"""
FastAPI backend for the InMoov ASL hand.

Starts on http://localhost:8765
  REST      : see api/routes_hand.py   ({success, data, error} envelope)
  WebSocket : /ws/telemetry  -> broadcasts {connected, port, angles} at ~10 Hz
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from hand import SerialHand
from api import hand_router

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)

_TELEMETRY_HZ = 10


@asynccontextmanager
async def lifespan(app: FastAPI):
    hand = SerialHand()
    app.state.hand = hand

    # Best-effort auto-connect to the first Arduino-like port on startup.
    try:
        port = hand.connect()
        _log.info("Auto-connected to %s", port)
    except Exception as exc:
        _log.info("No hand auto-connected (%s) — use POST /connect", exc)

    yield

    hand.disconnect()


app = FastAPI(title="InMoov ASL Hand", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hand_router)


@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket) -> None:
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


if __name__ == "__main__":
    uvicorn.run("main:app", host="localhost", port=8765, reload=False, log_level="info")
