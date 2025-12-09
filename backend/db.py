"""SQLite database setup and connection management."""

import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Generator

# Database file location
DB_PATH = Path(__file__).parent / "data" / "etoneto.db"


def init_db():
    """Initialize database with schema."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL CHECK(type IN ('guest', 'oauth')),
                oauth_provider TEXT,
                oauth_id TEXT,
                email TEXT,
                name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_users_oauth
            ON users(oauth_provider, oauth_id)
            WHERE oauth_provider IS NOT NULL;
        """)
        conn.commit()


@contextmanager
def get_connection() -> Generator[sqlite3.Connection, None, None]:
    """Get a database connection with row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def get_user(user_id: str) -> dict | None:
    """Get user by ID."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
        return dict(row) if row else None


def create_user(user_id: str, user_type: str = "guest", **kwargs) -> dict:
    """Create a new user."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO users (id, type, oauth_provider, oauth_id, email, name)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                user_type,
                kwargs.get("oauth_provider"),
                kwargs.get("oauth_id"),
                kwargs.get("email"),
                kwargs.get("name"),
            )
        )
        conn.commit()
    return get_user(user_id)


def update_user_last_seen(user_id: str):
    """Update user's last_seen_at timestamp."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?",
            (user_id,)
        )
        conn.commit()


def get_or_create_guest(user_id: str) -> dict:
    """Get existing user or create as guest."""
    user = get_user(user_id)
    if user:
        update_user_last_seen(user_id)
        return user
    return create_user(user_id, user_type="guest")
