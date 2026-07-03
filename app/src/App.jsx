import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TelemetryProvider } from './context/TelemetryContext'
import Sidebar from './components/Sidebar'
import AslSigns from './pages/AslSigns'
import Live from './pages/Live'
import Settings from './pages/Settings'

function AppInner() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden">
        <Routes>
          <Route path="/asl" element={<AslSigns />} />
          <Route path="/live" element={<Live />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/asl" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <TelemetryProvider>
      <HashRouter>
        <AppInner />
      </HashRouter>
    </TelemetryProvider>
  )
}
