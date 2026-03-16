"""
services/provider_router.py

Single entry point for AI text generation across providers.
"""

import config

PROVIDERS = {
    "cerebras": {
        "label": "Cerebras",
        "models": [
            {"id": "llama-4-scout-17b-16e-instruct", "label": "Llama 4 Scout 17B (default)"},
            {"id": "llama-3.3-70b", "label": "Llama 3.3 70B"},
        ],
        "free_tier": True,
        "key_env": "CEREBRAS_API_KEY",
        "key_link": "https://cloud.cerebras.ai",
    },
    "claude": {
        "label": "Anthropic Claude",
        "models": [
            {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6 (recommended)"},
            {"id": "claude-opus-4-6", "label": "Claude Opus 4.6"},
            {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5"},
        ],
        "free_tier": False,
        "key_env": "ANTHROPIC_API_KEY",
        "key_link": "https://console.anthropic.com",
    },
    "openai": {
        "label": "OpenAI",
        "models": [
            {"id": "gpt-4o", "label": "GPT-4o (recommended)"},
            {"id": "gpt-5.4", "label": "GPT-5.4"},
            {"id": "gpt-4o-mini", "label": "GPT-4o Mini"},
            {"id": "gpt-5-mini", "label": "GPT-5 Mini"},
        ],
        "free_tier": False,
        "key_env": "OPENAI_API_KEY",
        "key_link": "https://platform.openai.com",
    },
    "gemini": {
        "label": "Google Gemini",
        "models": [
            {"id": "gemini-2.5-pro", "label": "Gemini 2.5 Pro"},
            {"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash (recommended)"},
            {"id": "gemini-2.0-flash", "label": "Gemini 2.0 Flash"},
        ],
        "free_tier": False,
        "key_env": "GEMINI_API_KEY",
        "key_link": "https://aistudio.google.com/app/apikey",
    },
}


def _default_model(provider: str) -> str:
    defaults = {
        "cerebras": config.AI_MODEL_CEREBRAS,
        "claude": config.AI_MODEL_CLAUDE,
        "openai": config.AI_MODEL_OPENAI,
        "gemini": config.AI_MODEL_GEMINI,
    }
    return defaults.get(provider, "")


def call_ai(prompt: str, max_tokens: int = 1200, provider: str | None = None, model: str | None = None) -> str:
    active_provider = (provider or config.AI_PROVIDER or "cerebras").lower().strip()
    active_model = model or _default_model(active_provider)

    if active_provider == "cerebras":
        from services.providers.cerebras_provider import call

        return call(prompt, model=active_model, max_tokens=max_tokens)
    if active_provider == "claude":
        from services.providers.claude_provider import call

        return call(prompt, model=active_model, max_tokens=max_tokens)
    if active_provider == "openai":
        from services.providers.openai_provider import call

        return call(prompt, model=active_model, max_tokens=max_tokens)
    if active_provider == "gemini":
        from services.providers.gemini_provider import call

        return call(prompt, model=active_model, max_tokens=max_tokens)

    raise RuntimeError(
        f"Unknown AI provider: '{active_provider}'. Valid options are: {', '.join(PROVIDERS.keys())}"
    )


def get_providers_list() -> list:
    result = []
    active = (config.AI_PROVIDER or "cerebras").lower().strip()
    for provider_id, info in PROVIDERS.items():
        result.append(
            {
                "id": provider_id,
                "label": info["label"],
                "models": info["models"],
                "free_tier": info["free_tier"],
                "key_env": info["key_env"],
                "key_link": info["key_link"],
                "active": provider_id == active,
            }
        )
    return result


def get_active_provider_info() -> dict:
    provider = (config.AI_PROVIDER or "cerebras").lower().strip()
    return {
        "provider": provider,
        "model": _default_model(provider),
        "label": PROVIDERS.get(provider, {}).get("label", provider),
    }

