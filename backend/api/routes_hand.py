"""
Hand control endpoints. All responses use the {success, data, error} envelope.

GET  /ports                  list serial ports
POST /connect                open the serial port (body: {port?, baud?})
POST /disconnect             close the port
GET  /status                 connection state + current angles
GET  /signs                  the full ASL pose table (for the grid)
POST /sign/{letter}          form an ASL letter
POST /servos                 set six raw angles (body: {angles:[t,i,m,r,p,w]})
POST /jog                    single jog keypress (body: {key})
POST /rest                   open the hand (rest pose)
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from hand import SIGNS, sign_angles, REST_POSE, FINGERS

router = APIRouter(tags=["hand"])


def _ok(data: object) -> dict:
    return {"success": True, "data": data, "error": None}


def _err(msg: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"success": False, "data": None, "error": msg}, status_code=status)


def _require_connected(request: Request):
    hand = request.app.state.hand
    if not hand.is_connected():
        return None, _err("Hand not connected — POST /connect first", 503)
    return hand, None


# ── request bodies ───────────────────────────────────────────────────────────

class ConnectBody(BaseModel):
    port: str | None = None
    baud: int = 9600


class ServosBody(BaseModel):
    angles: list[int]


class JogBody(BaseModel):
    key: str


# ── routes ───────────────────────────────────────────────────────────────────

@router.get("/ports", response_model=None)
def list_ports(request: Request):
    return _ok(request.app.state.hand.list_ports())


@router.post("/connect", response_model=None)
def connect(body: ConnectBody, request: Request):
    hand = request.app.state.hand
    try:
        port = hand.connect(body.port, body.baud)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok(hand.status() | {"port": port})


@router.post("/disconnect", response_model=None)
def disconnect(request: Request):
    request.app.state.hand.disconnect()
    return _ok(request.app.state.hand.status())


@router.get("/status", response_model=None)
def status(request: Request):
    return _ok(request.app.state.hand.status())


@router.get("/signs", response_model=None)
def signs(request: Request):
    # Ordered A–Z for a stable grid.
    return _ok([SIGNS[k] for k in sorted(SIGNS.keys())])


@router.post("/sign/{letter}", response_model=None)
def play_sign(letter: str, request: Request):
    angles = sign_angles(letter)
    if angles is None:
        return _err(f"No pose for '{letter}'", 404)
    hand, error = _require_connected(request)
    if error:
        return error
    try:
        hand.send_pose(angles)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok({"letter": letter.upper(), "angles": angles})


@router.post("/servos", response_model=None)
def set_servos(body: ServosBody, request: Request):
    if len(body.angles) != 6:
        return _err(f"expected 6 angles [{', '.join(FINGERS)}], got {len(body.angles)}")
    hand, error = _require_connected(request)
    if error:
        return error
    try:
        hand.send_pose(body.angles)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok({"angles": body.angles})


@router.post("/jog", response_model=None)
def jog(body: JogBody, request: Request):
    hand, error = _require_connected(request)
    if error:
        return error
    try:
        hand.send_jog(body.key)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok({"key": body.key})


@router.post("/rest", response_model=None)
def rest(request: Request):
    hand, error = _require_connected(request)
    if error:
        return error
    try:
        hand.send_pose(REST_POSE)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok({"angles": REST_POSE})
