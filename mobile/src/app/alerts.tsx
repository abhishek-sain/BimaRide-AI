import React, { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { CrashAlertRecord } from "../types";

const STATUS: Record<CrashAlertRecord["status"], { label: string; color: string }> = {
  open: { label: "Unresolved", color: "#F87171" },
  acknowledged: { label: "Acknowledged", color: "#60A5FA" },
  rider_ok: { label: "Rider is OK", color: "#4ADE80" },
};

/** Alert history, for both account types: a rider sees their own alerts, a
 * contact sees every connected rider's. Same endpoint, scoped server-side. */
export default function AlertsScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<CrashAlertRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setAlerts(await api.get<CrashAlertRecord[]>("/alerts"));
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}
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
    >
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color="#8892A6" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Alert history</Text>

      {alerts.length === 0 && <Text style={styles.empty}>No alerts yet.</Text>}
      {alerts.map((a) => {
        const st = STATUS[a.status];
        const hasLoc = a.lat != null && a.lon != null;
        return (
          <View key={a.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.kind}>{a.kind === "manual" ? "🆘 SOS" : "🚨 Crash"} · {a.rider_name}</Text>
              <Text style={[styles.status, { color: st.color }]}>{st.label}</Text>
            </View>
            <Text style={styles.meta}>
              {new Date(a.created_at + "Z").toLocaleString()}
              {a.speed_kmh != null ? ` · ${Math.round(a.speed_kmh)} km/h` : ""}
            </Text>
            {a.acknowledged_by.length > 0 && (
              <Text style={styles.meta}>✓ Acknowledged by {a.acknowledged_by.map((x) => x.name).join(", ")}</Text>
            )}
            {a.rider_ok_at && <Text style={styles.meta}>Rider said they were OK</Text>}
            {hasLoc && (
              <TouchableOpacity onPress={() => Linking.openURL(`https://maps.google.com/?q=${a.lat},${a.lon}`)}>
                <Text style={styles.link}>View location →</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  back: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backText: { color: "#8892A6", marginLeft: 2 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 16 },
  empty: { color: "#8892A6" },
  card: { backgroundColor: "#161F32", borderRadius: 12, padding: 14, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  kind: { color: "#fff", fontWeight: "700", flex: 1 },
  status: { fontWeight: "700", fontSize: 12 },
  meta: { color: "#8892A6", fontSize: 12, marginTop: 2 },
  link: { color: "#60A5FA", marginTop: 8, fontWeight: "600" },
});
