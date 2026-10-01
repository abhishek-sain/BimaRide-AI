"""Real-time location relay for an active trip.

A WebSocket, not REST: a connected emergency contact watching a rider's
live map needs push-style updates with no polling, and the rider's app
is already sending GPS fixes at ~1Hz — a socket is the natural fit.

This is a pure relay, not storage: the rider's app keeps uploading points
to POST /trips/{id}/points for scoring exactly as before; this socket
additionally broadcasts each live fix, in memory only, to any connected
contacts watching that trip. Nothing here touches the database beyond the
one auth lookup on connect — if the backend restarts, in-flight live
viewing drops and reconnects, which is an acceptable trade-off for a
feature whose actual record of the trip is the REST-ingested points, not
this socket.

Auth note: a browser/RN WebSocket can't set a custom Authorization header
on the handshake, so the JWT travels as a query parameter instead
(?token=...). This is the standard workaround for WS auth and is no
less secure than a header over the same TLS connection in production
(wss://) — see README for why this project is http:// in local dev only.
"""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.database import SessionLocal
from app.core.security import decode_access_token
from app.models.models import Connection, Trip

router = APIRouter(tags=["live"])

# trip_id -> set of connected contact sockets watching that trip.
_subscribers: dict[str, set[WebSocket]] = defaultdict(set)


async def _authenticate(token: str) -> tuple[str, str] | None:
    """Returns (account_type, account_id) or None if the token is invalid."""
    decoded = decode_access_token(token)
    if not decoded:
        return None
    return decoded.account_type, decoded.subject


@router.websocket("/ws/trip/{trip_id}")
async def trip_live_location(websocket: WebSocket, trip_id: str, token: str = ""):
    auth = await _authenticate(token)
    if not auth:
        await websocket.close(code=4401)
        return
    account_type, account_id = auth

    db = SessionLocal()
    try:
        trip = db.query(Trip).filter(Trip.id == trip_id).first()
        if not trip:
            await websocket.close(code=4404)
            return

        if account_type == "rider":
            if trip.rider_id != account_id:
                await websocket.close(code=4403)
                return
        else:
            accepted = (
                db.query(Connection)
                .filter(
                    Connection.rider_id == trip.rider_id,
                    Connection.contact_id == account_id,
                    Connection.status == "accepted",
                )
                .first()
            )
            if not accepted:
                await websocket.close(code=4403)
                return
    finally:
        db.close()

    await websocket.accept()

    if account_type == "contact":
        _subscribers[trip_id].add(websocket)

    try:
        while True:
            message = await websocket.receive_json()
            if account_type == "rider":
                # Broadcast this fix to every contact currently watching —
                # never echo back to other riders (there's only ever one
                # rider per trip anyway) and never trust a contact's own
                # messages as location data.
                dead: list[WebSocket] = []
                for sub in _subscribers[trip_id]:
                    try:
                        await sub.send_json({"type": "location", **message})
                    except Exception:
                        dead.append(sub)
                for sub in dead:
                    _subscribers[trip_id].discard(sub)
            # A contact's incoming messages are intentionally ignored —
            # this channel is read-only for them.
    except WebSocketDisconnect:
        pass
    finally:
        _subscribers[trip_id].discard(websocket)
        if not _subscribers[trip_id]:
            _subscribers.pop(trip_id, None)
