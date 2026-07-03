"""
2D webcam hand tracking → robot hand teleoperation.

Owns the webcam and a MediaPipe HandLandmarker pipeline in a background thread.
Each frame it computes a per-finger "openness" (0 = closed/fist, 1 = open/extended)
from the 21 hand landmarks, and — when driving is enabled — maps that to each
configured finger's calibrated open/close range and drives the servos via
SerialHand. The annotated frame is kept as JPEG bytes for the app preview.

Uses the MediaPipe Tasks API (mediapipe>=0.10.x removed the legacy mp.solutions).
Model: backend/hand/models/hand_landmarker.task.
"""
from __future__ import annotations

import json
import math
import os
import threading
import time

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision

from .serial_hand import SerialHand, FINGERS

_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "hand_landmarker.task")
_CAL_PATH = os.path.join(os.path.dirname(__file__), "tracking_cal.json")

# Joint whose angle is each finger's curl metric.
# 4 fingers: angle at PIP (MCP, PIP, TIP). Thumb: angle at IP (MCP, IP, TIP).
_ANGLE_LM = {
    "thumb":  (2, 3, 4),
    "index":  (5, 6, 8),
    "middle": (9, 10, 12),
    "ring":   (13, 14, 16),
    "pinky":  (17, 18, 20),
}
_TRACKED = ["thumb", "index", "middle", "ring", "pinky"]

# Standard MediaPipe hand skeleton connections (for drawing).
_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17),
]

# Default metric (degrees) at the fist/open extremes; refined by 2-pose calibration.
_DEFAULT_CAL = {
    "thumb":  {"fist": 120, "open": 165},
    "index":  {"fist": 40,  "open": 175},
    "middle": {"fist": 40,  "open": 178},
    "ring":   {"fist": 40,  "open": 175},
    "pinky":  {"fist": 45,  "open": 172},
}

_EMA_ALPHA = 0.5
_DRIVE_HZ = 15
_DEADBAND = 2


def _angle(a, b, c) -> float:
    ba = np.array([a.x - b.x, a.y - b.y])
    bc = np.array([c.x - b.x, c.y - b.y])
    cos = float(np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6))
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


class HandTracker:
    def __init__(self, hand: SerialHand) -> None:
        self._hand = hand
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.Lock()

        self.running = False
        self.driving = False
        self.camera_index = 0
        self.fps = 0.0
        self.hand_present = False
        self.openness: dict[str, float] = {f: 0.0 for f in _TRACKED}
        self._metric: dict[str, float] = {f: 0.0 for f in _TRACKED}
        self._jpeg: bytes | None = None
        self._last_sent: dict[str, int] = {}
        self._last_drive_t = 0.0
        self._cap = None
        self.cal = self._load_cal()

    # ── calibration persistence ──────────────────────────────────────────────
    def _load_cal(self) -> dict:
        cal = {f: dict(_DEFAULT_CAL[f]) for f in _TRACKED}
        try:
            with open(_CAL_PATH) as fp:
                saved = json.load(fp)
            for f in _TRACKED:
                if f in saved:
                    cal[f].update({k: saved[f][k] for k in ("fist", "open") if k in saved[f]})
        except (FileNotFoundError, ValueError):
            pass
        return cal

    def _save_cal(self) -> None:
        with open(_CAL_PATH, "w") as fp:
            json.dump(self.cal, fp, indent=2)

    def calibrate_capture(self, pose: str) -> dict:
        if pose not in ("open", "fist"):
            raise ValueError("pose must be 'open' or 'fist'")
        if not self.hand_present:
            raise RuntimeError("no hand visible to capture")
        with self._lock:
            for f in _TRACKED:
                self.cal[f][pose] = round(self._metric[f], 1)
        self._save_cal()
        return self.cal

    # ── lifecycle ─────────────────────────────────────────────────────────────
    def start(self, camera_index: int = 0) -> None:
        if not os.path.exists(_MODEL_PATH):
            raise RuntimeError(f"hand landmarker model missing at {_MODEL_PATH}")
        if self.running:
            if camera_index == self.camera_index:
                return
            self.stop()
        cap = cv2.VideoCapture(camera_index)
        if not cap.isOpened():
            cap.release()
            raise RuntimeError(f"could not open camera {camera_index}")
        self._cap = cap
        self.camera_index = camera_index
        self._stop.clear()
        self.running = True
        self._thread = threading.Thread(target=self._loop, name="hand-tracker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self.running = False
        self.driving = False
        self.hand_present = False

    def set_driving(self, enabled: bool) -> None:
        self.driving = bool(enabled)
        self._last_sent = {}

    # ── mapping openness → the hand's calibrated range ────────────────────────
    def _working(self, finger: str, openness: float):
        lim = self._hand.limits.get(finger)
        if not lim or not lim.get("configured"):
            return None
        o, c = lim.get("open"), lim.get("close")
        if o is None or c is None or o == c:
            return None
        span = abs(o - c)
        raw = round(c + (openness * span) * (1 if o > c else -1))
        return raw, round(openness * span), span

    def _drive(self) -> None:
        now = time.time()
        if now - self._last_drive_t < 1.0 / _DRIVE_HZ:
            return
        self._last_drive_t = now
        for f in _TRACKED:
            w = self._working(f, self.openness[f])
            if w is None:
                continue
            raw = w[0]
            if abs(raw - self._last_sent.get(f, 10 ** 6)) < _DEADBAND:
                continue
            try:
                self._hand.send_joint(FINGERS.index(f), raw)
                self._last_sent[f] = raw
            except Exception:
                pass

    def _draw(self, frame, landmarks) -> None:
        h, w = frame.shape[:2]
        pts = [(int(l.x * w), int(l.y * h)) for l in landmarks]
        for a, b in _CONNECTIONS:
            cv2.line(frame, pts[a], pts[b], (0, 180, 255), 2)
        for (x, y) in pts:
            cv2.circle(frame, (x, y), 3, (80, 220, 120), -1)

    # ── main loop ─────────────────────────────────────────────────────────────
    def _loop(self) -> None:
        options = vision.HandLandmarkerOptions(
            base_options=mp_tasks.BaseOptions(model_asset_path=_MODEL_PATH),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=1,
            min_hand_detection_confidence=0.6,
            min_tracking_confidence=0.5,
        )
        landmarker = vision.HandLandmarker.create_from_options(options)
        last_t = time.time()
        ts_ms = 0
        try:
            while not self._stop.is_set():
                ok, frame = self._cap.read()
                if not ok:
                    time.sleep(0.01)
                    continue
                frame = cv2.flip(frame, 1)   # mirror for a natural preview
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                ts_ms += 33
                result = landmarker.detect_for_video(mp_image, ts_ms)

                present = bool(result.hand_landmarks)
                if present:
                    lm = result.hand_landmarks[0]
                    self._draw(frame, lm)
                    with self._lock:
                        for f in _TRACKED:
                            i, j, k = _ANGLE_LM[f]
                            metric = _angle(lm[i], lm[j], lm[k])
                            self._metric[f] = metric
                            lo, hi = self.cal[f]["fist"], self.cal[f]["open"]
                            o = (metric - lo) / (hi - lo) if hi != lo else 0.0
                            o = max(0.0, min(1.0, o))
                            self.openness[f] = _EMA_ALPHA * o + (1 - _EMA_ALPHA) * self.openness[f]
                self.hand_present = present
                if present and self.driving:
                    self._drive()

                t = time.time()
                dt = t - last_t
                last_t = t
                self.fps = 0.8 * self.fps + 0.2 * (1.0 / dt if dt > 0 else 0.0)
                cv2.putText(frame, f"{self.fps:4.1f} fps  drive:{'ON' if self.driving else 'off'}",
                            (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (80, 220, 120), 2)
                ok2, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                if ok2:
                    with self._lock:
                        self._jpeg = buf.tobytes()
        finally:
            landmarker.close()

    # ── accessors ─────────────────────────────────────────────────────────────
    def get_jpeg(self) -> bytes | None:
        with self._lock:
            return self._jpeg

    def status(self) -> dict:
        working = {}
        for f in _TRACKED:
            w = self._working(f, self.openness[f])
            working[f] = None if w is None else {"pos": w[1], "span": w[2], "configured": True}
        return {
            "running": self.running,
            "driving": self.driving,
            "camera": self.camera_index,
            "fps": round(self.fps, 1),
            "hand_present": self.hand_present,
            "openness": {f: round(self.openness[f], 3) for f in _TRACKED},
            "working": working,
            "calibration": self.cal,
        }
