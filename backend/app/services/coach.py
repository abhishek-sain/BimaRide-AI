"""LLM-grounded rider coaching.

Explanations are always grounded on the numeric score breakdown / event
counts produced by services/scoring.py and services/events.py — the LLM
narrates numbers it is given, it does not invent them. Falls back to a
deterministic template when no ANTHROPIC_API_KEY is configured, so the
rest of the app works without an API key.
"""

from __future__ import annotations

from app.core.config import settings

_SYSTEM_PROMPT = (
    "You are BimaRide AI's riding coach. You explain a motorcycle rider's "
    "safety score using ONLY the numeric data given to you (event counts, "
    "score deltas, category breakdown). Be concise (2-4 sentences), name the "
    "specific numeric driver, and give one concrete tip. Never invent a "
    "number that was not provided."
)


def _template_answer(question: str, grounded_on: dict) -> str:
    breakdown = grounded_on.get("score_breakdown", {})
    events = grounded_on.get("recent_events", [])
    score = grounded_on.get("current_score")

    top_driver = None
    if breakdown.get("weighted"):
        top_driver = min(breakdown["weighted"], key=lambda k: breakdown["weighted"][k])

    parts = []
    if score is not None:
        parts.append(f"Your current score is {score}.")
    if top_driver:
        parts.append(f"The biggest drag on it right now is your '{top_driver}' component.")
    if events:
        counts: dict[str, int] = {}
        for e in events:
            counts[e["event_type"]] = counts.get(e["event_type"], 0) + 1
        summary = ", ".join(f"{v} {k.replace('_', ' ')}" for k, v in counts.items())
        parts.append(f"In this window you had {summary}.")
    parts.append("Fix the biggest driver first and your score should recover within a few clean trips.")
    return " ".join(parts)


def explain(question: str, grounded_on: dict) -> str:
    if not settings.anthropic_api_key:
        return _template_answer(question, grounded_on)

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        msg = client.messages.create(
            model="claude-sonnet-5",
            max_tokens=300,
            system=_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Rider question: {question}\n\n"
                        f"Grounding data (JSON): {grounded_on}"
                    ),
                }
            ],
        )
        return "".join(block.text for block in msg.content if hasattr(block, "text"))
    except Exception:
        # Never fail the request over an LLM/network hiccup — degrade gracefully.
        return _template_answer(question, grounded_on)
