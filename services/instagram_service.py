"""
instagram_service.py
All Instagram Graph API interactions.
"""
import requests
from datetime import datetime, timedelta
import config
from models.db import get_replied_ids


def _token() -> str:
    return config.IG_ACCESS_TOKEN


def _ig_id() -> str:
    return config.IG_USER_ID


def _get(path: str, params: dict = None) -> dict:
    params = params or {}
    params["access_token"] = _token()
    r = requests.get(f"{config.IG_API_BASE}/{path}", params=params, timeout=10)
    r.raise_for_status()
    return r.json()


def _post(path: str, data: dict = None) -> dict:
    data = data or {}
    data["access_token"] = _token()
    r = requests.post(f"{config.IG_API_BASE}/{path}", data=data, timeout=10)
    r.raise_for_status()
    return r.json()


# ── Account metrics ───────────────────────────────────────

def fetch_account_metrics(period: str = "week") -> dict:
    """
    Fetch account-level insights.
    period: 'week' (last 7 days) | 'month' (last 28 days)
    """
    ig_id = _ig_id()

    # Basic profile fields
    profile = _get(ig_id, {"fields": "followers_count,media_count,username"})

    # Insights — reach and impressions
    since = int((datetime.utcnow() - timedelta(days=7 if period == "week" else 28)).timestamp())
    until = int(datetime.utcnow().timestamp())

    try:
        insights = _get(
            f"{ig_id}/insights",
            {
                "metric": "reach,impressions,profile_views,follower_count",
                "period": "day",
                "since": since,
                "until": until,
            }
        )
        reach = sum(v["value"] for v in insights["data"][0]["values"]) if insights.get("data") else 0
        impressions = sum(v["value"] for v in insights["data"][1]["values"]) if len(insights.get("data", [])) > 1 else 0
        profile_views = sum(v["value"] for v in insights["data"][2]["values"]) if len(insights.get("data", [])) > 2 else 0
    except Exception:
        reach = impressions = profile_views = 0

    return {
        "username": profile.get("username", ""),
        "followers": profile.get("followers_count", 0),
        "media_count": profile.get("media_count", 0),
        "profile_views": profile_views,
        "reach_7d": reach,
        "impressions_7d": impressions,
        "fetched_at": datetime.utcnow().isoformat() + "Z",
    }


# ── Posts ─────────────────────────────────────────────────

def fetch_recent_posts(limit: int = 20) -> dict:
    """Fetch recent posts with per-post metrics."""
    ig_id = _ig_id()
    media = _get(
        f"{ig_id}/media",
        {
            "fields": "id,media_type,thumbnail_url,media_url,caption,timestamp",
            "limit": limit,
        }
    )

    posts = []
    followers = fetch_account_metrics().get("followers", 1)

    for item in media.get("data", []):
        try:
            ins = _get(
                f"{item['id']}/insights",
                {"metric": "reach,impressions,likes,comments,saved,shares"}
            )
            metrics = {m["name"]: m["values"][0]["value"] for m in ins.get("data", [])}
        except Exception:
            metrics = {}

        likes    = metrics.get("likes", 0)
        comments = metrics.get("comments", 0)
        saves    = metrics.get("saved", 0)
        shares   = metrics.get("shares", 0)
        reach    = metrics.get("reach", 1)
        eng_rate = round((likes + comments + saves) / max(followers, 1) * 100, 2)

        posts.append({
            "id": item["id"],
            "type": item.get("media_type", "IMAGE"),
            "thumbnail": item.get("thumbnail_url") or item.get("media_url", ""),
            "caption": (item.get("caption", "") or "")[:120],
            "timestamp": item.get("timestamp", ""),
            "metrics": {
                "reach": reach,
                "impressions": metrics.get("impressions", 0),
                "likes": likes,
                "comments": comments,
                "saves": saves,
                "shares": shares,
                "engagement_rate": eng_rate,
                "plays": metrics.get("plays", 0),
            }
        })

    posts.sort(key=lambda p: p["metrics"]["reach"], reverse=True)
    top    = posts[0]["id"] if posts else None
    worst  = posts[-1]["id"] if posts else None

    return {"posts": posts, "top_post_id": top, "worst_post_id": worst}


# ── Comments ──────────────────────────────────────────────

def fetch_pending_comments() -> dict:
    """Return all unanswered comments across recent posts."""
    ig_id     = _ig_id()
    replied   = get_replied_ids()
    pending   = []

    media = _get(f"{ig_id}/media", {"fields": "id,thumbnail_url,media_url", "limit": 10})

    for item in media.get("data", []):
        try:
            comments = _get(
                f"{item['id']}/comments",
                {"fields": "id,username,text,timestamp"}
            )
            for c in comments.get("data", []):
                if c["id"] not in replied:
                    ts   = datetime.fromisoformat(c["timestamp"].replace("Z", "+00:00"))
                    diff = datetime.now(ts.tzinfo) - ts
                    pending.append({
                        "id": c["id"],
                        "post_id": item["id"],
                        "post_thumbnail": item.get("thumbnail_url") or item.get("media_url", ""),
                        "username": c.get("username", ""),
                        "text": c.get("text", ""),
                        "timestamp": c["timestamp"],
                        "hours_unanswered": round(diff.total_seconds() / 3600, 1),
                    })
        except Exception:
            continue

    pending.sort(key=lambda c: c["hours_unanswered"], reverse=True)
    return {"pending_count": len(pending), "comments": pending}


# ── Reply to comment ──────────────────────────────────────

def post_reply(comment_id: str, reply_text: str) -> dict:
    result = _post(f"{comment_id}/replies", {"message": reply_text})
    return result


# ── Token validation ──────────────────────────────────────

def check_token_status() -> dict:
    """Verify current token and return its metadata."""
    if not _token():
        return {"connected": False, "error": "No token stored"}
    try:
        data = requests.get(
            "https://graph.instagram.com/me",
            params={"fields": "id,username,account_type", "access_token": _token()},
            timeout=8,
        ).json()
        if "error" in data:
            return {"connected": False, "error": data["error"].get("message")}
        return {
            "connected": True,
            "ig_handle": "@" + data.get("username", ""),
            "account_type": data.get("account_type", "UNKNOWN"),
        }
    except Exception as e:
        return {"connected": False, "error": str(e)}


# ── Trending hashtags ─────────────────────────────────────

def fetch_trending_hashtags(niche: str) -> dict:
    """
    Fetch trending hashtags for a niche using the Graph API hashtag search.
    Returns top hashtags by media count in the niche.
    """
    ig_id = _ig_id()
    hashtags = []

    seed_tags = niche.lower().replace(" ", "").split("&")
    for tag in seed_tags[:3]:
        try:
            search = _get("ig_hashtag_search", {"q": tag, "user_id": ig_id})
            ht_id  = search.get("data", [{}])[0].get("id")
            if ht_id:
                info = _get(ht_id, {"fields": "name,media_count"})
                hashtags.append({
                    "tag": "#" + info.get("name", tag),
                    "media_count": info.get("media_count", 0),
                })
        except Exception:
            continue

    return {"niche": niche, "hashtags": hashtags}
