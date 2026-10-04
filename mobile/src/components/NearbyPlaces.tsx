import React, { useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import { NearbyPlace } from "../types";

const KIND_ICON: Record<string, string> = { hospital: "🏥", police: "🚓", garage: "🔧" };

export default function NearbyPlaces({ lat, lon }: { lat: number; lon: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState<NearbyPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    if (places || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<NearbyPlace[]>(`/places/nearby?lat=${lat}&lon=${lon}&kind=all`);
      setPlaces(result);
    } catch (e: any) {
      setError(e?.message ?? "Could not load nearby places.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.toggle} onPress={() => (open ? setOpen(false) : load())}>
        <Text style={styles.toggleText}>
          {open ? "▲ Hide nearby hospitals, police & garages" : "▼ Nearby hospitals, police & garages"}
        </Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.list}>
          {loading && <ActivityIndicator color="#3B82F6" style={{ marginVertical: 10 }} />}
          {error && <Text style={styles.error}>{error}</Text>}
          {!loading && !error && places?.length === 0 && (
            <Text style={styles.empty}>Nothing found within 5 km of the alert location.</Text>
          )}
          {/* Capped height + internal scroll: this sits above the alarm's
              STOP/I'M RESPONDING buttons on crash-alert.tsx, which must
              never be pushed off-screen by a long results list. */}
          <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
            {places?.map((p, i) => (
              <TouchableOpacity
                key={`${p.kind}-${i}`}
                style={styles.row}
                onPress={() => Linking.openURL(`https://maps.google.com/?q=${p.lat},${p.lon}(${encodeURIComponent(p.name)})`)}
              >
                <Text style={styles.icon}>{KIND_ICON[p.kind] ?? "📍"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.meta}>{p.distance_km.toFixed(1)} km away · {p.kind}</Text>
                </View>
                <Text style={styles.go}>Go ›</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  toggle: { paddingVertical: 10 },
  toggleText: { color: "#3B82F6", fontWeight: "700", fontSize: 13, textAlign: "center" },
  list: { backgroundColor: "#161F32", borderRadius: 12, padding: 8 },
  error: { color: "#F87171", textAlign: "center", padding: 10 },
  empty: { color: "#8892A6", textAlign: "center", padding: 10, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, gap: 10 },
  icon: { fontSize: 20 },
  name: { color: "#fff", fontWeight: "600", fontSize: 14 },
  meta: { color: "#8892A6", fontSize: 12, marginTop: 1 },
  go: { color: "#3B82F6", fontWeight: "700", fontSize: 13 },
});
