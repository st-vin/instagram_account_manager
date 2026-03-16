"""
scheduler_service.py
APScheduler setup and all scheduled job definitions.
All jobs are registered here; Flask app calls init_scheduler() at startup.
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler(timezone="Africa/Nairobi")


# ── Job functions ─────────────────────────────────────────

def job_morning_block():
    """08:00 daily — pull pending comments, flag unanswered DMs."""
    from models.db import log_job
    try:
        from services.instagram_service import fetch_pending_comments
        result = fetch_pending_comments()
        count  = result.get("pending_count", 0)
        log_job("morning_block", "success", f"{count} pending comments")
        logger.info(f"[morning_block] {count} pending comments found")
    except Exception as e:
        from models.db import log_job
        log_job("morning_block", "error", str(e))
        logger.error(f"[morning_block] {e}")


def job_midday_check():
    """12:00 daily — mid-day engagement nudge (log only)."""
    from models.db import log_job
    log_job("midday_check", "success", "Midday check triggered")
    logger.info("[midday_check] Midday engagement window reminder")


def job_evening_sweep():
    """18:00 daily — final comment sweep."""
    from models.db import log_job
    try:
        from services.instagram_service import fetch_pending_comments
        result = fetch_pending_comments()
        count  = result.get("pending_count", 0)
        log_job("evening_sweep", "success", f"{count} pending comments")
        logger.info(f"[evening_sweep] {count} pending comments")
    except Exception as e:
        log_job("evening_sweep", "error", str(e))
        logger.error(f"[evening_sweep] {e}")


def job_weekly_kpi_sync():
    """Monday 08:00 — pull metrics from IG, store in SQLite + Sheets."""
    from models.db import log_job, save_kpi_snapshot
    try:
        from services.instagram_service import fetch_account_metrics, fetch_recent_posts
        metrics = fetch_account_metrics()
        posts   = fetch_recent_posts(limit=10)

        # Compute engagement averages
        eng_rates = [p["metrics"]["engagement_rate"] for p in posts.get("posts", [])]
        reaches   = [p["metrics"]["reach"] for p in posts.get("posts", [])]
        saves     = [p["metrics"]["saves"] for p in posts.get("posts", [])]
        shares    = [p["metrics"]["shares"] for p in posts.get("posts", [])]

        formats   = [p["type"] for p in posts.get("posts", [])]
        top_fmt   = max(set(formats), key=formats.count) if formats else "Reel"

        snap = {
            "week_start":       datetime.utcnow().strftime("%Y-%m-%d"),
            "followers":        metrics.get("followers", 0),
            "follower_delta":   0,
            "avg_reach":        int(sum(reaches) / len(reaches)) if reaches else 0,
            "avg_eng_rate":     round(sum(eng_rates) / len(eng_rates), 2) if eng_rates else 0,
            "posts_published":  len(posts.get("posts", [])),
            "total_saves":      sum(saves),
            "total_shares":     sum(shares),
            "top_format":       top_fmt,
        }

        save_kpi_snapshot(snap)

        # Also push to Sheets if configured
        import config
        if config.SHEETS_KPI_ID:
            from services.sheets_service import save_kpi_snapshot as sheets_snap
            sheets_snap(snap)

        log_job("weekly_kpi_sync", "success", f"Followers: {snap['followers']}")
        logger.info(f"[weekly_kpi_sync] Snapshot saved — {snap['followers']} followers")
    except Exception as e:
        log_job("weekly_kpi_sync", "error", str(e))
        logger.error(f"[weekly_kpi_sync] {e}")


def job_weekly_report():
    """Monday 08:05 — generate report from latest KPI data."""
    from models.db import log_job, get_kpi_snapshots
    try:
        snaps = get_kpi_snapshots(limit=2)
        if not snaps:
            log_job("weekly_report", "skipped", "No KPI snapshots yet")
            return

        import config
        from services.cerebras_service import generate_report
        report = generate_report(
            metrics=snaps[0],
            client_name="Client",
            include_next_week=True,
        )
        log_job("weekly_report", "success", report.get("headline_summary", ""))
        logger.info(f"[weekly_report] {report.get('headline_summary')}")
    except Exception as e:
        log_job("weekly_report", "error", str(e))
        logger.error(f"[weekly_report] {e}")


def job_comment_poll():
    """Every 2 hours — poll for new unanswered comments."""
    from models.db import log_job
    try:
        from services.instagram_service import fetch_pending_comments
        result = fetch_pending_comments()
        log_job("comment_poll", "success", f"{result.get('pending_count',0)} pending")
    except Exception as e:
        log_job("comment_poll", "error", str(e))


def job_token_refresh_check():
    """1st of every month — warn if token expiring soon."""
    from models.db import log_job
    try:
        from services.instagram_service import check_token_status
        status = check_token_status()
        log_job("token_refresh_check", "success",
                "Connected" if status.get("connected") else "Disconnected")
        if not status.get("connected"):
            logger.warning("[token_refresh_check] Instagram token may be expired!")
    except Exception as e:
        log_job("token_refresh_check", "error", str(e))


# ── Scheduler initialisation ──────────────────────────────

def init_scheduler(app):
    """Register all jobs and start the scheduler."""
    with app.app_context():
        scheduler.add_job(job_morning_block,       CronTrigger(hour=8,  minute=0),  id="morning_block",       replace_existing=True)
        scheduler.add_job(job_midday_check,        CronTrigger(hour=12, minute=0),  id="midday_check",        replace_existing=True)
        scheduler.add_job(job_evening_sweep,       CronTrigger(hour=18, minute=0),  id="evening_sweep",       replace_existing=True)
        scheduler.add_job(job_weekly_kpi_sync,     CronTrigger(day_of_week="mon", hour=8,  minute=0),  id="weekly_kpi_sync",  replace_existing=True)
        scheduler.add_job(job_weekly_report,       CronTrigger(day_of_week="mon", hour=8,  minute=5),  id="weekly_report",    replace_existing=True)
        scheduler.add_job(job_comment_poll,        CronTrigger(minute=0, hour="*/2"), id="comment_poll",      replace_existing=True)
        scheduler.add_job(job_token_refresh_check, CronTrigger(day=1, hour=9, minute=0), id="token_refresh_check", replace_existing=True)

    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started — 7 jobs registered")


def get_jobs_status() -> list:
    jobs = []
    for job in scheduler.get_jobs():
        next_run = job.next_run_time
        jobs.append({
            "id":       job.id,
            "schedule": str(job.trigger),
            "next_run": next_run.isoformat() if next_run else "paused",
            "status":   "active" if next_run else "paused",
        })
    return jobs


def trigger_job_now(job_id: str) -> bool:
    job = scheduler.get_job(job_id)
    if not job:
        return False
    from apscheduler.util import datetime_to_utc_timestamp
    job.modify(next_run_time=datetime.now(tz=job.next_run_time.tzinfo if job.next_run_time else None))
    return True
