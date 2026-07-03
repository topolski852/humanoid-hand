// In the Electron app the renderer is loaded from Vite (:5173) or file://, so it
// must reach the backend at an absolute localhost URL. When the app is served as
// a website by the backend itself, use same-origin URLs so it works from any
// browser/host on the network.
const isElectron = typeof window !== 'undefined' && !!window.electron
const BASE = isElectron ? 'http://localhost:8765' : ''
const TOKEN_KEY = 'hand_token'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

export function wsUrl(path) {
  const token = getToken()
  const q = token ? `?token=${encodeURIComponent(token)}` : ''
  if (isElectron) return `ws://localhost:8765${path}${q}`
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}${q}`
}

// MJPEG stream URL for an <img> (token via query — img can't send a header).
export function cameraStreamUrl() {
  const token = getToken()
  const q = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${BASE}/camera/stream${q}`
}

async function request(path, options = {}, signal = undefined) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...options, headers, signal })
  // A 401 on a protected route means the token is missing/expired — force re-login.
  // (/auth/* 401s fall through so the login form can show "incorrect password".)
  if (res.status === 401 && !path.startsWith('/auth/')) {
    setToken(null)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('hand-auth-expired'))
    throw new Error('session expired — please log in again')
  }
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    throw new Error(`HTTP ${res.status}: unexpected response type "${ct}"`)
  }
  const json = await res.json()
  if (!json.success) throw new Error(json.error || `HTTP ${res.status}`)
  return json.data
}

export const api = {
  // ── Auth ───────────────────────────────────────────────────────────────────
  getAuthStatus: () => request('/auth/status'),
  login: async (password) => {
    const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) })
    setToken(data?.token ?? null)
    return data
  },
  logout: () => setToken(null),

  // ── Connection ───────────────────────────────────────────────────────────
  listPorts: () => request('/ports'),
  connect: (port = null, baud = 9600) =>
    request('/connect', { method: 'POST', body: JSON.stringify({ port, baud }) }),
  disconnect: () => request('/disconnect', { method: 'POST' }),
  getStatus: () => request('/status'),

  // ── ASL signs ────────────────────────────────────────────────────────────
  getSigns: () => request('/signs'),
  playSign: (letter) =>
    request(`/sign/${encodeURIComponent(letter)}`, { method: 'POST' }),

  // ── Direct servo control ──────────────────────────────────────────────────
  // angles: [thumb, index, middle, ring, pinky, wrist]
  setServos: (angles) =>
    request('/servos', { method: 'POST', body: JSON.stringify({ angles }) }),
  jog: (key) => request('/jog', { method: 'POST', body: JSON.stringify({ key }) }),
  rest: () => request('/rest', { method: 'POST' }),

  // ── Pulse control + live limit calibration ────────────────────────────────
  nudge: (finger, delta) =>
    request('/nudge', { method: 'POST', body: JSON.stringify({ finger, delta }) }),
  relax: () => request('/relax', { method: 'POST' }),
  getLimits: () => request('/limits'),
  // which: 'open' | 'close'; value defaults to the finger's current angle
  setLimit: (finger, which, value = null) =>
    request('/limit', { method: 'POST', body: JSON.stringify({ finger, which, value }) }),
  clearLimit: (finger) =>
    request('/limit/clear', { method: 'POST', body: JSON.stringify({ finger }) }),
  // Commit calibration: tighten hardstops + apply the position offset (0-at-close).
  configure: () => request('/configure', { method: 'POST' }),
  // Drive configured finger(s) to their open/close limit. finger: name or 'all'.
  goto: (which, finger = 'all') =>
    request('/goto', { method: 'POST', body: JSON.stringify({ finger, which }) }),

  // ── Webcam hand tracking ──────────────────────────────────────────────────
  trackStart: (camera = 0) =>
    request('/track/start', { method: 'POST', body: JSON.stringify({ camera }) }),
  trackStop: () => request('/track/stop', { method: 'POST' }),
  getTrackStatus: () => request('/track/status'),
  setTrackDrive: (enabled) =>
    request('/track/drive', { method: 'POST', body: JSON.stringify({ enabled }) }),
  trackCalibrate: (pose) =>
    request('/track/calibrate', { method: 'POST', body: JSON.stringify({ pose }) }),
}
