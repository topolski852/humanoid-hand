import { useEffect, useState } from 'react'
import { api } from '../api'
import { useTelemetry } from '../context/TelemetryContext'
import StatusDot from '../components/StatusDot'

export default function Settings() {
  const { connected, port } = useTelemetry()
  const [ports, setPorts] = useState([])
  const [selected, setSelected] = useState('')
  const [baud, setBaud] = useState(9600)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function refresh() {
    try {
      const list = await api.listPorts()
      setPorts(list)
      if (!selected && list.length) setSelected(list[0].device)
    } catch (e) { setError(e.message) }
  }

  useEffect(() => { refresh() }, [])

  async function connect() {
    setBusy(true); setError(null)
    try { await api.connect(selected || null, baud) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function disconnect() {
    setBusy(true); setError(null)
    try { await api.disconnect() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-3">
        <h1 className="text-lg font-semibold text-white">Settings</h1>
        <p className="text-xs text-gray-500">Serial connection to the Arduino</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <section className="card p-5 max-w-lg space-y-5">
          <div className="flex items-center gap-2 text-sm">
            <StatusDot online={connected} size="lg" />
            <span className="text-gray-300">
              {connected ? `Connected on ${port}` : 'Not connected'}
            </span>
          </div>

          {error && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="space-y-2">
            <label className="data-label">Serial port</label>
            <div className="flex gap-2">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={connected}
                className="flex-1 bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-gray-200 disabled:opacity-50"
              >
                {ports.length === 0 && <option value="">No ports found</option>}
                {ports.map((p) => (
                  <option key={p.device} value={p.device}>
                    {p.device}{p.description ? ` — ${p.description}` : ''}
                  </option>
                ))}
              </select>
              <button onClick={refresh} disabled={connected} className="btn-ghost text-xs">Refresh</button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="data-label">Baud rate</label>
            <input
              type="number"
              value={baud}
              onChange={(e) => setBaud(Number(e.target.value))}
              disabled={connected}
              className="w-40 bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-gray-200 disabled:opacity-50"
            />
          </div>

          <div className="pt-2">
            {connected ? (
              <button onClick={disconnect} disabled={busy} className="btn-danger">Disconnect</button>
            ) : (
              <button onClick={connect} disabled={busy} className="btn-primary">Connect</button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
