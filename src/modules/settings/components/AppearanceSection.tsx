import React, { useState } from 'react'
import { useNavStyleStore } from '../../../store/navStyleStore'
import { DEFAULT_SKIN, Skin, Theme, getSkin, getTheme, setSkin, setTheme } from '../../../styles/skin'

/** Visual (skin) and light/dark theme — saved per device (desktop and web independently). */
export function AppearanceSection(): React.ReactElement {
  const [skin, setSkinState] = useState<Skin>(getSkin())
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const platform = window.desktop ? 'desktop' : 'web'
  const { navStyle, setNavStyle } = useNavStyleStore()

  const pickSkin = (s: Skin): void => {
    setSkin(s === DEFAULT_SKIN[platform] ? null : s)
    setSkinState(s)
  }
  const pickTheme = (t: Theme): void => {
    setTheme(t)
    setThemeState(t)
  }

  return (
    <div className="chart-section" style={{ maxWidth: 560 }}>
      <div className="chart-title">🎨 Aparência</div>
      <div className="editor-field">
        <label>Visual ({platform === 'desktop' ? 'este computador' : 'este navegador'})</label>
        <div className="seg-toggle">
          <button className={`seg-btn ${skin === 'devlytics' ? 'active' : ''}`} onClick={() => pickSkin('devlytics')}>
            Novo
          </button>
          <button className={`seg-btn ${skin === 'classic' ? 'active' : ''}`} onClick={() => pickSkin('classic')}>
            Clássico
          </button>
        </div>
      </div>
      {skin === 'devlytics' && (
        <div className="editor-field">
          <label>Tema</label>
          <div className="seg-toggle">
            <button className={`seg-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => pickTheme('dark')}>
              Escuro
            </button>
            <button className={`seg-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => pickTheme('light')}>
              Claro
            </button>
          </div>
        </div>
      )}
      <div className="editor-field">
        <label>Navegação dos módulos</label>
        <div className="seg-toggle">
          <button className={`seg-btn ${navStyle === 'tabs' ? 'active' : ''}`} onClick={() => setNavStyle('tabs')}>
            Abas no topo
          </button>
          <button className={`seg-btn ${navStyle === 'sidebar' ? 'active' : ''}`} onClick={() => setNavStyle('sidebar')}>
            Submenu lateral
          </button>
        </div>
      </div>
    </div>
  )
}
