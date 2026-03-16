import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "smm.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_conn()
    c = conn.cursor()

    # Track which comments we have already replied to
    c.execute("""
        CREATE TABLE IF NOT EXISTS replied_comments (
            comment_id  TEXT PRIMARY KEY,
            post_id     TEXT,
            replied_at  TEXT
        )
    """)

    # Cache generated captions / scripts so we don't re-call Cerebras
    c.execute("""
        CREATE TABLE IF NOT EXISTS generated_content (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            content_type TEXT,
            input_hash   TEXT UNIQUE,
            output_json  TEXT,
            created_at   TEXT
        )
    """)

    # Scheduler job run log
    c.execute("""
        CREATE TABLE IF NOT EXISTS job_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id      TEXT,
            ran_at      TEXT,
            status      TEXT,
            notes       TEXT
        )
    """)

    # Local KPI snapshots (mirrors Sheets, used for fast dashboard reads)
    c.execute("""
        CREATE TABLE IF NOT EXISTS kpi_snapshots (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            week_start      TEXT UNIQUE,
            followers       INTEGER,
            follower_delta  INTEGER,
            avg_reach       INTEGER,
            avg_eng_rate    REAL,
            posts_published INTEGER,
            total_saves     INTEGER,
            total_shares    INTEGER,
            top_format      TEXT,
            recorded_at     TEXT
        )
    """)

    conn.commit()
    conn.close()


# ── Replied comments ──────────────────────────────────────

def mark_comment_replied(comment_id: str, post_id: str = ""):
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO replied_comments VALUES (?,?,?)",
        (comment_id, post_id, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()


def get_replied_ids() -> set:
    conn = get_conn()
    rows = conn.execute("SELECT comment_id FROM replied_comments").fetchall()
    conn.close()
    return {r["comment_id"] for r in rows}


# ── KPI snapshots ─────────────────────────────────────────

def save_kpi_snapshot(snap: dict):
    conn = get_conn()
    conn.execute("""
        INSERT OR REPLACE INTO kpi_snapshots
        (week_start, followers, follower_delta, avg_reach, avg_eng_rate,
         posts_published, total_saves, total_shares, top_format, recorded_at)
        VALUES (:week_start,:followers,:follower_delta,:avg_reach,:avg_eng_rate,
                :posts_published,:total_saves,:total_shares,:top_format,:recorded_at)
    """, {**snap, "recorded_at": datetime.utcnow().isoformat()})
    conn.commit()
    conn.close()


def get_kpi_snapshots(limit: int = 4) -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM kpi_snapshots ORDER BY week_start DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Job log ───────────────────────────────────────────────

def log_job(job_id: str, status: str, notes: str = ""):
    conn = get_conn()
    conn.execute(
        "INSERT INTO job_log (job_id, ran_at, status, notes) VALUES (?,?,?,?)",
        (job_id, datetime.utcnow().isoformat(), status, notes)
    )
    conn.commit()
    conn.close()
