# humanoid-hand

Control logic and a desktop app for the InMoov robotic hand, driven by an
**Arduino Uno**. Manually pulse each finger, calibrate its limits, form ASL
letters, or **teleoperate the hand from a webcam** (2D hand tracking).

The hand uses **6 servos** (five fingers + wrist) — open-loop 3-wire hobby
servos (HK15298), no position feedback — commanded over USB serial. Arm/head
servos from the original InMoov sketch have been removed, and the wrist is not
actively worked on.

## Layout

```
firmware/hand_control/   Arduino sketch (relative nudge + limits serial protocol)
backend/                 FastAPI + pyserial + OpenCV/MediaPipe service
app/                     Electron + React + Tailwind desktop app
```

The app spawns the backend automatically; the backend owns the serial port (and
the webcam for tracking) and exposes REST + WebSockets on `http://localhost:8765`.

## Hardware

- Arduino Uno + 6 hobby servos (HK15298, 3-wire, open-loop)
- USB serial @ 9600 baud
- A 2D USB webcam (optional, for hand tracking)

### Pin map

| Servo | Pin | Notes |
|-------|-----|-------|
| Thumb | 2 | |
| Index | 3 | |
| Middle| 4 | |
| Ring  | 5 | servo is **mechanically inverted** |
| Pinky | 6 | |
| Wrist | 7 | not actively worked on |

## Control model — no feedback

The servos have no position feedback, so absolute positioning is unreliable.
Control is **relative pulsing** plus a **position-offset calibration** (like the
Berkeley ESC firmware): pulse each finger to its physical hardstops, capture
`open`/`close`, and commit. Committing tightens the on-device software limits and
zeroes each finger at close, so the app works in a clean `0…span` (0 = closed)
coordinate. The firmware drives via **microseconds with a slightly extended
window**, so a finger can travel a few degrees "negative" past the nominal 0
during calibration.

## Serial protocol (firmware/hand_control) @ 9600 baud

Newline-terminated. Finger index `I`: 0 thumb, 1 index, 2 middle, 3 ring, 4
pinky, 5 wrist.

- `n I D` — nudge finger `I` by signed `D` (relative). Primary control.
- `j I A` — set finger `I` to absolute unit `A` (clamped to limits).
- `L I A B` — set finger `I` software limits to `[min(A,B), max(A,B)]`.
- `T I M R P W` — six-int absolute pose; only fingers whose value changed move.
- `x` — relax (detach all servos; hold pins low).
- `?` — print the six target units; `l` — print the twelve limits.
- Single-char jogs (`q/a w/s e/d f/r t/g u/y`) nudge one finger by 5°.

On power-up the servos are **detached** and pins held LOW — nothing is driven.

## Running the app

Requires **Node 18+** and **Python 3** (backend venv tested on 3.12).

```sh
# 1) backend deps (one-time) — includes OpenCV + MediaPipe (large)
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

# 2) hand-tracking model (one-time, ~7.5 MB, gitignored)
mkdir -p hand/models
curl -L -o hand/models/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
cd ..

# 3) app deps (one-time)
cd app && npm install && cd ..

# 4) run — launches Vite, Electron, and the backend together
cd app && npm run dev
```

The Electron main process auto-detects `backend/.venv`, starts the backend, and
the backend auto-connects to the first `/dev/ttyACM*` port (override in Settings).

### Run as a web app (browser, no Electron)

The same UI can be served from the backend so anyone on the network can use it in
a browser. Build the UI once, then run the backend as the web server:

```sh
cd app && npm run build && cd ..              # produces app/dist/
cd backend
HAND_HOST=0.0.0.0 ./.venv/bin/python main.py  # serve on all interfaces, port 8765
```

Then browse to `http://<server-ip>:8765` (or `http://localhost:8765` locally). The
frontend uses same-origin API/WebSocket URLs automatically, so it works from any
host. The Arduino and webcam are on the **server** machine — remote users drive
that hand and see that webcam.

- This is an **alternative** to the desktop app — don't run both at once; they
  contend for the serial port and camera.
- No authentication: only expose it on a trusted LAN. `HAND_HOST`/`HAND_PORT`
  default to `localhost`/`8765`.

### App pages

- **Hand Control** — pulse fingers toward open/close (0 = closed), or drive them
  straight to their calibrated open/close limits. Scalable hand diagram.
- **Configure Limits** — pulse each finger to its hardstops, capture open/close
  (may go negative), then **Configure hand** to commit the position offset.
- **Hand Tracking** — track a human hand on the webcam and mirror it on the
  robot (see below).
- **ASL Signs** — grid of A–Z; click a block to form the sign.
- **Settings** — serial port selection and connect/disconnect.

## Hand tracking (webcam teleoperation)

OpenCV + MediaPipe HandLandmarker run **in the backend**, which owns the webcam
and streams an annotated preview (with a landmark wireframe) to the app. On the
**Hand Tracking** page: Start tracking, hold your hand up, capture your open/fist
range, then enable **Drive hand** — the robot mirrors your fingers (smoothed,
rate-limited, only configured fingers, clamped to your hardstops).

- Only one app can use the camera at a time — close other webcam apps (e.g.
  Cheese) first.
- The webcam (`/dev/video0`) is group `video`; most desktop sessions grant access
  via ACL. If not: `sudo usermod -aG video $USER` (then re-login) or `sg video`.

## Serial / permissions (Linux)

The port (`/dev/ttyACM0`) is group `dialout`:

```sh
sudo usermod -aG dialout $USER   # then re-login, or run under: sg dialout -c '<cmd>'
```

## Flashing (arduino-cli)

```sh
arduino-cli core update-index
arduino-cli core install arduino:avr
arduino-cli lib install Servo

arduino-cli compile --fqbn arduino:avr:uno firmware/hand_control
arduino-cli upload  --fqbn arduino:avr:uno -p /dev/ttyACM0 firmware/hand_control
```

## ASL feasibility

Each finger is a single flexion servo — no finger spreading, thumb rotation, or
wrist articulation. Letters that depend on those are badged **approx** in the UI
(they snap to the closest achievable pose): `A C E F G H J K M N O P Q R S T V X Z`.
Cleanly formed: `B D I L U W Y`.
