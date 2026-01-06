"""FastAPI dependencies for authentication."""

from typing import Optional

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import AUTH_PROVIDERS
from db import get_or_create_guest, get_user

from .jwt import verify_token

# HTTP Bearer scheme for JWT tokens (auto_error=False allows fallback to legacy auth)
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    user_id: Optional[str] = Query(None, description="Legacy: User ID query param"),
) -> str:
    """
    Get current user ID from JWT token or legacy query param.

    Priority:
    1. JWT Bearer token in Authorization header (preferred)
    2. Query param user_id (legacy, for backward compatibility)

    Returns:
        User ID string

    Raises:
        HTTPException: If not authenticated
    """
    # Try JWT token first
    if credentials:
        token_data = verify_token(credentials.credentials)
        user = get_user(token_data.user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )
        return token_data.user_id

    # Fall back to query param for backward compatibility
    if user_id:
        if "guest" in AUTH_PROVIDERS:
            # Auto-create guest if needed
            user = get_or_create_guest(user_id)
            return user["id"]
        else:
            # If guest auth is disabled, require JWT
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Guest access is disabled.",
            )

    # No authentication provided
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Provide Bearer token or user_id.",
    )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    user_id: Optional[str] = Query(None),
) -> Optional[str]:
    """
    Get current user ID if authenticated, None otherwise.

    Use this for endpoints that work with or without authentication.
    """
    try:
        return await get_current_user(credentials, user_id)
    except HTTPException:
        return None


async def require_oauth_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    """
    Require OAuth-authenticated user (not guest).

    Use this for sensitive operations that require verified identity.

    Returns:
        User ID string

    Raises:
        HTTPException: If not authenticated with OAuth
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OAuth authentication required",
        )

    token_data = verify_token(credentials.credentials)

    if token_data.user_type != "oauth":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OAuth authentication required. Guest access not allowed.",
        )

    user = get_user(token_data.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return token_data.user_id
