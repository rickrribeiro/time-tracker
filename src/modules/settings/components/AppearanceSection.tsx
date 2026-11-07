import React, { useState } from 'react'
import { DEFAULT_SKIN, Skin, Theme, getSkin, getTheme, setSkin, setTheme } from '../../../styles/skin'

/** Visual (skin) and light/dark theme — saved per device (desktop and web independently). */
export function AppearanceSection(): React.ReactElement {
  const [skin, setSkinState] = useState<Skin>(getSkin())
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const platform = window.desktop ? 'desktop' : 'web'

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
    </div>
  )
}
