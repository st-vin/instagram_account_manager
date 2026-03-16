"""routes/ai.py — AI generation endpoints (general engine edition)"""
from flask import Blueprint, request, jsonify
from services import cerebras_service as cs
from services import flow_service as fs
from models.accounts import get_active_account

ai_bp = Blueprint("ai", __name__)


def _err(msg, code=400):
    return jsonify({"error": msg}), code


def _get_profile(data: dict):
    niche_id = data.get("niche_id")
    if not niche_id:
        acc = get_active_account()
        niche_id = acc.get("niche_id") if acc else None
    if niche_id:
        from models.niche_profile import load_profile
        return load_profile(niche_id)
    return None


def _get_tone(data: dict) -> str:
    tone = data.get("tone")
    if not tone:
        acc = get_active_account()
        tone = acc.get("tone") if acc else None
    return tone or "warm & friendly"


@ai_bp.route("/generate/caption", methods=["POST"])
def generate_caption():
    d = request.json or {}
    if not d.get("pillar") or not d.get("keyword"):
        return _err("pillar and keyword are required")
    try:
        return jsonify(cs.generate_caption(
            pillar=d["pillar"], archetype=d.get("archetype", "process_tutorial"),
            keyword=d["keyword"], account_type=d.get("account_type", "B"),
            tone=_get_tone(d), profile=_get_profile(d),
        ))
    except Exception as e:
        return _err(str(e), 500)


@ai_bp.route("/generate/reel-script", methods=["POST"])
def generate_reel_script():
    d = request.json or {}
    try:
        return jsonify(cs.generate_reel_script(
            topic=d.get("topic", ""), duration=int(d.get("duration", 45)),
            style=d.get("style", "talking-to-camera"),
            archetype=d.get("archetype", "process_tutorial"),
            profile=_get_profile(d),
        ))
    except Exception as e:
        return _err(str(e), 500)


@ai_bp.route("/generate/carousel", methods=["POST"])
def generate_carousel():
    d = request.json or {}
    try:
        return jsonify(cs.generate_carousel(
            topic=d.get("topic", ""), cta_goal=d.get("cta_goal", "follow"),
            visual_style=d.get("visual_style", "bold-graphic"),
            archetype=d.get("archetype", "deep_dive"),
            profile=_get_profile(d),
        ))
    except Exception as e:
        return _err(str(e), 500)


@ai_bp.route("/generate/dm", methods=["POST"])
def generate_dm():
    d = request.json or {}
    try:
        return jsonify(cs.generate_dm(
            target_handle=d.get("target_handle", ""), target_niche=d.get("target_niche", ""),
            specific_post=d.get("specific_post", ""), collab_idea=d.get("collab_idea", ""),
            strategy=d.get("strategy", "equal-swap"), profile=_get_profile(d),
        ))
    except Exception as e:
        return _err(str(e), 500)


@ai_bp.route("/generate/reply", methods=["POST"])
def generate_reply():
    d = request.json or {}
    acc = get_active_account()
    try:
        return jsonify(cs.generate_reply(
            comment_text=d.get("comment_text", ""), post_topic=d.get("post_topic", ""),
            brand_tone=_get_tone(d),
            account_name=acc.get("name", "") if acc else d.get("account_name", ""),
            profile=_get_profile(d),
        ))
    except Exception as e:
        return _err(str(e), 500)


@ai_bp.route("/generate/visual-prompt", methods=["POST"])
def generate_visual_prompt():
    d = request.json or {}
    try:
        return jsonify(cs.generate_visual_prompt(
            slide_topic=d.get("slide_topic", ""), aspect_ratio=d.get("aspect_ratio", "4:5"),
            profile=_get_profile(d),
        ))
    except Exception as e:
        return _err(str(e), 500)


@ai_bp.route("/generate/visual", methods=["POST"])
def generate_visual():
    d = request.json or {}
    try:
        images = fs.generate_image(
            prompt=d.get("prompt", ""), negative_prompt=d.get("negative_prompt", ""),
            aspect_ratio=d.get("aspect_ratio", "4:5"),
            number_of_images=int(d.get("number_of_images", 1)),
        )
        return jsonify({"images": images})
    except Exception as e:
        return _err(str(e), 500)


@ai_bp.route("/generate/report", methods=["POST"])
def generate_report():
    d = request.json or {}
    from models.db import get_kpi_snapshots
    snaps = get_kpi_snapshots(limit=2)
    if not snaps:
        return _err("No KPI data yet. Run /api/v1/kpi/sync first.", 404)
    try:
        metrics = snaps[0]
        if len(snaps) > 1:
            metrics["follower_delta"] = snaps[0].get("followers", 0) - snaps[1].get("followers", 0)
        acc = get_active_account()
        return jsonify(cs.generate_report(
            metrics=metrics,
            client_name=d.get("client_name", acc.get("name", "Client") if acc else "Client"),
            include_next_week=d.get("include_next_week_plan", True),
            profile=_get_profile(d),
        ))
    except Exception as e:
        return _err(str(e), 500)
