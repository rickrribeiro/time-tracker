/**
 * Visual skins. `classic` = the original look (src/index.css untouched);
 * `devlytics` = Geist + zinc + green glass (src/styles/skin-devlytics.css).
 *
 * ↓ To bring the desktop back to the old look, set `desktop: 'classic'` here
 *   (or pick "Clássico" in Configurações → Aparência, which overrides per device).
 */
export const DEFAULT_SKIN: Record<'desktop' | 'web', Skin> = {
  desktop: 'devlytics',
  web: 'devlytics'
}

export type Skin = 'classic' | 'devlytics'
export type Theme = 'dark' | 'light'

const SKINS: Skin[] = ['classic', 'devlytics']
const THEMES: Theme[] = ['dark', 'light']

function platform(): 'desktop' | 'web' {
  return window.desktop ? 'desktop' : 'web'
}
const skinKey = (): string => `rickos-skin-${platform()}`
const THEME_KEY = 'rickos-theme'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage unavailable — choice lasts for this session only
  }
}
function fromQuery(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name)
  } catch {
    return null
  }
}

export function getSkin(): Skin {
  const v = fromQuery('skin') || read(skinKey())
  return SKINS.includes(v as Skin) ? (v as Skin) : DEFAULT_SKIN[platform()]
}

export function getTheme(): Theme {
  const v = fromQuery('theme') || read(THEME_KEY)
  return THEMES.includes(v as Theme) ? (v as Theme) : 'dark'
}

/** Persist a per-device choice; `null` goes back to DEFAULT_SKIN. */
export function setSkin(skin: Skin | null): void {
  write(skinKey(), skin)
  applySkin()
}

export function setTheme(theme: Theme): void {
  write(THEME_KEY, theme)
  applySkin()
}

export function applySkin(): void {
  const d = document.documentElement
  const skin = getSkin()
  const theme = skin === 'classic' ? 'dark' : getTheme() // classic only has a dark palette
  d.dataset.skin = skin
  d.dataset.theme = theme
  const color = skin === 'classic' ? '#0f172a' : theme === 'light' ? '#f4f4f5' : '#18181b'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
}
