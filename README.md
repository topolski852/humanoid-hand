# humanoid-hand

Control logic and a desktop app for the InMoov robotic hand, driven by an
**Arduino Uno**. Click a letter of the ASL alphabet and the hand forms the sign.

The hand uses **6 servos** (five fingers + wrist) commanded over the USB serial
port. Arm/head servos from the original InMoov sketch have been removed — no
hardware is attached for them, and we are **not currently working on the wrist**.

## Layout

```
firmware/hand_control/   Arduino sketch (absolute-pose + jog serial protocol)
backend/                 FastAPI + pyserial service that owns the serial port
app/                     Electron + React + Tailwind desktop app
```

The app spawns the backend automatically; the backend opens the serial port and
exposes REST + a telemetry WebSocket on `http://localhost:8765`.

## Hardware

- Arduino Uno
- 6 hobby servos (fingers + wrist)
- USB cable to the host PC (serial @ 9600 baud)

### Pin map

| Servo   | Digital pin | Notes                              |
|---------|-------------|------------------------------------|
| Thumb   | 2           |                                    |
| Index   | 3           |                                    |
| Middle  | 4           |                                    |
| Ring    | 5           | servo is **inverted** (high = open)|
| Pinky   | 6           |                                    |
| Wrist   | 7           | not actively worked on             |

### Per-finger angle limits (raw servo degrees)

| Finger | open | closed |
|--------|------|--------|
| Thumb  | 60   | 180    |
| Index  | 40   | 180    |
| Middle | 30   | 180    |
| Ring   | 150  | 0      |
| Pinky  | 40   | 180    |
| Wrist  | 0 (–90 center) | 180 |

## Serial protocol (firmware/hand_control) @ 9600 baud

Send newline-terminated commands:

- **Absolute pose** — six integers `T I M R P W`, e.g. `60 40 30 150 40 90`.
  Each value is clamped to that finger's range on-device. This is what the app
  sends for an ASL sign.
- **Jog** — a single character nudges one finger by 10°:
  thumb `q`/`a`, index `w`/`s`, middle `e`/`d`, ring `f`/`r`, pinky `t`/`g`,
  wrist `u`/`y`.
- **Query** — `?` prints the current angle line once.

The board prints its six current angles (`T I M R P W`) whenever they change,
plus a 1 Hz heartbeat.

## Serial port permissions (Linux)

The port (`/dev/ttyACM0`) is owned by the `dialout` group. Add your user once:

```sh
sudo usermod -aG dialout $USER
# then log out and back in (or run commands under: sg dialout -c '<cmd>')
```

## Flashing (arduino-cli)

```sh
# one-time setup
arduino-cli core update-index
arduino-cli core install arduino:avr
arduino-cli lib install Servo   # no longer bundled with the AVR core

# with the Uno plugged in, find its port
arduino-cli board list

# compile + upload (adjust the port)
arduino-cli compile --fqbn arduino:avr:uno firmware/hand_control
arduino-cli upload  --fqbn arduino:avr:uno -p /dev/ttyACM0 firmware/hand_control
```

## Running the app

Requires **Node 18+** and **Python 3**.

```sh
# 1) backend deps (one-time)
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cd ..

# 2) app deps (one-time)
cd app
npm install

# 3) run — launches Vite, Electron, and the backend together
npm run dev
```

The Electron main process auto-detects `backend/.venv` and starts the backend;
the backend auto-connects to the first `/dev/ttyACM*` port. Use the **Settings**
page to pick a different port.

### App pages

- **ASL Signs** — grid of A–Z; click a block to form the sign.
- **Live** — live per-finger angles + sliders for manual control / calibration.
- **Settings** — serial port selection and connect/disconnect.

## ASL feasibility

Each finger is a single flexion servo — there is no finger spreading, thumb
rotation, or wrist articulation. Letters that depend on those cannot be truly
distinguished and are badged **approx** in the UI (they snap to the closest
achievable pose): `A C E F G H J K M N O P Q R S T V X Z`. Cleanly formed:
`B D I L U W Y`.
