"""routes/niches.py — NicheProfile management endpoints"""
from flask import Blueprint, request, jsonify
from models.niche_profile import (
    list_profiles, load_profile, save_custom_profile,
    UNIVERSAL_ARCHETYPES,
)
from services.cerebras_service import generate_niche_profile

niche_bp = Blueprint("niches", __name__)


def _err(msg, code=400):
    return jsonify({"error": msg}), code


@niche_bp.route("/niches", methods=["GET"])
def list_niches():
    """List all available niche profiles (presets + custom)."""
    return jsonify({"niches": list_profiles()})


@niche_bp.route("/niches/<niche_id>", methods=["GET"])
def get_niche(niche_id):
    """Fetch a full niche profile by ID."""
    profile = load_profile(niche_id)
    if not profile:
        return _err(f"Niche profile '{niche_id}' not found", 404)
    return jsonify(profile.to_dict())


@niche_bp.route("/niches/<niche_id>/archetypes", methods=["GET"])
def get_archetypes(niche_id):
    """Return all archetypes translated into this niche's vocabulary."""
    profile = load_profile(niche_id)
    if not profile:
        return _err("Niche not found", 404)
    return jsonify({"archetypes": profile.all_archetypes()})


@niche_bp.route("/niches/generate", methods=["POST"])
def generate_niche():
    """
    AI-generate a complete NicheProfile from onboarding wizard answers.
    Does NOT save automatically — returns the profile for user review.
    """
    d = request.json or {}
    if not d.get("niche_name"):
        return _err("niche_name is required")
    try:
        profile_data = generate_niche_profile(d)
        return jsonify({"profile": profile_data})
    except Exception as e:
        return _err(str(e), 500)


@niche_bp.route("/niches", methods=["POST"])
def create_niche():
    """Save a new or edited NicheProfile (user-created or AI-generated)."""
    d = request.json or {}
    if not d.get("name"):
        return _err("name is required")
    try:
        profile = save_custom_profile(d)
        return jsonify(profile.to_dict()), 201
    except Exception as e:
        return _err(str(e), 500)


@niche_bp.route("/niches/archetypes/universal", methods=["GET"])
def universal_archetypes():
    """Return the list of universal archetype IDs."""
    return jsonify({"archetypes": UNIVERSAL_ARCHETYPES})
