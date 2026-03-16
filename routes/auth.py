import json
import os
from flask import Blueprint, request, jsonify
from services.instagram_service import check_token_status
import config

auth_bp = Blueprint("auth", __name__)
_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", ".ig_config.json")


@auth_bp.route("/auth/connect-instagram", methods=["POST"])
def connect_instagram():
    d = request.json or {}
    token = d.get("access_token", "").strip()
    ig_id = d.get("ig_user_id", "").strip()

    if not token or not ig_id:
        return jsonify({"error": "access_token and ig_user_id required"}), 400

    # Persist to file and update runtime config
    cfg = {"access_token": token, "ig_user_id": ig_id}
    try:
        with open(_CONFIG_FILE, "w") as f:
            json.dump(cfg, f)
        config.IG_ACCESS_TOKEN = token
        config.IG_USER_ID      = ig_id
        return jsonify({"saved": True, "ig_user_id": ig_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/auth/status")
def auth_status():
    status = check_token_status()
    return jsonify(status)


def load_saved_token():
    """Called at app startup to restore token from file if present."""
    if os.path.exists(_CONFIG_FILE):
        try:
            with open(_CONFIG_FILE) as f:
                cfg = json.load(f)
            config.IG_ACCESS_TOKEN = cfg.get("access_token", config.IG_ACCESS_TOKEN)
            config.IG_USER_ID      = cfg.get("ig_user_id",   config.IG_USER_ID)
        except Exception:
            pass
