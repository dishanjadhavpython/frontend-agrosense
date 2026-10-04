from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest import mock

from clerk_backend_api.security.types import AuthStatus

from backend import auth

"""
A session token is accepted only from the sites it was issued to.

Clerk signs every session token for one instance, and every site on that
instance gets a valid signature. The `azp` claim says which origin the token
was minted for; `CLERK_AUTHORIZED_PARTIES` is the list this service accepts.
These tests pin that the list actually reaches Clerk's verifier, and that an
unset list stays a supported state rather than an empty allowlist that refuses
everyone.
"""


def _fake_client(status=AuthStatus.SIGNED_IN, payload=None):
    seen = {}

    def authenticate_request(request, options):
        seen["options"] = options
        return SimpleNamespace(status=status, payload=payload)

    return SimpleNamespace(authenticate_request=authenticate_request), seen


class AuthorizedParties(unittest.TestCase):
    def test_configured_sites_reach_the_verifier(self) -> None:
        client, seen = _fake_client(payload={"sub": "user_abc"})
        sites = ["https://agrosense.example", "http://localhost:3000"]
        with mock.patch.object(auth, "_client", return_value=client), \
                mock.patch.object(auth, "CLERK_AUTHORIZED_PARTIES", sites):
            user = auth.resolve_user(SimpleNamespace(headers={}))

        self.assertEqual(user, {"id": "user_abc", "email": None})
        self.assertEqual(seen["options"].authorized_parties, sites)

    def test_unset_means_not_checked_not_refuse_everyone(self) -> None:
        client, seen = _fake_client(payload={"sub": "user_abc"})
        with mock.patch.object(auth, "_client", return_value=client), \
                mock.patch.object(auth, "CLERK_AUTHORIZED_PARTIES", []):
            auth.resolve_user(SimpleNamespace(headers={}))

        self.assertIsNone(seen["options"].authorized_parties)

    def test_token_for_another_site_is_signed_out(self) -> None:
        # What Clerk's verifier returns for a valid signature with a foreign
        # `azp`: not signed in. The service must treat that as no user.
        client, _ = _fake_client(status=AuthStatus.SIGNED_OUT, payload=None)
        with mock.patch.object(auth, "_client", return_value=client):
            self.assertIsNone(auth.resolve_user(SimpleNamespace(headers={})))


if __name__ == "__main__":
    unittest.main()
