import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../context/AuthContext";

function Gate({ children }: { children: React.ReactNode }) {
  const { rider, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "auth";
    if (!rider && !inAuthGroup) {
      router.replace("/auth");
    } else if (rider && inAuthGroup) {
      router.replace("/");
    }
  }, [rider, loading, segments, router]);

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
      <AuthProvider>
        <StatusBar style="light" />
        <Gate>
          <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="live-ride" options={{ gestureEnabled: false }} />
            <Stack.Screen name="trip/[tripId]" />
            <Stack.Screen name="coach" />
            <Stack.Screen name="rewards" />
          </Stack>
        </Gate>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
