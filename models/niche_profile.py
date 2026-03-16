"""
models/niche_profile.py

Loads, validates, and manages NicheProfile objects.
A NicheProfile is the swappable "plugin" that tells the engine
what niche it is operating in — without touching any engine logic.
"""
import json
import os
from typing import Optional

NICHES_DIR = os.path.join(os.path.dirname(__file__), "..", "niches")

# ── Schema defaults (what every profile must have) ────────
REQUIRED_VOCABULARY_KEYS = [
    "primary_entity", "action_verb", "location_type",
    "resource_noun", "expert_title", "audience_role",
    "result_noun", "industry_term",
]

UNIVERSAL_ARCHETYPES = [
    "process_tutorial", "location_spotlight", "myth_busting",
    "resource_list", "personal_journey", "quick_win",
    "industry_commentary", "behind_scenes", "comparison",
    "community_spotlight", "hot_take", "deep_dive",
]


class NicheProfile:
    """
    Represents a fully loaded and validated niche configuration.
    All engine services consume a NicheProfile instance —
    never a raw niche name string.
    """

    def __init__(self, data: dict):
        self._data = data
        self._validate()

    def _validate(self):
        assert self._data.get("id"),   "NicheProfile must have an 'id'"
        assert self._data.get("name"), "NicheProfile must have a 'name'"
        vocab = self._data.get("vocabulary", {})
        for k in REQUIRED_VOCABULARY_KEYS:
            if k not in vocab:
                self._data["vocabulary"][k] = f"[{k}]"

    # ── Core accessors ────────────────────────────────────

    @property
    def id(self) -> str:
        return self._data["id"]

    @property
    def name(self) -> str:
        return self._data["name"]

    @property
    def description(self) -> str:
        return self._data.get("description", "")

    @property
    def vocabulary(self) -> dict:
        return self._data.get("vocabulary", {})

    @property
    def audience(self) -> dict:
        return self._data.get("audience", {})

    @property
    def local_context(self) -> dict:
        return self._data.get("local_context", {})

    @property
    def visual_style(self) -> dict:
        return self._data.get("visual_style", {})

    @property
    def hashtags(self) -> dict:
        return self._data.get("hashtags", {})

    @property
    def content_pillars_preset(self) -> list:
        return self._data.get("content_pillars_preset", [])

    @property
    def best_posting_days(self) -> list:
        return self.audience.get("best_posting_days", ["Tuesday", "Thursday", "Saturday"])

    @property
    def active_hours(self) -> dict:
        return self.audience.get("active_hours", {"weekday": ["12:00", "18:00"], "weekend": ["10:00", "14:00"]})

    @property
    def city(self) -> str:
        return self.local_context.get("city", "Nairobi")

    @property
    def currency(self) -> str:
        return self.local_context.get("currency", "KES")

    @property
    def local_references(self) -> list:
        return self.local_context.get("local_references", [])

    @property
    def image_prompt_suffix(self) -> str:
        return self.visual_style.get("image_prompt_suffix", "")

    # ── Archetype helpers ─────────────────────────────────

    def archetype_label(self, archetype_id: str) -> str:
        """Returns the niche-specific label for a universal archetype."""
        overrides = self._data.get("archetype_overrides", {})
        return overrides.get(archetype_id, {}).get("label", archetype_id.replace("_", " ").title())

    def archetype_examples(self, archetype_id: str) -> list:
        """Returns example topics for this archetype in this niche."""
        overrides = self._data.get("archetype_overrides", {})
        return overrides.get(archetype_id, {}).get("example_topics", [])

    def all_archetypes(self) -> list:
        """Returns list of {id, label, examples} for all universal archetypes."""
        return [
            {
                "id":       a,
                "label":    self.archetype_label(a),
                "examples": self.archetype_examples(a),
            }
            for a in UNIVERSAL_ARCHETYPES
        ]

    # ── Vocabulary substitution ───────────────────────────

    def fill(self, template: str) -> str:
        """
        Substitutes {vocabulary_key} placeholders in a template string.
        Also substitutes {city}, {currency}, and {local_ref}.
        """
        result = template
        for k, v in self.vocabulary.items():
            result = result.replace("{" + k + "}", v)
        result = result.replace("{city}",     self.city)
        result = result.replace("{currency}", self.currency)
        if self.local_references:
            result = result.replace("{local_ref}", self.local_references[0])
        return result

    # ── Serialisation ─────────────────────────────────────

    def to_dict(self) -> dict:
        return self._data.copy()

    def to_prompt_context(self) -> str:
        """
        Returns a compact, structured string that can be injected
        at the top of any Cerebras prompt to give the model
        full niche context without redundancy.
        """
        vocab = self.vocabulary
        audience = self.audience
        ctx = self.local_context
        return f"""
NICHE CONTEXT:
- Niche: {self.name} ({self.description})
- Location: {self.city}, {ctx.get('currency','KES')}
- Primary entity: {vocab.get('primary_entity')}
- Action verb: {vocab.get('action_verb')}
- Location type: {vocab.get('location_type')}
- Resource noun: {vocab.get('resource_noun')}
- Expert title: {vocab.get('expert_title')}
- Audience: {vocab.get('audience_role')} — {audience.get('age_range','22-38')} yrs
- Audience pain points: {', '.join(audience.get('pain_points', [])[:3])}
- Audience aspirations: {', '.join(audience.get('aspirations', [])[:3])}
- Language register: {audience.get('language_register', 'warm and direct')}
- Local references to use naturally: {', '.join(ctx.get('local_references', [])[:5])}
""".strip()


# ── Profile registry ──────────────────────────────────────

_cache: dict[str, NicheProfile] = {}


def load_profile(profile_id: str) -> Optional[NicheProfile]:
    """Load a NicheProfile by ID from the niches/ directory."""
    if profile_id in _cache:
        return _cache[profile_id]

    path = os.path.join(NICHES_DIR, f"{profile_id}.json")
    if not os.path.exists(path):
        return None

    with open(path) as f:
        data = json.load(f)

    profile = NicheProfile(data)
    _cache[profile_id] = profile
    return profile


def list_profiles() -> list[dict]:
    """Return a list of all available niche profile summaries."""
    profiles = []
    if not os.path.exists(NICHES_DIR):
        return profiles

    for fname in sorted(os.listdir(NICHES_DIR)):
        if fname.endswith(".json"):
            path = os.path.join(NICHES_DIR, fname)
            try:
                with open(path) as f:
                    data = json.load(f)
                profiles.append({
                    "id":          data.get("id", fname.replace(".json", "")),
                    "name":        data.get("name", "Unknown"),
                    "description": data.get("description", ""),
                    "pillars":     data.get("content_pillars_preset", []),
                })
            except Exception:
                continue
    return profiles


def save_custom_profile(data: dict) -> NicheProfile:
    """
    Save a user-created or user-modified NicheProfile to niches/.
    The ID is derived from the name if not provided.
    """
    if not data.get("id"):
        data["id"] = data.get("name", "custom").lower().replace(" ", "_").replace("&", "and")

    path = os.path.join(NICHES_DIR, f"{data['id']}.json")
    os.makedirs(NICHES_DIR, exist_ok=True)

    with open(path, "w") as f:
        json.dump(data, f, indent=2)

    # Bust cache
    _cache.pop(data["id"], None)
    return load_profile(data["id"])


def get_default_profile() -> NicheProfile:
    """Returns food_lifestyle as the fallback if no profile is specified."""
    return load_profile("food_lifestyle") or NicheProfile({
        "id": "generic",
        "name": "Generic",
        "description": "General social media account",
        "vocabulary": {k: k for k in REQUIRED_VOCABULARY_KEYS},
        "archetype_overrides": {},
        "audience": {},
        "local_context": {"city": "Nairobi", "currency": "KES", "local_references": []},
        "visual_style": {},
        "hashtags": {},
        "content_pillars_preset": [],
    })
