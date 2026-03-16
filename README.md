# Instagram SMM Automation Engine
### General Edition — v2.0

A self-hosted, AI-powered Instagram management engine that works for **any niche**. The strategy logic is universal. The niche vocabulary, content archetypes, audience context, and local references are loaded at runtime from a swappable configuration file called a **NicheProfile**.

---

## What changed from v1 (the architecture shift)

Version 1 was a specialised food account manager. Version 2 is a **general engine** where the niche is treated as an external configuration — a plugin — that any user can swap, customise, or create from scratch using AI.

| v1 (Subject-driven) | v2 (Strategy-driven) |
|---|---|
| Hardcoded: `"restaurant review"` | Abstracted: `"location_spotlight"` archetype |
| Hardcoded: `"ingredient list"` | Abstracted: `"resource_noun"` vocabulary key |
| Hardcoded: `"nyama choma"` | Config: `local_references[]` in NicheProfile |
| Single niche, single account | Multi-account, multi-niche, account switcher |
| Food-specific prompt strings | Universal templates with `{vocabulary}` substitution |

---

## Architecture

```
smm-engine/
├── app.py                       Flask entry point + blueprint registration
├── config.py                    Environment variables
│
├── niches/                      NicheProfile JSON files (presets + custom)
│   ├── food_lifestyle.json
│   ├── fitness_wellness.json
│   ├── tech_developer.json
│   ├── business_finance.json
│   └── travel_lifestyle.json
│
├── models/
│   ├── db.py                    SQLite helpers (comments, KPI, job log)
│   ├── niche_profile.py         NicheProfile class — loads, validates, fills templates
│   └── accounts.py              Multi-account CRUD and active account management
│
├── routes/                      Flask blueprints
│   ├── ai.py                    /api/v1/generate/* — niche-aware generation
│   ├── instagram.py             /api/v1/instagram/*
│   ├── calendar.py              /api/v1/calendar/*
│   ├── kpi.py                   /api/v1/kpi/*
│   ├── scheduler_routes.py      /api/v1/scheduler/*
│   ├── auth.py                  /api/v1/auth/*
│   ├── accounts.py              /api/v1/accounts/*
│   └── niches.py                /api/v1/niches/*
│
├── services/
│   ├── cerebras_service.py      All AI generation — niche-agnostic prompt templates
│   ├── instagram_service.py     Meta Graph API wrapper
│   ├── sheets_service.py        Google Sheets read/write
│   ├── flow_service.py          Vertex AI Imagen 3
│   └── scheduler_service.py     APScheduler job definitions
│
└── static/
    ├── index.html               Single-page dashboard
    ├── css/dashboard.css
    └── js/
        ├── api.js               fetch() wrapper
        └── dashboard.js         Full dashboard logic — account switching, niche-aware forms
```

---

## How the NicheProfile system works

Every niche is described by a JSON file with five sections:

**1. Vocabulary map** — eight semantic roles that translate niche-specific language into universal engine variables:

```json
"vocabulary": {
  "primary_entity": "dish / meal",
  "action_verb":    "cook / prepare",
  "location_type":  "restaurant / kitchen",
  "resource_noun":  "ingredient / tool",
  "expert_title":   "food blogger / chef",
  "audience_role":  "home cook / foodie",
  "result_noun":    "perfect meal",
  "industry_term":  "food scene"
}
```

**2. Archetype overrides** — 12 universal content archetypes exist in the engine. Each niche gives them niche-specific labels and example topics:

```json
"archetype_overrides": {
  "process_tutorial":   { "label": "Recipe walkthrough",   "example_topics": [...] },
  "location_spotlight": { "label": "Restaurant review",    "example_topics": [...] },
  "myth_busting":       { "label": "Food myth busting",    "example_topics": [...] }
}
```

**3. Audience block** — demographics, pain points, aspirations, language register, active hours, best posting days.

**4. Local context** — city, currency, local references, regional hashtags.

**5. Visual style** — photography style, color mood, Imagen 3 prompt suffix.

The Cerebras prompt templates use `{vocabulary_key}` placeholders that are substituted at call time. The same prompt template generates:
- "How to **cook** the perfect **dish** every time" (food)
- "How to **train** for your best **workout** every time" (fitness)
- "How to **deploy** your first **project** every time" (tech)

---

## The 12 universal content archetypes

| ID | Purpose | Primary signal |
|---|---|---|
| `process_tutorial` | Step-by-step guide to an outcome | Saves |
| `location_spotlight` | Review or feature of a place/service | DM shares |
| `myth_busting` | Challenges a common misconception | Comments + shares |
| `resource_list` | Curated tools, places, or materials | Saves |
| `personal_journey` | Creator's transformation or evolution | Follows + DMs |
| `quick_win` | Fast, immediately actionable value | Saves + replays |
| `industry_commentary` | Take on a trending niche topic | Comments |
| `behind_scenes` | Creator's process or routine | Comments + follows |
| `comparison` | Honest side-by-side breakdown | Saves + comments |
| `community_spotlight` | Features a follower's result or creation | Shares |
| `hot_take` | Polarising opinion that invites debate | Comments |
| `deep_dive` | Comprehensive educational carousel | Saves |

---

## Preset niche profiles

Five presets ship with the engine. Each is a complete NicheProfile JSON in `niches/`:

| File | Niche | Local context |
|---|---|---|
| `food_lifestyle.json` | Food & Lifestyle | Nairobi restaurants, nyama choma, Java House |
| `fitness_wellness.json` | Fitness & Wellness | Nairobi Marathon, Karura Forest, gym culture |
| `tech_developer.json` | Tech & Developer | iHub, Andela, M-Pesa API, Moringa School |
| `business_finance.json` | Business & Finance | NSE, KRA, Equity Bank, M-Pesa, Fuliza |
| `travel_lifestyle.json` | Travel & Lifestyle | Maasai Mara, Diani, Lamu, Amboseli |

To create a custom profile: Dashboard → Niches → "Create custom niche" → answer 5 questions → AI generates the full profile → save it.

---

## Multi-account support

Each account has:
- A linked NicheProfile (determines vocabulary, archetypes, posting times)
- Its own Instagram credentials (token + user ID)
- Its own posting schedule and content pillars
- Its own tone setting

Switch accounts from the sidebar account switcher. All generation, KPI data, and calendar content automatically uses the active account's niche profile.

---

## New API routes (v2 additions)

```
# Accounts
GET    /api/v1/accounts                  List all accounts
POST   /api/v1/accounts                  Create account
GET    /api/v1/accounts/active           Get active account
GET    /api/v1/accounts/<id>             Get account by ID
PATCH  /api/v1/accounts/<id>             Update account
DELETE /api/v1/accounts/<id>             Delete account
POST   /api/v1/accounts/<id>/activate    Switch active account

# NicheProfiles
GET    /api/v1/niches                         List all profiles
GET    /api/v1/niches/<id>                    Get profile by ID
GET    /api/v1/niches/<id>/archetypes         Get archetypes in niche vocabulary
POST   /api/v1/niches/generate                AI-generate profile from answers
POST   /api/v1/niches                         Save a profile
GET    /api/v1/niches/archetypes/universal    List universal archetype IDs
```

All generation routes now auto-resolve the niche from the active account. You can override per-request by passing `niche_id` in the request body.

---

## Setup (same as v1 — full steps in original README)

```bash
git clone https://github.com/yourhandle/smm-engine.git
cd smm-engine
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in your API keys
python app.py               # opens at localhost:5000
```

**First run — dashboard flow:**
1. Dashboard → Accounts → Add account → choose a preset niche
2. Dashboard → Settings → connect Instagram token
3. Dashboard → Overview → Sync metrics
4. Dashboard → Calendar → Generate month
5. Dashboard → Generate → start producing content

---

## Creating a custom niche profile (in 5 minutes)

1. Dashboard → Niches → "Create custom niche"
2. Fill in: niche name, what you post about, primary subject, target audience, city, tone
3. Click "Generate profile with AI" — Cerebras generates the full NicheProfile (vocab map, 12 archetype labels + examples, hashtag clusters, audience profile, image prompt suffix)
4. Review the generated profile
5. Click "Save this profile" — it is immediately available for all accounts

---

## Adding your own preset niche

Create a JSON file in `niches/your_niche.json` following the schema in `models/niche_profile.py`. The engine loads all `.json` files from the `niches/` directory on startup — no code changes needed.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Flask 3.0 with blueprints |
| AI text | Cerebras Cloud — `llama-4-scout-17b-16e-instruct` |
| AI image | Google Vertex AI Imagen 3 |
| Niche config | JSON files — `niches/*.json` |
| Multi-account | SQLite `accounts` table |
| KPI storage | SQLite + Google Sheets |
| Scheduling | APScheduler (background thread) |
| Frontend | Plain HTML / CSS / JS |
| Instagram | Meta Graph API v19 |

---

## Extending — add a new niche in one step

1. Copy `niches/food_lifestyle.json` → `niches/your_niche.json`
2. Replace all vocabulary values, archetype labels, audience fields, local references
3. Restart the app — the new niche appears in the dropdown immediately

No Python changes. No route changes. No prompt changes.

---

## Licence

MIT.
