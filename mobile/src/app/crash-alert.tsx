import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useAlarm } from "../services/useAlarm";

export default function CrashAlertScreen() {
  const router = useRouter();
  const { riderName, lat, lon, speedKmh, tripId } = useLocalSearchParams<{
    riderName?: string;
    lat?: string;
    lon?: string;
    speedKmh?: string;
    tripId?: string;
  }>();
  const { stopped, secondsLeft, stop } = useAlarm();

  const latNum = lat ? parseFloat(lat) : null;
  const lonNum = lon ? parseFloat(lon) : null;
  const hasLocation = latNum != null && lonNum != null && !Number.isNaN(latNum) && !Number.isNaN(lonNum);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  function openInMaps() {
    if (!hasLocation) return;
    Linking.openURL(`https://maps.google.com/?q=${latNum},${lonNum}`);
  }

  function close() {
    router.replace(tripId ? `/contact-live-map?tripId=${tripId}&riderName=${encodeURIComponent(riderName ?? "")}` : "/contact-home");
  }

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>🚨 Crash alert</Text>
        <Text style={styles.bannerBody}>
          {riderName ?? "A connected rider"} may have been in a crash
          {speedKmh ? ` — last recorded speed ${Math.round(parseFloat(speedKmh))} km/h.` : "."}
        </Text>
      </View>

      <View style={styles.mapWrap}>
        {hasLocation ? (
          <MapView
            style={StyleSheet.absoluteFill}
            region={{ latitude: latNum!, longitude: lonNum!, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          >
            <Marker coordinate={{ latitude: latNum!, longitude: lonNum! }} title={riderName ?? "Rider"} pinColor="#EF4444" />
          </MapView>
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

      {!stopped ? (
        <>
          <Text style={styles.countdown}>
            {mm}:{ss}
          </Text>
          <TouchableOpacity style={styles.stopButton} onPress={stop}>
            <Text style={styles.stopButtonText}>STOP ALERT</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.stopButton} onPress={close}>
          <Text style={styles.stopButtonText}>CLOSE</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", padding: 20, paddingTop: 60 },
  banner: { backgroundColor: "#3B1414", borderRadius: 16, padding: 16, marginBottom: 16 },
  bannerTitle: { color: "#F87171", fontSize: 20, fontWeight: "800", marginBottom: 6 },
  bannerBody: { color: "#fff", fontSize: 14, lineHeight: 20 },
  mapWrap: { flex: 1, borderRadius: 16, overflow: "hidden", marginBottom: 16, backgroundColor: "#161F32" },
  noLocation: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  noLocationText: { color: "#8892A6", textAlign: "center" },
  mapsButton: { backgroundColor: "#1E2A45", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 16 },
  mapsButtonText: { color: "#fff", fontWeight: "700" },
  countdown: {
    color: "#EF4444",
    fontSize: 40,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
    fontVariant: ["tabular-nums"],
  },
  stopButton: { backgroundColor: "#22C55E", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  stopButtonText: { color: "#06210F", fontWeight: "800", fontSize: 16 },
});
