"""
services/providers/cerebras_provider.py

Handles all communication with the Cerebras Cloud API.
Has exactly one job: take a prompt, call Cerebras, return a string.
"""

from cerebras.cloud.sdk import Cerebras

import config

_client = None


def get_client() -> Cerebras:
    global _client
    if _client is None:
        if not config.CEREBRAS_API_KEY:
            raise RuntimeError(
                "CEREBRAS_API_KEY is not set. "
                "Add it to your .env file: CEREBRAS_API_KEY=your_key_here"
            )
        _client = Cerebras(api_key=config.CEREBRAS_API_KEY)
    return _client


def call(prompt: str, model: str, max_tokens: int = 1200) -> str:
    resp = get_client().chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content.strip()

