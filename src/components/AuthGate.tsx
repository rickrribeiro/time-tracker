import React, { useEffect, useState } from 'react'
import { UNAUTHORIZED_EVENT, checkAuth, setToken, getToken } from '../api/transport'

/**
 * When the server requires a token (RICKOS_TOKEN, e.g. when exposed to the phone),
 * show a simple screen to paste it. The token is kept in localStorage.
 */
export function AuthGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const [needsToken, setNeedsToken] = useState(false)
  const [value, setValue] = useState(getToken())
  const [error, setError] = useState('')

  useEffect(() => {
    const on = (): void => setNeedsToken(true)
    window.addEventListener(UNAUTHORIZED_EVENT, on)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, on)
  }, [])

  if (!needsToken) return <>{children}</>

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setToken(value.trim())
    if (await checkAuth()) window.location.reload()
    else setError('Token inválido.')
  }

  return (
    <div className="auth-gate">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">🧭 RickOS</div>
        <p className="auth-hint">Este servidor exige um token de acesso.</p>
        <input
          className="input"
          type="password"
          autoFocus
          placeholder="Cole o token (RICKOS_TOKEN)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && <div className="auth-error">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={!value.trim()}>
          Entrar
        </button>
      </form>
    </div>
  )
}
