# Getting a Google Maps API key (Android) — optional

**You almost certainly don't need this.** The Emergency Contact's live-map
screen and the crash-alert screen use `components/OsmMapView.tsx` by
default — OpenStreetMap rendered via Leaflet in a WebView, which needs no
API key, no Google account, and no rebuild to change. This document is only
for switching those two screens to `react-native-maps` (Google-backed on
Android) instead, if you want a more native map feel later.

If you skip this entirely, the app works fully. If you try to use
`react-native-maps` without a key, it crashes with:

```
java.lang.IllegalStateException: API key not found. Check that
<meta-data android:name="com.google.android.geo.API_KEY" .../> is in
the <application> element of AndroidManifest.xml
```

Getting a key is a Google account/billing step, so it can't be scripted
for you.

## 1. Create a Google Cloud project (or reuse one)

1. Go to <https://console.cloud.google.com/>.
2. Top-left project picker → **New Project**. Any name, e.g. `bimaride-ai`.
3. Google requires a billing account attached to use Maps APIs, even on the
   free tier. Maps SDK for Android gives **$200/month free usage**, which
   is far more than local testing will ever use — you're very unlikely to
   be charged anything for this project.

## 2. Enable the Maps SDK for Android

1. In the project, go to **APIs & Services → Library**.
2. Search **"Maps SDK for Android"** → **Enable**.

## 3. Create the API key

1. **APIs & Services → Credentials → + Create Credentials → API key.**
2. Copy the key it generates immediately — you'll paste it into `.env` next.

## 4. Restrict the key (don't skip this)

An unrestricted Maps key can be used by anyone who extracts it from your
APK. Restricting it to your app costs nothing and takes a minute:

1. Click the key you just created → **Edit API key**.
2. **Application restrictions → Android apps → Add an item.**
3. **Package name:** `com.bimarideai.app`
4. **SHA-1 certificate fingerprint:** get it from your debug keystore:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
   ```
5. **API restrictions → Restrict key → Maps SDK for Android** only.
6. Save.

(If you later build a release/production APK, it's signed with a
different keystore and has a different SHA-1 — add that as a second entry
here when you get there, or the release build's maps will fail the same
way.)

## 5. Add it to this project

```bash
cd mobile
cp .env.example .env
```

Edit `mobile/.env` and paste the key:
```
GOOGLE_MAPS_API_KEY_ANDROID=AIzaSy...your key...
```

`mobile/.env` is gitignored — it never gets committed.

## 6. Rebuild (a JS reload is not enough)

The key gets baked into `AndroidManifest.xml` at prebuild time, which only
happens when the native project regenerates. Restarting Metro or reloading
the app does nothing here:

```bash
cd mobile
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Then reinstall the same APK on the second phone the same way as before.

## Verifying it worked

```bash
cd mobile
npx expo config --json | python3 -c "import json,sys; d=json.load(sys.stdin); print([p for p in d['plugins'] if isinstance(p, list) and p[0]=='react-native-maps'])"
```
should print your real key, not `""`. Once rebuilt and reinstalled, you
still need one code change — the screens render `OsmMapView` by default,
not `react-native-maps`, regardless of whether a key is configured:

In `src/app/contact-live-map.tsx` and `src/app/crash-alert.tsx`, swap:
```tsx
import OsmMapView from "../components/OsmMapView";
// ...
<OsmMapView style={...} latitude={lat} longitude={lon} title={name} pinColor="#EF4444" />
```
for:
```tsx
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
// ...
<MapView provider={PROVIDER_GOOGLE} style={...} region={{ latitude: lat, longitude: lon, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
  <Marker coordinate={{ latitude: lat, longitude: lon }} title={name} pinColor="#EF4444" />
</MapView>
```
Then prebuild and rebuild as above. Opening **View live location** or a
crash alert on the contact's phone should show an actual Google map.
