import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useTelemetry } from '../context/TelemetryContext'
import HandDiagram from '../components/HandDiagram'
import StatusDot from '../components/StatusDot'
import {
  angleToOpenness, limitReady, closeDir, workingSpan, rawToWorking, workingOpenness, VIEW,
} from '../handModel'

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky']
const ALL = [...FINGERS, 'wrist']
const MAGNITUDES = [10, 5, 1]

export default function HandControl() {
  const { connected, angles } = useTelemetry()
  const [limits, setLimits] = useState({})
  const [error, setError] = useState(null)

  async function refetch() {
    try { setLimits(await api.getLimits()) } catch (e) { /* pre-limits backend */ }
  }
  useEffect(() => { refetch() }, [connected])

  async function nudge(finger, delta) {
    try { await api.nudge(finger, delta) } catch (e) { setError(e.message) }
  }
  async function relax() {
    try { await api.relax() } catch (e) { setError(e.message) }
  }
  async function goto(which, finger = 'all') {
    try { await api.goto(which, finger) } catch (e) { setError(e.message) }
  }

  const openness = {}
  for (const f of FINGERS) {
    const lim = limits[f]
    const a = angles[f] ?? 90
    openness[f] = (lim && lim.configured && limitReady(lim))
      ? workingOpenness(lim, a)
      : angleToOpenness(f, a)
  }

  const anyConfigured = ALL.some((f) => limits[f]?.configured)

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Hand Control</h1>
          <p className="text-xs text-gray-500">Pulse toward open or close · 0 = fully closed</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 mr-1">
            <StatusDot online={connected} />
            {connected ? 'hand ready' : 'hand disconnected'}
          </div>
          <button onClick={() => goto('open')} disabled={!connected || !anyConfigured} className="btn-ghost text-xs" title="drive all configured fingers to their open limit">Open hand</button>
          <button onClick={() => goto('close')} disabled={!connected || !anyConfigured} className="btn-ghost text-xs" title="drive all configured fingers to their close limit">Close hand</button>
          <button onClick={relax} disabled={!connected} className="btn-danger text-xs">Relax all</button>
        </div>
      </header>

      {error && <div className="mx-6 mt-3 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</div>}
      {!connected && <div className="mx-6 mt-3 text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">Hand not connected — click <span className="font-semibold">Connect</span> in the sidebar.</div>}
      {connected && !anyConfigured && (
        <div className="mx-6 mt-3 text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">
          No fingers calibrated yet — set limits on the <Link to="/configure" className="underline font-semibold">Configure Limits</Link> page first.
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-6 p-6 overflow-hidden">
        {/* Hand visual — top-aligned (inline with the command rows), full thumb */}
        <div className="hidden lg:block flex-shrink-0" style={{ width: 230 }}>
          <div className="w-full" style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
            <HandDiagram openness={openness} />
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto space-y-3 pr-1">
          {ALL.map((finger) => (
            <FingerRow
              key={finger}
              finger={finger}
              angle={angles[finger]}
              limit={limits[finger]}
              disabled={!connected}
              onNudge={(d) => nudge(finger, d)}
              onGoto={(which) => goto(which, finger)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function PulseBtn({ children, onClick, disabled, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="btn-ghost !px-2 !py-1 text-xs font-mono tabular-nums w-9">
      {children}
    </button>
  )
}

function FingerRow({ finger, angle, limit, disabled, onNudge, onGoto }) {
  const configured = limit?.configured && limitReady(limit)

  if (!configured) {
    // Uncalibrated (e.g. wrist): raw +/- control.
    return (
      <div className="card p-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3 w-44 flex-shrink-0">
          <span className="capitalize text-sm font-medium text-white w-16">{finger}</span>
          <span className="data-value text-lg">{angle ?? '—'}</span>
          <span className="text-[10px] text-warn">uncalibrated</span>
        </div>
        <div className="flex items-center gap-1">
          {[-10, -5, -1, 1, 5, 10].map((d) => (
            <PulseBtn key={d} disabled={disabled} onClick={() => onNudge(d)} title={`${d > 0 ? '+' : ''}${d}° raw`}>
              {d > 0 ? `+${d}` : d}
            </PulseBtn>
          ))}
        </div>
      </div>
    )
  }

  const dir = closeDir(limit)                 // raw sign toward close
  const span = workingSpan(limit)
  const pos = angle == null ? null : rawToWorking(limit, angle)

  return (
    <div className="card p-3 flex items-center justify-between gap-3">
      <div className="flex items-baseline gap-3 w-44 flex-shrink-0">
        <span className="capitalize text-sm font-medium text-white w-16">{finger}</span>
        <span className="data-value text-lg">{pos}<span className="text-gray-600 text-xs">/{span}</span></span>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => onGoto('close')} disabled={disabled} className="btn-ghost !px-2 !py-1 text-xs" title="drive to close limit">Close</button>
        <div className="flex items-center gap-1">
          {MAGNITUDES.map((m) => (
            <PulseBtn key={m} disabled={disabled} onClick={() => onNudge(m * dir)} title={`close ${m}°`}>{m}</PulseBtn>
          ))}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-gray-600">close · open</span>
        <div className="flex items-center gap-1">
          {[...MAGNITUDES].reverse().map((m) => (
            <PulseBtn key={m} disabled={disabled} onClick={() => onNudge(-m * dir)} title={`open ${m}°`}>{m}</PulseBtn>
          ))}
        </div>
        <button onClick={() => onGoto('open')} disabled={disabled} className="btn-ghost !px-2 !py-1 text-xs" title="drive to open limit">Open</button>
      </div>
    </div>
  )
}
