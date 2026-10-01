import React, { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, Vibration, View } from "react-native";

const VIBRATE_DURATION_MS = 60_000; // 1 minute
// 800ms buzz / 400ms pause, repeated. Android honors the custom duration;
// iOS always does a fixed ~400ms buzz per cycle regardless of the number
// given — on both platforms this reads as a continuous, attention-grabbing
// pulse until cancelled or the minute is up.
const VIBRATE_PATTERN = [800, 400];

export default function SosOverlay({
  reason = "crash",
  onResolved,
}: {
  /** "crash" for an auto-detected crash-suspect event, "manual" for the SOS button. */
  reason?: "crash" | "manual";
  onResolved: () => void;
}) {
  const [stopped, setStopped] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(VIBRATE_DURATION_MS / 1000);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Vibration.vibrate(VIBRATE_PATTERN, true);

    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    autoStopRef.current = setTimeout(() => {
      Vibration.cancel();
      setStopped(true);
    }, VIBRATE_DURATION_MS);

    return () => {
      // Belt-and-braces: cancel on unmount too, in case the screen is torn
      // down (e.g. navigating away) before either stop path runs — a
      // vibration call with no matching cancel would otherwise outlive
      // this component and keep buzzing the phone indefinitely.
      Vibration.cancel();
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);

  function stopNow() {
    Vibration.cancel();
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    setStopped(true);
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {!stopped ? (
            <>
              <Text style={styles.title}>
                {reason === "crash" ? "Possible crash detected" : "SOS"}
              </Text>
              <Text style={styles.countdown}>
                {mm}:{ss}
              </Text>
              <Text style={styles.body}>
                Your phone will keep vibrating for up to a minute to get your attention, or anyone nearby&apos;s.
              </Text>
              <TouchableOpacity style={styles.stopButton} onPress={stopNow}>
                <Text style={styles.stopButtonText}>I&apos;M OK — STOP VIBRATING</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>Vibration stopped</Text>
              <Text style={styles.body}>Glad you&apos;re OK.</Text>
              <TouchableOpacity style={styles.stopButton} onPress={onResolved}>
                <Text style={styles.stopButtonText}>CLOSE</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
  card: { backgroundColor: "#161F32", borderRadius: 20, padding: 28, width: "85%", alignItems: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  countdown: { color: "#EF4444", fontSize: 48, fontWeight: "800", marginBottom: 12, fontVariant: ["tabular-nums"] },
  body: { color: "#8892A6", textAlign: "center", marginBottom: 20 },
  stopButton: { backgroundColor: "#22C55E", borderRadius: 12, paddingVertical: 14, width: "100%", alignItems: "center" },
  stopButtonText: { color: "#06210F", fontWeight: "800" },
});
