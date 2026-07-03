import { useEffect, useState } from 'react'
import { api, getToken } from '../api'

// Gates the app behind a shared password when the backend requires it.
// When auth is disabled (desktop app / no HAND_PASSWORD) it renders instantly.
export default function AuthGate({ children }) {
  const [status, setStatus] = useState('checking')  // checking | login | ok
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function check() {
    try {
      const s = await api.getAuthStatus()
      if (!s.auth_required) { setStatus('ok'); return }
      if (getToken()) {
        try { await api.getStatus(); setStatus('ok'); return }   // token still valid?
        catch { setStatus('login'); return }
      }
      setStatus('login')
    } catch {
      // Backend unreachable — let the app render (it'll show "backend offline");
      // any protected call will bounce to login via the 401 handler.
      setStatus('ok')
    }
  }

  useEffect(() => { check() }, [])
  useEffect(() => {
    const onExpired = () => setStatus('login')
    window.addEventListener('hand-auth-expired', onExpired)
    return () => window.removeEventListener('hand-auth-expired', onExpired)
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await api.login(password)
      setPassword('')
      setStatus('ok')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (status === 'checking') {
    return <div className="h-screen flex items-center justify-center text-sm text-gray-500">Loading…</div>
  }

  if (status === 'login') {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <form onSubmit={submit} className="card p-6 w-80 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🖐️</span>
            <h1 className="font-semibold text-white">Humanoid Hand</h1>
          </div>
          <p className="text-xs text-gray-500">This hand is password protected. Enter the access password.</p>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-gray-200"
          />
          {error && <div className="text-xs text-danger">{error}</div>}
          <button type="submit" disabled={busy || !password} className="btn-primary w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    )
  }

  return children
}
