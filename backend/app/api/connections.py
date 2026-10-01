"""Pairing between a Rider and an Emergency Contact Person's account.

Either side can send the request, by entering the other's connect_code.
It only starts sharing anything — ride-start pings, live location, crash
alerts — once the OTHER side accepts. See models.Connection's docstring
for why an unconfirmed one-way add isn't acceptable here.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_account
from app.core.database import get_db
from app.models.models import ContactUser, Connection, Rider, Trip
from app.schemas.schemas import ConnectionActionOut, ConnectionRequestIn
from app.services.push import send_expo_push

router = APIRouter(prefix="/connections", tags=["connections"])


def _to_out(conn: Connection) -> ConnectionActionOut:
    return ConnectionActionOut(
        id=conn.id,
        status=conn.status,
        requested_by=conn.requested_by,
        rider_id=conn.rider_id,
        rider_name=conn.rider.name,
        contact_id=conn.contact_id,
        contact_name=conn.contact.name,
        created_at=conn.created_at,
        accepted_at=conn.accepted_at,
    )


@router.post("/request", response_model=ConnectionActionOut)
def request_connection(
    payload: ConnectionRequestIn,
    db: Session = Depends(get_db),
    account=Depends(get_current_account),
):
    code = payload.code.strip().upper()
    is_rider = isinstance(account, Rider)

    if is_rider:
        contact = db.query(ContactUser).filter(ContactUser.connect_code == code).first()
        if not contact:
            raise HTTPException(status_code=404, detail="No emergency contact account has that code.")
        rider_id, contact_id = account.id, contact.id
    else:
        rider = db.query(Rider).filter(Rider.connect_code == code).first()
        if not rider:
            raise HTTPException(status_code=404, detail="No rider account has that code.")
        rider_id, contact_id = rider.id, account.id

    existing = (
        db.query(Connection)
        .filter(Connection.rider_id == rider_id, Connection.contact_id == contact_id)
        .first()
    )
    if existing:
        return _to_out(existing)

    conn = Connection(
        rider_id=rider_id,
        contact_id=contact_id,
        status="pending",
        requested_by="rider" if is_rider else "contact",
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return _to_out(conn)


@router.post("/{connection_id}/accept", response_model=ConnectionActionOut)
def accept_connection(
    connection_id: str,
    db: Session = Depends(get_db),
    account=Depends(get_current_account),
):
    conn = db.query(Connection).filter(Connection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    is_rider = isinstance(account, Rider)
    owns_this_side = (is_rider and conn.rider_id == account.id) or (not is_rider and conn.contact_id == account.id)
    if not owns_this_side:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Only the side that DIDN'T send the request can accept it — otherwise
    # the requester could just accept their own request and skip consent
    # from the other side entirely.
    requester_is_this_side = (conn.requested_by == "rider") == is_rider
    if requester_is_this_side:
        raise HTTPException(status_code=400, detail="Waiting on the other person to accept — you sent this request.")

    if conn.status != "accepted":
        conn.status = "accepted"
        conn.accepted_at = datetime.utcnow()
        db.commit()
        db.refresh(conn)

        requester_push_token = conn.contact.push_token if conn.requested_by == "contact" else conn.rider.push_token
        accepter_name = conn.rider.name if is_rider else conn.contact.name
        send_expo_push(
            [requester_push_token] if requester_push_token else [],
            title="Connection accepted",
            body=f"{accepter_name} accepted your BimaRide AI connection request.",
            data={"type": "connection_accepted", "connection_id": conn.id},
        )

    return _to_out(conn)


@router.get("", response_model=list[ConnectionActionOut])
def list_connections(db: Session = Depends(get_db), account=Depends(get_current_account)):
    is_rider = isinstance(account, Rider)
    query = db.query(Connection)
    query = query.filter(Connection.rider_id == account.id) if is_rider else query.filter(
        Connection.contact_id == account.id
    )
    return [_to_out(c) for c in query.order_by(Connection.created_at.desc()).all()]


@router.delete("/{connection_id}")
def delete_connection(
    connection_id: str,
    db: Session = Depends(get_db),
    account=Depends(get_current_account),
):
    conn = db.query(Connection).filter(Connection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    is_rider = isinstance(account, Rider)
    owns_this_side = (is_rider and conn.rider_id == account.id) or (not is_rider and conn.contact_id == account.id)
    if not owns_this_side:
        raise HTTPException(status_code=404, detail="Connection not found")

    db.delete(conn)
    db.commit()
    return {"deleted": True}


@router.get("/{connection_id}/active-trip")
def active_trip_for_connection(
    connection_id: str,
    db: Session = Depends(get_db),
    account=Depends(get_current_account),
):
    """Lets a contact's app check whether the connected rider is currently
    on a ride, so it knows whether to offer 'View live location' at all."""
    conn = db.query(Connection).filter(Connection.id == connection_id, Connection.status == "accepted").first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    is_rider = isinstance(account, Rider)
    owns_this_side = (is_rider and conn.rider_id == account.id) or (not is_rider and conn.contact_id == account.id)
    if not owns_this_side:
        raise HTTPException(status_code=404, detail="Connection not found")

    trip = (
        db.query(Trip)
        .filter(Trip.rider_id == conn.rider_id, Trip.status == "active")
        .order_by(Trip.started_at.desc())
        .first()
    )
    return {"trip_id": trip.id if trip else None, "rider_name": conn.rider.name}
