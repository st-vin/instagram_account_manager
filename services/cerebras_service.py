"""
cerebras_service.py  —  General Engine Edition

All prompts are niche-agnostic templates.
A NicheProfile is injected at call time to provide vocabulary,
audience context, and local references.
The engine logic never changes; only the profile data does.
"""
import json
import re
from cerebras.cloud.sdk import Cerebras
import config
from models.niche_profile import NicheProfile, get_default_profile

_client = None


def get_client() -> Cerebras:
    global _client
    if _client is None:
        if not config.CEREBRAS_API_KEY:
            raise RuntimeError("CEREBRAS_API_KEY not set in environment.")
        _client = Cerebras(api_key=config.CEREBRAS_API_KEY)
    return _client


def _call(prompt: str, max_tokens: int = 1200) -> str:
    resp = get_client().chat.completions.create(
        model=config.CEREBRAS_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content.strip()


def _parse_json(raw: str) -> dict | list:
    clean = re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()
    return json.loads(clean)


def _profile(p) -> NicheProfile:
    if isinstance(p, NicheProfile):
        return p
    if isinstance(p, str):
        from models.niche_profile import load_profile
        loaded = load_profile(p)
        return loaded if loaded else get_default_profile()
    return get_default_profile()


HOOK_TEMPLATES = {
    "process_tutorial":    "How to {action_verb} {primary_entity} perfectly every time",
    "location_spotlight":  "The best {location_type} in {city} nobody is talking about",
    "myth_busting":        "Unpopular opinion: [common belief in this niche] is completely wrong",
    "resource_list":       "{number} {resource_noun}s every {audience_role} should know about",
    "personal_journey":    "I spent [time] {action_verb}ing wrong — here is what I learned",
    "quick_win":           "In 60 seconds: [specific outcome] for {audience_role}s",
    "industry_commentary": "Everyone is talking about [trend]. Here is what they are missing.",
    "behind_scenes":       "What [time period] of {action_verb}ing actually looks like",
    "comparison":          "[Option A] vs [Option B]: an honest breakdown for {audience_role}s",
    "community_spotlight": "One of my followers did this — and it is incredible",
    "hot_take":            "Unpopular opinion: [controversial claim your {audience_role}s debate]",
    "deep_dive":           "Everything you need to know about [niche topic] in one post",
}


def generate_caption(pillar: str, archetype: str, keyword: str,
                     account_type: str = "B", tone: str = "warm & friendly",
                     profile=None) -> dict:
    p = _profile(profile)
    hook_template = p.fill(HOOK_TEMPLATES.get(archetype, HOOK_TEMPLATES["process_tutorial"]))
    archetype_label = p.archetype_label(archetype)
    prompt = f"""
You are an expert Instagram content strategist.

{p.to_prompt_context()}

Generate an Instagram caption. Content type: {archetype_label}
Content pillar: {pillar}
Topic/keyword: {keyword}
Brand tone: {tone}
Account situation: {"Brand new — prioritise follow CTAs" if account_type == "A" else "Rebuilding engagement — prioritise saves and DM shares"}

Hook inspiration (adapt freely): "{hook_template}"

Return ONLY valid JSON:
{{
  "hook": "First scroll-stopping line (max 15 words, hyper-specific to topic)",
  "body": "2-4 paragraph caption body weaving in local context naturally",
  "cta": "One specific call to action matched to content type",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
  "variations": [{{"hook":"Alt hook A"}},{{"hook":"Alt hook B"}}],
  "best_time_to_post": "Based on niche audience active hours"
}}
"""
    return _parse_json(_call(prompt))


def generate_reel_script(topic: str, duration: int, style: str,
                          archetype: str = "process_tutorial", profile=None) -> dict:
    p = _profile(profile)
    prompt = f"""
You are an expert short-form video scriptwriter.

{p.to_prompt_context()}

Write a complete {duration}-second Reel script. Type: {p.archetype_label(archetype)}
Topic: {topic}. Filming style: {style}

Rules: hook in first 3 seconds, on-screen text on every beat,
vocabulary resonant with {p.vocabulary.get('audience_role')}s in {p.city}.

Return ONLY valid JSON:
{{
  "title": "Working title",
  "script": [
    {{"time":"0:00-0:03","action":"Visual direction","spoken":"Spoken words","on_screen_text":"Text overlay"}}
  ],
  "filming_tips": ["tip1","tip2"],
  "audio_suggestion": "Audio mood and type",
  "cta": "Final call to action"
}}
"""
    return _parse_json(_call(prompt, max_tokens=1500))


def generate_carousel(topic: str, cta_goal: str, visual_style: str,
                       archetype: str = "deep_dive", profile=None) -> dict:
    p = _profile(profile)
    prompt = f"""
You are an expert Instagram carousel strategist.

{p.to_prompt_context()}

Create a 10-slide carousel. Type: {p.archetype_label(archetype)}
Topic: {topic}. CTA goal: {cta_goal}. Visual style: {visual_style}

Slide 1=hook, slides 2-8=one value point each, slide 9=key insight, slide 10=CTA only.

Return ONLY valid JSON:
{{
  "title": "Carousel title",
  "slides": [
    {{"number":1,"type":"hook","headline":"Big headline (max 8 words)","subtext":"Supporting text","visual_direction":"Photo or design description","design_notes":"Canva guidance","background":"photo|solid-brand|solid-secondary"}}
  ],
  "caption": "Full Instagram caption",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"]
}}
"""
    return _parse_json(_call(prompt, max_tokens=2000))


def generate_dm(target_handle: str, target_niche: str, specific_post: str,
                collab_idea: str, strategy: str, profile=None) -> dict:
    p = _profile(profile)
    strategy_desc = {
        "equal-swap":    "equal value collab post — both audiences benefit equally",
        "feature-first": "feature them first, soft collab ask later",
        "direct":        "direct pitch — only use after prior comment interactions",
    }.get(strategy, "equal-swap")

    prompt = f"""
You are writing a collab outreach DM for a {p.name} creator in {p.city}.
Strategy: {strategy_desc}
Target: {target_handle} ({target_niche}). Their content: {specific_post}
Collab idea: {collab_idea}. Tone: genuine, specific, not copy-paste.

Return ONLY valid JSON:
{{
  "body": "Full DM (150-200 words, specific, no unfilled placeholders)",
  "tone": "warm|bold|direct",
  "follow_up": "5-day follow-up if no reply",
  "strategy_note": "Why this approach fits this target"
}}
"""
    return _parse_json(_call(prompt))


def generate_reply(comment_text: str, post_topic: str, brand_tone: str,
                   account_name: str, profile=None) -> dict:
    p = _profile(profile)
    prompt = f"""
You manage a {p.name} Instagram account called {account_name} in {p.city}.
Tone: {brand_tone}. Audience: {p.vocabulary.get('audience_role')}s.

Comment on post about "{post_topic}": "{comment_text}"

Write a 1-3 sentence human reply that directly addresses the comment.
Optionally end with a light question to extend conversation.

Return ONLY valid JSON:
{{"reply":"Primary reply","alt_reply":"Alternative reply","add_emoji":true}}
"""
    return _parse_json(_call(prompt, max_tokens=400))


def generate_visual_prompt(slide_topic: str, aspect_ratio: str = "4:5",
                            profile=None) -> dict:
    p = _profile(profile)
    prompt = f"""
Generate an Imagen 3 prompt for {p.name} content.
Subject: {slide_topic}. Style: {p.visual_style.get('photography_style','editorial')}.
City aesthetic: {p.city}. Aspect ratio: {aspect_ratio}.
Style suffix: {p.image_prompt_suffix}

Return ONLY valid JSON:
{{
  "prompt": "Complete positive prompt (50-80 words)",
  "negative_prompt": "text, watermark, artificial, oversaturated, generic stock",
  "lighting": "Lighting description",
  "composition": "Framing guidance"
}}
"""
    return _parse_json(_call(prompt, max_tokens=600))


def generate_report(metrics: dict, client_name: str,
                    include_next_week: bool = True, profile=None) -> dict:
    p = _profile(profile)
    prompt = f"""
Write a weekly Instagram performance report.
Client: {client_name}. Niche: {p.name} in {p.city}.
Data: {json.dumps(metrics, indent=2)}
{"Include 'Focus for next week' section." if include_next_week else ""}

Return ONLY valid JSON:
{{
  "report_text": "Full plain-text report",
  "report_html": "Same report as clean HTML",
  "headline_summary": "One sentence week summary",
  "top_win": "Best result",
  "key_learning": "Main insight"
}}
"""
    return _parse_json(_call(prompt, max_tokens=1500))


def generate_calendar(month: str, pillars: list, posting_days: list,
                       frequency: int, account_type: str, profile=None) -> dict:
    p = _profile(profile)
    archetypes_summary = ", ".join(
        f"{a['label']} ({a['id']})" for a in p.all_archetypes()
    )
    prompt = f"""
Generate a {month} Instagram content calendar.

{p.to_prompt_context()}

Pillars: {', '.join(pillars)}. Posting days: {', '.join(posting_days)}.
Posts per week: {frequency}. Account: {"Brand new" if account_type == "A" else "Existing, rebuilding"}.

Available content types for this niche: {archetypes_summary}

Rules: 60% Reels, 25% Carousels, 15% Static. Rotate pillars and archetypes.
{"Week 1 opens with re-introduction Reel." if account_type == "B" else "Week 1 opens with authority-establishing Reel."}
Best posting times: {', '.join(p.active_hours.get('weekday',['18:00']))}.

Return ONLY valid JSON:
{{
  "month": "{month}",
  "slots": [
    {{
      "id":"slot_001","date":"YYYY-MM-DD","day":"Monday",
      "format":"Reel","pillar":"pillar","archetype":"archetype_id",
      "archetype_label":"niche label","topic":"Specific topic",
      "hook_type":"bold claim","status":"draft","notes":""
    }}
  ]
}}
"""
    return _parse_json(_call(prompt, max_tokens=3000))


def generate_niche_profile(answers: dict) -> dict:
    """Generate a complete NicheProfile JSON from onboarding wizard answers."""
    prompt = f"""
Build a complete Instagram NicheProfile JSON for a new user.

Their answers:
- Niche name: {answers.get('niche_name')}
- What they post about: {answers.get('description')}
- Primary topic/subject: {answers.get('primary_topic')}
- Target audience: {answers.get('target_audience')}
- City: {answers.get('city','Nairobi')}
- Tone: {answers.get('tone','warm & friendly')}

Return a complete NicheProfile following this exact schema — ONLY valid JSON:
{{
  "id": "snake_case_from_name",
  "name": "Display Name",
  "description": "One sentence",
  "vocabulary": {{
    "primary_entity":"...","action_verb":"...","location_type":"...",
    "resource_noun":"...","expert_title":"...","audience_role":"...",
    "result_noun":"...","industry_term":"..."
  }},
  "archetype_overrides": {{
    "process_tutorial":{{"label":"...","example_topics":["...","...","..."]}},
    "location_spotlight":{{"label":"...","example_topics":["...","...","..."]}},
    "myth_busting":{{"label":"...","example_topics":["...","...","..."]}},
    "resource_list":{{"label":"...","example_topics":["...","...","..."]}},
    "personal_journey":{{"label":"...","example_topics":["...","...","..."]}},
    "quick_win":{{"label":"...","example_topics":["...","...","..."]}},
    "industry_commentary":{{"label":"...","example_topics":["...","...","..."]}},
    "behind_scenes":{{"label":"...","example_topics":["...","...","..."]}},
    "comparison":{{"label":"...","example_topics":["...","...","..."]}},
    "community_spotlight":{{"label":"...","example_topics":["...","...","..."]}},
    "hot_take":{{"label":"...","example_topics":["...","...","..."]}},
    "deep_dive":{{"label":"...","example_topics":["...","...","..."]}}
  }},
  "audience": {{
    "age_range":"...","interests":[...],"pain_points":[3 items],
    "aspirations":[3 items],"language_register":"...",
    "active_hours":{{"weekday":["HH:MM","HH:MM"],"weekend":["HH:MM","HH:MM"]}},
    "best_posting_days":[3 days]
  }},
  "local_context": {{
    "city":"...","currency":"...",
    "local_references":[5 specific local terms],
    "regional_hashtags":[5 hashtags]
  }},
  "visual_style": {{
    "photography_style":"...","color_mood":"...",
    "aesthetic":"...","image_prompt_suffix":"..."
  }},
  "hashtags": {{"broad":[4],"mid":[4],"niche":[5]}},
  "content_pillars_preset":[4 pillars]
}}
"""
    return _parse_json(_call(prompt, max_tokens=2500))
