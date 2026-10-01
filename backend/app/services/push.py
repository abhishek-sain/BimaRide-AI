"""Push notifications via Expo's push notification service.

Unlike the Twilio SMS path this replaces for emergency-contact alerts,
Expo's push service needs no account, no billing, and no per-recipient
verification — it's part of Expo itself and works immediately in both
Expo Go and a production build, for any Expo push token. This is why
pairing-based push alerts replace the old SMS-to-a-phone-number design:
no third-party gateway, no trial-account restrictions, nothing to
configure before it works.

A push notification reliably triggers a sound + vibration the instant it
arrives, including when the recipient's app is backgrounded or fully
closed, because the OS (not our app) delivers and displays it. What a
plain push can't do — on either platform, without a custom native build
outside Expo Go — is keep ringing indefinitely like an incoming phone
call; that needs iOS CallKit/VoIP-push (a special Apple entitlement) or
an Android full-screen-intent call UI. This module sends the strongest
alert Expo's standard push API supports: max priority, a custom sound,
and a payload the receiving app uses to open straight to the crash
location and start its own full continuous vibrate+siren loop once it's
actually open.
"""

from __future__ import annotations

import httpx

from app.core.logging_utils import get_logger

logger = get_logger("bimaride.push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_expo_push(
    push_tokens: list[str],
    title: str,
    body: str,
    data: dict | None = None,
    sound: str = "default",
    priority: str = "high",
    category_id: str | None = None,
) -> int:
    """Sends one push message to each token. Returns how many sends Expo's
    API accepted (not a delivery guarantee — just that Expo queued it).
    Never raises: a push failure shouldn't break the caller's request."""
    tokens = [t for t in push_tokens if t]
    if not tokens:
        return 0

    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": sound,
            "priority": priority,
            # Android: ensures this shows as a heads-up notification with
            # its own channel rather than being silently grouped/throttled.
            "channelId": "crash-alerts" if category_id == "crash_alert" else "default",
            **({"categoryId": category_id} if category_id else {}),
        }
        for token in tokens
    ]

    try:
        resp = httpx.post(
            EXPO_PUSH_URL,
            json=messages,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=10.0,
        )
        if resp.status_code >= 300:
            logger.error("Expo push send failed: %s %s", resp.status_code, resp.text)
            return 0
        body_json = resp.json()
        tickets = body_json.get("data", [])
        sent = sum(1 for t in tickets if t.get("status") == "ok")
        for t in tickets:
            if t.get("status") != "ok":
                logger.warning("Expo push ticket error: %s", t)
        return sent
    except httpx.HTTPError as exc:
        logger.error("Expo push send failed: %s", exc)
        return 0
