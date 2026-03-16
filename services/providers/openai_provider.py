"""
services/providers/openai_provider.py

Handles all communication with the OpenAI API.
Has exactly one job: take a prompt, call OpenAI, return a string.
"""

from openai import (
    OpenAI,
    APIConnectionError,
    APIStatusError,
    AuthenticationError,
    RateLimitError,
)

import config

_client = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        if not config.OPENAI_API_KEY:
            raise RuntimeError(
                "OPENAI_API_KEY is not set. "
                "Get your key at https://platform.openai.com → API Keys. "
                "Then add it to your .env file: OPENAI_API_KEY=sk-..."
            )
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def call(prompt: str, model: str, max_tokens: int = 1200) -> str:
    if "---USER---" in prompt:
        system_part, user_part = prompt.split("---USER---", 1)
        system_part = system_part.strip()
        user_part = user_part.strip()
    else:
        system_part = ""
        user_part = prompt

    messages = []
    if system_part:
        messages.append({"role": "system", "content": system_part})
    messages.append({"role": "user", "content": user_part})

    try:
        response = get_client().chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=messages,
        )
        return response.choices[0].message.content.strip()
    except RateLimitError:
        raise RuntimeError(
            "OpenAI rate limit reached. Wait a moment and try again, "
            "or switch to a different model/provider in Settings."
        )
    except AuthenticationError:
        raise RuntimeError("OpenAI authentication failed. Check your OPENAI_API_KEY in Settings.")
    except APIStatusError as e:
        raise RuntimeError(f"OpenAI API error ({getattr(e, 'status_code', 'unknown')}): {e}")
    except APIConnectionError:
        raise RuntimeError("Could not connect to OpenAI API. Check your internet connection.")

