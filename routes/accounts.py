"""routes/accounts.py — Account management endpoints"""
from flask import Blueprint, request, jsonify
from models.accounts import (
    create_account, get_account, list_accounts,
    update_account, delete_account,
    set_active_account, get_active_account,
)

acc_bp = Blueprint("accounts", __name__)


def _err(msg, code=400):
    return jsonify({"error": msg}), code


@acc_bp.route("/accounts", methods=["GET"])
def list_accs():
    return jsonify({"accounts": list_accounts()})


@acc_bp.route("/accounts", methods=["POST"])
def create_acc():
    d = request.json or {}
    if not d.get("name") or not d.get("niche_id"):
        return _err("name and niche_id are required")
    try:
        acc = create_account(
            name=d["name"], handle=d.get("handle", ""),
            niche_id=d["niche_id"],
            account_type=d.get("account_type", "B"),
            tone=d.get("tone", "warm & friendly"),
            posting_days=d.get("posting_days"),
            pillars=d.get("pillars"),
            ig_token=d.get("ig_token", ""),
            ig_user_id=d.get("ig_user_id", ""),
        )
        # Auto-activate if first account
        from models.accounts import list_accounts
        if len(list_accounts()) == 1:
            set_active_account(acc["id"])
            acc["is_active"] = 1
        return jsonify(acc), 201
    except Exception as e:
        return _err(str(e), 500)


@acc_bp.route("/accounts/<acc_id>", methods=["GET"])
def get_acc(acc_id):
    acc = get_account(acc_id)
    if not acc:
        return _err("Account not found", 404)
    return jsonify(acc)


@acc_bp.route("/accounts/<acc_id>", methods=["PATCH"])
def update_acc(acc_id):
    d = request.json or {}
    try:
        acc = update_account(acc_id, d)
        return jsonify(acc)
    except Exception as e:
        return _err(str(e), 500)


@acc_bp.route("/accounts/<acc_id>", methods=["DELETE"])
def delete_acc(acc_id):
    delete_account(acc_id)
    return jsonify({"deleted": True, "id": acc_id})


@acc_bp.route("/accounts/<acc_id>/activate", methods=["POST"])
def activate_acc(acc_id):
    set_active_account(acc_id)
    acc = get_account(acc_id)
    # Update runtime config with this account's credentials
    if acc:
        import config
        if acc.get("ig_token"):
            config.IG_ACCESS_TOKEN = acc["ig_token"]
        if acc.get("ig_user_id"):
            config.IG_USER_ID = acc["ig_user_id"]
    return jsonify({"activated": acc_id, "account": acc})


@acc_bp.route("/accounts/active", methods=["GET"])
def get_active():
    acc = get_active_account()
    if not acc:
        return jsonify({"account": None})
    return jsonify({"account": acc})
