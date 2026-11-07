import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { createApi } from './api/createApi'
import { subscribe } from './api/transport'
import './index.css'
import './styles/responsive.css'

// Same API on desktop and web: everything goes to the rickOS server over HTTP.
window.api = createApi() as unknown as Window['api']

// Server push: notifications (rules engine, agents) and DB swaps (import/restore).
subscribe('notify', (p) => {
  const { title, body } = p as { title: string; body: string }
  if (window.desktop) {
    window.desktop.notify(title, body)
    return
  }
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') new Notification(title, { body })
  else if (Notification.permission === 'default') {
    void Notification.requestPermission().then((perm) => {
      if (perm === 'granted') new Notification(title, { body })
    })
  }
})
subscribe('db:replaced', () => window.location.reload())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
