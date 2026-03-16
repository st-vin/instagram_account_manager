"""
app.py  —  Instagram SMM Automation Engine (General Edition)
Strategy-driven, niche-agnostic. Configure for any niche via NicheProfile.
Run: python app.py
"""
import logging
from flask import Flask, send_from_directory, jsonify
from flask_caching import Cache
from flask_cors import CORS

import config
from models.db import init_db
from models.accounts import init_accounts_table
from routes.ai import ai_bp
from routes.instagram import ig_bp
from routes.calendar import cal_bp
from routes.kpi import kpi_bp
from routes.scheduler_routes import sched_bp
from routes.auth import auth_bp, load_saved_token
from routes.accounts import acc_bp
from routes.niches import niche_bp
from services.scheduler_service import init_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.secret_key = config.SECRET_KEY

CORS(app, resources={r"/api/*": {"origins": "*"}})
cache = Cache(app, config={"CACHE_TYPE": "SimpleCache", "CACHE_DEFAULT_TIMEOUT": 3600})

PREFIX = "/api/v1"
app.register_blueprint(ai_bp,    url_prefix=PREFIX)
app.register_blueprint(ig_bp,    url_prefix=PREFIX)
app.register_blueprint(cal_bp,   url_prefix=PREFIX)
app.register_blueprint(kpi_bp,   url_prefix=PREFIX)
app.register_blueprint(sched_bp, url_prefix=PREFIX)
app.register_blueprint(auth_bp,  url_prefix=PREFIX)
app.register_blueprint(acc_bp,   url_prefix=PREFIX)
app.register_blueprint(niche_bp, url_prefix=PREFIX)


@app.route("/")
def dashboard():
    return send_from_directory("static", "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("static", path)


@app.route("/api/v1/health")
def health():
    from models.niche_profile import list_profiles
    from models.accounts import list_accounts
    return jsonify({
        "status":   "ok",
        "version":  "2.0.0",
        "edition":  "General Engine",
        "niches":   len(list_profiles()),
        "accounts": len(list_accounts()),
    })


init_db()
init_accounts_table()
load_saved_token()
init_scheduler(app)

if __name__ == "__main__":
    app.run(debug=config.DEBUG, port=config.PORT, use_reloader=False)
