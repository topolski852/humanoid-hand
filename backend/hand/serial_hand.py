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
import threading
import time

import serial
from serial.tools import list_ports

# Ordered finger names — index i maps to the i-th value in an angle list/line.
FINGERS = ["thumb", "index", "middle", "ring", "pinky", "wrist"]

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

    def query(self) -> None:
        self._write_line("?")

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
