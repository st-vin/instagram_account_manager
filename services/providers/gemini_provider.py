"""
services/providers/gemini_provider.py

Handles all communication with Google Gemini via Google AI Studio (API key).
Has exactly one job: take a prompt, call Gemini, return a string.
"""

from google import genai

import config

_client = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. "
                "Get your key from Google AI Studio, then add it to your .env: GEMINI_API_KEY=..."
            )
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def call(prompt: str, model: str, max_tokens: int = 1200) -> str:
    """
    Gemini uses generate_content. We send the prompt as plain text.
    """
    try:
        resp = get_client().models.generate_content(
            model=model,
            contents=prompt,
            config={"max_output_tokens": max_tokens},
        )
        text = getattr(resp, "text", None)
        if not text:
            raise RuntimeError("Gemini returned an empty response.")
        return text.strip()
    except Exception as e:
        raise RuntimeError(f"Gemini API error: {e}")

