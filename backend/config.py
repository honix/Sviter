"""
Central configuration for the wiki backend.

All settings loaded from .env file or environment variables.
See .env.example for available options.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend directory
load_dotenv(Path(__file__).parent / ".env")

# Wiki repository path (required)
WIKI_REPO_PATH = os.getenv("WIKI_REPO_PATH")
if not WIKI_REPO_PATH:
    raise ValueError("WIKI_REPO_PATH environment variable is required. See .env.example")

# OpenRouter API key (required if using OpenRouter adapter)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# LLM Configuration
# Model to use (e.g., "claude-sonnet-4-5", "anthropic/claude-sonnet-4")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-sonnet-4-5")

# Provider: "claude" (Claude SDK) or "openrouter"
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "claude")

# =============================================================================
# Authentication Configuration
# =============================================================================

# Enabled auth providers (comma-separated): guest, github, oidc
AUTH_PROVIDERS = [p.strip() for p in os.getenv("AUTH_PROVIDERS", "guest").split(",") if p.strip()]

# JWT Settings
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# GitHub OAuth
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/auth/callback/github")

# Generic OIDC Provider (Keycloak, Azure AD, Okta, etc.)
OIDC_ISSUER = os.getenv("OIDC_ISSUER")  # e.g., https://login.example.com/realms/main
OIDC_CLIENT_ID = os.getenv("OIDC_CLIENT_ID")
OIDC_CLIENT_SECRET = os.getenv("OIDC_CLIENT_SECRET")
OIDC_REDIRECT_URI = os.getenv("OIDC_REDIRECT_URI", "http://localhost:8000/auth/callback/oidc")
OIDC_SCOPES = os.getenv("OIDC_SCOPES", "openid profile email").split()
OIDC_DISPLAY_NAME = os.getenv("OIDC_DISPLAY_NAME", "SSO")

# Frontend URL (for OAuth redirects)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
