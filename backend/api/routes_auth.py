"""Public auth endpoints (not behind require_auth)."""
from __future__ import annotations

import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .auth import (
    auth_required, issue_token,
    login_locked, record_login_failure, record_login_success,
)

router = APIRouter(tags=["auth"])


class LoginBody(BaseModel):
    password: str


@router.get("/auth/status", response_model=None)
def auth_status():
    return {"success": True, "data": {"auth_required": auth_required()}, "error": None}


@router.post("/auth/login", response_model=None)
def auth_login(body: LoginBody, request: Request):
    if not auth_required():
        # Auth disabled — nothing to log into.
        return {"success": True, "data": {"token": None, "auth_required": False}, "error": None}

    ip = request.client.host if request.client else "unknown"
    if login_locked(ip):
        return JSONResponse(
            {"success": False, "data": None, "error": "too many attempts — try again later"},
            status_code=429,
        )

    token = issue_token(body.password)
    if token is None:
        record_login_failure(ip)
        time.sleep(0.5)   # slow down guessing
        return JSONResponse(
            {"success": False, "data": None, "error": "incorrect password"},
            status_code=401,
        )
    record_login_success(ip)
    return {"success": True, "data": {"token": token, "auth_required": True}, "error": None}
