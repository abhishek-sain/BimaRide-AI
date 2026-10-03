// Dynamic config, not static app.json, for exactly one reason: the Google
// Maps API key for Android (and optionally iOS) has to come from an
// environment variable rather than be hardcoded into a file this repo
// commits. The rest of this file is app.base.json, unchanged.
//
// Without a key, react-native-maps on Android crashes with:
//   java.lang.IllegalStateException: API key not found. Check that
//   <meta-data android:name="com.google.android.geo.API_KEY" .../> is in
//   the <application> element of AndroidManifest.xml
// — exactly the error that led to this file existing. See
// docs/google-maps-setup.md for how to get a key.
const base = require("./app.base.json");

const androidMapsKey = process.env.GOOGLE_MAPS_API_KEY_ANDROID || "";
const iosMapsKey = process.env.GOOGLE_MAPS_API_KEY_IOS || "";

if (!androidMapsKey) {
  // Not a hard failure: every other screen in the app works without this.
  // Only the contact's live-map and crash-alert screens need it, and they
  // fail at the native level (not here) if it's missing.
  // eslint-disable-next-line no-console
  console.warn(
    "\n⚠️  GOOGLE_MAPS_API_KEY_ANDROID is not set (mobile/.env) — the map screens will crash on Android until it is. See docs/google-maps-setup.md.\n"
  );
}

module.exports = {
  ...base.expo,
  plugins: [
    ...base.expo.plugins,
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey: androidMapsKey,
        ...(iosMapsKey ? { iosGoogleMapsApiKey: iosMapsKey } : {}),
      },
    ],
  ],
};
