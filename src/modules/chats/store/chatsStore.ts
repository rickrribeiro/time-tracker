import { create } from 'zustand'
import type { ChatCounts, ChatFilter, ChatLabel, ChatPreset, ChatsStatus, ChatSummary } from '../../../../shared/chats'
import { useUIStore } from '../../../store/uiStore'

export type ChatsTab = 'radar' | 'inbox' | 'triage'
export type ChatsPane = 'list' | 'chat'
export type TriageMode = 'backlog' | 'daily' | 'mentions' | 'unread' | 'professional'

const PAGE = 60
const DEFAULT_FILTER: ChatFilter = { state: 'all', type: 'all', person: 'all', sort: 'recent' }
// v2: o padrão passou a ser "mais recentes" (prioridade escondia mensagens novas)
const FILTER_KEY = 'rickos:chats:filter:v2'
const TAB_KEY = 'rickos:chats:tab'

function load<T>(key: string, def: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? { ...def, ...JSON.parse(v) } : def
  } catch {
    return def
  }
}
function saveLocal(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // sem storage
  }
}

function chatFromHash(): number | null {
  const m = window.location.hash.match(/^#\/chats\?(?:.*&)?c=(\d+)/)
  return m ? Number(m[1]) : null
}

interface ChatsState {
  ready: boolean
  status: ChatsStatus | null
  counts: ChatCounts | null
  filter: ChatFilter
  items: ChatSummary[]
  total: number
  hasMore: boolean
  loading: boolean
  error: string | null
  tab: ChatsTab
  pane: ChatsPane
  detailOpen: boolean
  activeId: number | null
  active: ChatSummary | null
  selected: number[]
  labels: ChatLabel[]
  presets: ChatPreset[]
  /** Conversa a abrir quando a página montar (deep link / outros módulos). */
  pendingOpen: number | null
  /** Modo inicial da triagem (ex.: "Revisão diária" vindo do radar/Home). */
  triageMode: TriageMode
  init: () => Promise<() => void>
  setTab: (t: ChatsTab) => void
  setFilter: (patch: Partial<ChatFilter>, replace?: boolean) => void
  reload: () => Promise<void>
  loadMore: () => Promise<void>
  open: (id: number | null) => Promise<void>
  refreshActive: () => Promise<void>
  setPane: (p: ChatsPane) => void
  setDetailOpen: (v: boolean) => void
  toggleSelect: (id: number) => void
  selectMany: (ids: number[]) => void
  clearSelection: () => void
  refreshCounts: () => Promise<void>
  refreshLabels: () => Promise<void>
  refreshPresets: () => Promise<void>
}

let seq = 0

export const useChatsStore = create<ChatsState>((set, get) => ({
  ready: false,
  status: null,
  counts: null,
  filter: load(FILTER_KEY, DEFAULT_FILTER),
  items: [],
  total: 0,
  hasMore: false,
  loading: false,
  error: null,
  tab: (() => {
    try {
      return (localStorage.getItem(TAB_KEY) as ChatsTab) || 'radar'
    } catch {
      return 'radar'
    }
  })(),
  pane: 'list',
  detailOpen: false,
  activeId: null,
  active: null,
  selected: [],
  labels: [],
  presets: [],
  pendingOpen: chatFromHash(),
  triageMode: 'backlog',

  init: async () => {
    const wanted = chatFromHash() ?? get().pendingOpen // lido antes de qualquer await (o App reescreve o hash)
    const st = await window.api.chats.status()
    set({ status: st, ready: true })
    await Promise.all([get().refreshCounts(), get().refreshLabels(), get().refreshPresets(), get().reload()])
    const hashId = wanted ?? get().pendingOpen
    if (hashId) {
      set({ pendingOpen: null, tab: 'inbox' })
      await get().open(hashId)
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    const offU = window.api.chats.onUpdated(({ chatIds }) => {
      // várias mudanças seguidas viram um recarregamento
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void get().refreshCounts()
        void get().reload()
        const a = get().activeId
        if (a && (!chatIds.length || chatIds.includes(a))) void get().refreshActive()
      }, 300)
    })
    const offS = window.api.chats.onStatus((s) => set({ status: s }))
    const onHash = (): void => {
      const id = chatFromHash()
      if (id && id !== get().activeId) {
        set({ tab: 'inbox' })
        void get().open(id)
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => {
      offU()
      offS()
      window.removeEventListener('hashchange', onHash)
    }
  },

  setTab: (t) => {
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // ignore
    }
    set({ tab: t })
  },

  setFilter: (patch, replace) => {
    const filter = replace ? { ...DEFAULT_FILTER, ...patch } : { ...get().filter, ...patch }
    const { search: _s, ...persist } = filter
    saveLocal(FILTER_KEY, persist)
    set({ filter, selected: [] })
    void get().reload()
  },

  reload: async () => {
    const my = ++seq
    set({ loading: true, error: null })
    try {
      // mantém o tamanho já carregado (não "pula" a rolagem em atualizações em tempo real)
      const size = Math.max(PAGE, Math.min(get().items.length, 400))
      const page = await window.api.chats.list(get().filter, 0, size)
      if (my !== seq) return // resposta obsoleta (filtro mudou)
      set({ items: page.items, total: page.total, hasMore: page.hasMore, loading: false })
    } catch (e) {
      if (my === seq) set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  loadMore: async () => {
    if (get().loading || !get().hasMore) return
    const my = seq
    set({ loading: true })
    try {
      const page = await window.api.chats.list(get().filter, get().items.length, PAGE)
      if (my !== seq) return
      const seen = new Set(get().items.map((i) => i.id))
      set({ items: [...get().items, ...page.items.filter((i) => !seen.has(i.id))], total: page.total, hasMore: page.hasMore, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  open: async (id) => {
    if (id == null) {
      set({ activeId: null, active: null, pane: 'list' })
      return
    }
    const cached = get().items.find((i) => i.id === id) ?? null
    set({ activeId: id, active: cached, pane: 'chat' })
    const fresh = await window.api.chats.get(id).catch(() => null)
    if (get().activeId === id) set({ active: fresh })
  },

  refreshActive: async () => {
    const id = get().activeId
    if (!id) return
    const fresh = await window.api.chats.get(id).catch(() => null)
    if (get().activeId === id) set({ active: fresh })
  },

  setPane: (p) => set({ pane: p }),
  setDetailOpen: (v) => set({ detailOpen: v }),
  toggleSelect: (id) => set({ selected: get().selected.includes(id) ? get().selected.filter((x) => x !== id) : [...get().selected, id] }),
  selectMany: (ids) => set({ selected: Array.from(new Set([...get().selected, ...ids])) }),
  clearSelection: () => set({ selected: [] }),
  refreshCounts: async () => set({ counts: await window.api.chats.counts().catch(() => null) }),
  refreshLabels: async () => set({ labels: await window.api.chats.labels().catch(() => []) }),
  refreshPresets: async () => set({ presets: await window.api.chats.presets().catch(() => []) })
}))

/** Abre a Central numa conversa (usado por Home, Pessoas, notificações). */
export function openChat(id: number): void {
  useChatsStore.setState({ pendingOpen: id, tab: 'inbox' })
  if (useUIStore.getState().currentPage === 'chats') void useChatsStore.getState().open(id)
  else useUIStore.getState().setPage('chats')
}

/** Abre a Central com um filtro (ex.: "Ver prioritárias" na Home). */
export function openChatsWith(filter: Partial<ChatFilter>, tab: ChatsTab = 'inbox'): void {
  useChatsStore.getState().setFilter(filter, true)
  useChatsStore.setState({ tab })
  useUIStore.getState().setPage('chats')
}

// Deep link #/chats?c=ID: guarda o id no momento do hashchange (antes do App normalizar o hash).
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const id = chatFromHash()
    if (id) useChatsStore.setState({ pendingOpen: id, tab: 'inbox' })
  })
}
