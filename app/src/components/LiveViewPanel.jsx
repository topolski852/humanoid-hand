import { useState } from 'react'
import { cameraStreamUrl } from '../api'

// Floating, collapsible live view of the robot (server webcam), rendered in the
// app shell so it's available on EVERY page — watch the hand while you drive it.
// The MJPEG <img> is only mounted while expanded, so the server camera is opened
// only when someone is actually watching.
export default function LiveViewPanel() {
  const [open, setOpen] = useState(() => localStorage.getItem('liveview_open') !== '0')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('liveview_collapsed') === '1')
  const [err, setErr] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  function persist(o, c) {
    try {
      localStorage.setItem('liveview_open', o ? '1' : '0')
      localStorage.setItem('liveview_collapsed', c ? '1' : '0')
    } catch { /* ignore */ }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); persist(true, collapsed) }}
        className="fixed bottom-4 right-4 z-40 btn-ghost text-xs shadow-lg"
      >
        📹 Live view
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 card overflow-hidden shadow-2xl" style={{ width: collapsed ? 200 : 340 }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-surface-3 bg-surface-2">
        <span className="text-[11px] font-medium text-gray-300">Robot live view</span>
        <div className="flex items-center gap-2 text-gray-500">
          <button onClick={() => { setErr(false); setReloadKey((k) => k + 1) }} title="reload" className="hover:text-white">⟳</button>
          <button onClick={() => { const c = !collapsed; setCollapsed(c); persist(true, c) }} title={collapsed ? 'expand' : 'collapse'} className="hover:text-white">
            {collapsed ? '▢' : '—'}
          </button>
          <button onClick={() => { setOpen(false); persist(false, collapsed) }} title="hide" className="hover:text-white">✕</button>
        </div>
      </div>
      {!collapsed && (
        <div className="bg-black aspect-[4/3] flex items-center justify-center">
          {err ? (
            <span className="text-[11px] text-gray-600 px-3 text-center">camera unavailable — is a USB webcam plugged in and free?</span>
          ) : (
            <img
              key={reloadKey}
              src={cameraStreamUrl()}
              onError={() => setErr(true)}
              className="w-full h-full object-contain"
              alt="robot live view"
            />
          )}
        </div>
      )}
    </div>
  )
}
