import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import OsmMapView from "../components/OsmMapView";
import NearbyPlaces from "../components/NearbyPlaces";
import { api, ApiError } from "../api/client";
import { useAlarm } from "../services/useAlarm";
import { MutualAidPing } from "../types";

export default function MutualAidAlertScreen() {
  const router = useRouter();
  const { pingId } = useLocalSearchParams<{ pingId: string }>();
  const [ping, setPing] = useState<MutualAidPing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  // Same vibrate-and-siren alarm as the crashed rider's own SOS screen and
  // the emergency contact's crash-alert screen — a nearby rider being
  // paged needs the same "can't miss it" attention-grab, not a silent
  // screen they'd only notice if they happened to be looking at the app.
  const { stopped, secondsLeft, stop } = useAlarm();

  const load = useCallback(async () => {
    if (!pingId) return;
    try {
      const result = await api.get<MutualAidPing>(`/mutual-aid/${pingId}`);
      setPing(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this alert.");
    }
  }, [pingId]);

  // Loads immediately on mount/focus, then keeps polling: the underlying
  // crash alert might get acknowledged by the rider's own emergency
  // contact, or the rider might say they're OK, while this screen is open.
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 4000);
      return () => clearInterval(timer);
    }, [load])
  );

  const hasLocation = ping?.lat != null && ping?.lon != null;
  const resolved = ping?.alert_status === "rider_ok";

  // The rider dismissed it as a false alarm — no reason to keep sounding
  // an alarm on a nearby stranger's phone over it.
  useEffect(() => {
    if (resolved && !stopped) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  async function respond(responding: boolean) {
    if (!pingId) return;
    setActing(true);
    try {
      const result = await api.post<MutualAidPing>(`/mutual-aid/${pingId}/respond`, { responding });
      setPing(result);
      if (!responding) {
        stop();
        router.back();
      }
    } catch (e) {
      console.warn("Could not record response:", e);
    } finally {
      setActing(false);
    }
  }

  function openInMaps() {
    if (!hasLocation) return;
    Linking.openURL(`https://maps.google.com/?q=${ping!.lat},${ping!.lon}`);
  }

  if (!ping && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3B82F6" size="large" />
      </View>
    );
  }

  if (error || !ping) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "This alert is no longer available."}</Text>
        <TouchableOpacity style={styles.stopButton} onPress={() => router.back()}>
          <Text style={styles.stopButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <View style={styles.container}>
      <View style={[styles.banner, resolved && styles.bannerResolved]}>
        <Text style={styles.bannerTitle}>{resolved ? "✅ Rider says they're OK" : "🚨 Nearby rider may need help"}</Text>
        <Text style={styles.bannerBody}>
          {resolved
            ? "This alert was a false alarm — the rider has already confirmed they're fine."
            : `A BimaRide rider's crash alert was just raised ~${ping.distance_km} km from your last known location. Their emergency contact has also been notified — you opted in to be notified too, since you may be able to reach them faster.`}
        </Text>
      </View>

      <View style={styles.mapWrap}>
        {hasLocation ? (
          <OsmMapView style={{ flex: 1 }} latitude={ping.lat!} longitude={ping.lon!} title="Crash location" pinColor="#EF4444" />
        ) : (
          <View style={styles.noLocation}>
            <Text style={styles.noLocationText}>No location was included with this alert.</Text>
          </View>
        )}
      </View>

      {hasLocation && (
        <TouchableOpacity style={styles.mapsButton} onPress={openInMaps}>
          <Text style={styles.mapsButtonText}>Open in Google Maps</Text>
        </TouchableOpacity>
      )}

      {hasLocation && !resolved && <NearbyPlaces lat={ping.lat!} lon={ping.lon!} />}

      {!resolved && ping.status === "notified" && (
        <>
          <TouchableOpacity style={styles.respondButton} onPress={() => respond(true)} disabled={acting}>
            <Text style={styles.respondButtonText}>I&apos;M ON MY WAY</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={() => respond(false)} disabled={acting}>
            <Text style={styles.dismissButtonText}>Can&apos;t help right now</Text>
          </TouchableOpacity>
        </>
      )}

      {ping.status === "responding" && !resolved && (
        <Text style={styles.ackNote}>✓ You said you&apos;re on your way.</Text>
      )}

      {!stopped ? (
        <>
          <Text style={styles.countdown}>
            {mm}:{ss}
          </Text>
          <TouchableOpacity style={styles.stopButton} onPress={stop}>
            <Text style={styles.stopButtonText}>STOP ALARM</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.stopButton} onPress={() => router.back()}>
          <Text style={styles.stopButtonText}>Close</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", padding: 20, paddingTop: 60 },
  center: { flex: 1, backgroundColor: "#0B1220", justifyContent: "center", alignItems: "center", padding: 20, gap: 16 },
  errorText: { color: "#8892A6", textAlign: "center" },
  banner: { backgroundColor: "#3B1414", borderRadius: 16, padding: 16, marginBottom: 16 },
  bannerResolved: { backgroundColor: "#12301E" },
  bannerTitle: { color: "#F87171", fontSize: 18, fontWeight: "800", marginBottom: 6 },
  bannerBody: { color: "#fff", fontSize: 13, lineHeight: 19 },
  mapWrap: { flex: 1, borderRadius: 16, overflow: "hidden", marginBottom: 16, backgroundColor: "#161F32" },
  noLocation: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  noLocationText: { color: "#8892A6", textAlign: "center" },
  mapsButton: { backgroundColor: "#1E2A45", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  mapsButtonText: { color: "#fff", fontWeight: "700" },
  respondButton: { backgroundColor: "#22C55E", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginBottom: 10 },
  respondButtonText: { color: "#06210F", fontWeight: "800", fontSize: 16 },
  dismissButton: { backgroundColor: "#1E2A45", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  dismissButtonText: { color: "#8892A6", fontWeight: "600" },
  ackNote: { color: "#4ADE80", textAlign: "center", marginBottom: 10, fontSize: 13 },
  countdown: {
    color: "#EF4444",
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
    fontVariant: ["tabular-nums"],
  },
  stopButton: { backgroundColor: "#1E2A45", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  stopButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
