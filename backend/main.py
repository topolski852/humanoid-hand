"""
FastAPI backend for the InMoov ASL hand.

Starts on http://localhost:8765
  REST      : see api/routes_hand.py   ({success, data, error} envelope)
  WebSocket : /ws/telemetry  -> broadcasts {connected, port, angles} at ~10 Hz
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from hand import SerialHand, FINGERS
from hand.tracking import HandTracker
from hand.camera import CameraFeed
from api import (
    hand_router, tracking_router, auth_router, camera_router,
    require_auth, auth_required, token_valid,
)

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)

_TELEMETRY_HZ = 10
_TRACK_FPS = 15

# Built web UI (app/dist). When present, the backend serves it so the app is
# usable from any browser — set HAND_HOST=0.0.0.0 to reach it across the network.
_WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "dist")


@asynccontextmanager
async def lifespan(app: FastAPI):
    hand = SerialHand()
    app.state.hand = hand
    app.state.tracker = HandTracker(hand)
    app.state.camera = CameraFeed(index=int(os.environ.get("HAND_CAMERA_INDEX", "0")))

    # Best-effort auto-connect to the first Arduino-like port on startup.
    try:
        port = hand.connect()
        _log.info("Auto-connected to %s", port)
    except Exception as exc:
        _log.info("No hand auto-connected (%s) — use POST /connect", exc)

    yield

    app.state.tracker.stop()
    app.state.camera.stop()
    hand.disconnect()


app = FastAPI(title="InMoov ASL Hand", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)                                        # public
app.include_router(camera_router)                                      # token via query for /stream
app.include_router(hand_router, dependencies=[Depends(require_auth)])
app.include_router(tracking_router, dependencies=[Depends(require_auth)])


def _ws_authed(ws: WebSocket) -> bool:
    return not auth_required() or token_valid(ws.query_params.get("token"))


@app.websocket("/ws/track")
async def ws_track(ws: WebSocket) -> None:
    if not _ws_authed(ws):
        await ws.close(code=1008)
        return
    await ws.accept()
    _log.info("Track client connected")
    interval = 1.0 / _TRACK_FPS
    tracker = ws.app.state.tracker
    try:
        while True:
            jpeg = tracker.get_jpeg()
            payload = tracker.status()
            if jpeg is not None:
                payload["frame"] = base64.b64encode(jpeg).decode("ascii")
            try:
                await ws.send_json(payload)
            except Exception:
                break
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        pass
    finally:
        _log.info("Track client disconnected")


@app.websocket("/ws/drive")
async def ws_drive(ws: WebSocket) -> None:
    """Receive per-finger openness (0..1) computed in the BROWSER (from the
    visitor's own camera) and drive the servos. Rate-limited + deadbanded; only
    configured fingers move; nothing moves unless the client sets driving=true."""
    if not _ws_authed(ws):
        await ws.close(code=1008)
        return
    await ws.accept()
    _log.info("Drive client connected")
    hand = ws.app.state.hand
    last_sent: dict[str, int] = {}
    last_t = 0.0
    try:
        while True:
            msg = await ws.receive_json()
            if not msg.get("driving") or not hand.is_connected():
                continue
            now = asyncio.get_event_loop().time()
            if now - last_t < 1.0 / 15:
                continue
            last_t = now
            for finger, o in (msg.get("openness") or {}).items():
                if finger not in FINGERS:
                    continue
                raw = hand.openness_to_raw(finger, float(o))
                if raw is None or abs(raw - last_sent.get(finger, 10 ** 6)) < 2:
                    continue
                try:
                    hand.send_joint(FINGERS.index(finger), raw)
                    last_sent[finger] = raw
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        _log.info("Drive client disconnected")


@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket) -> None:
    if not _ws_authed(ws):
        await ws.close(code=1008)
        return
    await ws.accept()
    _log.info("Telemetry client connected")
    interval = 1.0 / _TELEMETRY_HZ
    try:
        while True:
            try:
                await ws.send_json(ws.app.state.hand.status())
            except Exception:
                break
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        pass
    finally:
        _log.info("Telemetry client disconnected")


# Serve the built web UI at "/" (must be mounted AFTER the API routes/websockets
# so they take precedence). HashRouter means the browser only ever loads "/",
# so no SPA catch-all is needed.
if os.path.isdir(_WEB_DIR):
    app.mount("/", StaticFiles(directory=_WEB_DIR, html=True), name="web")
    _log.info("Serving web UI from %s", os.path.abspath(_WEB_DIR))
else:
    _log.info("No web UI build at %s — run `npm run build` in app/ to enable it", _WEB_DIR)


if __name__ == "__main__":
    host = os.environ.get("HAND_HOST", "localhost")
    port = int(os.environ.get("HAND_PORT", "8765"))
    uvicorn.run("main:app", host=host, port=port, reload=False, log_level="info")
