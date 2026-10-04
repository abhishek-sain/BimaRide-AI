import React, { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import OsmMapView from "../components/OsmMapView";
import NearbyPlaces from "../components/NearbyPlaces";
import { api } from "../api/client";
import { useAlarm } from "../services/useAlarm";
import { FallAlertRecord } from "../types";

export default function FallAlertScreen() {
  const router = useRouter();
  const { alertId, riderName } = useLocalSearchParams<{ alertId?: string; riderName?: string }>();
  const { stopped, secondsLeft, stop } = useAlarm();
  const [alert, setAlert] = useState<FallAlertRecord | null>(null);
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    if (!alertId) return;
    try {
      const result = await api.get<FallAlertRecord>(`/safety/${alertId}`);
      setAlert(result);
    } catch (e) {
      console.warn("Could not load fall alert:", e);
    }
  }, [alertId]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 4000);
      return () => clearInterval(timer);
    }, [load])
  );

  const name = riderName ?? alert?.rider_name ?? "A connected rider";
  const riderIsOk = alert?.status === "rider_ok";
  const acknowledged = !!alert?.acknowledged_by?.length;
  const hasLocation = alert?.lat != null && alert?.lon != null;

  React.useEffect(() => {
    if (riderIsOk && !stopped) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderIsOk]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  function openInMaps() {
    if (!hasLocation) return;
    Linking.openURL(`https://maps.google.com/?q=${alert!.lat},${alert!.lon}`);
  }

  async function acknowledge() {
    if (!alertId) return;
    setAcking(true);
    try {
      await api.post(`/safety/${alertId}/ack`);
      stop();
      load();
    } catch (e) {
      console.warn("Could not acknowledge:", e);
    } finally {
      setAcking(false);
    }
  }

  return (
    <View style={styles.container}>
      {riderIsOk ? (
        <View style={[styles.banner, styles.bannerOk]}>
          <Text style={styles.bannerOkTitle}>✅ {name} says they&apos;re OK</Text>
          <Text style={styles.bannerBody}>They confirmed this was a false alarm. The alarm has been stopped.</Text>
        </View>
      ) : (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>🚨 Possible fall detected</Text>
          <Text style={styles.bannerBody}>
            {name}&apos;s phone detected a sudden drop while not on a tracked ride — background fall monitoring, not the ride crash detector.
          </Text>
        </View>
      )}

      <View style={styles.mapWrap}>
        {hasLocation ? (
          <OsmMapView style={StyleSheet.absoluteFill} latitude={alert!.lat!} longitude={alert!.lon!} title={name} pinColor="#EF4444" />
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

      {hasLocation && <NearbyPlaces lat={alert!.lat!} lon={alert!.lon!} />}

      {acknowledged && (
        <Text style={styles.ackNote}>
          ✓ Acknowledged by {alert!.acknowledged_by.map((a) => a.name).join(", ")} — {name} can see this.
        </Text>
      )}

      {!stopped ? (
        <>
          <Text style={styles.countdown}>
            {mm}:{ss}
          </Text>
          {!acknowledged && !riderIsOk && (
            <TouchableOpacity style={styles.ackButton} onPress={acknowledge} disabled={acking}>
              <Text style={styles.ackButtonText}>I&apos;M RESPONDING</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.stopButton} onPress={stop}>
            <Text style={styles.stopButtonText}>STOP ALARM</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {!acknowledged && !riderIsOk && (
            <TouchableOpacity style={styles.ackButton} onPress={acknowledge} disabled={acking}>
              <Text style={styles.ackButtonText}>I&apos;M RESPONDING</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.stopButton} onPress={() => router.replace("/contact-home")}>
            <Text style={styles.stopButtonText}>CLOSE</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", padding: 20, paddingTop: 60 },
  banner: { backgroundColor: "#3B1414", borderRadius: 16, padding: 16, marginBottom: 16 },
  bannerOk: { backgroundColor: "#12301E" },
  bannerTitle: { color: "#F87171", fontSize: 20, fontWeight: "800", marginBottom: 6 },
  bannerOkTitle: { color: "#4ADE80", fontSize: 20, fontWeight: "800", marginBottom: 6 },
  bannerBody: { color: "#fff", fontSize: 14, lineHeight: 20 },
  mapWrap: { flex: 1, borderRadius: 16, overflow: "hidden", marginBottom: 16, backgroundColor: "#161F32" },
  noLocation: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  noLocationText: { color: "#8892A6", textAlign: "center" },
  mapsButton: { backgroundColor: "#1E2A45", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  mapsButtonText: { color: "#fff", fontWeight: "700" },
  ackNote: { color: "#4ADE80", textAlign: "center", marginBottom: 12, fontSize: 13 },
  countdown: {
    color: "#EF4444",
    fontSize: 40,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
    fontVariant: ["tabular-nums"],
  },
  ackButton: { backgroundColor: "#3B82F6", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginBottom: 10 },
  ackButtonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  stopButton: { backgroundColor: "#22C55E", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  stopButtonText: { color: "#06210F", fontWeight: "800", fontSize: 16 },
});
