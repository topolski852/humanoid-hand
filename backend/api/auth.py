"""
Optional shared-password access control.

If the HAND_PASSWORD env var is set, every API route and websocket requires a
bearer token obtained by POSTing the password to /auth/login. If it is unset
(the default — desktop app / localhost use), auth is disabled entirely.

Tokens are opaque, random, and held in memory (clients re-login after a restart).
"""
from __future__ import annotations

import hmac
import os
import secrets

from fastapi import Header, HTTPException

_PASSWORD = os.environ.get("HAND_PASSWORD") or None
_tokens: set[str] = set()


def auth_required() -> bool:
    return _PASSWORD is not None


def issue_token(password: str) -> str | None:
    """Return a fresh token if the password matches, else None."""
    if not auth_required():
        return None
    if not hmac.compare_digest(password, _PASSWORD):
        return None
    token = secrets.token_urlsafe(32)
    _tokens.add(token)
    return token


def token_valid(token: str | None) -> bool:
    return bool(token) and token in _tokens


def require_auth(authorization: str | None = Header(default=None)) -> None:
    """FastAPI dependency: 401 unless a valid bearer token is presented."""
    if not auth_required():
        return
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    if not token_valid(token):
        raise HTTPException(status_code=401, detail="unauthorized")
