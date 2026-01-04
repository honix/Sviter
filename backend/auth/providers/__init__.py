"""OAuth provider implementations."""

from .base import OAuthProvider, OAuthUserInfo
from .github import GitHubProvider
from .oidc import OIDCProvider

__all__ = ["OAuthProvider", "OAuthUserInfo", "GitHubProvider", "OIDCProvider"]
