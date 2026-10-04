import { Platform } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import FallDetectionNative from "../../modules/fall-detection/src/FallDetectionModule";
import { API_BASE_URL } from "../api/config";
import { loadToken } from "../api/client";

// Always-on fall detection needs a native Android foreground service (see
// modules/fall-detection) — there's no equivalent JS API for continuous
// background accelerometer access, and iOS doesn't grant third-party apps
// the entitlements for true background motion monitoring the way it does
// its own Watch fall detection. So this is Android-only; every function
// here is a no-op on other platforms (the module itself has safe no-op
// web/iOS implementations — see FallDetectionModule.web.ts and
// ios/FallDetectionModule.swift).
const SUPPORTED = Platform.OS === "android";

function getNativeModule() {
  return SUPPORTED ? FallDetectionNative : null;
}

export interface PermissionResult {
  granted: boolean;
  reason?: string;
}

/** Requests everything the background service needs: foreground location
 * (prerequisite for background location on Android), background location
 * ("Allow all the time" — Android routes this through Settings on API
 * 30+, so the OS dialog may not look like a normal permission prompt),
 * and notifications (required to show the persistent "monitoring" one). */
export async function requestFallDetectionPermissions(): Promise<PermissionResult> {
  if (!SUPPORTED) return { granted: false, reason: "Background fall detection is only available on Android." };

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    return { granted: false, reason: "Location permission is required for background fall detection." };
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") {
    return {
      granted: false,
      reason:
        'Background location permission is required so a fall can be reported with a location. On this phone you may need to open Settings and choose "Allow all the time" for BimaRide.',
    };
  }

  const notif = await Notifications.requestPermissionsAsync();
  if (notif.status !== "granted") {
    return { granted: false, reason: "Notification permission is required to show the monitoring indicator." };
  }

  return { granted: true };
}

/** Starts the background monitor. Call requestFallDetectionPermissions()
 * first — this doesn't request anything itself, it just starts the
 * service with whatever's already granted. */
export async function startFallDetection(): Promise<boolean> {
  const native = getNativeModule();
  if (!native) return false;
  const token = await loadToken();
  if (!token) return false;
  return native.startMonitoring(token, API_BASE_URL);
}

export function stopFallDetection(): boolean {
  const native = getNativeModule();
  if (!native) return false;
  return native.stopMonitoring();
}

export function isFallDetectionActive(): boolean {
  const native = getNativeModule();
  if (!native) return false;
  return native.isMonitoring();
}

/** Re-pushes the current token into the service's cache — call this
 * whenever the app opens with a logged-in rider and monitoring was
 * already on, so a service that's been running since before the last
 * login (JWTs expire after 7 days) doesn't end up silently stuck with a
 * stale token. Best-effort: does nothing if monitoring isn't on. */
export async function refreshFallDetectionToken(): Promise<void> {
  if (!isFallDetectionActive()) return;
  await startFallDetection();
}
