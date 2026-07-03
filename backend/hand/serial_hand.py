"""
pyserial wrapper around the InMoov hand's Arduino.

The Arduino (firmware/hand_control) speaks a line protocol @ 9600 baud:
  - send  "T I M R P W\n"  -> six absolute servo angles (clamped on-device)
  - send  "<char>\n"       -> a single jog keypress
  - send  "?\n"            -> ask it to print its current angles
  - it prints "T I M R P W\n" whenever the angles change (+ a 1 Hz heartbeat)

This class owns the port and a background reader thread that keeps
``self.angles`` up to date so the FastAPI telemetry loop can just read it.
"""
from __future__ import annotations

import glob
import json
import os
import threading
import time

import serial
from serial.tools import list_ports

# Ordered finger names — index i maps to the i-th value in an angle list/line.
FINGERS = ["thumb", "index", "middle", "ring", "pinky", "wrist"]

# Captured joint limits persist here so calibration survives restarts.
_LIMITS_PATH = os.path.join(os.path.dirname(__file__), "limits.json")

# How long to wait after opening the port for the Uno to finish its
# auto-reset-on-DTR reboot before it will accept commands.
_BOOT_WAIT_S = 2.2


class SerialHand:
    def __init__(self) -> None:
        self._ser: serial.Serial | None = None
        self._port: str | None = None
        self._reader: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self.angles: dict[str, int] = {name: 0 for name in FINGERS}
        self.last_rx: float = 0.0
        # Captured per-finger limits: {finger: {"open": int|None, "close": int|None}}.
        self.limits: dict[str, dict] = self._load_limits()

    # ── introspection ────────────────────────────────────────────────────────
    @staticmethod
    def list_ports() -> list[dict]:
        """All serial ports, likely-Arduino ones first."""
        ports = []
        for p in list_ports.comports():
            ports.append({
                "device": p.device,
                "description": p.description or "",
                "manufacturer": p.manufacturer or "",
            })
        ports.sort(key=lambda d: ("ACM" not in d["device"] and "USB" not in d["device"], d["device"]))
        return ports

    @staticmethod
    def _default_port() -> str | None:
        candidates = sorted(glob.glob("/dev/ttyACM*") + glob.glob("/dev/ttyUSB*"))
        return candidates[0] if candidates else None

    def is_connected(self) -> bool:
        return self._ser is not None and self._ser.is_open

    @property
    def port(self) -> str | None:
        return self._port

    def status(self) -> dict:
        with self._lock:
            angles = dict(self.angles)
        return {
            "connected": self.is_connected(),
            "port": self._port,
            "angles": angles,
            "last_rx": self.last_rx,
        }

    # ── connection lifecycle ─────────────────────────────────────────────────
    def connect(self, port: str | None = None, baud: int = 9600) -> str:
        """Open the port (auto-detecting if ``port`` is None). Returns the device."""
        if self.is_connected():
            self.disconnect()
        port = port or self._default_port()
        if not port:
            raise RuntimeError("No serial port found (no /dev/ttyACM* or /dev/ttyUSB*)")

        ser = serial.Serial(port, baud, timeout=1)
        # The Uno reboots when the port opens; wait it out, then flush the boot banner.
        time.sleep(_BOOT_WAIT_S)
        ser.reset_input_buffer()

        self._ser = ser
        self._port = port
        self._stop.clear()
        self._reader = threading.Thread(target=self._read_loop, name="hand-serial-reader", daemon=True)
        self._reader.start()

        self.query()  # prime self.angles with the current state
        self.apply_limits()  # re-push any calibrated limits to the fresh boot
        return port

    def disconnect(self) -> None:
        self._stop.set()
        if self._reader and self._reader.is_alive():
            self._reader.join(timeout=1.0)
        self._reader = None
        if self._ser is not None:
            try:
                self._ser.close()
            except Exception:
                pass
        self._ser = None
        self._port = None

    # ── commands ─────────────────────────────────────────────────────────────
    def _write_line(self, line: str) -> None:
        if not self.is_connected():
            raise RuntimeError("Hand not connected")
        assert self._ser is not None
        self._ser.write((line + "\n").encode("ascii"))
        self._ser.flush()

    def send_pose(self, angles: list[int]) -> None:
        """Send six absolute servo angles [thumb, index, middle, ring, pinky, wrist]."""
        if len(angles) != 6:
            raise ValueError(f"expected 6 angles, got {len(angles)}")
        self._write_line(" ".join(str(int(a)) for a in angles))

    def send_jog(self, char: str) -> None:
        """Send a single jog keypress (q/a/w/s/e/d/f/r/t/g/u/y)."""
        if len(char) != 1:
            raise ValueError("jog expects a single character")
        self._write_line(char)

    def send_nudge(self, index: int, delta: int) -> None:
        """Nudge one finger by a signed number of degrees ("n I D")."""
        self._write_line(f"n {int(index)} {int(delta)}")

    def send_joint(self, index: int, angle: int) -> None:
        """Drive one finger to an absolute unit ("j I A")."""
        self._write_line(f"j {int(index)} {int(angle)}")

    def goto(self, finger: str, which: str) -> list[str]:
        """Drive configured finger(s) to their 'open' or 'close' limit. finger may
        be a name or 'all'. Only fingers that are configured actually move."""
        if which not in ("open", "close"):
            raise ValueError("which must be 'open' or 'close'")
        targets = FINGERS if finger == "all" else [finger]
        moved = []
        for name in targets:
            lim = self.limits.get(name)
            if lim and lim.get("configured") and lim.get(which) is not None:
                self.send_joint(FINGERS.index(name), lim[which])
                moved.append(name)
        return moved

    def send_relax(self) -> None:
        """Detach all servos (stop driving; hold pins low)."""
        self._write_line("x")

    def query(self) -> None:
        self._write_line("?")

    # ── joint limits + position offset (live calibration, persisted) ──────────
    # Per finger: {"open": unit|None, "close": unit|None, "configured": bool}.
    # open/close are RAW units captured during calibration (may be negative).
    # "configured" means the range has been committed: the firmware hardstop
    # limits are tightened and the app works in offset (0-at-close) coordinates.
    _WIDE = (-15, 195)   # calibration-time firmware limits (match firmware defaults)

    def _load_limits(self) -> dict:
        default = {name: {"open": None, "close": None, "configured": False} for name in FINGERS}
        try:
            with open(_LIMITS_PATH) as f:
                saved = json.load(f)
            for name in FINGERS:
                if name in saved:
                    default[name]["open"] = saved[name].get("open")
                    default[name]["close"] = saved[name].get("close")
                    default[name]["configured"] = bool(saved[name].get("configured", False))
        except (FileNotFoundError, ValueError):
            pass
        return default

    def _save_limits(self) -> None:
        with open(_LIMITS_PATH, "w") as f:
            json.dump(self.limits, f, indent=2)

    def send_limit(self, index: int, a: int, b: int) -> None:
        """Set a finger's on-device software limits ("L I A B")."""
        self._write_line(f"L {int(index)} {int(a)} {int(b)}")

    def apply_limits(self) -> None:
        """After a boot, re-push firmware limits: tightened hardstops for
        configured fingers, wide bounds for the rest (calibration still open)."""
        for i, name in enumerate(FINGERS):
            lim = self.limits[name]
            o, c = lim["open"], lim["close"]
            try:
                if lim.get("configured") and o is not None and c is not None:
                    self.send_limit(i, min(o, c), max(o, c))
                else:
                    self.send_limit(i, *self._WIDE)
            except Exception:
                pass

    def set_limit(self, finger: str, which: str, value: int) -> dict:
        """Record one raw bound ('open'|'close') during calibration. Does NOT
        clamp the firmware yet — that happens on configure()."""
        if finger not in FINGERS:
            raise ValueError(f"unknown finger '{finger}'")
        if which not in ("open", "close"):
            raise ValueError("which must be 'open' or 'close'")
        self.limits[finger][which] = int(value)
        self.limits[finger]["configured"] = False   # re-capturing reopens calibration
        try:
            self.send_limit(FINGERS.index(finger), *self._WIDE)  # keep movable
        except Exception:
            pass
        self._save_limits()
        return self.limits[finger]

    def configure(self) -> dict:
        """Commit calibration: for every finger with both bounds captured, tighten
        the firmware hardstop limits to [min,max] and mark it configured. The app
        then works in offset (0-at-close) coordinates. Returns the full table."""
        for i, name in enumerate(FINGERS):
            o, c = self.limits[name]["open"], self.limits[name]["close"]
            if o is not None and c is not None:
                try:
                    self.send_limit(i, min(o, c), max(o, c))
                    self.limits[name]["configured"] = True
                except Exception:
                    pass
        self._save_limits()
        return self.limits

    def clear_limit(self, finger: str) -> dict:
        if finger not in FINGERS:
            raise ValueError(f"unknown finger '{finger}'")
        self.limits[finger] = {"open": None, "close": None, "configured": False}
        self._save_limits()
        try:
            self.send_limit(FINGERS.index(finger), *self._WIDE)  # freely movable again
        except Exception:
            pass
        return self.limits[finger]

    # ── background reader ────────────────────────────────────────────────────
    def _read_loop(self) -> None:
        assert self._ser is not None
        while not self._stop.is_set():
            try:
                raw = self._ser.readline()
            except Exception:
                break
            if not raw:
                continue
            line = raw.decode("ascii", errors="replace").strip()
            self._parse_line(line)

    def _parse_line(self, line: str) -> None:
        parts = line.split()
        if len(parts) != 6:
            return  # banner / non-telemetry line
        try:
            vals = [int(p) for p in parts]
        except ValueError:
            return
        with self._lock:
            for name, v in zip(FINGERS, vals):
                self.angles[name] = v
            self.last_rx = time.time()
