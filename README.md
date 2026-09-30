# BimaRide AI

Usage-based motorcycle insurance, powered entirely by the rider's phone — no
external hardware or sensors. GPS, accelerometer and gyroscope on the phone
detect ride events (harsh braking, harsh acceleration, aggressive cornering,
overspeed, crash-suspect), a rule-based engine turns those into a 0–100
Rider Safety Score, and an LLM coach explains the score in plain language.

This repo has three parts:

```
backend/        FastAPI service — auth, trip ingest, event detection, scoring, SOS, LLM coach, insurer API
mobile/         React Native (Expo) rider app — GPS + IMU capture, live score, SOS, rewards
web-console/    Next.js insurer dashboard — portfolio KPIs, rider drill-down, heatmap
```

## How it works

1. The rider starts a ride in the mobile app. It records GPS at 1 Hz and
   accelerometer/gyroscope at 10 Hz, buffers samples on-device, and uploads
   them to the backend every 5 seconds (with retry on failure).
2. A rule-based engine mirrors the same logic on-device (instant feedback)
   and on the backend (source of truth): longitudinal g → harsh braking /
   acceleration, lateral g + yaw rate → cornering, GPS speed vs. local limit
   → overspeed, sudden decel + speed collapse → crash-suspect.
3. When the trip ends, the backend computes the final Rider Safety Score
   (weighted, per-100km normalised, matching the original deck's formula),
   flags rewards, and stores everything for the insurer console.
4. A crash-suspect event triggers a 15-second "Are you OK?" countdown in the
   app; no response (or a manual "I need help") marks the SOS as dispatched.
5. The insurer console reads the same backend to show portfolio risk,
   per-rider drill-downs, and an event heatmap.

## Quickstart

For a more detailed, step-by-step walkthrough of starting all three
services (including how to point the phone at your dev machine), see
[docs/running-locally.md](docs/running-locally.md).

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add ANTHROPIC_API_KEY to enable real LLM coaching (optional — has a template fallback)
uvicorn app.main:app --reload --port 8000
```

API docs at http://localhost:8000/docs. Uses SQLite by default
(`bimaride.db`) — point `DATABASE_URL` at Postgres for anything beyond a
demo.

### 2. Mobile app (the core of the project)

```bash
cd mobile
npm install
# edit src/api/config.ts -> API_BASE_URL to your machine's LAN IP (not localhost),
# e.g. http://192.168.1.23:8000, so a phone on Expo Go can reach the backend.
npx expo start
```

Scan the QR code with Expo Go on a real Android/iOS phone (a simulator has
no GPS/IMU). Grant location and motion permissions, tap **Start Ride**, and
ride — the live score, event feed, and SOS button are all driven by real
sensor data.

### 3. Insurer console

```bash
cd web-console
npm install
cp .env.local.example .env.local   # set API_URL and INSURER_API_KEY to match backend/.env
npm run dev -- --port 3001
```

Open http://localhost:3001.

### Auth / secrets

- Rider-facing endpoints use JWT (`backend/.env` → `JWT_SECRET`). If unset,
  a random secret is generated at startup (with a warning) — fine for a
  demo, but tokens won't survive a restart and won't work across multiple
  backend processes.
- The insurer console's read endpoints (`/insurer/*`) require a shared key
  sent as `x-insurer-api-key` (`backend/.env` → `INSURER_API_KEY`, mirrored
  in `web-console/.env.local`). Same random-if-unset behaviour and warning.
  This is a single shared secret, not per-insurer-org login — replace it
  before a real pilot.

## Design notes / what's intentionally simplified for the MVP

- **No hardware, phone only.** No OBD dongle, no external telematics box —
  matches the original deck's "smartphone is the sensor pack" pitch, minus
  the deck's Kafka/TimescaleDB streaming layer (not needed at 1 Hz GPS + a
  batched upload).
- **Rule-based scoring is the source of truth**, not the deck's XGBoost+SHAP
  model — there's no labelled training data yet. `backend/app/services/scoring.py`
  is written so a trained model can be swapped in later without changing the
  API surface once enough real trips accumulate.
- **Road-risk context is a stub** (`backend/app/services/road_risk.py`):
  deterministic heuristics instead of live OSM/weather/accident-density
  APIs, so the pipeline runs end-to-end without external API keys. Swap the
  implementation, not the interface, when real data sources are wired up.
- **Foreground-only location tracking.** Background trip recording (screen
  off) needs a native background task + platform-specific permissions
  (`ACCESS_BACKGROUND_LOCATION` etc.) — left out of this MVP; the trip must
  stay in the foreground during a ride.
- **Insurer console uses one shared API key**, not per-org login — see
  "Auth / secrets" above; add real insurer-org accounts before a pilot.
- **SMS/call dispatch to emergency contacts is not wired to a real SMS
  gateway** — the SOS flow (detect → 15s countdown → dispatch) is fully
  implemented end-to-end, the actual `dispatched` alert would call a
  provider like Twilio in production.
