import { VIEW, PALM, FINGER_GEO, FINGER_MIN_LEN } from '../handModel'

// Draw one finger as a rounded bar rising from its base; length shrinks as it
// curls closed. Thumb is rotated about its base.
function Finger({ name, openness }) {
  const g = FINGER_GEO[name]
  const len = FINGER_MIN_LEN + (g.len - FINGER_MIN_LEN) * openness
  const x = g.x - g.w / 2
  const y = g.baseY - len
  const fillOpacity = 0.2 + 0.6 * openness
  const transform = g.angle ? `rotate(${g.angle} ${g.x} ${g.baseY})` : undefined
  return (
    <g transform={transform}>
      <rect
        x={x}
        y={y}
        width={g.w}
        height={len}
        rx={g.w / 2}
        fill="#3b82f6"
        fillOpacity={fillOpacity}
        stroke="#2d3148"
        strokeWidth="2"
        style={{ transition: 'all 60ms linear' }}
      />
      {/* knuckle */}
      <circle cx={g.x} cy={g.baseY} r={g.w / 2.4} fill="#252836" stroke="#2d3148" strokeWidth="2" />
    </g>
  )
}

export default function HandDiagram({ openness = {}, className = '' }) {
  return (
    <svg
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={`w-full h-full block ${className}`}
    >
      {/* palm */}
      <rect
        x={PALM.x}
        y={PALM.y}
        width={PALM.w}
        height={PALM.h}
        rx={PALM.r}
        fill="#1a1d27"
        stroke="#2d3148"
        strokeWidth="2"
      />
      {/* fingers (thumb first so up-fingers overlap it at the base) */}
      <Finger name="thumb" openness={openness.thumb ?? 0} />
      <Finger name="index" openness={openness.index ?? 0} />
      <Finger name="middle" openness={openness.middle ?? 0} />
      <Finger name="ring" openness={openness.ring ?? 0} />
      <Finger name="pinky" openness={openness.pinky ?? 0} />
    </svg>
  )
}
