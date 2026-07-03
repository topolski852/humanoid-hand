import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TelemetryProvider } from './context/TelemetryContext'
import Sidebar from './components/Sidebar'
import HandControl from './pages/HandControl'
import ConfigureLimits from './pages/ConfigureLimits'
import HandTracking from './pages/HandTracking'
import AslSigns from './pages/AslSigns'
import Settings from './pages/Settings'

function AppInner() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden">
        <Routes>
          <Route path="/control" element={<HandControl />} />
          <Route path="/configure" element={<ConfigureLimits />} />
          <Route path="/tracking" element={<HandTracking />} />
          <Route path="/asl" element={<AslSigns />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/control" replace />} />
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
