"""Generic OIDC provider with PKCE support."""

import base64
import hashlib
import secrets
from typing import Optional
from urllib.parse import urlencode

import httpx

from config import (
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    OIDC_ISSUER,
    OIDC_REDIRECT_URI,
    OIDC_SCOPES,
)
from .base import OAuthProvider, OAuthUserInfo


class OIDCProvider(OAuthProvider):
    """
    Generic OpenID Connect provider with PKCE support.

    Works with any standard OIDC-compliant identity provider:
    - Keycloak
    - Azure AD / Entra ID
    - Okta
    - Auth0
    - Google Workspace
    """

    _discovery_cache: Optional[dict] = None

    @property
    def name(self) -> str:
        return "oidc"

    @staticmethod
    def generate_pkce() -> tuple[str, str]:
        """
        Generate PKCE code_verifier and code_challenge.

        Returns:
            Tuple of (code_verifier, code_challenge)
        """
        # Generate random code verifier (43-128 chars, URL-safe)
        code_verifier = secrets.token_urlsafe(32)

        # Create S256 code challenge
        digest = hashlib.sha256(code_verifier.encode()).digest()
        code_challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")

        return code_verifier, code_challenge

    async def _get_discovery_document(self) -> dict:
        """
        Fetch and cache OIDC discovery document.

        The discovery document contains all endpoint URLs.
        """
        if self._discovery_cache:
            return self._discovery_cache

        discovery_url = f"{OIDC_ISSUER}/.well-known/openid-configuration"

        async with httpx.AsyncClient() as client:
            response = await client.get(discovery_url)
            response.raise_for_status()
            self._discovery_cache = response.json()
            return self._discovery_cache

    def get_authorization_url(
        self,
        state: str,
        code_challenge: Optional[str] = None,
        **kwargs
    ) -> str:
        """
        Generate OIDC authorization URL.

        For PKCE flow, pass code_challenge from generate_pkce().
        """
        # Build authorization URL without async discovery
        # Most OIDC providers use /authorize endpoint
        authorize_url = f"{OIDC_ISSUER}/protocol/openid-connect/auth"

        params = {
            "client_id": OIDC_CLIENT_ID,
            "redirect_uri": OIDC_REDIRECT_URI,
            "scope": " ".join(OIDC_SCOPES),
            "response_type": "code",
            "state": state,
        }

        # Add PKCE if provided
        if code_challenge:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"

        return f"{authorize_url}?{urlencode(params)}"

    async def exchange_code(self, code: str, code_verifier: Optional[str] = None) -> dict:
        """Exchange authorization code for tokens."""
        discovery = await self._get_discovery_document()
        token_endpoint = discovery["token_endpoint"]

        data = {
            "grant_type": "authorization_code",
            "client_id": OIDC_CLIENT_ID,
            "code": code,
            "redirect_uri": OIDC_REDIRECT_URI,
        }

        # Add client secret if configured (confidential client)
        if OIDC_CLIENT_SECRET:
            data["client_secret"] = OIDC_CLIENT_SECRET

        # Add PKCE code verifier if provided
        if code_verifier:
            data["code_verifier"] = code_verifier

        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_endpoint,
                data=data,
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            return response.json()

    async def get_user_info(self, access_token: str) -> OAuthUserInfo:
        """Fetch user info from OIDC userinfo endpoint."""
        discovery = await self._get_discovery_document()
        userinfo_endpoint = discovery["userinfo_endpoint"]

        async with httpx.AsyncClient() as client:
            response = await client.get(
                userinfo_endpoint,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()

            return OAuthUserInfo(
                provider="oidc",
                provider_user_id=data.get("sub", ""),
                email=data.get("email"),
                name=data.get("name") or data.get("preferred_username"),
                avatar_url=data.get("picture"),
            )
