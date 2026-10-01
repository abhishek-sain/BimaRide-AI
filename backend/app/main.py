from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import alerts, auth, coach, connections, contacts_auth, insurer, live, sos, trips
from app.core.database import Base, SessionLocal, engine, run_lightweight_migrations
from app.models.models import ContactUser, Rider, gen_connect_code

Base.metadata.create_all(bind=engine)
run_lightweight_migrations()


def _backfill_connect_codes() -> None:
    """The migration above adds `connect_code` to any pre-existing riders
    table as a bare nullable column — SQLite's ALTER TABLE can't retroactively
    apply a NOT NULL + per-row-unique default to rows that already exist.
    Without this, every rider created before this feature shipped would have
    connect_code = NULL and have nothing to share for pairing."""
    db = SessionLocal()
    try:
        existing_codes = {c for (c,) in db.query(Rider.connect_code).all() if c} | {
            c for (c,) in db.query(ContactUser.connect_code).all() if c
        }
        changed = False
        for rider in db.query(Rider).filter(Rider.connect_code.is_(None)).all():
            code = gen_connect_code()
            while code in existing_codes:
                code = gen_connect_code()
            existing_codes.add(code)
            rider.connect_code = code
            changed = True
        if changed:
            db.commit()
    finally:
        db.close()


_backfill_connect_codes()

app = FastAPI(title="BimaRide AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten before production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(trips.router)
app.include_router(sos.router)
app.include_router(coach.router)
app.include_router(insurer.router)
app.include_router(contacts_auth.router)
app.include_router(connections.router)
app.include_router(alerts.router)
app.include_router(live.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "BimaRide AI backend"}
