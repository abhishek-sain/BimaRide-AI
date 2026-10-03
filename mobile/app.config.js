// Dynamic config, not static app.json, for exactly one reason: an optional
// Google Maps API key has to come from an environment variable rather than
// be hardcoded into a file this repo commits. The rest of this file is
// app.base.json, unchanged.
//
// The map screens (contact live-map, crash-alert) use components/OsmMapView
// by default — OpenStreetMap via Leaflet in a WebView, which needs NO API
// key at all. react-native-maps (Google-backed on Android) stays available
// as a swap-in upgrade for a more native feel; it needs a key from your own
// Google Cloud account first, or it crashes with:
//   java.lang.IllegalStateException: API key not found. Check that
//   <meta-data android:name="com.google.android.geo.API_KEY" .../> is in
//   the <application> element of AndroidManifest.xml
// See docs/google-maps-setup.md for getting a key and switching back.
const base = require("./app.base.json");

const androidMapsKey = process.env.GOOGLE_MAPS_API_KEY_ANDROID || "";
const iosMapsKey = process.env.GOOGLE_MAPS_API_KEY_IOS || "";

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
