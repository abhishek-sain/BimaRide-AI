import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { api, loadToken } from "../api/client";
import { RideRecorder } from "../services/rideRecorder";
import { LiveState, LocalEvent, emptyState } from "../services/localRules";
import { LiveLocationSocket } from "../services/liveLocationSocket";
import { Trip } from "../types";
import SosOverlay from "../components/SosOverlay";

const EVENT_LABEL: Record<string, string> = {
  harsh_brake: "Harsh braking",
  harsh_accel: "Harsh acceleration",
  cornering: "Aggressive cornering",
  overspeed: "Overspeed",
  crash_suspect: "Possible crash",
};

export default function LiveRideScreen() {
  const router = useRouter();
  const [tripId, setTripId] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveState>(emptyState());
  const [recentEvents, setRecentEvents] = useState<LocalEvent[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [sosReason, setSosReason] = useState<"crash" | "manual" | null>(null);
  const [notifyState, setNotifyState] = useState<"idle" | "sending" | "sent">("idle");
  const recorderRef = useRef<RideRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const liveSocketRef = useRef<LiveLocationSocket | null>(null);
  const lastLocationRef = useRef<{ lat?: number; lon?: number; speedKmh?: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Location required", "BimaRide needs location access to score your ride.");
          router.back();
          return;
        }

        const trip = await api.post<Trip>("/trips", {});
        setTripId(trip.id);
        startedAtRef.current = Date.now();

        const token = await loadToken();
        if (token) {
          const socket = new LiveLocationSocket(trip.id, token, {
            onError: (e) => console.warn("Live-location socket error:", e),
          });
          socket.connect();
          liveSocketRef.current = socket;
        }

        const recorder = new RideRecorder(trip.id, {
          onLiveUpdate: (state, point) => {
            setLiveState({ ...state });
            if (point?.lat != null && point?.lon != null) {
              lastLocationRef.current = { lat: point.lat, lon: point.lon, speedKmh: point.speed_kmh };
              liveSocketRef.current?.send({ lat: point.lat, lon: point.lon, speed_kmh: point.speed_kmh });
            }
          },
          onNewEvent: (event) => {
            setRecentEvents((prev) => [event, ...prev].slice(0, 10));
          },
          onCrashSuspected: () => {
            setSosReason("crash");
            reportCrashToContacts(trip.id);
          },
        });
        recorderRef.current = recorder;
        await recorder.start();

        timerRef.current = setInterval(() => {
          setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
        }, 1000);
      } catch (e: any) {
        Alert.alert("Could not start ride", e.message ?? String(e));
        router.back();
      }
    })();

    return () => {
      recorderRef.current?.stop();
      liveSocketRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reportCrashToContacts(activeTripId: string) {
    // Runs alongside, never instead of, the rider's own phone alarm
    // (SosOverlay) — this is the part that reaches someone ELSE.
    try {
      await api.post(`/trips/${activeTripId}/crash-alert`, {
        lat: lastLocationRef.current?.lat,
        lon: lastLocationRef.current?.lon,
        speed_kmh: lastLocationRef.current?.speedKmh,
      });
    } catch (e) {
      console.warn("Crash alert to emergency contacts failed:", e);
    }
  }

  async function notifyContact() {
    if (!tripId) return;
    setNotifyState("sending");
    try {
      const res = await api.post<{ notified: number }>(`/trips/${tripId}/notify-start`);
      setNotifyState("sent");
      if (res.notified === 0) {
        Alert.alert(
          "No one was notified",
          "You don't have an accepted emergency contact connection yet, or they haven't opened the app to receive push notifications. Add one from the home screen."
        );
      }
    } catch (e: any) {
      setNotifyState("idle");
      Alert.alert("Could not notify your contact", e.message ?? String(e));
    }
  }

  function onSosPress() {
    setSosReason("manual");
    if (tripId) reportCrashToContacts(tripId);
  }

  async function endRide() {
    if (!tripId) return;
    try {
      await recorderRef.current?.stop();
      liveSocketRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
      const trip = await api.post<Trip>(`/trips/${tripId}/end`);
      router.replace(`/trip/${trip.id}`);
    } catch (e: any) {
      Alert.alert("Could not end ride", e.message ?? String(e));
    }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <View style={styles.container}>
      <Text style={styles.timer}>
        {mm}:{ss}
      </Text>

      <TouchableOpacity
        style={[styles.notifyButton, notifyState === "sent" && styles.notifyButtonSent]}
        onPress={notifyContact}
        disabled={notifyState !== "idle"}
      >
        <Text style={styles.notifyButtonText}>
          {notifyState === "sent" ? "✓ Emergency contact notified" : "🔔 Notify emergency contact"}
        </Text>
      </TouchableOpacity>

      <View style={styles.scoreWrap}>
        <Text style={styles.scoreLabel}>LIVE SCORE</Text>
        <Text style={styles.score}>{liveState.provisionalScore}</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Distance" value={`${liveState.distanceKm.toFixed(2)} km`} />
        <Stat label="Events" value={String(liveState.events.length)} />
      </View>

      <Text style={styles.sectionTitle}>Live feed</Text>
      <View style={styles.feed}>
        {recentEvents.length === 0 && <Text style={styles.feedEmpty}>Riding clean — no events yet.</Text>}
        {recentEvents.map((e, i) => (
          <Text key={i} style={styles.feedItem}>
            {EVENT_LABEL[e.type] ?? e.type} · {e.peakValue.toFixed(2)}g
          </Text>
        ))}
      </View>

      <TouchableOpacity style={styles.sosButton} onPress={onSosPress}>
        <Text style={styles.sosButtonText}>SOS</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.stopButton} onPress={endRide}>
        <Text style={styles.stopButtonText}>■  END RIDE</Text>
      </TouchableOpacity>

      {sosReason && <SosOverlay reason={sosReason} onResolved={() => setSosReason(null)} />}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", padding: 20, paddingTop: 60, alignItems: "center" },
  timer: { color: "#8892A6", fontSize: 18, fontVariant: ["tabular-nums"], marginBottom: 8 },
  notifyButton: { backgroundColor: "#1E2A45", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 8 },
  notifyButtonSent: { backgroundColor: "#15321F" },
  notifyButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  scoreWrap: { alignItems: "center", marginVertical: 12 },
  scoreLabel: { color: "#8892A6", letterSpacing: 2, fontSize: 12 },
  score: { color: "#fff", fontSize: 72, fontWeight: "800" },
  statsRow: { flexDirection: "row", gap: 32, marginBottom: 20 },
  stat: { alignItems: "center" },
  statValue: { color: "#fff", fontSize: 20, fontWeight: "700" },
  statLabel: { color: "#8892A6", fontSize: 12 },
  sectionTitle: { color: "#fff", fontWeight: "700", alignSelf: "flex-start", marginBottom: 8 },
  feed: { width: "100%", backgroundColor: "#161F32", borderRadius: 12, padding: 14, minHeight: 100, marginBottom: 20 },
  feedEmpty: { color: "#8892A6" },
  feedItem: { color: "#FBBF24", marginBottom: 4 },
  sosButton: { width: 90, height: 90, borderRadius: 45, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  sosButtonText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  stopButton: { backgroundColor: "#1E2A45", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40 },
  stopButtonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
