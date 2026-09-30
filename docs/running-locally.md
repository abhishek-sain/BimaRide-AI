# Running BimaRide AI locally

This walks through starting all three pieces — the backend API, the mobile
rider app, and the insurer web console — from a clean checkout, in order,
with every command. Do the sections in order: the mobile app and the web
console both need the backend running first.

## 0. Prerequisites

- **Python 3.11+** (`python3 --version`)
- **Node.js 18+** and **npm** (`node --version`, `npm --version`)
- **A physical Android or iOS phone** with the [Expo Go](https://expo.dev/go)
  app installed, on the **same Wi-Fi network** as your dev machine. The
  rider app needs real GPS/accelerometer/gyroscope hardware — it will not
  work correctly in a simulator or on a laptop.
- Your dev machine's **LAN IP address** (not `localhost`) — you'll need
  this so the phone can reach the backend. Find it with:
  - macOS: `ipconfig getifaddr en0` (or `en1` if you're on Wi-Fi via a
    different interface)
  - Linux: `hostname -I`
  - Windows: `ipconfig` and read the "IPv4 Address" under your active
    adapter

Keep three terminal tabs/windows open — one per service — since all three
run at the same time.

---

## 1. Start the backend

**Terminal 1:**

```bash
cd backend
```

### 1.1 Create and activate a virtual environment (first time only)

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
```

You'll need to run the `source .venv/bin/activate` line again in any new
terminal you open for the backend.

### 1.2 Install dependencies (first time only, or after requirements.txt changes)

```bash
pip install -r requirements.txt
```

### 1.3 Configure secrets

```bash
cp .env.example .env
```

Open `.env` and set:

```
JWT_SECRET=<any random string>
INSURER_API_KEY=<any random string>
ANTHROPIC_API_KEY=          # optional — leave blank for the template coach fallback
```

You can generate random values with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Run it twice — once for `JWT_SECRET`, once for `INSURER_API_KEY` — and
paste each result in. (If you skip this step, the server will still start:
it auto-generates both values at boot and prints a warning, but they change
every time you restart it, which logs everyone out and breaks the web
console's key. Setting them once in `.env` avoids that.)

### 1.4 Run the server

```bash
uvicorn app.main:app --reload --port 8000
```

Leave this running. You should see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### 1.5 Verify it's up

In a separate terminal (or your browser):

```bash
curl http://localhost:8000/health
```

Expect: `{"status":"ok","service":"BimaRide AI backend"}`

Interactive API docs are at **http://localhost:8000/docs**.

> If port 8000 is already used by something else on your machine, start on
> another port instead — `uvicorn app.main:app --reload --port 8001` — and
> use that port number everywhere below.

---

## 2. Start the mobile rider app

**Terminal 2:**

```bash
cd mobile
```

### 2.1 Install dependencies (first time only)

```bash
npm install
```

### 2.2 Point the app at your backend

Open `src/api/config.ts` and set `API_BASE_URL` to your machine's LAN IP
from step 0, with the backend's port:

```ts
export const API_BASE_URL = "http://192.168.1.23:8000"; // <- your LAN IP here
```

Do **not** use `localhost` or `127.0.0.1` — the phone is a separate device
on the network and can't resolve those to your dev machine.

### 2.3 Start the Expo dev server

```bash
npx expo start
```

This prints a QR code in the terminal and opens Expo Dev Tools.

### 2.4 Open the app on your phone

1. Open the **Expo Go** app on your phone.
2. Scan the QR code from the terminal (Camera app on iOS, Expo Go's
   built-in scanner on Android).
3. The app bundles and launches. On first load you'll land on the
   **BimaRide AI** login screen.

### 2.5 Create a rider account and grant permissions

1. Tap **New rider? Create an account**, fill in name/email/password,
   submit.
2. Tap **▶ START RIDE**.
3. Approve the **location** permission prompt, and the **motion/fitness**
   permission prompt if your OS asks separately.
4. You should see the live score screen with distance/elapsed time
   ticking up. Move around (even walking) to generate GPS movement and
   confirm points are being recorded; tap **■ END RIDE** to finish and see
   the trip summary and score.

> If "Could not start ride" appears, double check step 2.2 — it's almost
> always the wrong `API_BASE_URL`, or the phone and dev machine being on
> different networks (e.g. phone on cellular data, or a guest Wi-Fi network
> that isolates devices from each other).

---

## 3. Start the insurer web console

**Terminal 3:**

```bash
cd web-console
```

### 3.1 Install dependencies (first time only)

```bash
npm install
```

### 3.2 Configure environment

```bash
cp .env.local.example .env.local
```

Open `.env.local` and set:

```
API_URL=http://localhost:8000
INSURER_API_KEY=<the same value you put in backend/.env>
```

`API_URL` uses `localhost` here (not the LAN IP) because the console's
server-side code runs on your dev machine, talking to the backend on the
same machine — it isn't a phone on the network.

### 3.3 Run the dev server

```bash
npm run dev
```

By default this serves on port 3000. If you also want the backend visible
on 8000 and don't want a clash with anything else already on 3000, you can
pick a different port explicitly:

```bash
npm run dev -- --port 3001
```

### 3.4 Open it

Visit **http://localhost:3000** (or whichever port you chose). You should
land on **Portfolio overview**, showing the rider(s) you created through
the mobile app in step 2, their scores, and the risk distribution bar. Use
the **Riders** nav link to see the full table, and click any rider's name
to see their trip history.

If the page errors instead of loading data, check:
- The backend (Terminal 1) is still running.
- `API_URL` in `.env.local` matches the backend's actual port.
- `INSURER_API_KEY` in `.env.local` exactly matches `INSURER_API_KEY` in
  `backend/.env` (a mismatch shows as a `401`/`Backend request failed`
  error).

---

## Everyday restart (after the first-time setup above)

Once you've done the one-time setup in each section, restarting later is
just:

```bash
# Terminal 1
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Terminal 2
cd mobile && npx expo start

# Terminal 3
cd web-console && npm run dev
```

Then re-open Expo Go's "recently opened" entry for the app (or re-scan the
QR code if it changed), and revisit the console URL.

## Stopping everything

`Ctrl+C` in each of the three terminals.

## Related docs

- [../README.md](../README.md) — project overview, architecture, and the
  list of things intentionally simplified for this MVP (rule-based scoring,
  foreground-only location tracking, the single shared insurer API key,
  etc.)
