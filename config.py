import os
from dotenv import load_dotenv

load_dotenv()

# ── Cerebras ──────────────────────────────────────────────
CEREBRAS_API_KEY    = os.getenv("CEREBRAS_API_KEY", "")
CEREBRAS_MODEL      = "llama-4-scout-17b-16e-instruct"

# ── Anthropic Claude ──────────────────────────────────────
ANTHROPIC_API_KEY   = os.getenv("ANTHROPIC_API_KEY", "")

# ── OpenAI ────────────────────────────────────────────────
OPENAI_API_KEY      = os.getenv("OPENAI_API_KEY", "")

# ── Google Gemini (AI Studio) ─────────────────────────────
GEMINI_API_KEY      = os.getenv("GEMINI_API_KEY", "")

# ── Active AI provider ────────────────────────────────────
# Which provider to use for text generation.
# Options: "cerebras" | "claude" | "openai" | "gemini"
AI_PROVIDER         = os.getenv("AI_PROVIDER", "cerebras")

# Default model per provider — overridden when user picks from dashboard
AI_MODEL_CEREBRAS   = os.getenv("AI_MODEL_CEREBRAS", "llama-4-scout-17b-16e-instruct")
AI_MODEL_CLAUDE     = os.getenv("AI_MODEL_CLAUDE",   "claude-sonnet-4-6")
AI_MODEL_OPENAI     = os.getenv("AI_MODEL_OPENAI",   "gpt-4o")
AI_MODEL_GEMINI     = os.getenv("AI_MODEL_GEMINI",   "gemini-2.5-flash")

# ── Instagram Graph API ───────────────────────────────────
IG_ACCESS_TOKEN     = os.getenv("IG_ACCESS_TOKEN", "")
IG_USER_ID          = os.getenv("IG_USER_ID", "")
IG_API_BASE         = "https://graph.instagram.com/v19.0"

# ── Google Cloud / Vertex AI (Google Flow) ────────────────
GOOGLE_PROJECT_ID   = os.getenv("GOOGLE_PROJECT_ID", "")
GOOGLE_LOCATION     = os.getenv("GOOGLE_LOCATION", "us-central1")
GOOGLE_CREDS_FILE   = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "gcp-credentials.json")
IMAGEN_MODEL        = "imagen-3.0-fast-generate-001"

# ── Google Sheets ─────────────────────────────────────────
SHEETS_CREDS_FILE   = os.getenv("SHEETS_CREDS_FILE", "sheets-credentials.json")
SHEETS_CALENDAR_ID  = os.getenv("SHEETS_CALENDAR_ID", "")
SHEETS_KPI_ID       = os.getenv("SHEETS_KPI_ID", "")

# ── Flask ─────────────────────────────────────────────────
SECRET_KEY          = os.getenv("SECRET_KEY", "dev-secret-change-in-prod")
DEBUG               = os.getenv("DEBUG", "true").lower() == "true"
PORT                = int(os.getenv("PORT", 5000))

# ── App defaults ──────────────────────────────────────────
DEFAULT_NICHE       = os.getenv("DEFAULT_NICHE", "Food & Lifestyle")
DEFAULT_TONE        = os.getenv("DEFAULT_TONE", "warm & friendly")
DEFAULT_LOCATION    = os.getenv("DEFAULT_LOCATION", "Nairobi")
