import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../api'
import { useTelemetry } from '../context/TelemetryContext'
import StatusDot from './StatusDot'

const LINKS = [
  { to: '/asl',      label: 'ASL Signs', icon: HandIcon },
  { to: '/live',     label: 'Live',      icon: SlidersIcon },
  { to: '/settings', label: 'Settings',  icon: GearIcon },
]

function SidebarLink({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-accent-muted text-accent' : 'text-gray-400 hover:text-white hover:bg-surface-2'
        }`
      }
    >
      <Icon className="w-4 h-4" />
      {label}
    </NavLink>
  )
}

export default function Sidebar() {
  const { connected, wsConnected, port } = useTelemetry()
  const [busy, setBusy] = useState(false)

  async function toggleConnection() {
    setBusy(true)
    try {
      if (connected) await api.disconnect()
      else await api.connect()
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-surface-1 border-r border-surface-3 flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-surface-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🖐️</span>
          <span className="font-semibold text-white">Humanoid Hand</span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <StatusDot online={connected} />
            <span className="text-gray-400 font-mono truncate max-w-[90px]">
              {connected ? (port || 'connected') : 'disconnected'}
            </span>
          </div>
          <button
            onClick={toggleConnection}
            disabled={busy || !wsConnected}
            className={connected ? 'btn-danger !px-2 !py-1 text-xs' : 'btn-success !px-2 !py-1 text-xs'}
          >
            {connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
        {!wsConnected && (
          <p className="mt-2 text-[10px] text-warn">backend offline…</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {LINKS.map((l) => <SidebarLink key={l.to} {...l} />)}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-surface-3">
        <button onClick={() => window.electron?.quit?.()} className="btn-ghost w-full text-xs">
          Quit
        </button>
      </div>
    </aside>
  )
}

// ── Inline icons ──────────────────────────────────────────────────────────────
function HandIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  )
}
function SlidersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  )
}
function GearIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
