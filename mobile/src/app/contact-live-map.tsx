import React, { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { loadToken } from "../api/client";
import { LiveLocationMessage, LiveLocationSocket } from "../services/liveLocationSocket";

export default function ContactLiveMapScreen() {
  const router = useRouter();
  const { tripId, riderName } = useLocalSearchParams<{ tripId: string; riderName?: string }>();
  const [location, setLocation] = useState<LiveLocationMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<LiveLocationSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await loadToken();
      if (!token || cancelled || !tripId) return;

      const socket = new LiveLocationSocket(tripId, token, {
        onOpen: () => setConnected(true),
        onClose: () => setConnected(false),
        onMessage: (msg) => setLocation(msg),
        onError: (e) => console.warn("Live map socket error:", e),
      });
      socket.connect();
      socketRef.current = socket;
    })();

    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, [tripId]);

  return (
    <View style={styles.container}>
      {location ? (
        <MapView
          style={StyleSheet.absoluteFill}
          region={{
            latitude: location.lat,
            longitude: location.lon,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Marker coordinate={{ latitude: location.lat, longitude: location.lon }} title={riderName ?? "Rider"} />
        </MapView>
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
          <View style={[styles.dot, { backgroundColor: connected ? "#22C55E" : "#F59E0B" }]} />
          <Text style={styles.statusText}>{connected ? "Live" : "Reconnecting…"}</Text>
          {location?.speed_kmh != null && (
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
