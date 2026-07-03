// Per-finger openness from MediaPipe hand landmarks (runs in the browser).
// openness: 0 = fully curled (fist), 1 = fully extended (open).

export const TRACKED = ['thumb', 'index', 'middle', 'ring', 'pinky']

// Joint whose angle is each finger's curl metric.
// 4 fingers: angle at PIP (MCP, PIP, TIP). Thumb: angle at IP (MCP, IP, TIP).
const ANGLE_LM = {
  thumb: [2, 3, 4],
  index: [5, 6, 8],
  middle: [9, 10, 12],
  ring: [13, 14, 16],
  pinky: [17, 18, 20],
}

// Standard MediaPipe hand skeleton (for the wireframe overlay).
export const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

// Default metric (degrees) at the fist/open extremes; refined per-user via the
// 2-pose gesture calibration below.
export const DEFAULT_CAL = {
  thumb: { fist: 120, open: 165 },
  index: { fist: 40, open: 175 },
  middle: { fist: 40, open: 178 },
  ring: { fist: 40, open: 175 },
  pinky: { fist: 45, open: 172 },
}

function angle(a, b, c) {
  const bax = a.x - b.x, bay = a.y - b.y
  const bcx = c.x - b.x, bcy = c.y - b.y
  const dot = bax * bcx + bay * bcy
  const mag = Math.hypot(bax, bay) * Math.hypot(bcx, bcy) + 1e-6
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI
}

// Raw curl metric (degrees) per finger for a 21-landmark hand.
export function fingerMetrics(landmarks) {
  const m = {}
  for (const f of TRACKED) {
    const [i, j, k] = ANGLE_LM[f]
    m[f] = angle(landmarks[i], landmarks[j], landmarks[k])
  }
  return m
}

export function metricsToOpenness(metrics, cal) {
  const o = {}
  for (const f of TRACKED) {
    const c = (cal && cal[f]) || DEFAULT_CAL[f]
    const t = c.open === c.fist ? 0 : (metrics[f] - c.fist) / (c.open - c.fist)
    o[f] = Math.max(0, Math.min(1, t))
  }
  return o
}

// ── per-user gesture calibration (localStorage) ──────────────────────────────
const CAL_KEY = 'hand_gesture_cal'

export function loadGestureCal() {
  try {
    const raw = localStorage.getItem(CAL_KEY)
    if (raw) return { ...structuredCloneCal(DEFAULT_CAL), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return structuredCloneCal(DEFAULT_CAL)
}

export function saveGestureCal(cal) {
  try { localStorage.setItem(CAL_KEY, JSON.stringify(cal)) } catch { /* ignore */ }
}

// Capture the current metrics as the 'open' or 'fist' extreme for every finger.
export function captureGesture(cal, pose, metrics) {
  const next = structuredCloneCal(cal)
  for (const f of TRACKED) next[f][pose] = Math.round(metrics[f] * 10) / 10
  return next
}

function structuredCloneCal(cal) {
  const out = {}
  for (const f of TRACKED) out[f] = { ...cal[f] }
  return out
}
