"""Emergency SMS dispatch.

Sends a real SMS to a rider's emergency contacts via Twilio's REST API
(plain HTTP call, no SDK — Twilio's Messages resource is simple enough that
pulling in the whole `twilio` package isn't worth it).

This is deliberately backend-side, not phone-side: both iOS and Android
block apps from sending SMS on the user's behalf without the user tapping
"send" in the native composer, which would make "automatic" dispatch on
crash detection impossible. A server-side gateway is the only way to
actually send without a tap.

Optional-with-graceful-fallback, matching services/coach.py's pattern: if
TWILIO_* isn't configured, this logs a warning and no-ops instead of
raising, so the rest of the SOS flow (alert recorded, countdown, dispatched
flag) still works in a demo with no Twilio account.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("bimaride.notifications")

TWILIO_MESSAGES_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


def _configured() -> bool:
    return bool(settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number)


def send_sms(to: str, body: str) -> bool:
    """Sends one SMS. Returns True on success, False otherwise — never
    raises, so one bad number or a Twilio outage can't break the SOS flow
    for the rider or for the other emergency contacts."""
    if not _configured():
        logger.warning(
            "SOS dispatch to %s skipped — TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / "
            "TWILIO_FROM_NUMBER are not all set in backend/.env. No SMS was sent.",
            to,
        )
        return False

    url = TWILIO_MESSAGES_URL.format(sid=settings.twilio_account_sid)
    try:
        resp = httpx.post(
            url,
            data={"From": settings.twilio_from_number, "To": to, "Body": body},
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            timeout=10.0,
        )
        if resp.status_code >= 300:
            logger.error("Twilio SMS to %s failed: %s %s", to, resp.status_code, resp.text)
            return False
        return True
    except httpx.HTTPError as exc:
        logger.error("Twilio SMS to %s failed: %s", to, exc)
        return False


def build_sos_message(rider_name: str, lat: float | None, lon: float | None, speed_kmh: float | None) -> str:
    parts = [f"BimaRide AI SOS: {rider_name} may have been in a crash."]
    if lat is not None and lon is not None:
        parts.append(f"Location: https://maps.google.com/?q={lat},{lon}")
    if speed_kmh is not None:
        parts.append(f"Last recorded speed: {round(speed_kmh)} km/h.")
    parts.append("This was sent automatically — please check on them.")
    return " ".join(parts)


def notify_emergency_contacts(
    rider_name: str,
    contacts: list[dict],
    lat: float | None,
    lon: float | None,
    speed_kmh: float | None,
) -> int:
    """Sends the SOS message to every saved contact. Returns how many sends
    succeeded (0 if there are no contacts, or none succeeded)."""
    if not contacts:
        logger.warning("SOS dispatched for %s but they have no emergency contacts saved.", rider_name)
        return 0

    message = build_sos_message(rider_name, lat, lon, speed_kmh)
    sent = 0
    for contact in contacts:
        phone = (contact or {}).get("phone")
        if not phone:
            continue
        if send_sms(phone, message):
            sent += 1
    return sent
