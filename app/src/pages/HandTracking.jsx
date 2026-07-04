import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, wsUrl } from '../api'
import { useTelemetry } from '../context/TelemetryContext'
import StatusDot from '../components/StatusDot'
import { getLandmarker } from '../tracking/landmarker'
import {
  TRACKED, CONNECTIONS, fingerMetrics, metricsToOpenness,
  loadGestureCal, saveGestureCal, captureGesture,
} from '../tracking/openness'

// Tracking runs in THIS browser using the visitor's own camera. Only the
// per-finger openness numbers are sent to the backend to drive the servos.
export default function HandTracking() {
  const { connected } = useTelemetry()
  const [limits, setLimits] = useState({})
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [driving, setDriving] = useState(false)
  const [handPresent, setHandPresent] = useState(false)
  const [openness, setOpenness] = useState({})
  const [fps, setFps] = useState(0)
  const [error, setError] = useState(null)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const wsRef = useRef(null)
  const lmRef = useRef(null)
  const streamRef = useRef(null)
  const calRef = useRef(loadGestureCal())
  const drivingRef = useRef(false)
  const metricsRef = useRef({})
  const lastStateT = useRef(0)
  const lastFrameT = useRef(0)

  useEffect(() => { api.getLimits().then(setLimits).catch(() => {}) }, [connected])
  useEffect(() => () => stop(), [])   // cleanup on unmount

  const anyConfigured = TRACKED.some((f) => limits[f]?.configured)

  function openWs() {
    try {
      const ws = new WebSocket(wsUrl('/ws/drive'))
      wsRef.current = ws
    } catch (e) { /* non-fatal */ }
  }

  async function start() {
    setError(null); setLoading(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }, audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      await video.play()
      lmRef.current = await getLandmarker()
      setLoading(false); setRunning(true)
      openWs()
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      setLoading(false)
      setError(e.name === 'NotAllowedError' ? 'Camera permission denied.' : (e.message || String(e)))
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
    if (wsRef.current) { try { wsRef.current.close() } catch { /* */ } wsRef.current = null }
    drivingRef.current = false
    setDriving(false); setRunning(false); setHandPresent(false)
    const c = canvasRef.current
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height)
  }

  function toggleDrive() {
    const next = !drivingRef.current
    drivingRef.current = next
    setDriving(next)
  }

  async function relax() {
    drivingRef.current = false
    setDriving(false)
    try { await api.relax() } catch (e) { setError(e.message) }
  }

  function capture(pose) {
    const next = captureGesture(calRef.current, pose, metricsRef.current)
    calRef.current = next
    saveGestureCal(next)
  }

  function loop() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !lmRef.current) return
    if (video.readyState >= 2) {
      if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight }
      const now = performance.now()
      let result
      try { result = lmRef.current.detectForVideo(video, now) } catch { result = null }
      const hands = result?.landmarks
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (hands && hands.length) {
        const lm = hands[0]
        drawWire(ctx, lm, canvas.width, canvas.height)
        const metrics = fingerMetrics(lm)
        metricsRef.current = metrics
        const o = metricsToOpenness(metrics, calRef.current)
        if (drivingRef.current && wsRef.current?.readyState === 1) {
          wsRef.current.send(JSON.stringify({ driving: true, openness: o }))
        }
        if (now - lastStateT.current > 80) {   // throttle React updates
          setOpenness(o); setHandPresent(true); lastStateT.current = now
        }
      } else if (now - lastStateT.current > 120) {
        setHandPresent(false); lastStateT.current = now
      }
      const dt = now - lastFrameT.current
      lastFrameT.current = now
      if (dt > 0 && now - lastStateT.current < 5) setFps(Math.round(1000 / dt))
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Hand Tracking</h1>
          <p className="text-xs text-gray-500">Uses <span className="text-gray-400">your device's</span> camera — tracking runs in your browser</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 mr-1">
            <StatusDot online={running} />
            {running ? `${fps} fps` : (loading ? 'loading…' : 'stopped')}
          </div>
          {!running ? (
            <button onClick={start} disabled={loading} className="btn-primary text-xs">Start camera</button>
          ) : (
            <>
              <button onClick={toggleDrive} disabled={!connected || !anyConfigured}
                className={driving ? 'btn-success text-xs' : 'btn-ghost text-xs'}
                title={!connected ? 'connect the hand first' : (!anyConfigured ? 'calibrate limits first' : '')}>
                {driving ? 'Driving ●' : 'Drive hand'}
              </button>
              <button onClick={stop} className="btn-ghost text-xs">Stop camera</button>
            </>
          )}
          <button onClick={relax} disabled={!connected} className="btn-danger text-xs"
            title="detach all servos (stop holding force)">Relax</button>
        </div>
      </header>

      {error && <div className="mx-6 mt-3 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</div>}
      {running && !anyConfigured && (
        <div className="mx-6 mt-3 text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">
          No fingers calibrated — set limits on the <Link to="/configure" className="underline font-semibold">Configure Limits</Link> page to enable driving.
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-6 p-6 overflow-hidden">
        <div className="flex-shrink-0 flex flex-col gap-2" style={{ width: 480 }}>
          <div className="card overflow-hidden bg-black aspect-[4/3] relative flex items-center justify-center">
            {/* mirror both video + overlay for a natural selfie view */}
            <video ref={videoRef} muted playsInline className="w-full h-full object-contain" style={{ transform: 'scaleX(-1)' }} />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" style={{ transform: 'scaleX(-1)' }} />
            {!running && <span className="absolute text-xs text-gray-600">camera off</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <StatusDot online={handPresent} />
            {handPresent ? 'hand detected' : (running ? 'no hand in view' : 'camera off')}
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto space-y-4">
          <section className="card p-4">
            <h2 className="data-label mb-3">Detected openness (0 = fist · 1 = open)</h2>
            <div className="space-y-2.5">
              {TRACKED.map((f) => {
                const o = openness?.[f] ?? 0
                return (
                  <div key={f} className="flex items-center gap-3">
                    <span className="w-14 text-xs text-gray-400 capitalize">{f}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(o * 100)}%` }} />
                    </div>
                    <span className="w-10 text-right data-value text-xs">{o.toFixed(2)}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="data-label mb-2">Gesture calibration</h2>
            <p className="text-[11px] text-gray-500 mb-3">
              Map your hand's range: hold your hand fully open and capture, then make a fist and capture. Saved in this browser.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => capture('open')} disabled={!handPresent} className="btn-ghost text-xs">Capture open</button>
              <button onClick={() => capture('fist')} disabled={!handPresent} className="btn-ghost text-xs">Capture fist</button>
              {!handPresent && running && <span className="text-[11px] text-gray-600">show your hand to the camera</span>}
            </div>
          </section>

          <p className="text-[11px] text-gray-600 leading-relaxed">
            Your camera never leaves your device — only the openness numbers go to the hand. Only
            <span className="text-gray-400"> configured</span> fingers are driven, and it's rate-limited + clamped to your calibrated limits.
          </p>
        </div>
      </div>
    </div>
  )
}

function drawWire(ctx, lm, w, h) {
  ctx.strokeStyle = '#00b4ff'
  ctx.lineWidth = 2
  for (const [a, b] of CONNECTIONS) {
    ctx.beginPath()
    ctx.moveTo(lm[a].x * w, lm[a].y * h)
    ctx.lineTo(lm[b].x * w, lm[b].y * h)
    ctx.stroke()
  }
  ctx.fillStyle = '#50dc78'
  for (const p of lm) {
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}
