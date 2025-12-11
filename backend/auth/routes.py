"""Authentication API routes."""

import secrets
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_user, get_or_create_guest

router = APIRouter(prefix="/auth", tags=["auth"])


def generate_guest_id() -> str:
    """Generate a guest user ID: guest-{6 random chars}."""
    return f"guest-{secrets.token_hex(3)}"


class GuestResponse(BaseModel):
    id: str
    type: str
    created_at: str
    last_seen_at: str


class UserResponse(BaseModel):
    id: str
    type: str
    email: str | None
    name: str | None
    oauth_provider: str | None
    created_at: str
    last_seen_at: str


@router.post("/guest", response_model=GuestResponse)
async def create_guest():
    """Create a new guest user with auto-generated ID."""
    guest_id = generate_guest_id()
    user = get_or_create_guest(guest_id)
    return GuestResponse(
        id=user["id"],
        type=user["type"],
        created_at=str(user["created_at"]),
        last_seen_at=str(user["last_seen_at"]),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user(user_id: str):
    """Get current user by ID (passed as query param for now)."""
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(
        id=user["id"],
        type=user["type"],
        email=user["email"],
        name=user["name"],
        oauth_provider=user["oauth_provider"],
        created_at=str(user["created_at"]),
        last_seen_at=str(user["last_seen_at"]),
    )


@router.post("/validate/{user_id}")
async def validate_user(user_id: str):
    """Validate and touch user (update last_seen). Creates guest if not exists."""
    user = get_or_create_guest(user_id)
    return {"valid": True, "user_id": user["id"], "type": user["type"]}
