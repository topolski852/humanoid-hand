import { useEffect, useRef, useState } from 'react'

const WS_URL = 'ws://localhost:8765/ws/track'

const EMPTY = {
  wsConnected: false,
  running: false,
  driving: false,
  fps: 0,
  handPresent: false,
  openness: {},
  working: {},
  calibration: {},
  frame: null,
}

// Page-scoped websocket to /ws/track — connects on mount, closes on unmount so
// the backend only streams frames while the Hand Tracking page is open. Mirrors
// the reconnect / StrictMode-safe teardown of TelemetryContext.
export function useTrackStream() {
  const [state, setState] = useState(EMPTY)
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)

  useEffect(() => {
    let cancelled = false

    function connect() {
      if (cancelled) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => setState((s) => ({ ...s, wsConnected: true }))

      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          setState({
            wsConnected: true,
            running: d.running ?? false,
            driving: d.driving ?? false,
            fps: d.fps ?? 0,
            handPresent: d.hand_present ?? false,
            openness: d.openness ?? {},
            working: d.working ?? {},
            calibration: d.calibration ?? {},
            frame: d.frame ?? null,
          })
        } catch (e) { console.warn('track WS parse', e) }
      }

      ws.onclose = () => {
        setState((s) => ({ ...s, wsConnected: false }))
        if (!cancelled) reconnectTimer.current = setTimeout(connect, 2000)
      }
      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      cancelled = true
      clearTimeout(reconnectTimer.current)
      const ws = wsRef.current
      if (!ws) return
      ws.onclose = null
      ws.onerror = null
      if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close()
      else ws.close()
    }
  }, [])

  return state
}
