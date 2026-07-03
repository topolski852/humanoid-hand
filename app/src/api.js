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
}
