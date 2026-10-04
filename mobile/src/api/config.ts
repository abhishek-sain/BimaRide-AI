// Point this at your backend. On a physical phone connected to the same
// Wi-Fi as your dev machine, use your machine's LAN IP (not localhost).
// Example: "http://192.168.1.23:8000"
//
// http:// is fine for local dev on a trusted LAN only. It sends the login
// password and every request's Authorization bearer token in cleartext, so
// any deployed backend MUST be reached over https:// — swap this for your
// backend's https URL before this app talks to anything but your own dev
// machine.
export const API_BASE_URL = "http://192.168.43.172:20000";

// Derived, not separately configured — the live-location WebSocket lives on
// the same backend as everything else, just with the ws(s):// scheme.
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

