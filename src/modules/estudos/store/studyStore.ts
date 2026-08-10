import { create } from 'zustand'
import { StudyTopic, StudyNode, StudyNote, StudyFlashcard } from '../../../types'
import { schedule, Rating } from '../srs'

const SEL_KEY = 'rickos:studySel'

function loadSel(): { topicId: number | null; nodeId: number | null } {
  try {
    const v = JSON.parse(localStorage.getItem(SEL_KEY) || 'null')
    if (v && typeof v === 'object') return { topicId: v.topicId ?? null, nodeId: v.nodeId ?? null }
  } catch {
    // ignore
  }
  return { topicId: null, nodeId: null }
}
function saveSel(topicId: number | null, nodeId: number | null): void {
  localStorage.setItem(SEL_KEY, JSON.stringify({ topicId, nodeId }))
}

interface StudyState {
  topics: StudyTopic[]
  activeTopicId: number | null
  nodes: StudyNode[]
  selectedNodeId: number | null
  note: StudyNote | null
  flashcards: StudyFlashcard[]
  dueCards: StudyFlashcard[]

  refreshTopics: () => Promise<void>
  setActiveTopic: (id: number | null) => Promise<void>
  selectNode: (id: number | null) => Promise<void>
  refreshActive: () => Promise<void>
  refreshDue: () => Promise<void>

  createTopic: (name: string, category: string | null, status: string, targetDate: string | null, priority: number, color: string) => Promise<void>
  updateTopic: (t: StudyTopic) => Promise<void>
  removeTopic: (id: number) => Promise<void>

  createNode: (parentId: number | null, title: string) => Promise<void>
  updateNode: (id: number, title: string, description: string | null, status: string, estimatedHours: number | null) => Promise<void>
  cycleNodeStatus: (node: StudyNode) => Promise<void>
  removeNode: (id: number) => Promise<void>
  moveNode: (id: number, dir: 'up' | 'down') => Promise<void>

  saveNote: (content: string) => Promise<void>

  createFlashcard: (front: string, back: string, nodeId: number | null) => Promise<void>
  removeFlashcard: (id: number) => Promise<void>
  reviewCard: (id: number, rating: Rating) => Promise<void>
}

const NEXT_STATUS: Record<string, string> = { todo: 'doing', doing: 'done', done: 'todo' }

export const useStudyStore = create<StudyState>((set, get) => ({
  topics: [],
  activeTopicId: loadSel().topicId,
  nodes: [],
  selectedNodeId: loadSel().nodeId,
  note: null,
  flashcards: [],
  dueCards: [],

  refreshTopics: async () => set({ topics: await window.api.study.topics() }),

  setActiveTopic: async (id) => {
    set({ activeTopicId: id, selectedNodeId: null, note: null, nodes: [], flashcards: [] })
    saveSel(id, null)
    if (id != null) await get().refreshActive()
  },

  selectNode: async (id) => {
    set({ selectedNodeId: id })
    saveSel(get().activeTopicId, id)
    const topicId = get().activeTopicId
    if (topicId != null) set({ note: await window.api.study.getNote(topicId, id) })
  },

  refreshActive: async () => {
    const topicId = get().activeTopicId
    if (topicId == null) return
    const [nodes, flashcards, note] = await Promise.all([
      window.api.study.nodes(topicId),
      window.api.study.flashcards(topicId),
      window.api.study.getNote(topicId, get().selectedNodeId)
    ])
    set({ nodes, flashcards, note })
  },

  refreshDue: async () => set({ dueCards: await window.api.study.due(new Date().toISOString()) }),

  createTopic: async (name, category, status, targetDate, priority, color) => {
    await window.api.study.createTopic(name, category, status, targetDate, priority, color)
    await get().refreshTopics()
  },
  updateTopic: async (t) => {
    await window.api.study.updateTopic(t.id, t.name, t.category, t.status, t.targetDate, t.priority, t.color)
    await get().refreshTopics()
  },
  removeTopic: async (id) => {
    await window.api.study.deleteTopic(id)
    if (get().activeTopicId === id) await get().setActiveTopic(null)
    await get().refreshTopics()
  },

  createNode: async (parentId, title) => {
    const topicId = get().activeTopicId
    if (topicId == null) return
    await window.api.study.createNode(topicId, parentId, title, null, null)
    await get().refreshActive()
  },
  updateNode: async (id, title, description, status, estimatedHours) => {
    await window.api.study.updateNode(id, title, description, status, estimatedHours)
    await get().refreshActive()
  },
  cycleNodeStatus: async (node) => {
    await window.api.study.updateNode(node.id, node.title, node.description, NEXT_STATUS[node.status] ?? 'todo', node.estimatedHours)
    await get().refreshActive()
  },
  removeNode: async (id) => {
    await window.api.study.deleteNode(id)
    if (get().selectedNodeId === id) await get().selectNode(null)
    await get().refreshActive()
  },
  moveNode: async (id, dir) => {
    await window.api.study.moveNode(id, dir)
    await get().refreshActive()
  },

  saveNote: async (content) => {
    const topicId = get().activeTopicId
    if (topicId == null) return
    const note = await window.api.study.saveNote(topicId, get().selectedNodeId, content)
    set({ note })
  },

  createFlashcard: async (front, back, nodeId) => {
    const topicId = get().activeTopicId
    if (topicId == null) return
    await window.api.study.createFlashcard(topicId, nodeId, front, back)
    await get().refreshActive()
  },
  removeFlashcard: async (id) => {
    await window.api.study.deleteFlashcard(id)
    await get().refreshActive()
    await get().refreshDue()
  },
  reviewCard: async (id, rating) => {
    const card = get().dueCards.find((c) => c.id === id) || get().flashcards.find((c) => c.id === id)
    if (!card) return
    const u = schedule(card, rating)
    await window.api.study.reviewFlashcard(id, u.easeFactor, u.intervalDays, u.repetitions, u.nextReviewAt, u.lastReviewedAt)
    await get().refreshDue()
  }
}))
