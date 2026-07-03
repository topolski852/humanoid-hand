"""
Robot-view webcam endpoints.

GET /camera/status               availability + viewer count (bearer auth)
GET /camera/stream?token=...     MJPEG live view (token via query — an <img> tag
                                 can't send an Authorization header)
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from .auth import auth_required, token_valid, require_auth

router = APIRouter(tags=["camera"])


@router.get("/camera/status", response_model=None, dependencies=[Depends(require_auth)])
def camera_status(request: Request):
    return {"success": True, "data": request.app.state.camera.status(), "error": None}


@router.get("/camera/stream", response_model=None)
async def camera_stream(request: Request):
    if auth_required() and not token_valid(request.query_params.get("token")):
        return JSONResponse({"success": False, "data": None, "error": "unauthorized"}, status_code=401)

    feed = request.app.state.camera
    feed.add_viewer()
    if feed.available is False:
        feed.remove_viewer()
        return JSONResponse(
            {"success": False, "data": None, "error": feed.error or "camera unavailable"},
            status_code=503,
        )

    async def frames():
        try:
            while True:
                if await request.is_disconnected():
                    break
                jpeg = feed.get_jpeg()
                if jpeg:
                    yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                await asyncio.sleep(1 / 20)
        finally:
            feed.remove_viewer()

    return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame")
