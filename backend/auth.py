from __future__ import annotations

import logging
from typing import Any

from fastapi import Header, HTTPException, Request

from .config import CLERK_ENABLED, CLERK_SECRET_KEY

logger = logging.getLogger("agrosense.auth")

"""
Who is asking.

Descended from `_unwired/clerk_auth.py`, which was quarantined because neither
half of the app had Clerk wired. The Next side now does, so this comes back —
and it comes back load-bearing rather than decorative.

Two independent checks guard the reading service, and they answer different
questions:

  * `X-AgroSense-Key` (see `config.API_KEY`) proves the request came from our
    own Next server rather than from the internet. It is a network boundary
    expressed in a header.
  * The Clerk bearer token proves *which farmer* is asking. It is the thing
    that makes a stored Soil Health Card belong to somebody.

Neither substitutes for the other. The shared secret cannot tell two farmers
apart; the JWT cannot stop a stranger calling the service directly if it is
ever exposed.

`CLERK_ENABLED` is false without a secret key, and in that state every request
resolves to a single local development user. That keeps `npm run api` working
on a fresh clone with no Clerk account — the same "runs with no credentials"
rule the rest of `config.py` follows — and it is why `require_user` refuses to
do that when it detects it is not on localhost.
"""

#: Who everything belongs to when Clerk is not configured. A real Clerk user id
#: is `user_2ab...`; this cannot collide with one.
LOCAL_DEV_USER = "local-dev-user"

_clerk_client: Any | None = None


def _client() -> Any | None:
    global _clerk_client
    if not CLERK_ENABLED:
        return None
    if _clerk_client is None:
        from clerk_backend_api import Clerk

        _clerk_client = Clerk(bearer_auth=CLERK_SECRET_KEY)
    return _clerk_client


def resolve_user(request: Request) -> dict[str, Any] | None:
    """Verify the request's Clerk session token, or return None.

    `request` only needs a `.headers` mapping, which is Starlette's `Request`
    and also clerk_backend_api's `Requestish` protocol.
    """
    client = _client()
    if client is None:
        return None

    try:
        from clerk_backend_api.security.types import (
            AuthenticateRequestOptions,
            AuthStatus,
        )

        state = client.authenticate_request(
            request,
            AuthenticateRequestOptions(secret_key=CLERK_SECRET_KEY),
        )
    except Exception as exc:
        # A malformed or expired token is a 401, not a 500, and the reason is
        # logged rather than returned — telling a caller *why* verification
        # failed helps them craft the next attempt.
        logger.debug("Clerk verification failed: %s", exc)
        return None

    if state.status != AuthStatus.SIGNED_IN or not state.payload:
        return None

    user_id = state.payload.get("sub")
    if not user_id:
        return None

    # A default Clerk session token carries `sub`/`sid` and little else. Email
    # and username appear only with a custom session token template, so both
    # are optional here rather than assumed.
    return {
        "id": str(user_id),
        "email": state.payload.get("email"),
    }


def require_user(request: Request) -> dict[str, Any]:
    """FastAPI dependency. 401 unless a real signed-in person is asking.

    Used on every path that costs money (OCR, a prediction that starts agent
    runs) or touches somebody's document.
    """
    if CLERK_ENABLED:
        user = resolve_user(request)
        if user is None:
            raise HTTPException(
                status_code=401,
                detail={"message": "Sign in to read a card."},
            )
        return user

    # No Clerk configured. Allowed, but only where it cannot matter: a service
    # bound to localhost. If this process has a public address and no Clerk
    # secret, every stored card would belong to one shared identity — which is
    # the exposure this module exists to close, reintroduced by configuration.
    client_host = (request.client.host if request.client else "") or ""
    if client_host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
        raise HTTPException(
            status_code=503,
            detail={
                "message": (
                    "This server has no CLERK_SECRET_KEY configured and is not "
                    "on localhost, so it cannot tell users apart. Refusing to "
                    "store documents against a shared identity."
                )
            },
        )
    return {"id": LOCAL_DEV_USER, "email": None}


__all__ = ["require_user", "resolve_user", "LOCAL_DEV_USER"]
