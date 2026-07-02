# humanoid-hand

Control logic for the InMoov robotic hand, driven by an **Arduino Uno**.

The hand uses **6 servos** (five fingers + wrist) commanded over the USB serial
port. The original InMoov sketch also defines the arm/head servos (biceps,
rotate, shoulder, omoplat, neck, rothead); those are left in the code but have
no hardware attached on this build. We are **not currently working on the wrist**.

## Hardware

- Arduino Uno
- 6 hobby servos (fingers + wrist)
- USB cable to the host PC (serial @ 9600 baud)

### Pin map

| Servo   | Digital pin | Notes                         |
|---------|-------------|-------------------------------|
| Thumb   | 2           |                               |
| Index   | 3           |                               |
| Middle  | 4           |                               |
| Ring    | 5           |                               |
| Pinky   | 6           |                               |
| Wrist   | 7           | not actively worked on        |
| Biceps  | 8           | arm — no hardware attached     |
| Rotate  | 9           | arm — no hardware attached     |
| Shoulder| 10          | arm — no hardware attached     |
| Omoplat | 11          | arm — no hardware attached     |
| Neck    | 12          | head — no hardware attached    |
| RotHead | 13          | head — no hardware attached    |

## Sketches

- **`basic_hand_control/`** — jog each finger up/down over serial. Prints the
  current finger angles each loop.
- **`buddy_hand_control/`** — everything in basic, plus sign-language routines
  that finger-spell "buddy" (`makeB` / `makeU` / `makeD` / `makeY`).

## Serial controls

Open a serial monitor at **9600 baud** and send single characters:

| Finger  | decrease | increase |
|---------|----------|----------|
| Thumb   | `q`      | `a`      |
| Index   | `w`      | `s`      |
| Middle  | `e`      | `d`      |
| Ring    | `f`      | `r`      |
| Pinky   | `t`      | `g`      |
| Wrist   | `u`      | `y`      |

`buddy_hand_control` adds: `z`=B, `x`=U, `c`=D, `v`=Y, `b`=spell "buddy".

## Flashing (arduino-cli)

```sh
# one-time setup
arduino-cli core update-index
arduino-cli core install arduino:avr

# with the Uno plugged in, find its port
arduino-cli board list

# compile + upload (adjust the port)
arduino-cli compile --fqbn arduino:avr:uno basic_hand_control
arduino-cli upload  --fqbn arduino:avr:uno -p /dev/ttyACM0 basic_hand_control
```
