import json
import os
from flask import Blueprint, request, jsonify
from services.instagram_service import check_token_status
import config

auth_bp = Blueprint("auth", __name__)
_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", ".ig_config.json")
_PROVIDER_KEYS_FILE = os.path.join(os.path.dirname(__file__), "..", ".provider_keys.json")


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

    # Also load provider API keys saved via dashboard.
    if os.path.exists(_PROVIDER_KEYS_FILE):
        try:
            with open(_PROVIDER_KEYS_FILE) as f:
                keys = json.load(f) or {}
            if keys.get("CEREBRAS_API_KEY"):
                config.CEREBRAS_API_KEY = keys["CEREBRAS_API_KEY"]
            if keys.get("ANTHROPIC_API_KEY"):
                config.ANTHROPIC_API_KEY = keys["ANTHROPIC_API_KEY"]
            if keys.get("OPENAI_API_KEY"):
                config.OPENAI_API_KEY = keys["OPENAI_API_KEY"]
            if keys.get("GEMINI_API_KEY"):
                config.GEMINI_API_KEY = keys["GEMINI_API_KEY"]
        except Exception:
            pass


@auth_bp.route("/auth/save-api-key", methods=["POST"])
def save_api_key():
    """
    Save a provider API key to runtime config and persist it to .provider_keys.json.
    This lets users paste keys in the dashboard without editing .env.
    """
    d = request.json or {}
    provider = (d.get("provider") or "").lower().strip()
    api_key = (d.get("api_key") or "").strip()

    if not provider or not api_key:
        return jsonify({"error": "provider and api_key are required"}), 400

    key_map = {
        "cerebras": "CEREBRAS_API_KEY",
        "claude": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "gemini": "GEMINI_API_KEY",
    }
    config_attr = key_map.get(provider)
    if not config_attr:
        return jsonify({"error": f"Unknown provider: {provider}"}), 400

    setattr(config, config_attr, api_key)

    # Best-effort persistence
    try:
        existing = {}
        if os.path.exists(_PROVIDER_KEYS_FILE):
            with open(_PROVIDER_KEYS_FILE) as f:
                existing = json.load(f) or {}
        existing[config_attr] = api_key
        with open(_PROVIDER_KEYS_FILE, "w") as f:
            json.dump(existing, f)
    except Exception:
        pass

    return jsonify({"saved": True, "provider": provider})
