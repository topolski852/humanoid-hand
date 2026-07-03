import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useTelemetry } from '../context/TelemetryContext'
import { useTrackStream } from '../hooks/useTrackStream'
import StatusDot from '../components/StatusDot'

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky']

export default function HandTracking() {
  const { connected } = useTelemetry()          // hand (serial) connection
  const track = useTrackStream()                // /ws/track live state
  const [camera, setCamera] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const anyConfigured = FINGERS.some((f) => track.working?.[f])

  async function call(fn) {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const start = () => call(() => api.trackStart(camera))
  const stop = () => call(() => api.trackStop())
  const toggleDrive = () => call(() => api.setTrackDrive(!track.driving))
  const capture = (pose) => call(() => api.trackCalibrate(pose))

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Hand Tracking</h1>
          <p className="text-xs text-gray-500">Track a human hand on the webcam and mirror it on the robot</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 mr-1">
            <StatusDot online={track.running} />
            {track.running ? `${track.fps} fps` : 'stopped'}
          </div>
          {!track.running ? (
            <>
              <select value={camera} onChange={(e) => setCamera(Number(e.target.value))}
                className="bg-surface-2 border border-surface-3 rounded-lg px-2 py-1 text-xs text-gray-200">
                {[0, 1, 2].map((i) => <option key={i} value={i}>cam {i}</option>)}
              </select>
              <button onClick={start} disabled={busy || !track.wsConnected} className="btn-primary text-xs">Start tracking</button>
            </>
          ) : (
            <>
              <button onClick={toggleDrive} disabled={busy || !connected || !anyConfigured}
                className={track.driving ? 'btn-success text-xs' : 'btn-ghost text-xs'}
                title={!connected ? 'connect the hand first' : (!anyConfigured ? 'calibrate limits first' : '')}>
                {track.driving ? 'Driving ●' : 'Drive hand'}
              </button>
              <button onClick={stop} disabled={busy} className="btn-danger text-xs">Stop</button>
            </>
          )}
        </div>
      </header>

      {error && <div className="mx-6 mt-3 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</div>}
      {track.running && !anyConfigured && (
        <div className="mx-6 mt-3 text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">
          No fingers calibrated — set limits on the <Link to="/configure" className="underline font-semibold">Configure Limits</Link> page to enable driving.
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-6 p-6 overflow-hidden">
        {/* Preview */}
        <div className="flex-shrink-0 flex flex-col gap-2" style={{ width: 480 }}>
          <div className="card overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
            {track.frame ? (
              <img src={`data:image/jpeg;base64,${track.frame}`} alt="hand tracking" className="w-full h-full object-contain" />
            ) : (
              <span className="text-xs text-gray-600">{track.running ? 'waiting for frames…' : 'tracking stopped'}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <StatusDot online={track.handPresent} />
            {track.handPresent ? 'hand detected' : 'no hand in view'}
          </div>
        </div>

        {/* Per-finger openness + calibration */}
        <div className="flex-1 min-w-0 overflow-y-auto space-y-4">
          <section className="card p-4">
            <h2 className="data-label mb-3">Detected openness (0 = fist · 1 = open)</h2>
            <div className="space-y-2.5">
              {FINGERS.map((f) => {
                const o = track.openness?.[f] ?? 0
                const w = track.working?.[f]
                return (
                  <div key={f} className="flex items-center gap-3">
                    <span className="w-14 text-xs text-gray-400 capitalize">{f}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(o * 100)}%` }} />
                    </div>
                    <span className="w-24 text-right data-value text-xs">
                      {o.toFixed(2)}
                      {w ? <span className="text-gray-600"> → {w.pos}/{w.span}</span> : <span className="text-gray-700"> · n/a</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="data-label mb-2">Gesture calibration</h2>
            <p className="text-[11px] text-gray-500 mb-3">
              Map your hand's range to the robot: hold your hand fully open and capture, then make a fist and capture.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => capture('open')} disabled={busy || !track.handPresent} className="btn-ghost text-xs">Capture open</button>
              <button onClick={() => capture('fist')} disabled={busy || !track.handPresent} className="btn-ghost text-xs">Capture fist</button>
              {!track.handPresent && <span className="text-[11px] text-gray-600">show your hand to the camera</span>}
            </div>
          </section>

          <p className="text-[11px] text-gray-600 leading-relaxed">
            Vision runs in the backend; only <span className="text-gray-400">configured</span> fingers are driven, motion is
            smoothed and rate-limited, and the firmware clamps to your calibrated hardstops. Use
            <span className="text-danger"> Stop</span> to release the camera.
          </p>
        </div>
      </div>
    </div>
  )
}
