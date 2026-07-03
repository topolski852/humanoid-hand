import { useEffect, useState } from 'react'
import { api } from '../api'
import { useTelemetry } from '../context/TelemetryContext'
import AslSignCard from '../components/AslSignCard'
import StatusDot from '../components/StatusDot'

export default function AslSigns() {
  const { connected } = useTelemetry()
  const [signs, setSigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [active, setActive] = useState(null)

  useEffect(() => {
    let alive = true
    api.getSigns()
      .then((data) => { if (alive) { setSigns(data); setLoading(false) } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false) } })
    return () => { alive = false }
  }, [])

  async function play(letter) {
    setActive(letter)
    try {
      await api.playSign(letter)
    } catch (e) {
      setError(e.message)
    }
  }

  async function rest() {
    setActive(null)
    try { await api.rest() } catch (e) { setError(e.message) }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">ASL Signs</h1>
          <p className="text-xs text-gray-500">Click a letter to form the sign on the hand</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <StatusDot online={connected} />
            {connected ? 'hand ready' : 'hand disconnected'}
          </div>
          <button onClick={rest} disabled={!connected} className="btn-ghost text-xs">
            Open hand
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {!connected && (
          <div className="mb-4 text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">
            The hand is not connected — click <span className="font-semibold">Connect</span> in the sidebar.
            You can still browse the signs.
          </div>
        )}
        {error && (
          <div className="mb-4 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-gray-500">Loading signs…</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {signs.map((sign) => (
              <AslSignCard
                key={sign.letter}
                sign={sign}
                active={active === sign.letter}
                disabled={!connected}
                onClick={() => play(sign.letter)}
              />
            ))}
          </div>
        )}
        <p className="mt-6 text-[11px] text-gray-600 leading-relaxed max-w-2xl">
          <span className="text-warn font-medium">approx</span> letters can't be
          fully formed on a hand with one servo per finger (no finger spreading,
          thumb rotation, or wrist motion) — e.g. U/V/R look identical, and J/Z are
          motions shown as their static shape. They snap to the closest achievable pose.
        </p>
      </div>
    </div>
  )
}
