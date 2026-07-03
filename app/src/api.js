const BASE = 'http://localhost:8765'

async function request(path, options = {}, signal = undefined) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    signal,
    ...options,
  })
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    throw new Error(`HTTP ${res.status}: unexpected response type "${ct}"`)
  }
  const json = await res.json()
  if (!json.success) throw new Error(json.error || `HTTP ${res.status}`)
  return json.data
}

export const api = {
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
