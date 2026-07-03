"""Public auth endpoints (not behind require_auth)."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .auth import auth_required, issue_token

router = APIRouter(tags=["auth"])


class LoginBody(BaseModel):
    password: str


@router.get("/auth/status", response_model=None)
def auth_status():
    return {"success": True, "data": {"auth_required": auth_required()}, "error": None}


@router.post("/auth/login", response_model=None)
def auth_login(body: LoginBody):
    if not auth_required():
        # Auth disabled — nothing to log into.
        return {"success": True, "data": {"token": None, "auth_required": False}, "error": None}
    token = issue_token(body.password)
    if token is None:
        return JSONResponse(
            {"success": False, "data": None, "error": "incorrect password"},
            status_code=401,
        )
    return {"success": True, "data": {"token": token, "auth_required": True}, "error": None}
