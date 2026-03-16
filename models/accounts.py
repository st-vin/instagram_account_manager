"""
models/accounts.py
Multi-account management. Each account has its own
NicheProfile, Instagram credentials, persona, and posting schedule.
"""
import json
import uuid
from datetime import datetime
from models.db import get_conn


def init_accounts_table():
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            handle       TEXT,
            niche_id     TEXT NOT NULL,
            account_type TEXT DEFAULT 'B',
            persona      TEXT,
            ig_token     TEXT,
            ig_user_id   TEXT,
            posting_days TEXT,
            pillars      TEXT,
            tone         TEXT DEFAULT 'warm & friendly',
            created_at   TEXT,
            is_active    INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()


# ── CRUD ──────────────────────────────────────────────────

def create_account(name: str, handle: str, niche_id: str,
                   account_type: str = "B", tone: str = "warm & friendly",
                   posting_days: list = None, pillars: list = None,
                   ig_token: str = "", ig_user_id: str = "") -> dict:
    conn  = get_conn()
    acc_id = str(uuid.uuid4())[:8]
    conn.execute("""
        INSERT INTO accounts
        (id, name, handle, niche_id, account_type, tone,
         ig_token, ig_user_id, posting_days, pillars, created_at, is_active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,0)
    """, (
        acc_id, name, handle, niche_id, account_type, tone,
        ig_token, ig_user_id,
        json.dumps(posting_days or ["Tuesday", "Thursday", "Saturday"]),
        json.dumps(pillars or []),
        datetime.utcnow().isoformat(),
    ))
    conn.commit()
    conn.close()
    return get_account(acc_id)


def get_account(account_id: str) -> dict | None:
    conn = get_conn()
    row  = conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return _row_to_dict(row)


def list_accounts() -> list:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM accounts ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def update_account(account_id: str, updates: dict) -> dict | None:
    allowed = {"name", "handle", "niche_id", "account_type", "tone",
               "ig_token", "ig_user_id", "posting_days", "pillars",
               "persona", "is_active"}
    fields  = {k: v for k, v in updates.items() if k in allowed}
    if not fields:
        return get_account(account_id)

    # Serialise list fields
    for lf in ("posting_days", "pillars"):
        if lf in fields and isinstance(fields[lf], list):
            fields[lf] = json.dumps(fields[lf])

    set_clause = ", ".join(f"{k}=?" for k in fields)
    values     = list(fields.values()) + [account_id]
    conn = get_conn()
    conn.execute(f"UPDATE accounts SET {set_clause} WHERE id=?", values)
    conn.commit()
    conn.close()
    return get_account(account_id)


def delete_account(account_id: str) -> bool:
    conn = get_conn()
    conn.execute("DELETE FROM accounts WHERE id=?", (account_id,))
    conn.commit()
    conn.close()
    return True


def set_active_account(account_id: str):
    """Mark one account as active, all others as inactive."""
    conn = get_conn()
    conn.execute("UPDATE accounts SET is_active=0")
    conn.execute("UPDATE accounts SET is_active=1 WHERE id=?", (account_id,))
    conn.commit()
    conn.close()


def get_active_account() -> dict | None:
    conn  = get_conn()
    row   = conn.execute("SELECT * FROM accounts WHERE is_active=1").fetchone()
    conn.close()
    if row:
        return _row_to_dict(row)
    # Fall back to most recently created
    conn  = get_conn()
    row   = conn.execute("SELECT * FROM accounts ORDER BY created_at DESC LIMIT 1").fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


# ── Helpers ───────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    d = dict(row)
    for lf in ("posting_days", "pillars"):
        if isinstance(d.get(lf), str):
            try:
                d[lf] = json.loads(d[lf])
            except Exception:
                d[lf] = []
    return d
