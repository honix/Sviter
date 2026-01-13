"""SQLite database setup and connection management."""

import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Generator, Optional, List, Dict, Any
import json
from datetime import datetime

# Database file location
DB_PATH = Path(__file__).parent / "data" / "sviter.db"


def init_db():
    """Initialize database with schema."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with get_connection() as conn:
        conn.executescript("""
            -- Users table
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

            -- Threads table (unified for assistant and worker)
            CREATE TABLE IF NOT EXISTS threads (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL CHECK(type IN ('assistant', 'worker')),
                name TEXT NOT NULL,
                goal TEXT,
                owner_id TEXT NOT NULL,
                status TEXT NOT NULL,  -- Free-form status string (e.g., 'created', 'researching', 'review')
                branch TEXT,
                worktree_path TEXT,
                review_summary TEXT,
                error TEXT,
                is_generating BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (owner_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_threads_owner ON threads(owner_id);
            CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
            CREATE INDEX IF NOT EXISTS idx_threads_type ON threads(type);

            -- Thread messages table
            CREATE TABLE IF NOT EXISTS thread_messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tool_name TEXT,
                tool_args TEXT,
                tool_result TEXT,
                user_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_thread ON thread_messages(thread_id);
            CREATE INDEX IF NOT EXISTS idx_messages_created ON thread_messages(thread_id, created_at);

            -- Thread sharing table
            CREATE TABLE IF NOT EXISTS thread_shares (
                thread_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (thread_id, user_id),
                FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_shares_user ON thread_shares(user_id);

            -- Thread attention tracking (notifications/inbox)
            CREATE TABLE IF NOT EXISTS thread_attention (
                thread_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                reason TEXT NOT NULL,  -- 'mention', 'added', 'question', 'waiting'
                message_id TEXT,       -- Optional: which message triggered attention
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                cleared_at TIMESTAMP,  -- NULL if still needs attention
                PRIMARY KEY (thread_id, user_id, reason, created_at),
                FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_attention_user ON thread_attention(user_id);
            CREATE INDEX IF NOT EXISTS idx_attention_uncleared
            ON thread_attention(user_id, cleared_at)
            WHERE cleared_at IS NULL;
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


def get_user_by_oauth(provider: str, oauth_id: str) -> Optional[dict]:
    """Get user by OAuth provider and provider-specific ID."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?",
            (provider, oauth_id)
        ).fetchone()
        return dict(row) if row else None


def get_user_by_email(email: str) -> Optional[dict]:
    """Get user by email address."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?",
            (email,)
        ).fetchone()
        return dict(row) if row else None


def create_oauth_user(
    user_id: str,
    provider: str,
    oauth_id: str,
    email: Optional[str] = None,
    name: Optional[str] = None
) -> dict:
    """Create a new OAuth user."""
    return create_user(
        user_id=user_id,
        user_type="oauth",
        oauth_provider=provider,
        oauth_id=oauth_id,
        email=email,
        name=name,
    )


def upgrade_guest_to_oauth(
    guest_id: str,
    provider: str,
    oauth_id: str,
    email: Optional[str] = None,
    name: Optional[str] = None
) -> dict:
    """
    Upgrade a guest user to an OAuth user, preserving their data.

    All threads, shares, and other data remain linked to the same user ID.
    """
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE users
            SET type = 'oauth',
                oauth_provider = ?,
                oauth_id = ?,
                email = ?,
                name = ?,
                last_seen_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (provider, oauth_id, email, name, guest_id)
        )
        conn.commit()
    return get_user(guest_id)


def update_user_oauth_info(
    user_id: str,
    email: Optional[str] = None,
    name: Optional[str] = None
) -> dict:
    """Update OAuth user's email and name (e.g., if changed on provider)."""
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE users
            SET email = COALESCE(?, email),
                name = COALESCE(?, name),
                last_seen_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (email, name, user_id)
        )
        conn.commit()
    return get_user(user_id)


def list_users() -> List[dict]:
    """List all registered users for @mention dropdown."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, email FROM users ORDER BY last_seen_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Thread Operations
# ─────────────────────────────────────────────────────────────────────────────

def create_thread(
    thread_id: str,
    thread_type: str,
    name: str,
    owner_id: str,
    status: str,
    goal: str = None,
    branch: str = None,
    worktree_path: str = None
) -> dict:
    """Create a new thread."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO threads (id, type, name, goal, owner_id, status, branch, worktree_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (thread_id, thread_type, name, goal, owner_id, status, branch, worktree_path)
        )
        conn.commit()
    return get_thread(thread_id)


def get_thread(thread_id: str) -> Optional[dict]:
    """Get thread by ID."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM threads WHERE id = ?",
            (thread_id,)
        ).fetchone()
        return dict(row) if row else None


def update_thread(thread_id: str, **kwargs) -> Optional[dict]:
    """Update thread fields."""
    if not kwargs:
        return get_thread(thread_id)

    # Build SET clause dynamically
    allowed_fields = {
        'name', 'status', 'branch', 'worktree_path', 'review_summary',
        'error', 'is_generating', 'goal'
    }
    fields = {k: v for k, v in kwargs.items() if k in allowed_fields}

    if not fields:
        return get_thread(thread_id)

    # Always update updated_at
    fields['updated_at'] = datetime.now().isoformat()

    set_clause = ", ".join(f"{k} = ?" for k in fields.keys())
    values = list(fields.values()) + [thread_id]

    with get_connection() as conn:
        conn.execute(
            f"UPDATE threads SET {set_clause} WHERE id = ?",
            values
        )
        conn.commit()

    return get_thread(thread_id)


def delete_thread(thread_id: str) -> bool:
    """Delete a thread and its messages (cascade)."""
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM threads WHERE id = ?",
            (thread_id,)
        )
        conn.commit()
        return cursor.rowcount > 0


def list_threads_for_user(user_id: str, include_archived: bool = False) -> List[dict]:
    """List threads owned by or shared with user."""
    status_filter = "" if include_archived else "AND t.status != 'archived'"

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT DISTINCT t.* FROM threads t
            LEFT JOIN thread_shares ts ON t.id = ts.thread_id
            WHERE (t.owner_id = ? OR ts.user_id = ?)
            {status_filter}
            ORDER BY t.updated_at DESC
            """,
            (user_id, user_id)
        ).fetchall()
        return [dict(row) for row in rows]


def list_worker_threads(status: str = None) -> List[dict]:
    """List all worker threads, optionally filtered by status."""
    with get_connection() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM threads WHERE type = 'worker' AND status = ? ORDER BY updated_at DESC",
                (status,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM threads WHERE type = 'worker' ORDER BY updated_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]


def get_user_assistant_thread(user_id: str) -> Optional[dict]:
    """Get the user's active assistant thread (creates one if none exists)."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT * FROM threads
            WHERE owner_id = ? AND type = 'assistant' AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
            """,
            (user_id,)
        ).fetchone()
        return dict(row) if row else None


# ─────────────────────────────────────────────────────────────────────────────
# Thread Message Operations
# ─────────────────────────────────────────────────────────────────────────────

def add_thread_message(
    message_id: str,
    thread_id: str,
    role: str,
    content: str,
    tool_name: str = None,
    tool_args: dict = None,
    tool_result: str = None,
    user_id: str = None
) -> dict:
    """Add a message to a thread."""
    tool_args_json = json.dumps(tool_args) if tool_args else None

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO thread_messages (id, thread_id, role, content, tool_name, tool_args, tool_result, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (message_id, thread_id, role, content, tool_name, tool_args_json, tool_result, user_id)
        )
        # Update thread's updated_at
        conn.execute(
            "UPDATE threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (thread_id,)
        )
        conn.commit()

    return get_thread_message(message_id)


def get_thread_message(message_id: str) -> Optional[dict]:
    """Get a single message by ID."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM thread_messages WHERE id = ?",
            (message_id,)
        ).fetchone()
        if row:
            msg = dict(row)
            if msg.get('tool_args'):
                msg['tool_args'] = json.loads(msg['tool_args'])
            return msg
        return None


def get_thread_messages(thread_id: str, limit: int = 1000, offset: int = 0) -> List[dict]:
    """Get all messages for a thread."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM thread_messages
            WHERE thread_id = ?
            ORDER BY created_at ASC, rowid ASC
            LIMIT ? OFFSET ?
            """,
            (thread_id, limit, offset)
        ).fetchall()

        messages = []
        for row in rows:
            msg = dict(row)
            if msg.get('tool_args'):
                msg['tool_args'] = json.loads(msg['tool_args'])
            messages.append(msg)
        return messages


def delete_thread_messages(thread_id: str) -> int:
    """Delete all messages for a thread. Returns count deleted."""
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM thread_messages WHERE thread_id = ?",
            (thread_id,)
        )
        conn.commit()
        return cursor.rowcount


# ─────────────────────────────────────────────────────────────────────────────
# Thread Sharing Operations
# ─────────────────────────────────────────────────────────────────────────────

def share_thread(thread_id: str, user_id: str) -> bool:
    """Share a thread with a user."""
    try:
        with get_connection() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO thread_shares (thread_id, user_id) VALUES (?, ?)",
                (thread_id, user_id)
            )
            conn.commit()
        return True
    except Exception:
        return False


def unshare_thread(thread_id: str, user_id: str) -> bool:
    """Remove thread share."""
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM thread_shares WHERE thread_id = ? AND user_id = ?",
            (thread_id, user_id)
        )
        conn.commit()
        return cursor.rowcount > 0


def get_thread_shares(thread_id: str) -> List[str]:
    """Get list of user IDs a thread is shared with."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT user_id FROM thread_shares WHERE thread_id = ?",
            (thread_id,)
        ).fetchall()
        return [row['user_id'] for row in rows]


def can_access_thread(thread_id: str, user_id: str) -> bool:
    """Check if user can access a thread (owner or shared)."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT 1 FROM threads t
            LEFT JOIN thread_shares ts ON t.id = ts.thread_id AND ts.user_id = ?
            WHERE t.id = ? AND (t.owner_id = ? OR ts.user_id IS NOT NULL)
            """,
            (user_id, thread_id, user_id)
        ).fetchone()
        return row is not None


# ─────────────────────────────────────────────────────────────────────────────
# Thread Attention (Notifications/Inbox)
# ─────────────────────────────────────────────────────────────────────────────

def add_attention(
    thread_id: str,
    user_id: str,
    reason: str,
    message_id: str = None
) -> bool:
    """
    Add attention flag for a user on a thread.

    Args:
        thread_id: Thread requiring attention
        user_id: User who needs to see this
        reason: Why attention is needed ('mention', 'added', 'question', 'waiting')
        message_id: Optional message that triggered the attention

    Returns:
        True if added successfully
    """
    try:
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO thread_attention (thread_id, user_id, reason, message_id)
                VALUES (?, ?, ?, ?)
                """,
                (thread_id, user_id, reason, message_id)
            )
            conn.commit()
        return True
    except Exception:
        return False


def clear_attention(thread_id: str, user_id: str, reason: str = None) -> int:
    """
    Clear attention flags for a user on a thread.

    Args:
        thread_id: Thread ID
        user_id: User ID
        reason: If provided, only clear this reason; otherwise clear all

    Returns:
        Number of attention flags cleared
    """
    with get_connection() as conn:
        if reason:
            cursor = conn.execute(
                """
                UPDATE thread_attention
                SET cleared_at = CURRENT_TIMESTAMP
                WHERE thread_id = ? AND user_id = ? AND reason = ? AND cleared_at IS NULL
                """,
                (thread_id, user_id, reason)
            )
        else:
            cursor = conn.execute(
                """
                UPDATE thread_attention
                SET cleared_at = CURRENT_TIMESTAMP
                WHERE thread_id = ? AND user_id = ? AND cleared_at IS NULL
                """,
                (thread_id, user_id)
            )
        conn.commit()
        return cursor.rowcount


def get_user_attention(user_id: str) -> List[dict]:
    """
    Get all uncleared attention items for a user.

    Returns list of dicts with thread_id, reason, message_id, created_at.
    """
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT thread_id, reason, message_id, created_at
            FROM thread_attention
            WHERE user_id = ? AND cleared_at IS NULL
            ORDER BY created_at DESC
            """,
            (user_id,)
        ).fetchall()
        return [dict(row) for row in rows]


def get_threads_needing_attention(user_id: str) -> List[dict]:
    """
    Get threads that need user's attention (for inbox view).

    Returns threads with attention reasons aggregated.
    """
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT t.*, GROUP_CONCAT(DISTINCT ta.reason) as attention_reasons
            FROM threads t
            JOIN thread_attention ta ON t.id = ta.thread_id
            WHERE ta.user_id = ? AND ta.cleared_at IS NULL
            GROUP BY t.id
            ORDER BY t.updated_at DESC
            """,
            (user_id,)
        ).fetchall()
        result = []
        for row in rows:
            d = dict(row)
            # Parse attention_reasons into list
            if d.get('attention_reasons'):
                d['attention_reasons'] = d['attention_reasons'].split(',')
            else:
                d['attention_reasons'] = []
            result.append(d)
        return result


def has_unread_attention(thread_id: str, user_id: str) -> bool:
    """Check if thread has uncleared attention for user."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT 1 FROM thread_attention
            WHERE thread_id = ? AND user_id = ? AND cleared_at IS NULL
            LIMIT 1
            """,
            (thread_id, user_id)
        ).fetchone()
        return row is not None
