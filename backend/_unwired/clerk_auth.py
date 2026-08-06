from __future__ import annotations

from typing import Any

from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions, AuthStatus

from .config import CLERK_ENABLED, CLERK_SECRET_KEY

_clerk_client: Clerk | None = None


def _get_client() -> Clerk | None:
    global _clerk_client
    if not CLERK_ENABLED:
        return None
    if _clerk_client is None:
        _clerk_client = Clerk(bearer_auth=CLERK_SECRET_KEY)
    return _clerk_client


def resolve_clerk_user(request: Any) -> dict[str, Any] | None:
    """Verify the request's Clerk session token and return a lightweight user dict.

    `request` only needs a `.headers` mapping (Starlette's Request satisfies this),
    matching clerk_backend_api's Requestish protocol.
    """
    client = _get_client()
    if client is None:
        return None

    try:
        request_state = client.authenticate_request(
            request,
            AuthenticateRequestOptions(secret_key=CLERK_SECRET_KEY),
        )
    except Exception:
        return None

    if request_state.status != AuthStatus.SIGNED_IN or not request_state.payload:
        return None

    payload = request_state.payload
    user_id = payload.get("sub")
    if not user_id:
        return None

    # Default Clerk session tokens only carry `sub`/`sid`/etc. Richer fields
    # (email, username) show up here only if a custom session token template
    # was configured in the Clerk dashboard; fall back gracefully otherwise.
    return {
        "id": str(user_id),
        "username": payload.get("username") or payload.get("email") or str(user_id),
        "email": payload.get("email"),
    }
