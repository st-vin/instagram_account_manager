"""routes/calendar.py — Content calendar endpoints"""
from flask import Blueprint, request, jsonify
from services import cerebras_service as cs
from models.accounts import get_active_account
import config

cal_bp = Blueprint("calendar", __name__)


def _err(msg, code=400):
    return jsonify({"error": msg}), code


def _get_profile(data: dict = None):
    niche_id = (data or {}).get("niche_id")
    if not niche_id:
        acc = get_active_account()
        niche_id = acc.get("niche_id") if acc else None
    if niche_id:
        from models.niche_profile import load_profile
        return load_profile(niche_id)
    return None


def _sheets_ok():
    return bool(config.SHEETS_CALENDAR_ID)


@cal_bp.route("/calendar")
def get_calendar():
    month = request.args.get("month", "")
    try:
        if _sheets_ok():
            from services.sheets_service import get_calendar
            slots = get_calendar(month)
        else:
            slots = []
        return jsonify({"month": month, "slots": slots})
    except Exception as e:
        return _err(str(e), 500)


@cal_bp.route("/calendar/generate", methods=["POST"])
def generate_calendar():
    d = request.json or {}
    if not d.get("month") or not d.get("pillars") or not d.get("posting_days"):
        return _err("month, pillars, and posting_days are required")

    # Merge account defaults
    acc = get_active_account()
    posting_days = d["posting_days"]
    pillars      = d["pillars"]
    if acc:
        if not posting_days:
            posting_days = acc.get("posting_days", ["Tuesday","Thursday","Saturday"])
        if not pillars:
            pillars = acc.get("pillars", [])

    try:
        result = cs.generate_calendar(
            month=d["month"], pillars=pillars, posting_days=posting_days,
            frequency=int(d.get("frequency", 3)),
            account_type=d.get("account_type", "B"),
            profile=_get_profile(d),
        )
        if _sheets_ok():
            from services.sheets_service import save_calendar
            save_calendar(result.get("slots", []))
        return jsonify(result)
    except Exception as e:
        return _err(str(e), 500)


@cal_bp.route("/calendar/slot", methods=["POST"])
def upsert_slot():
    d = request.json or {}
    try:
        if _sheets_ok():
            from services.sheets_service import upsert_slot
            result = upsert_slot(d)
        else:
            result = {"id": d.get("id"), "saved": True}
        return jsonify(result)
    except Exception as e:
        return _err(str(e), 500)


@cal_bp.route("/calendar/slot/<slot_id>", methods=["DELETE"])
def delete_slot(slot_id):
    try:
        if _sheets_ok():
            from services.sheets_service import delete_slot
            ok = delete_slot(slot_id)
        else:
            ok = True
        return jsonify({"deleted": ok, "id": slot_id})
    except Exception as e:
        return _err(str(e), 500)
