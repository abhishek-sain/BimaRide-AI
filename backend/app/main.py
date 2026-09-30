from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, coach, insurer, sos, trips
from app.core.database import Base, engine, run_lightweight_migrations

Base.metadata.create_all(bind=engine)
run_lightweight_migrations()

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


@app.get("/health")
def health():
    return {"status": "ok", "service": "BimaRide AI backend"}
