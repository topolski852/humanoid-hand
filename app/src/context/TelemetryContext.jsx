import { createContext, useContext, useEffect, useRef, useState } from 'react'

const WS_URL = 'ws://localhost:8765/ws/telemetry'

const EMPTY_ANGLES = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0, wrist: 0 }

const TelemetryContext = createContext({
  connected: false,       // hand (serial) connected
  wsConnected: false,     // backend WebSocket reachable
  port: null,
  angles: EMPTY_ANGLES,
})

export function TelemetryProvider({ children }) {
  const [connected, setConnected]   = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [port, setPort]             = useState(null)
  const [angles, setAngles]         = useState(EMPTY_ANGLES)
  const wsRef          = useRef(null)
  const reconnectTimer = useRef(null)

  useEffect(() => {
    let cancelled = false

    function connect() {
      if (cancelled) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => setWsConnected(true)

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          setConnected(data.connected ?? false)
          setPort(data.port ?? null)
          if (data.angles) setAngles(data.angles)
        } catch (e) { console.warn('WS parse error', e) }
      }

      ws.onclose = () => {
        setWsConnected(false)
        setConnected(false)
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
      // Null handlers before closing so the reconnect timer can't fire and to
      // avoid the "closed before connection established" warning under React
      // StrictMode's double-mount in development.
      ws.onclose = null
      ws.onerror = null
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close()
      } else {
        ws.close()
      }
    }
  }, [])

  return (
    <TelemetryContext.Provider value={{ connected, wsConnected, port, angles }}>
      {children}
    </TelemetryContext.Provider>
  )
}

export const useTelemetry = () => useContext(TelemetryContext)
