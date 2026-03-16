"""
services/providers/claude_provider.py

Handles all communication with the Anthropic Claude API.
Has exactly one job: take a prompt, call Claude, return a string.
"""

import anthropic

import config

_client = None
_AuthError = getattr(anthropic, "AuthenticationError", None)


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not config.ANTHROPIC_API_KEY:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. "
                "Get your key at https://console.anthropic.com → API Keys. "
                "Then add it to your .env file: ANTHROPIC_API_KEY=sk-ant-..."
            )
        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    return _client


def call(prompt: str, model: str, max_tokens: int = 1200) -> str:
    """
    Claude accepts a separate `system` prompt.

    To keep existing prompts compatible, we optionally split prompt by marker:
    - everything before '---USER---' => system
    - everything after  '---USER---' => user
    If marker is absent, we send the whole prompt as the user message.
    """
    if "---USER---" in prompt:
        system_part, user_part = prompt.split("---USER---", 1)
        system_part = system_part.strip()
        user_part = user_part.strip()
    else:
        system_part = ""
        user_part = prompt

    try:
        response = get_client().messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_part or None,
            messages=[{"role": "user", "content": user_part}],
        )
        return response.content[0].text.strip()
    except anthropic.RateLimitError:
        raise RuntimeError(
            "Claude rate limit reached. Wait a moment and try again, "
            "or switch to a different model/provider in Settings."
        )
    except anthropic.APIStatusError as e:
        raise RuntimeError(f"Claude API error ({getattr(e, 'status_code', 'unknown')}): {e}")
    except anthropic.APIConnectionError:
        raise RuntimeError("Could not connect to Claude API. Check your internet connection.")
    except Exception as e:
        if _AuthError and isinstance(e, _AuthError):
            raise RuntimeError(
                "Claude authentication failed. Check your ANTHROPIC_API_KEY in Settings."
            )
        raise

