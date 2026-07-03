// Shared hand model: per-finger calibration + SVG geometry.
// Used by both the HandDiagram (drawing) and HandControl page (sliders) so the
// visual fingers and the slider overlay stay aligned.

export const FINGER_ORDER = ['thumb', 'index', 'middle', 'ring', 'pinky', 'wrist']

// Raw servo angles at the open/closed extremes (from firmware calibration).
// Note the ring servo is mechanically inverted (open = high angle).
export const FINGER_CAL = {
  thumb:  { open: 60,  closed: 160 },
  index:  { open: 40,  closed: 170 },
  middle: { open: 30,  closed: 160 },
  ring:   { open: 150, closed: 0 },
  pinky:  { open: 40,  closed: 160 },
  wrist:  { open: 0,   closed: 180 },
}

// openness: 0 = fully curled/closed, 1 = fully extended/open.
export function angleToOpenness(name, angle) {
  const { open, closed } = FINGER_CAL[name]
  const t = (angle - closed) / (open - closed)
  return Math.max(0, Math.min(1, t))
}

export function opennessToAngle(name, o) {
  const { open, closed } = FINGER_CAL[name]
  return Math.round(closed + (open - closed) * Math.max(0, Math.min(1, o)))
}

// ── Position-offset coordinates (from captured raw open/close limits) ─────────
// Working position is 0 at close and +span at open, regardless of raw direction.
export function limitReady(lim) {
  return lim && lim.open != null && lim.close != null && lim.open !== lim.close
}
// raw servo sign that moves a finger toward CLOSE
export function closeDir(lim) {
  return Math.sign(lim.close - lim.open)
}
export function workingSpan(lim) {
  return Math.abs(lim.open - lim.close)
}
export function rawToWorking(lim, raw) {
  return Math.round((raw - lim.close) * Math.sign(lim.open - lim.close))
}
// openness 0..1 (0 = closed) for the diagram
export function workingOpenness(lim, raw) {
  return Math.max(0, Math.min(1, (raw - lim.close) / (lim.open - lim.close)))
}

// ── SVG geometry (coordinate space 300 x 400) ────────────────────────────────
export const VIEWBOX = { w: 300, h: 400 }
// Render window — padded on the left/top so the thumb isn't clipped at full open
// (the open thumb reaches ~x=-34). Both the diagram and its container use this.
export const VIEW = { x: -50, y: -6, w: 312, h: 412 }
export const PALM = { x: 66, y: 200, w: 168, h: 168, r: 44 }
export const FINGER_MIN_LEN = 32   // stub length when fully curled

// Each up-finger rises from y=PALM.y at column x; thumb is angled off the side.
export const FINGER_GEO = {
  thumb:  { x: 74,  baseY: 292, len: 118, w: 36, angle: -56 },
  index:  { x: 104, baseY: 200, len: 150, w: 30, angle: 0 },
  middle: { x: 142, baseY: 200, len: 174, w: 32, angle: 0 },
  ring:   { x: 180, baseY: 200, len: 150, w: 30, angle: 0 },
  pinky:  { x: 214, baseY: 200, len: 116, w: 26, angle: 0 },
}
