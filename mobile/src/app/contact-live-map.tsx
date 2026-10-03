import React, { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import OsmMapView from "../components/OsmMapView";
import { loadToken } from "../api/client";
import { openCrashAlert } from "../services/openCrashAlert";
import { usePendingAlertReplay } from "../services/usePendingAlertReplay";
import { LiveLocationMessage, LiveLocationSocket } from "../services/liveLocationSocket";

export default function ContactLiveMapScreen() {
  const router = useRouter();
  const { tripId, riderName } = useLocalSearchParams<{ tripId: string; riderName?: string }>();
  const [location, setLocation] = useState<LiveLocationMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const socketRef = useRef<LiveLocationSocket | null>(null);

  // Safety net behind the socket: if it was mid-reconnect when an alert was
  // raised, this still surfaces it within 5s.
  usePendingAlertReplay();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await loadToken();
      if (!token || cancelled || !tripId) return;

      const socket = new LiveLocationSocket(tripId, token, {
        onOpen: () => setConnected(true),
        onClose: () => setConnected(false),
        onMessage: (msg) => setLocation(msg),
        onCrashAlert: (alert) => {
          // The only crash-alert channel that works in Expo Go (no remote
          // push there) — and harmless alongside push elsewhere, since
          // openCrashAlert drops the duplicate.
          openCrashAlert(router, { ...alert, rider_name: alert.rider_name ?? riderName, trip_id: alert.trip_id ?? tripId });
        },
        onRideEnded: () => setEnded(true),
        onError: (e) => console.warn("Live map socket error:", e),
      });
      socket.connect();
      socketRef.current = socket;
    })();

    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, [tripId, router, riderName]);

  return (
    <View style={styles.container}>
      {location ? (
        <OsmMapView
          style={StyleSheet.absoluteFill}
          latitude={location.lat}
          longitude={location.lon}
          title={riderName ?? "Rider"}
          pinColor="#3B82F6"
        />
      ) : (
        <View style={styles.waiting}>
          <ActivityIndicator color="#3B82F6" size="large" />
          <Text style={styles.waitingText}>
            {connected ? "Connected — waiting for the first location update…" : "Connecting…"}
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color="#fff" />
      </TouchableOpacity>

      <View style={styles.infoCard}>
        <Text style={styles.riderName}>{riderName ?? "Rider"}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: ended ? "#8892A6" : connected ? "#22C55E" : "#F59E0B" }]} />
          <Text style={styles.statusText}>{ended ? "Ride ended — last known position" : connected ? "Live" : "Reconnecting…"}</Text>
          {!ended && location?.speed_kmh != null && (
            <Text style={styles.speedText}>· {Math.round(location.speed_kmh)} km/h</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  waiting: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 40 },
  waitingText: { color: "#8892A6", textAlign: "center" },
  back: {
    position: "absolute",
    top: 56,
    left: 16,
    backgroundColor: "rgba(11,18,32,0.85)",
    borderRadius: 20,
    padding: 8,
  },
  infoCard: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: "rgba(22,31,50,0.95)",
    borderRadius: 16,
    padding: 16,
  },
  riderName: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 6 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: "#8892A6", fontSize: 13 },
  speedText: { color: "#8892A6", fontSize: 13 },
});
