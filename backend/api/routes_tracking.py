"""
Webcam hand-tracking endpoints. Same {success, data, error} envelope as routes_hand.

POST /track/start      {camera?}      start the webcam + MediaPipe pipeline
POST /track/stop                      stop tracking, release the camera
GET  /track/status                    running/driving/fps/openness/calibration
POST /track/drive      {enabled}      toggle driving the servos from tracking
POST /track/calibrate  {pose}         capture 'open' or 'fist' metric extremes
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from hand import FINGERS

router = APIRouter(tags=["tracking"])


def _ok(data: object) -> dict:
    return {"success": True, "data": data, "error": None}


def _err(msg: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"success": False, "data": None, "error": msg}, status_code=status)


class StartBody(BaseModel):
    camera: int = 0


class DriveBody(BaseModel):
    enabled: bool


class CalibrateBody(BaseModel):
    pose: str   # "open" | "fist"


@router.post("/track/start", response_model=None)
def track_start(body: StartBody, request: Request):
    tracker = request.app.state.tracker
    try:
        tracker.start(body.camera)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok(tracker.status())


@router.post("/track/stop", response_model=None)
def track_stop(request: Request):
    request.app.state.tracker.stop()
    return _ok(request.app.state.tracker.status())


@router.get("/track/status", response_model=None)
def track_status(request: Request):
    return _ok(request.app.state.tracker.status())


@router.post("/track/drive", response_model=None)
def track_drive(body: DriveBody, request: Request):
    tracker = request.app.state.tracker
    hand = request.app.state.hand
    if body.enabled:
        if not tracker.running:
            return _err("start tracking before enabling drive", 409)
        if not hand.is_connected():
            return _err("hand not connected — POST /connect first", 503)
        configured = [f for f in FINGERS if hand.limits.get(f, {}).get("configured")]
        if not configured:
            return _err("no configured fingers — calibrate limits first", 409)
    tracker.set_driving(body.enabled)
    return _ok(tracker.status())


@router.post("/track/calibrate", response_model=None)
def track_calibrate(body: CalibrateBody, request: Request):
    tracker = request.app.state.tracker
    try:
        cal = tracker.calibrate_capture(body.pose)
    except (ValueError, RuntimeError) as exc:
        return _err(str(exc), 409)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok({"pose": body.pose, "calibration": cal})
