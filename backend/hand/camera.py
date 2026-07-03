"""
Server-side USB webcam feed — a live view of the physical robot hand.

Opens the PC's webcam lazily (only while someone is watching) and keeps the
latest JPEG frame for an MJPEG stream. This is separate from hand tracking,
which runs in each visitor's browser on their own camera.
"""
from __future__ import annotations

import threading
import time

import cv2


class CameraFeed:
    def __init__(self, index: int = 0) -> None:
        self.index = index
        self._cap = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._jpeg: bytes | None = None
        self._viewers = 0
        self.available: bool | None = None   # None = not tried yet
        self.error: str | None = None

    # ── viewer refcount (open on first viewer, release on last) ──────────────
    def add_viewer(self) -> None:
        with self._lock:
            self._viewers += 1
            if self._viewers == 1:
                self._open()

    def remove_viewer(self) -> None:
        with self._lock:
            self._viewers = max(0, self._viewers - 1)
            if self._viewers == 0:
                self._close()

    def _open(self) -> None:
        cap = cv2.VideoCapture(self.index, cv2.CAP_V4L2)
        if not cap.isOpened():
            cap.release()
            self.available = False
            self.error = f"could not open camera {self.index} (in use, or wrong index?)"
            return
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self._cap = cap
        self.available = True
        self.error = None
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="robot-camera", daemon=True)
        self._thread.start()

    def _close(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.5)
        self._thread = None
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self._jpeg = None

    def _loop(self) -> None:
        while not self._stop.is_set():
            ok, frame = self._cap.read()
            if not ok:
                time.sleep(0.02)
                continue
            ok2, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ok2:
                self._jpeg = buf.tobytes()

    def get_jpeg(self) -> bytes | None:
        return self._jpeg

    def status(self) -> dict:
        return {
            "available": self.available,
            "streaming": self._viewers > 0,
            "viewers": self._viewers,
            "index": self.index,
            "error": self.error,
        }

    def stop(self) -> None:
        with self._lock:
            self._viewers = 0
            self._close()
