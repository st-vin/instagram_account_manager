from flask import Blueprint, request, jsonify
from models.db import get_kpi_snapshots, save_kpi_snapshot
import config

kpi_bp = Blueprint("kpi", __name__)


def _err(msg, code=400):
    return jsonify({"error": msg}), code


@kpi_bp.route("/kpi/weekly")
def get_weekly_kpi():
    try:
        snaps = get_kpi_snapshots(limit=4)
        if len(snaps) >= 2:
            trend_followers  = "up" if snaps[0].get("followers", 0) > snaps[1].get("followers", 0) else "down"
            trend_engagement = "up" if snaps[0].get("avg_eng_rate", 0) > snaps[1].get("avg_eng_rate", 0) else "down"
        else:
            trend_followers = trend_engagement = "stable"

        return jsonify({
            "weeks": snaps,
            "trend": {
                "followers":  trend_followers,
                "engagement": trend_engagement,
                "reach":      "stable",
            }
        })
    except Exception as e:
        return _err(str(e), 500)


@kpi_bp.route("/kpi/sync", methods=["POST"])
def sync_kpi():
    try:
        from services.instagram_service import fetch_account_metrics, fetch_recent_posts
        from datetime import datetime

        metrics = fetch_account_metrics()
        posts   = fetch_recent_posts(limit=10)

        eng_rates = [p["metrics"]["engagement_rate"] for p in posts.get("posts", [])]
        reaches   = [p["metrics"]["reach"] for p in posts.get("posts", [])]
        saves     = [p["metrics"]["saves"] for p in posts.get("posts", [])]
        shares    = [p["metrics"]["shares"] for p in posts.get("posts", [])]
        formats   = [p["type"] for p in posts.get("posts", [])]
        top_fmt   = max(set(formats), key=formats.count) if formats else "Reel"

        # Follower delta vs last snapshot
        prev  = get_kpi_snapshots(limit=1)
        delta = (metrics.get("followers", 0) - prev[0].get("followers", 0)) if prev else 0

        snap = {
            "week_start":       datetime.utcnow().strftime("%Y-%m-%d"),
            "followers":        metrics.get("followers", 0),
            "follower_delta":   delta,
            "avg_reach":        int(sum(reaches) / len(reaches)) if reaches else 0,
            "avg_eng_rate":     round(sum(eng_rates) / len(eng_rates), 2) if eng_rates else 0.0,
            "posts_published":  len(posts.get("posts", [])),
            "total_saves":      sum(saves),
            "total_shares":     sum(shares),
            "top_format":       top_fmt,
        }

        save_kpi_snapshot(snap)

        if config.SHEETS_KPI_ID:
            from services.sheets_service import save_kpi_snapshot as sheets_snap
            sheets_snap(snap)

        return jsonify({"synced": True, "snapshot": snap})
    except Exception as e:
        return _err(str(e), 500)


@kpi_bp.route("/kpi/top-posts")
def get_top_posts():
    try:
        from services.instagram_service import fetch_recent_posts
        data  = fetch_recent_posts(limit=20)
        posts = data.get("posts", [])

        by_reach = sorted(posts, key=lambda p: p["metrics"]["reach"], reverse=True)[:3]
        by_eng   = sorted(posts, key=lambda p: p["metrics"]["engagement_rate"], reverse=True)[:3]
        by_saves = sorted(posts, key=lambda p: p["metrics"]["saves"], reverse=True)[:3]

        return jsonify({
            "by_reach":      by_reach,
            "by_engagement": by_eng,
            "by_saves":      by_saves,
        })
    except Exception as e:
        return _err(str(e), 500)
