const { app, BrowserWindow, dialog, shell, session, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const http = require('http')

const IS_DEV = !app.isPackaged
const BACKEND_PORT = 8765

const BACKEND_DIR = IS_DEV
  ? path.resolve(__dirname, '../../backend')
  : path.join(process.resourcesPath, 'backend')

let mainWindow = null
let backendProcess = null
app.isQuitting = false

// Prefer the backend's own virtualenv interpreter if present, so the spawned
// Python has fastapi/pyserial installed regardless of the system environment.
function resolvePython() {
  const venvPy = process.platform === 'win32'
    ? path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(BACKEND_DIR, '.venv', 'bin', 'python')
  if (fs.existsSync(venvPy)) return venvPy
  return process.platform === 'win32' ? 'python' : 'python3'
}

// ── Poll until the backend answers on /status ─────────────────────────────────
function waitForBackend(maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempt = 0
    function check() {
      attempt++
      const req = http.get(`http://localhost:${BACKEND_PORT}/status`, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (attempt >= maxAttempts) reject(new Error('Backend did not become ready within 20 seconds'))
        else setTimeout(check, 500)
      })
      req.setTimeout(1000, () => {
        req.destroy()
        if (attempt >= maxAttempts) reject(new Error('Backend connection timed out after 20 s'))
        else setTimeout(check, 500)
      })
    }
    setTimeout(check, 1500)  // give Python a moment to import
  })
}

// ── Spawn the FastAPI backend (python main.py) ────────────────────────────────
function startBackend() {
  return new Promise((resolve, reject) => {
    const python = resolvePython()
    backendProcess = spawn(python, ['main.py'], {
      cwd: BACKEND_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })

    backendProcess.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`))
    backendProcess.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`))

    let started = false
    backendProcess.on('error', (err) => {
      if (!started) {
        reject(new Error(`Failed to launch Python: ${err.message}\n\nCheck that python3 is on PATH and backend dependencies are installed (see backend/requirements.txt).`))
      } else {
        showBackendCrash(null, err.message)
      }
    })
    backendProcess.on('exit', (code, signal) => {
      if (!started) {
        reject(new Error(`Backend exited before becoming ready (code ${code ?? signal})`))
        return
      }
      if (!app.isQuitting && code !== 0 && code !== null) showBackendCrash(code)
    })

    waitForBackend()
      .then(() => { started = true; resolve() })
      .catch((err) => { if (!started) reject(err) })
  })
}

function showBackendCrash(code, reason) {
  const detail = reason ?? `Exit code: ${code}`
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Backend Process Crashed',
      message: 'The Python backend stopped unexpectedly.',
      detail: `${detail}\n\nSave your work and restart Humanoid Hand.`,
      buttons: ['Restart', 'Quit'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) { app.relaunch(); app.exit(0) } else { app.quit() }
    })
  }
}

// ── Create the renderer window ────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0f1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    title: 'Humanoid Hand',
  })

  const url = IS_DEV
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`
  mainWindow.loadURL(url)

  if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (!IS_DEV) {
    const prodCSP = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src http://localhost:8765 ws://localhost:8765",
    ].join('; ')
    session.defaultSession.webRequest.onHeadersReceived(
      { urls: ['file://*'] },
      (details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [prodCSP],
          },
        })
      }
    )
  }

  // Allow the renderer to use the camera (getUserMedia) for hand tracking.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  ipcMain.on('app-quit', () => app.quit())

  try {
    console.log('[main] Starting Python backend from', BACKEND_DIR)
    await startBackend()
    console.log('[main] Backend ready — creating window')
    createWindow()
  } catch (err) {
    dialog.showErrorBox('Failed to Start Humanoid Hand', err.message)
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (app.isQuitting) return
  app.isQuitting = true
  if (!backendProcess || backendProcess.killed) return

  event.preventDefault()
  console.log('[main] Sending SIGTERM to backend...')
  backendProcess.kill('SIGTERM')
  const timer = setTimeout(() => {
    if (!backendProcess.killed) backendProcess.kill('SIGKILL')
    app.quit()
  }, 3000)
  backendProcess.once('exit', () => {
    clearTimeout(timer)
    console.log('[main] backend exited')
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
