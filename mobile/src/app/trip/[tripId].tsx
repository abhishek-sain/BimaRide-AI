import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../../api/client";
import { Trip } from "../../types";
import { tierColor, tierLabel } from "../../services/tiers";

const EVENT_LABEL: Record<string, string> = {
  harsh_brake: "Harsh braking",
  harsh_accel: "Harsh acceleration",
  cornering: "Aggressive cornering",
  overspeed: "Overspeed",
  crash_suspect: "Possible crash",
};

export default function TripSummaryScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);

  useEffect(() => {
    if (!tripId) return;
    api.get<Trip>(`/trips/${tripId}`).then(setTrip).catch(console.warn);
  }, [tripId]);

  if (!trip) return null;

  const score = trip.trip_score ?? 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
      <Text style={styles.heading}>Trip summary</Text>

      <View style={styles.scoreCard}>
        <Text style={styles.scoreValue}>{Math.round(score)}</Text>
        <Text style={[styles.tier, { color: tierColor(score) }]}>{tierLabel(score)}</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Distance" value={`${trip.distance_km} km`} />
        <Stat label="Duration" value={`${Math.round(trip.duration_s / 60)} min`} />
        <Stat label="Avg speed" value={`${trip.avg_speed_kmh} km/h`} />
      </View>

      {trip.status === "crash_flagged" && (
        <View style={styles.crashBanner}>
          <Text style={styles.crashText}>⚠️ This trip was flagged for a possible crash event.</Text>
        </View>
      )}

      {trip.score_breakdown && (
        <>
          <Text style={styles.sectionTitle}>Score breakdown</Text>
          {Object.entries(trip.score_breakdown.weighted).map(([k, v]) => (
            <View key={k} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{k}</Text>
              <Text style={styles.breakdownValue}>{v} pts</Text>
            </View>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>Events ({trip.events.length})</Text>
      {trip.events.length === 0 && <Text style={styles.empty}>Clean ride — no events detected.</Text>}
      {trip.events.map((e) => (
        <View key={e.id} style={styles.eventRow}>
          <View>
            <Text style={styles.eventType}>{EVENT_LABEL[e.event_type] ?? e.event_type}</Text>
            <Text style={styles.eventTip}>{e.coach_tip}</Text>
          </View>
          <Text style={styles.eventSeverity}>{e.severity}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.coachButton} onPress={() => router.push(`/coach?tripId=${trip.id}`)}>
        <Text style={styles.coachButtonText}>Ask the AI coach about this trip</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.doneButton} onPress={() => router.replace("/")}>
        <Text style={styles.doneButtonText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
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
  container: { flex: 1, backgroundColor: "#0B1220" },
  heading: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 16 },
  scoreCard: { backgroundColor: "#161F32", borderRadius: 20, alignItems: "center", paddingVertical: 20, marginBottom: 16 },
  scoreValue: { color: "#fff", fontSize: 48, fontWeight: "800" },
  tier: { fontWeight: "700" },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  stat: { alignItems: "center", flex: 1 },
  statValue: { color: "#fff", fontSize: 16, fontWeight: "700" },
  statLabel: { color: "#8892A6", fontSize: 12 },
  crashBanner: { backgroundColor: "#3B1414", borderRadius: 12, padding: 12, marginBottom: 16 },
  crashText: { color: "#F87171", fontWeight: "600" },
  sectionTitle: { color: "#fff", fontWeight: "700", fontSize: 16, marginBottom: 8, marginTop: 8 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  breakdownLabel: { color: "#8892A6", textTransform: "capitalize" },
  breakdownValue: { color: "#fff", fontWeight: "600" },
  eventRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#161F32", borderRadius: 12, padding: 12, marginBottom: 8, alignItems: "center" },
  eventType: { color: "#fff", fontWeight: "600" },
  eventTip: { color: "#8892A6", fontSize: 12, marginTop: 2, maxWidth: 240 },
  eventSeverity: { color: "#FBBF24", textTransform: "uppercase", fontSize: 12, fontWeight: "700" },
  empty: { color: "#8892A6", marginBottom: 8 },
  coachButton: { backgroundColor: "#1E2A45", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16 },
  coachButtonText: { color: "#fff", fontWeight: "600" },
  doneButton: { backgroundColor: "#3B82F6", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 12, marginBottom: 40 },
  doneButtonText: { color: "#fff", fontWeight: "700" },
});
