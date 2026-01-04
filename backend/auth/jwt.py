"""JWT token management for authentication."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status

from config import (
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ALGORITHM,
    JWT_REFRESH_TOKEN_EXPIRE_DAYS,
    JWT_SECRET_KEY,
)


@dataclass
class TokenData:
    """Decoded JWT token payload."""

    user_id: str
    user_type: str  # 'guest' or 'oauth'
    token_type: str  # 'access' or 'refresh'


def create_access_token(user_id: str, user_type: str = "oauth") -> str:
    """
    Create a short-lived access token.

    Args:
        user_id: User identifier
        user_type: 'guest' or 'oauth'

    Returns:
        Encoded JWT access token
    """
    expires = datetime.now(timezone.utc) + timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "type": user_type,
        "token_type": "access",
        "exp": expires,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, user_type: str = "oauth") -> str:
    """
    Create a long-lived refresh token.

    Args:
        user_id: User identifier
        user_type: 'guest' or 'oauth'

    Returns:
        Encoded JWT refresh token
    """
    expires = datetime.now(timezone.utc) + timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "type": user_type,
        "token_type": "refresh",
        "exp": expires,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_token(token: str, expected_type: str = "access") -> TokenData:
    """
    Verify and decode a JWT token.

    Args:
        token: JWT token string
        expected_type: Expected token type ('access' or 'refresh')

    Returns:
        TokenData with decoded payload

    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])

        token_type = payload.get("token_type")
        if token_type != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token type. Expected {expected_type}, got {token_type}",
            )

        return TokenData(
            user_id=payload["sub"],
            user_type=payload.get("type", "oauth"),
            token_type=token_type,
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


def create_token_pair(user_id: str, user_type: str = "oauth") -> tuple[str, str]:
    """
    Create both access and refresh tokens.

    Args:
        user_id: User identifier
        user_type: 'guest' or 'oauth'

    Returns:
        Tuple of (access_token, refresh_token)
    """
    access_token = create_access_token(user_id, user_type)
    refresh_token = create_refresh_token(user_id, user_type)
    return access_token, refresh_token
