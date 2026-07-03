import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useTelemetry } from '../context/TelemetryContext'
import FingerSlider from '../components/FingerSlider'
import StatusDot from '../components/StatusDot'

// [name, min, max, inverted] — must match firmware/hand_control per-finger clamps.
const FINGERS = [
  ['thumb',  60, 180, false],
  ['index',  40, 180, false],
  ['middle', 30, 180, false],
  ['ring',    0, 150, true],
  ['pinky',  40, 180, false],
  ['wrist',   0, 180, false],
]
const ORDER = FINGERS.map((f) => f[0])

export default function Live() {
  const { connected, angles } = useTelemetry()
  const [local, setLocal] = useState(ORDER.map((n) => angles[n] ?? 90))
  const [error, setError] = useState(null)
  const editing = useRef(false)

  // Keep sliders in sync with the hand's real angles unless the user is dragging.
  useEffect(() => {
    if (!editing.current) setLocal(ORDER.map((n) => angles[n] ?? 90))
  }, [angles])

  async function push(next) {
    setLocal(next)
    try { await api.setServos(next) } catch (e) { setError(e.message) }
  }

  function onSlide(i, v) {
    editing.current = true
    const next = local.slice()
    next[i] = v
    push(next)
  }

  async function rest() {
    editing.current = false
    try { await api.rest() } catch (e) { setError(e.message) }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Live Control</h1>
          <p className="text-xs text-gray-500">Manual per-finger control &amp; live telemetry</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <StatusDot online={connected} />
          {connected ? 'hand ready' : 'hand disconnected'}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Live readout */}
        <section className="card p-4">
          <h2 className="data-label mb-3">Current angles (from hand)</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {ORDER.map((name) => (
              <div key={name} className="text-center">
                <div className="data-value text-xl">{angles[name] ?? '—'}°</div>
                <div className="text-[10px] text-gray-500 capitalize">{name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Sliders */}
        <section className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="data-label">Manual control</h2>
            <button onClick={rest} disabled={!connected} className="btn-ghost text-xs">Open hand</button>
          </div>
          <div
            className="space-y-3"
            onMouseUp={() => { editing.current = false }}
            onMouseLeave={() => { editing.current = false }}
          >
            {FINGERS.map(([name, min, max, inverted], i) => (
              <FingerSlider
                key={name}
                label={name}
                value={local[i]}
                min={min}
                max={max}
                inverted={inverted}
                disabled={!connected}
                onChange={(v) => onSlide(i, v)}
              />
            ))}
          </div>
          <p className="mt-4 text-[11px] text-gray-600">
            The ring servo (⇄) is mechanically inverted — a higher angle extends it.
          </p>
        </section>
      </div>
    </div>
  )
}
