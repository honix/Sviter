"""Base class for OAuth providers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class OAuthUserInfo:
    """Standardized user info from OAuth providers."""

    provider: str
    provider_user_id: str
    email: Optional[str]
    name: Optional[str]
    avatar_url: Optional[str] = None


class OAuthProvider(ABC):
    """Abstract base class for OAuth providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier (e.g., 'github', 'oidc')."""
        pass

    @abstractmethod
    def get_authorization_url(self, state: str, **kwargs) -> str:
        """
        Generate authorization URL.

        Args:
            state: CSRF protection state parameter
            **kwargs: Provider-specific params (e.g., code_challenge for PKCE)

        Returns:
            Full authorization URL to redirect user to
        """
        pass

    @abstractmethod
    async def exchange_code(self, code: str, code_verifier: Optional[str] = None) -> dict:
        """
        Exchange authorization code for tokens.

        Args:
            code: Authorization code from callback
            code_verifier: PKCE code verifier (if used)

        Returns:
            Token response dict with access_token, etc.
        """
        pass

    @abstractmethod
    async def get_user_info(self, access_token: str) -> OAuthUserInfo:
        """
        Fetch user info using access token.

        Args:
            access_token: OAuth access token

        Returns:
            Standardized user info
        """
        pass
