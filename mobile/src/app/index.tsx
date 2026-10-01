import React, { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import { Trip } from "../types";
import { useAuth } from "../context/AuthContext";
import { useRole } from "../context/RoleContext";
import { tierLabel, tierColor } from "../services/tiers";

export default function HomeScreen() {
  const { rider, logout } = useAuth();
  const { clearRole } = useRole();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Trip[]>("/trips");
      setTrips(data.filter((t) => t.status !== "active"));
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const latestScore = trips.find((t) => t.trip_score != null)?.trip_score;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/profile")}>
          <Text style={styles.greeting}>Hi {rider?.name?.split(" ")[0]}</Text>
          <Text style={styles.sub}>{rider?.bike_model ?? "Complete your profile →"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            await logout();
            await clearRole();
            router.replace("/choose-role");
          }}
        >
          <Text style={styles.logout}>Log out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>RIDER SCORE</Text>
        <Text style={styles.scoreValue}>{latestScore != null ? Math.round(latestScore) : "--"}</Text>
        {latestScore != null && <Text style={[styles.tier, { color: tierColor(latestScore) }]}>{tierLabel(latestScore)}</Text>}
      </View>

      <TouchableOpacity style={styles.startButton} onPress={() => router.push("/live-ride")}>
        <Text style={styles.startButtonText}>▶  START RIDE</Text>
      </TouchableOpacity>

      <View style={styles.rowButtons}>
        <TouchableOpacity style={styles.smallButton} onPress={() => router.push("/coach")}>
          <Text style={styles.smallButtonText}>Ask coach</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallButton} onPress={() => router.push("/rewards")}>
          <Text style={styles.smallButtonText}>Rewards</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.rowButtons}>
        <TouchableOpacity style={styles.smallButton} onPress={() => router.push("/profile")}>
          <Text style={styles.smallButtonText}>Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallButton} onPress={() => router.push("/connect")}>
          <Text style={styles.smallButtonText}>Emergency contact</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Recent trips</Text>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.tripRow} onPress={() => router.push(`/trip/${item.id}`)}>
            <View>
              <Text style={styles.tripDate}>{new Date(item.started_at).toLocaleString()}</Text>
              <Text style={styles.tripMeta}>
                {item.distance_km.toFixed(1)} km · {item.events.length} events
                {item.status === "crash_flagged" ? " · ⚠️ crash flagged" : ""}
              </Text>
            </View>
            <Text style={[styles.tripScore, { color: tierColor(item.trip_score ?? 0) }]}>
              {item.trip_score != null ? Math.round(item.trip_score) : "--"}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No trips yet — start your first ride.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", paddingHorizontal: 20, paddingTop: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  greeting: { color: "#fff", fontSize: 22, fontWeight: "700" },
  sub: { color: "#8892A6", fontSize: 13 },
  logout: { color: "#F87171" },
  scoreCard: { backgroundColor: "#161F32", borderRadius: 20, alignItems: "center", paddingVertical: 24, marginBottom: 16 },
  scoreLabel: { color: "#8892A6", letterSpacing: 2, fontSize: 12 },
  scoreValue: { color: "#fff", fontSize: 56, fontWeight: "800" },
  tier: { fontSize: 14, fontWeight: "700", marginTop: 4 },
  startButton: { backgroundColor: "#22C55E", borderRadius: 16, paddingVertical: 20, alignItems: "center", marginBottom: 12 },
  startButtonText: { color: "#06210F", fontWeight: "800", fontSize: 18 },
  rowButtons: { flexDirection: "row", gap: 12, marginBottom: 12 },
  smallButton: { flex: 1, backgroundColor: "#1E2A45", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  smallButtonText: { color: "#fff", fontWeight: "600" },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8, marginTop: 8 },
  tripRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#161F32", borderRadius: 12, padding: 14, marginBottom: 8 },
  tripDate: { color: "#fff", fontWeight: "600" },
  tripMeta: { color: "#8892A6", fontSize: 12, marginTop: 2 },
  tripScore: { fontSize: 22, fontWeight: "800" },
  empty: { color: "#8892A6", textAlign: "center", marginTop: 20 },
});
