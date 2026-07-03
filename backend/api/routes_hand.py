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


class NudgeBody(BaseModel):
    finger: str
    delta: int


class LimitBody(BaseModel):
    finger: str
    which: str                 # "open" | "close"
    value: int | None = None   # defaults to the finger's current angle


class ClearLimitBody(BaseModel):
    finger: str


class GotoBody(BaseModel):
    finger: str = "all"        # a finger name or "all"
    which: str                 # "open" | "close"


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


@router.post("/nudge", response_model=None)
def nudge(body: NudgeBody, request: Request):
    if body.finger not in FINGERS:
        return _err(f"unknown finger '{body.finger}'", 400)
    hand, error = _require_connected(request)
    if error:
        return error
    try:
        hand.send_nudge(FINGERS.index(body.finger), body.delta)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok({"finger": body.finger, "delta": body.delta})


@router.post("/relax", response_model=None)
def relax(request: Request):
    hand, error = _require_connected(request)
    if error:
        return error
    try:
        hand.send_relax()
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok({"relaxed": True})


@router.get("/limits", response_model=None)
def get_limits(request: Request):
    return _ok(request.app.state.hand.limits)


@router.post("/limit", response_model=None)
def set_limit(body: LimitBody, request: Request):
    if body.finger not in FINGERS:
        return _err(f"unknown finger '{body.finger}'", 400)
    hand, error = _require_connected(request)
    if error:
        return error
    # Default the captured value to the finger's current commanded angle.
    value = body.value if body.value is not None else hand.status()["angles"].get(body.finger)
    if value is None:
        return _err("no current angle available for finger", 409)
    try:
        limit = hand.set_limit(body.finger, body.which, int(value))
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok({"finger": body.finger, "limit": limit})


@router.post("/goto", response_model=None)
def goto(body: GotoBody, request: Request):
    """Drive configured finger(s) to their open/close limit (finger name or 'all')."""
    if body.finger != "all" and body.finger not in FINGERS:
        return _err(f"unknown finger '{body.finger}'", 400)
    hand, error = _require_connected(request)
    if error:
        return error
    try:
        moved = hand.goto(body.finger, body.which)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok({"which": body.which, "moved": moved})


@router.post("/configure", response_model=None)
def configure(request: Request):
    """Commit calibration: tighten firmware hardstops to captured ranges and mark
    fingers configured (the position-offset / 0-at-close coordinate takes effect)."""
    hand, error = _require_connected(request)
    if error:
        return error
    try:
        limits = hand.configure()
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok(limits)


@router.post("/limit/clear", response_model=None)
def clear_limit(body: ClearLimitBody, request: Request):
    if body.finger not in FINGERS:
        return _err(f"unknown finger '{body.finger}'", 400)
    hand, error = _require_connected(request)
    if error:
        return error
    try:
        limit = hand.clear_limit(body.finger)
    except Exception as exc:
        return _err(str(exc), 500)
    return _ok({"finger": body.finger, "limit": limit})


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
