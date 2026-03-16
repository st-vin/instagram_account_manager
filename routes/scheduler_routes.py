from flask import Blueprint, jsonify
from services.scheduler_service import get_jobs_status, trigger_job_now, scheduler

sched_bp = Blueprint("scheduler", __name__)


@sched_bp.route("/scheduler/jobs")
def list_jobs():
    return jsonify({"jobs": get_jobs_status()})


@sched_bp.route("/scheduler/trigger/<job_id>", methods=["POST"])
def trigger_job(job_id):
    ok = trigger_job_now(job_id)
    if not ok:
        return jsonify({"error": f"Job '{job_id}' not found"}), 404
    return jsonify({"triggered": job_id, "status": "running"})
