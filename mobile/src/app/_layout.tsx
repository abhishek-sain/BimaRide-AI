import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ContactAuthProvider, useContactAuth } from "../context/ContactAuthContext";
import { RoleProvider, useRole } from "../context/RoleContext";

/** Routes to the crash-alert screen whenever a crash_alert push arrives —
 * whether the contact tapped it (app was backgrounded/closed) or it just
 * came in while the app was already open. Mounted once at the root so it
 * works no matter which screen is currently showing. */
function NotificationRouter() {
  const router = useRouter();

  useEffect(() => {
    function openIfCrashAlert(data: Record<string, unknown> | undefined) {
      if (!data || data.type !== "crash_alert") return;
      const params = new URLSearchParams({
        riderName: String(data.rider_name ?? "Rider"),
        lat: data.lat != null ? String(data.lat) : "",
        lon: data.lon != null ? String(data.lon) : "",
        speedKmh: data.speed_kmh != null ? String(data.speed_kmh) : "",
        tripId: String(data.trip_id ?? ""),
      });
      router.push(`/crash-alert?${params.toString()}`);
    }

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      openIfCrashAlert(notification.request.content.data as Record<string, unknown>);
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openIfCrashAlert(response.notification.request.content.data as Record<string, unknown>);
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
]);
const CONTACT_ROUTES = new Set(["contact-home", "contact-live-map"]);
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
                {/* Emergency Contact Person */}
                <Stack.Screen name="contact-auth" />
                <Stack.Screen name="contact-home" />
                <Stack.Screen name="contact-live-map" />
                {/* Shared */}
                <Stack.Screen name="crash-alert" options={{ gestureEnabled: false }} />
              </Stack>
            </Gate>
          </ContactAuthProvider>
        </AuthProvider>
      </RoleProvider>
    </SafeAreaProvider>
  );
}
