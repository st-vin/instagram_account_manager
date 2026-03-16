"""
sheets_service.py
All Google Sheets read / write operations via gspread.
"""
import json
from datetime import datetime
import gspread
from google.oauth2.service_account import Credentials
import config

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

_gc = None


def get_client():
    global _gc
    if _gc is None:
        try:
            creds = Credentials.from_service_account_file(config.SHEETS_CREDS_FILE, scopes=SCOPES)
            _gc = gspread.authorize(creds)
        except Exception as e:
            raise RuntimeError(f"Google Sheets auth failed: {e}")
    return _gc


# ── Calendar sheet ────────────────────────────────────────

CALENDAR_HEADERS = ["id", "date", "day", "format", "pillar",
                     "topic", "hook_type", "status", "notes", "caption_id"]


def get_calendar(month: str = "") -> list:
    gc = get_client()
    sh = gc.open_by_key(config.SHEETS_CALENDAR_ID)
    ws = sh.sheet1
    rows = ws.get_all_records()
    if month:
        rows = [r for r in rows if r.get("date", "").startswith(month)]
    return rows


def save_calendar(slots: list):
    """Overwrite the calendar sheet with a new set of slots."""
    gc = get_client()
    sh = gc.open_by_key(config.SHEETS_CALENDAR_ID)
    ws = sh.sheet1
    ws.clear()
    ws.append_row(CALENDAR_HEADERS)
    for s in slots:
        ws.append_row([s.get(h, "") for h in CALENDAR_HEADERS])


def upsert_slot(slot: dict) -> dict:
    """Insert or update a single calendar row matched by id."""
    gc = get_client()
    sh = gc.open_by_key(config.SHEETS_CALENDAR_ID)
    ws = sh.sheet1
    rows = ws.get_all_records()

    # Ensure headers exist
    if not rows:
        ws.append_row(CALENDAR_HEADERS)

    slot_id = slot.get("id")
    all_values = ws.get_all_values()
    for i, row in enumerate(all_values[1:], start=2):
        if row and row[0] == slot_id:
            ws.update(f"A{i}", [[slot.get(h, "") for h in CALENDAR_HEADERS]])
            return {"id": slot_id, "saved": True, "action": "updated"}

    ws.append_row([slot.get(h, "") for h in CALENDAR_HEADERS])
    return {"id": slot_id, "saved": True, "action": "created"}


def delete_slot(slot_id: str) -> bool:
    gc = get_client()
    sh = gc.open_by_key(config.SHEETS_CALENDAR_ID)
    ws = sh.sheet1
    all_values = ws.get_all_values()
    for i, row in enumerate(all_values[1:], start=2):
        if row and row[0] == slot_id:
            ws.delete_rows(i)
            return True
    return False


# ── KPI sheet ─────────────────────────────────────────────

KPI_HEADERS = ["week_start", "followers", "follower_delta", "avg_reach",
               "avg_eng_rate", "posts_published", "total_saves",
               "total_shares", "top_format", "recorded_at"]


def save_kpi_snapshot(snap: dict):
    gc = get_client()
    sh = gc.open_by_key(config.SHEETS_KPI_ID)
    ws = sh.sheet1

    # Ensure headers
    existing = ws.get_all_values()
    if not existing:
        ws.append_row(KPI_HEADERS)

    snap["recorded_at"] = datetime.utcnow().isoformat()
    ws.append_row([snap.get(h, "") for h in KPI_HEADERS])


def get_kpi_data(limit: int = 4) -> list:
    gc = get_client()
    sh = gc.open_by_key(config.SHEETS_KPI_ID)
    ws = sh.sheet1
    rows = ws.get_all_records()
    return list(reversed(rows[-limit:])) if rows else []
