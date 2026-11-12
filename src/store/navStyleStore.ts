import { create } from 'zustand'

/** `tabs` = módulo é um item só na sidebar e as páginas viram abas no topo; `sidebar` = submenu expansível. */
export type NavStyle = 'tabs' | 'sidebar'

const key = (): string => `rickos-nav-${window.desktop ? 'desktop' : 'web'}`

function read(): NavStyle {
  try {
    return localStorage.getItem(key()) === 'sidebar' ? 'sidebar' : 'tabs'
  } catch {
    return 'tabs'
  }
}

interface NavStyleState {
  navStyle: NavStyle
  setNavStyle: (s: NavStyle) => void
}

/** Estilo de navegação: salvo por dispositivo (desktop e web independentes), como a skin. */
export const useNavStyleStore = create<NavStyleState>((set) => ({
  navStyle: read(),
  setNavStyle: (navStyle) => {
    try {
      localStorage.setItem(key(), navStyle)
    } catch {
      /* sem storage: vale só nesta sessão */
    }
    set({ navStyle })
  }
}))
