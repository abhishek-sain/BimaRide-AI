import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ContactAuthProvider, useContactAuth } from "../context/ContactAuthContext";
import { RoleProvider, useRole } from "../context/RoleContext";
import { CrashAlertLike, openCrashAlert } from "../services/openCrashAlert";
import { openMutualAidAlert } from "../services/openMutualAidAlert";
import { FallAlertLike, openFallAlert } from "../services/openFallAlert";

/** Routes to the crash-alert or mutual-aid screen whenever the matching
 * push arrives — whether the recipient tapped it (app was
 * backgrounded/closed) or it just came in while the app was already open.
 * Mounted once at the root so it works no matter which screen is showing. */
function NotificationRouter() {
  const router = useRouter();

  useEffect(() => {
    function route(data: Record<string, unknown> | undefined) {
      if (!data) return;
      if (data.type === "crash_alert") {
        // The same alert can also arrive over the live-map socket or the
        // home-screen replay poll — openCrashAlert opens it only once.
        openCrashAlert(router, data as CrashAlertLike);
      } else if (data.type === "mutual_aid") {
        openMutualAidAlert(router, data as { ping_id?: string });
      } else if (data.type === "fall_alert") {
        openFallAlert(router, data as FallAlertLike);
      }
    }

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      route(notification.request.content.data as Record<string, unknown>);
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      route(response.notification.request.content.data as Record<string, unknown>);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [router]);

  return null;
}

const RIDER_ROUTES = new Set([
  "index",
  "live-ride",
  "trip",
  "coach",
  "rewards",
  "profile",
  "emergency-contacts",
  "connect",
  "mutual-aid-alert",
]);
const CONTACT_ROUTES = new Set(["contact-home", "contact-live-map"]);
// "fall-alert" is reachable only from the contact side (a standalone fall
// isn't tied to a trip the way crash-alert's rider-ok flow is), but is
// left out of the route-group checks below like crash-alert, since a
// rider could in principle also receive one as someone else's contact.
// "crash-alert" is reachable from either role (a rider could in principle
// also be someone else's emergency contact on the same device/role some
// day), so it's deliberately left out of both route-group checks below.

function Gate({ children }: { children: React.ReactNode }) {
  const { role, loading: roleLoading } = useRole();
  const { rider, loading: riderLoading } = useAuth();
  const { contact, loading: contactLoading } = useContactAuth();
  const segments = useSegments();
  const router = useRouter();

  const loading =
    roleLoading || (role === "rider" && riderLoading) || (role === "contact" && contactLoading);

  useEffect(() => {
    if (loading) return;
    const seg0 = segments[0] ?? "";

    if (!role) {
      if (seg0 !== "choose-role") router.replace("/choose-role");
      return;
    }

    if (role === "rider") {
      if (!rider && seg0 !== "auth") {
        router.replace("/auth");
      } else if (rider && (seg0 === "auth" || seg0 === "choose-role" || CONTACT_ROUTES.has(seg0))) {
        router.replace("/");
      }
    } else {
      if (!contact && seg0 !== "contact-auth") {
        router.replace("/contact-auth");
      } else if (contact && (seg0 === "contact-auth" || seg0 === "choose-role" || RIDER_ROUTES.has(seg0))) {
        router.replace("/contact-home");
      }
    }
  }, [role, rider, contact, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0B1220", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#3B82F6" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RoleProvider>
        <AuthProvider>
          <ContactAuthProvider>
            <StatusBar style="light" />
            <NotificationRouter />
            <Gate>
              <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
                <Stack.Screen name="choose-role" />
                {/* Rider */}
                <Stack.Screen name="auth" />
                <Stack.Screen name="index" />
                <Stack.Screen name="live-ride" options={{ gestureEnabled: false }} />
                <Stack.Screen name="trip/[tripId]" />
                <Stack.Screen name="coach" />
                <Stack.Screen name="rewards" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="emergency-contacts" />
                <Stack.Screen name="connect" />
                <Stack.Screen name="mutual-aid-alert" options={{ gestureEnabled: false }} />
                {/* Emergency Contact Person */}
                <Stack.Screen name="contact-auth" />
                <Stack.Screen name="contact-home" />
                <Stack.Screen name="contact-live-map" />
                {/* Shared */}
                <Stack.Screen name="crash-alert" options={{ gestureEnabled: false }} />
                <Stack.Screen name="fall-alert" options={{ gestureEnabled: false }} />
                <Stack.Screen name="alerts" />
              </Stack>
            </Gate>
          </ContactAuthProvider>
        </AuthProvider>
      </RoleProvider>
    </SafeAreaProvider>
  );
}
