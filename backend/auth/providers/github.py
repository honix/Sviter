"""GitHub OAuth provider."""

from typing import Optional
from urllib.parse import urlencode

import httpx

from config import GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI
from .base import OAuthProvider, OAuthUserInfo


class GitHubProvider(OAuthProvider):
    """GitHub OAuth 2.0 provider."""

    AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
    TOKEN_URL = "https://github.com/login/oauth/access_token"
    USER_URL = "https://api.github.com/user"
    EMAILS_URL = "https://api.github.com/user/emails"

    @property
    def name(self) -> str:
        return "github"

    def get_authorization_url(self, state: str, **kwargs) -> str:
        """Generate GitHub authorization URL."""
        params = {
            "client_id": GITHUB_CLIENT_ID,
            "redirect_uri": GITHUB_REDIRECT_URI,
            "scope": "user:email",
            "state": state,
        }
        return f"{self.AUTHORIZE_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str, code_verifier: Optional[str] = None) -> dict:
        """Exchange authorization code for access token."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TOKEN_URL,
                data={
                    "client_id": GITHUB_CLIENT_ID,
                    "client_secret": GITHUB_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": GITHUB_REDIRECT_URI,
                },
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            return response.json()

    async def get_user_info(self, access_token: str) -> OAuthUserInfo:
        """Fetch GitHub user info."""
        async with httpx.AsyncClient() as client:
            # Get basic user info
            response = await client.get(
                self.USER_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()

            # Get email if not public
            email = data.get("email")
            if not email:
                try:
                    email_response = await client.get(
                        self.EMAILS_URL,
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Accept": "application/json",
                        },
                    )
                    if email_response.status_code == 200:
                        emails = email_response.json()
                        # Find primary verified email
                        primary = next(
                            (e for e in emails if e.get("primary") and e.get("verified")),
                            None
                        )
                        if primary:
                            email = primary.get("email")
                except Exception:
                    pass  # Email fetch failed, continue without it

            return OAuthUserInfo(
                provider="github",
                provider_user_id=str(data["id"]),
                email=email,
                name=data.get("name") or data.get("login"),
                avatar_url=data.get("avatar_url"),
            )
