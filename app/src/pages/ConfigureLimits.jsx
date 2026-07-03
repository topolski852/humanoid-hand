import { useEffect, useState } from 'react'
import { api } from '../api'
import { useTelemetry } from '../context/TelemetryContext'
import StatusDot from '../components/StatusDot'
import { limitReady } from '../handModel'

const ALL = ['thumb', 'index', 'middle', 'ring', 'pinky', 'wrist']
const RAW_PULSES = [-10, -5, -1, 1, 5, 10]

export default function ConfigureLimits() {
  const { connected, angles } = useTelemetry()
  const [limits, setLimits] = useState({})
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  async function refetch() {
    try { setLimits(await api.getLimits()) } catch (e) { /* pre-limits backend */ }
  }
  useEffect(() => { refetch() }, [connected])

  async function nudge(finger, delta) {
    try { await api.nudge(finger, delta) } catch (e) { setError(e.message) }
  }
  async function setLimit(finger, which) {
    try { await api.setLimit(finger, which); await refetch() } catch (e) { setError(e.message) }
  }
  async function clearLimit(finger) {
    try { await api.clearLimit(finger); await refetch() } catch (e) { setError(e.message) }
  }
  async function relax() {
    try { await api.relax() } catch (e) { setError(e.message) }
  }
  async function configure() {
    setError(null); setMsg(null)
    try {
      await api.configure()
      await refetch()
      setMsg('Configured — limits committed to the Arduino. Switch to Hand Control.')
    } catch (e) { setError(e.message) }
  }

  const ready = ALL.filter((f) => limitReady(limits[f]))

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Configure Limits</h1>
          <p className="text-xs text-gray-500">Pulse each finger to its hardstops (values may go negative), capture open/close, then commit</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <StatusDot online={connected} />
            {connected ? 'hand ready' : 'hand disconnected'}
          </div>
          <button onClick={relax} disabled={!connected} className="btn-danger text-xs">Relax all</button>
        </div>
      </header>

      {error && <div className="mx-6 mt-3 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</div>}
      {msg && <div className="mx-6 mt-3 text-xs text-online bg-online/10 border border-online/30 rounded-lg px-3 py-2">{msg}</div>}
      {!connected && <div className="mx-6 mt-3 text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">Hand not connected — click <span className="font-semibold">Connect</span> in the sidebar.</div>}

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
        {ALL.map((finger) => {
          const lim = limits[finger] || {}
          const both = limitReady(lim)
          return (
            <div key={finger} className="card p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-3 w-40 flex-shrink-0">
                  <span className="capitalize text-sm font-medium text-white w-16">{finger}</span>
                  <span className="data-value text-lg">{angles[finger] ?? '—'}</span>
                  <span className="text-[10px] text-gray-600">raw</span>
                </div>
                <div className="flex items-center gap-1">
                  {RAW_PULSES.map((d) => (
                    <button
                      key={d}
                      onClick={() => nudge(finger, d)}
                      disabled={!connected}
                      className="btn-ghost !px-2 !py-1 text-xs font-mono tabular-nums w-9"
                      title={`${d > 0 ? '+' : ''}${d}° raw`}
                    >
                      {d > 0 ? `+${d}` : d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-surface-3 flex items-center justify-between gap-2">
                <div className="text-[11px] text-gray-500">
                  open: <span className="data-value">{lim.open ?? '—'}</span>{'  '}
                  close: <span className="data-value">{lim.close ?? '—'}</span>
                  {both && <span className="text-gray-600"> · span {Math.abs(lim.open - lim.close)}°</span>}
                  {lim.configured && <span className="text-online"> · committed</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setLimit(finger, 'open')} disabled={!connected} className="btn-ghost !px-2 !py-1 text-xs">Set open</button>
                  <button onClick={() => setLimit(finger, 'close')} disabled={!connected} className="btn-ghost !px-2 !py-1 text-xs">Set close</button>
                  <button onClick={() => clearLimit(finger)} disabled={!connected} className="btn-ghost !px-2 !py-1 text-xs text-gray-500" title="clear">✕</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Commit bar */}
      <div className="flex-shrink-0 px-6 py-3 border-t border-surface-3 flex items-center justify-between">
        <p className="text-[11px] text-gray-500">
          {ready.length} of {ALL.length} fingers have open + close captured. Committing tightens the
          on-device limits and zeroes each finger at close (position offset).
        </p>
        <button onClick={configure} disabled={!connected || ready.length === 0} className="btn-primary text-sm">
          Configure hand
        </button>
      </div>
    </div>
  )
}
