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
   and on the backend (source of truth). It is **GPS-derived, not read from
   the raw accelerometer**: speed change → harsh braking / acceleration,
   speed × heading change → cornering, speed vs. local limit → overspeed,
   and a fast vehicle (≥30 km/h) losing ≥25 km/h within 2 s → crash-suspect.
   (A phone accelerometer includes gravity and depends on how the phone is
   mounted — reading one raw axis as "forward acceleration" made a
   stationary phone look like it was constantly accelerating.)
3. When the trip ends, the backend computes the final Rider Safety Score
   (weighted, per-100km normalised, matching the original deck's formula),
   flags rewards, and stores everything for the insurer console.
4. A crash-suspect event (or the manual SOS button) makes the rider's own
   phone vibrate and sound an alarm continuously for up to a minute, and —
   if they've paired with an Emergency Contact Person — alerts that person
   too, with the rider's location. See
   "Emergency contacts" below for the full picture.
5. The insurer console reads the same backend to show portfolio risk,
   per-rider drill-downs, and an event heatmap.

## Emergency contacts: two account types, paired by code

There are two kinds of accounts: **Rider** and **Emergency Contact
Person**. Both register in the same app (a role picker on first launch)
and pair up by sharing an 8-character connect code — either side can send
the request, but nothing is shared until the **other** side accepts. An
unconfirmed one-way add would let anyone who sees a leaked code start
watching a stranger's live location, which is exactly what requiring
mutual acceptance prevents.

Once paired:

- **One-tap ride-start ping.** The rider taps "Notify emergency contact"
  on the live-ride screen; every accepted contact gets a push notification.
- **Live location while riding.** The rider's app streams GPS fixes over a
  WebSocket (`/ws/trip/{id}`) to every connected contact currently viewing
  the live map — a real-time relay, not polling, and separate from the
  REST-ingested points used for scoring.
- **Crash and SOS alerts, with a response loop.** Crash auto-detection and
  the manual SOS button both call `POST /trips/{id}/crash-alert`, which
  *persists* the alert and delivers it three ways, all carrying the same
  alert id so the contact's app opens one alarm, not several:
  1. the live-map WebSocket (instant; the only channel that works in Expo
     Go, which has no remote push since SDK 53),
  2. a push notification (dev/production builds),
  3. **replay** — the contact app polls `GET /alerts/pending`, so an alert
     raised while they were offline or on another screen still surfaces.

  The contact gets a full-screen alert with a map pin on the incident, the
  rider's last speed, "Open in Google Maps", and the same continuous
  vibrate+siren the rider's own phone plays. They tap **I'm responding**
  and the rider's screen shows who acknowledged. If the rider taps **I'm
  OK**, every contact is told it was a false alarm and their alarm stops
  by itself. Contacts can tell a manual SOS from a detected crash, and
  both sides have an **Alert history** screen.
- **Ride-completed reassurance.** When a trip ends safely (not
  crash-flagged), contacts get a quieter "completed their ride safely"
  push — peace of mind on the common case, not just the emergency one.

**The one real platform limitation, stated plainly:** a push notification
reliably triggers a sound + vibration the instant it arrives, even with
the recipient's app fully closed, because the OS delivers it, not the app.
What a standard push **cannot** do on either platform without a custom
native build is ring indefinitely like an incoming phone call — that
needs iOS CallKit/VoIP-push (a special Apple entitlement, approved
case-by-case) or an Android full-screen-intent call UI, neither available
in Expo Go. This app sends the strongest alert Expo's push API supports
and starts the full continuous alarm the moment the contact's app is
actually open (by tap or by being foregrounded already) — a very loud,
vibrating, impossible-to-miss notification on arrival, not an
indefinitely-ringing phone call.

**Also worth knowing:** push notifications require a development build,
not Expo Go, from Expo SDK 53 onward. Every other feature in this app
(pairing, live map, crash-alert screen, the alarm itself once opened)
works in Expo Go; only the "deliver a push while the app is closed" piece
needs `eas build --profile development` (or `npx expo run:android` /
`run:ios`) plus an EAS project (`eas init`). Push registration fails
silently (logs a warning, doesn't crash) when running in Expo Go, so
development isn't blocked on this.

## Development build (needed for real push notifications)

Expo Go can't receive remote push (removed in SDK 53). A development build is
your own copy of Expo Go containing this app's native modules; it still loads
your code from `npx expo start` over Wi-Fi.

**One-time machine setup (macOS, already done on the dev machine):**
`brew install openjdk@17`, `brew install --cask android-commandlinetools`,
then `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"`
and export `JAVA_HOME`, `ANDROID_HOME` and `platform-tools` on `PATH`
(see `~/.zshrc`).

**Build and install:**
```bash
cd mobile
npx expo prebuild --platform android          # generates android/ (gitignored)
cd android && ./gradlew assembleDebug          # -> app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk   # phone on USB, USB debugging on
```
The same APK can be copied to a second phone and tapped to install — only
installing needs USB, running does not. Then `npx expo start --dev-client`
and open the app (not Expo Go) on each phone.

**For push to actually deliver (needs your own accounts, can't be scripted):**
1. `npx eas-cli login` then `npx eas-cli init` — writes
   `extra.eas.projectId` into `app.json`; `getExpoPushTokenAsync` needs it.
2. Create a Firebase project, add an Android app with package
   `com.bimarideai.app`, download `google-services.json` into `mobile/`, and
   set `"googleServicesFile": "./google-services.json"` under `android` in
   `app.json`. Rebuild.
3. In the Firebase console create a service-account key, then
   `npx eas-cli credentials` → Android → upload it as the FCM V1 key, so
   Expo's push service can send to your devices.

`eas.json` also defines a `development` profile if you'd rather build in the
cloud (`eas build --profile development --platform android`).

## How the insurance process works (and what this app doesn't do)

**This app is a telematics and scoring layer, not an insurer.** It isn't a
licensed insurance company, can't legally underwrite a policy, calculate a
real premium, or handle a claim — none of that is something a hackathon
project can do standalone, and pretending otherwise would be misleading.
What it does do:

- **Riders add their own vehicle and (if they have one) policy details** in
  the app's **Profile** screen: personal details (phone, date of birth,
  city), the vehicle being scored (bike model, registration number, year),
  and reference-only policy fields (insurer name, policy number, IDV, NCB
  %, expiry date). None of this is required to start riding and scoring —
  it's there to make the Rider Score meaningful in an actual underwriting
  context later, and to show alongside the score in the app and the
  insurer console.
- **The Rider Safety Score drives illustrative reward tiers** (see the
  Rewards screen), exactly as pitched in the original deck: Safe Rider,
  Good Rider, Needs Improvement, High Risk. These are shown as **what a
  real UBI discount/loading would look like**, not an actual price — there
  is no premium calculation engine here, and none of these numbers are
  binding.
- **A real policy would be issued, priced, and paid for entirely outside
  this app**, by a licensed, IRDAI-regulated insurer. The intended
  integration point is exactly what the insurer console already is: an
  insurer's underwriting team sees each rider's score, event history, and
  the vehicle/policy reference data, and applies it to whatever their own
  policy administration system does — adjusting a renewal premium,
  approving a reward, flagging a rider for review. This app produces the
  signal; a licensed insurer's own systems would be the one to act on it
  for real money.
- **Claims aren't handled here either.** A crash-suspect event and its
  telemetry are recorded and could support a real claim (that's the
  "faster claims" pitch in the deck), but filing, adjudicating, and paying
  a claim is entirely the insurer's process, not this app's.

In short: the app captures the data an insurer would want, computes the
signal that would drive pricing, and shows both to an insurer's team to
act on — it never itself becomes the insurer.

## Quickstart

For a more detailed, step-by-step walkthrough of starting all three
services (including how to point the phone at your dev machine), see
[docs/running-locally.docx](docs/running-locally.docx).

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add ANTHROPIC_API_KEY to enable real LLM coaching (optional — has a template fallback)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` is required, not optional, if the mobile app will connect
from a phone — without it, uvicorn binds to `127.0.0.1` (localhost only)
and is unreachable from any other device on the network, including your
phone, even though the IP/port in `mobile/src/api/config.ts` are correct.
This is the most common cause of the mobile app's "Something went wrong"
on login/register.

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
- **Emergency alerts now go through paired accounts + push notifications**
  (see "Emergency contacts" above), not SMS. The original Twilio-based
  design (`backend/app/services/notifications.py`, `backend/app/api/sos.py`,
  the phone-number-only `emergency-contacts.tsx` screen) is still in the
  codebase and still works, but it's dormant — nothing in the current
  mobile flow calls it. It's a reasonable fallback to revive for a contact
  who'd rather get a plain SMS than install the app, but that's future
  work, not wired up today.
- **No calling integration anywhere** — SMS or push, this app only ever
  sends a text/notification, never places a phone call.
