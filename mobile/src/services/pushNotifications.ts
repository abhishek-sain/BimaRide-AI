import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

// Foreground behavior: still show the alert even while the app is open —
// the default is to suppress it, which would make a crash alert silently
// disappear if the contact happens to have the app open at the time.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Android notification channels are immutable once created (only the name and
// description can change afterwards), so a channel that was created with the
// wrong sound can't be fixed by editing its options. The id carries a version
// for that reason: "crash-alerts" was created with `sound: "default"`, which
// expo-notifications treats as a custom FILENAME — it doesn't exist, so it
// logged "Custom sound 'default' not found in native app" and gave the channel
// no sound at all. Bump the suffix (and backend/app/services/push.py, which
// must send to the same id) if the channel's sound/importance ever has to change.
const CRASH_CHANNEL_ID = "crash-alerts-v2";
const LEGACY_CRASH_CHANNEL_ID = "crash-alerts";

async function ensureAndroidChannels() {
  if (Platform.OS !== "android") return;

  // Remove the broken v1 channel so it doesn't linger in the phone's settings.
  await Notifications.deleteNotificationChannelAsync(LEGACY_CRASH_CHANNEL_ID);

  await Notifications.setNotificationChannelAsync(CRASH_CHANNEL_ID, {
    name: "Crash alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    // `sound` is deliberately OMITTED: omitted means "the system default
    // sound"; null means silent; any string means a custom file that must be
    // bundled via the config plugin's `sounds` array.
    // Play it as an ALARM rather than an ordinary notification: it follows
    // the alarm volume (not the ringer/notification volume the user may have
    // turned down) — the right stream for something that must be heard.
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/**
 * Requests permission and returns an Expo push token, or null if it
 * couldn't get one. Returning null (instead of throwing) matters here:
 * push notifications require a development build, not Expo Go, from
 * SDK 53 onward — this lets every other feature in the app keep working
 * in Expo Go during development, with push simply not registering until
 * the app is run from a dev build or production build instead.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    await ensureAndroidChannels();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      console.warn("Push notification permission not granted.");
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn(
        "No EAS projectId configured — push notifications need `eas init` and a development build; skipping push token registration."
      );
      return null;
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (e) {
    // Most commonly: running in Expo Go, where remote push notifications
    // aren't supported at all (SDK 53+). Degrade quietly rather than
    // breaking login/registration over a feature that needs a dev build.
    console.warn("Could not register for push notifications:", e);
    return null;
  }
}

export { CRASH_CHANNEL_ID };
