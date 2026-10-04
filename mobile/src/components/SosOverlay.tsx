import React from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import NearbyPlaces from "./NearbyPlaces";
import { useAlarm } from "../services/useAlarm";
import { useAlertStatus } from "../services/useAlertStatus";

export default function SosOverlay({
  reason = "crash",
  alertId,
  lat,
  lon,
  onImOk,
  onResolved,
}: {
  /** "crash" for an auto-detected crash-suspect event, "manual" for the SOS button. */
  reason?: "crash" | "manual";
  /** The backend alert this raised, once known — lets us show who acknowledged it. */
  alertId?: string | null;
  /** Last known GPS fix at the moment of the crash — lets the rider themselves
   * see nearby hospitals/garages without waiting for anyone else to look. */
  lat?: number | null;
  lon?: number | null;
  /** Called when the rider taps "I'm OK", so contacts can be told. */
  onImOk?: () => void;
  onResolved: () => void;
}) {
  const { stopped, secondsLeft, stop } = useAlarm();
  const alert = useAlertStatus(alertId);
  const ackedBy = alert?.acknowledged_by?.map((a) => a.name) ?? [];

  function imOk() {
    stop();
    onImOk?.();
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const hasLocation = lat != null && lon != null;

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Scrollable: NearbyPlaces can expand into a results list, and the
              STOP/I'M OK button below it must stay reachable either way. */}
          <ScrollView contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator={false}>
            {!stopped ? (
              <>
                <Text style={styles.title}>{reason === "crash" ? "Possible crash detected" : "SOS"}</Text>
                <Text style={styles.countdown}>
                  {mm}:{ss}
                </Text>
                <Text style={styles.body}>
                  Your phone will keep vibrating and sounding an alarm for up to a minute to get your attention, or
                  anyone nearby&apos;s.
                </Text>
                {ackedBy.length > 0 && (
                  <Text style={styles.ack}>✓ {ackedBy.join(", ")} acknowledged — help is aware</Text>
                )}
                {hasLocation && (
                  <View style={styles.nearbyWrap}>
                    <NearbyPlaces lat={lat!} lon={lon!} />
                  </View>
                )}
                <TouchableOpacity style={styles.stopButton} onPress={imOk}>
                  <Text style={styles.stopButtonText}>I&apos;M OK — STOP ALERT</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.title}>Alert stopped</Text>
                <Text style={styles.body}>{alertId ? "Glad you're OK. Your emergency contacts have been told." : "Glad you're OK."}</Text>
                <TouchableOpacity style={styles.stopButton} onPress={onResolved}>
                  <Text style={styles.stopButtonText}>CLOSE</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
  card: { backgroundColor: "#161F32", borderRadius: 20, padding: 28, width: "85%", maxHeight: "80%" },
  cardContent: { alignItems: "center" },
  nearbyWrap: { width: "100%", marginBottom: 6 },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  countdown: { color: "#EF4444", fontSize: 48, fontWeight: "800", marginBottom: 12, fontVariant: ["tabular-nums"] },
  body: { color: "#8892A6", textAlign: "center", marginBottom: 20 },
  ack: { color: "#4ADE80", textAlign: "center", marginBottom: 14, fontWeight: "600" },
  stopButton: { backgroundColor: "#22C55E", borderRadius: 12, paddingVertical: 14, width: "100%", alignItems: "center" },
  stopButtonText: { color: "#06210F", fontWeight: "800" },
});
