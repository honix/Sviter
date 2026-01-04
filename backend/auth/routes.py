"""Authentication API routes with OAuth support."""

import secrets
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from config import (
    AUTH_PROVIDERS,
    FRONTEND_URL,
    GITHUB_CLIENT_ID,
    OIDC_CLIENT_ID,
    OIDC_DISPLAY_NAME,
)
from db import (
    create_oauth_user,
    get_or_create_guest,
    get_user,
    get_user_by_email,
    get_user_by_oauth,
    update_user_last_seen,
    update_user_oauth_info,
    upgrade_guest_to_oauth,
)

from .jwt import create_token_pair, verify_token
from .providers import GitHubProvider, OIDCProvider

router = APIRouter(prefix="/auth", tags=["auth"])

# ─────────────────────────────────────────────────────────────────────────────
# Provider Instances (initialized based on config)
# ─────────────────────────────────────────────────────────────────────────────

providers: dict = {}

if "github" in AUTH_PROVIDERS and GITHUB_CLIENT_ID:
    providers["github"] = GitHubProvider()

if "oidc" in AUTH_PROVIDERS and OIDC_CLIENT_ID:
    providers["oidc"] = OIDCProvider()

# OAuth state storage (in production, use Redis or database)
# Maps state -> {provider, guest_id, code_verifier}
_oauth_states: dict[str, dict] = {}


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────────────────────


def generate_guest_id() -> str:
    """Generate a guest user ID: guest-{6 random chars}."""
    return f"guest-{secrets.token_hex(3)}"


class UserResponse(BaseModel):
    """User information response."""

    id: str
    type: str
    email: Optional[str] = None
    name: Optional[str] = None
    oauth_provider: Optional[str] = None
    created_at: str
    last_seen_at: str


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class ProvidersResponse(BaseModel):
    """Available authentication providers."""

    providers: list[dict]
    guest_enabled: bool


class RefreshRequest(BaseModel):
    """Token refresh request."""

    refresh_token: str


# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────


def _user_to_response(user: dict) -> UserResponse:
    """Convert database user dict to response model."""
    return UserResponse(
        id=user["id"],
        type=user["type"],
        email=user.get("email"),
        name=user.get("name"),
        oauth_provider=user.get("oauth_provider"),
        created_at=str(user["created_at"]),
        last_seen_at=str(user["last_seen_at"]),
    )


def _create_token_response(user: dict) -> TokenResponse:
    """Create token response for a user."""
    access_token, refresh_token = create_token_pair(user["id"], user["type"])
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_to_response(user),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Provider Info Endpoint
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/providers", response_model=ProvidersResponse)
async def get_available_providers():
    """
    Get list of enabled authentication providers.

    Returns provider names and display info for the login UI.
    """
    provider_list = []

    if "github" in providers:
        provider_list.append({
            "id": "github",
            "name": "GitHub",
            "icon": "github",
        })

    if "oidc" in providers:
        provider_list.append({
            "id": "oidc",
            "name": OIDC_DISPLAY_NAME,
            "icon": "key",
        })

    return ProvidersResponse(
        providers=provider_list,
        guest_enabled="guest" in AUTH_PROVIDERS,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Guest Authentication
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/guest", response_model=TokenResponse)
async def create_guest():
    """
    Create a new guest user and return JWT tokens.

    Guest users get auto-generated IDs and can later upgrade to OAuth.
    """
    if "guest" not in AUTH_PROVIDERS:
        raise HTTPException(status_code=403, detail="Guest authentication is disabled")

    guest_id = generate_guest_id()
    user = get_or_create_guest(guest_id)

    return _create_token_response(user)


# ─────────────────────────────────────────────────────────────────────────────
# OAuth Login Flow
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/login/{provider}")
async def oauth_login(
    provider: str,
    guest_id: Optional[str] = Query(None, description="Guest ID to link after login"),
):
    """
    Initiate OAuth login flow.

    Redirects user to the OAuth provider for authentication.
    Optionally pass guest_id to link the OAuth account to an existing guest session.
    """
    if provider not in providers:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    oauth_provider = providers[provider]
    state = secrets.token_urlsafe(32)

    # Store state with optional guest_id for linking
    state_data = {"provider": provider}
    if guest_id:
        state_data["guest_id"] = guest_id

    # For OIDC, generate PKCE
    if provider == "oidc":
        code_verifier, code_challenge = OIDCProvider.generate_pkce()
        state_data["code_verifier"] = code_verifier
        auth_url = oauth_provider.get_authorization_url(state, code_challenge=code_challenge)
    else:
        auth_url = oauth_provider.get_authorization_url(state)

    _oauth_states[state] = state_data

    return RedirectResponse(url=auth_url)


@router.get("/callback/{provider}")
async def oauth_callback(
    provider: str,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
):
    """
    Handle OAuth callback from provider.

    Exchanges authorization code for tokens, fetches user info,
    and creates/links the user account.
    """
    # Handle OAuth errors
    if error:
        error_msg = error_description or error
        return RedirectResponse(
            url=f"{FRONTEND_URL}/auth/error?error={error}&message={error_msg}"
        )

    if not code or not state:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/auth/error?error=missing_params&message=Missing code or state"
        )

    # Verify state
    state_data = _oauth_states.pop(state, None)
    if not state_data or state_data.get("provider") != provider:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/auth/error?error=invalid_state&message=Invalid or expired state"
        )

    if provider not in providers:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/auth/error?error=unknown_provider&message=Unknown provider"
        )

    oauth_provider = providers[provider]

    try:
        # Exchange code for tokens
        code_verifier = state_data.get("code_verifier")
        token_data = await oauth_provider.exchange_code(code, code_verifier)

        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("No access token in response")

        # Fetch user info from provider
        user_info = await oauth_provider.get_user_info(access_token)

        # Find or create user
        user = None

        # 1. Check if OAuth user already exists
        existing_oauth = get_user_by_oauth(provider, user_info.provider_user_id)
        if existing_oauth:
            user = existing_oauth
            update_user_last_seen(user["id"])
            # Update name/email if changed on provider
            if user_info.email or user_info.name:
                user = update_user_oauth_info(user["id"], user_info.email, user_info.name)

        # 2. Check if we should link to a guest account
        elif state_data.get("guest_id"):
            guest_id = state_data["guest_id"]
            guest = get_user(guest_id)
            if guest and guest["type"] == "guest":
                user = upgrade_guest_to_oauth(
                    guest_id,
                    provider,
                    user_info.provider_user_id,
                    user_info.email,
                    user_info.name,
                )

        # 3. Check if email matches existing user (account linking)
        if not user and user_info.email:
            email_user = get_user_by_email(user_info.email)
            if email_user:
                # Link OAuth to existing user with same email
                user = upgrade_guest_to_oauth(
                    email_user["id"],
                    provider,
                    user_info.provider_user_id,
                    user_info.email,
                    user_info.name,
                )

        # 4. Create new OAuth user
        if not user:
            user_id = f"oauth-{provider}-{secrets.token_hex(4)}"
            user = create_oauth_user(
                user_id,
                provider,
                user_info.provider_user_id,
                user_info.email,
                user_info.name,
            )

        # Generate JWT tokens
        jwt_access, jwt_refresh = create_token_pair(user["id"], "oauth")

        # Redirect to frontend with tokens
        return RedirectResponse(
            url=f"{FRONTEND_URL}/auth/callback?access_token={jwt_access}&refresh_token={jwt_refresh}"
        )

    except Exception as e:
        error_msg = str(e).replace(" ", "+")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/auth/error?error=oauth_failed&message={error_msg}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Token Management
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(request: RefreshRequest):
    """
    Refresh access token using refresh token.

    Returns new access and refresh tokens.
    """
    token_data = verify_token(request.refresh_token, expected_type="refresh")

    user = get_user(token_data.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    update_user_last_seen(user["id"])

    return _create_token_response(user)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    authorization: Optional[str] = Query(None, alias="token"),
    user_id: Optional[str] = Query(None, description="Legacy: User ID"),
):
    """
    Get current authenticated user info.

    Accepts either JWT token or legacy user_id query param.
    """
    user = None

    # Try JWT token first
    if authorization:
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        token_data = verify_token(token)
        user = get_user(token_data.user_id)

    # Fall back to legacy user_id
    elif user_id:
        user = get_user(user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return _user_to_response(user)


# ─────────────────────────────────────────────────────────────────────────────
# Legacy Endpoints (for backward compatibility during migration)
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/validate/{user_id}")
async def validate_user(user_id: str):
    """
    Legacy: Validate and touch user (update last_seen).

    Creates guest if not exists. Kept for backward compatibility.
    """
    user = get_or_create_guest(user_id)
    return {"valid": True, "user_id": user["id"], "type": user["type"]}
