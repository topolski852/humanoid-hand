import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

// Assets are served locally from public/ (no CDN — required by the CSP).
const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/models/hand_landmarker.task'

let _landmarker = null
let _loading = null

// Lazily create a single HandLandmarker (VIDEO mode, one hand).
export async function getLandmarker() {
  if (_landmarker) return _landmarker
  if (_loading) return _loading
  _loading = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
    _landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH },
      numHands: 1,
      runningMode: 'VIDEO',
    })
    return _landmarker
  })()
  return _loading
}
