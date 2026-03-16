from flask import Blueprint, request, jsonify, current_app
from services import instagram_service as ig
from models.db import mark_comment_replied

ig_bp = Blueprint("instagram", __name__)


def _err(msg, code=400):
    return jsonify({"error": msg}), code


@ig_bp.route("/instagram/metrics")
def get_metrics():
    period = request.args.get("period", "week")
    try:
        data = ig.fetch_account_metrics(period)
        return jsonify(data)
    except Exception as e:
        return _err(str(e), 500)


@ig_bp.route("/instagram/posts")
def get_posts():
    limit = int(request.args.get("limit", 20))
    try:
        data = ig.fetch_recent_posts(limit)
        return jsonify(data)
    except Exception as e:
        return _err(str(e), 500)


@ig_bp.route("/instagram/comments")
def get_comments():
    try:
        data = ig.fetch_pending_comments()
        return jsonify(data)
    except Exception as e:
        return _err(str(e), 500)


@ig_bp.route("/instagram/reply", methods=["POST"])
def post_reply():
    d = request.json or {}
    comment_id  = d.get("comment_id")
    reply_text  = d.get("reply_text")
    if not comment_id or not reply_text:
        return _err("comment_id and reply_text are required")
    try:
        result = ig.post_reply(comment_id, reply_text)
        mark_comment_replied(comment_id)
        return jsonify({"success": True, "ig_response": result})
    except Exception as e:
        return _err(str(e), 500)


@ig_bp.route("/instagram/trending")
def get_trending():
    niche = request.args.get("niche", "food")
    try:
        data = ig.fetch_trending_hashtags(niche)
        return jsonify(data)
    except Exception as e:
        return _err(str(e), 500)
