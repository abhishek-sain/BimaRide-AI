import React, { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, Vibration, View } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

const ALARM_SOUND = require("../../assets/audio/sos-alarm.wav");

const ALERT_DURATION_MS = 60_000; // 1 minute
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
  const [secondsLeft, setSecondsLeft] = useState(ALERT_DURATION_MS / 1000);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = useAudioPlayer(ALARM_SOUND);
  const status = useAudioPlayerStatus(player);
  const soundStartedRef = useRef(false);

  // useAudioPlayer loads the file asynchronously — calling .play() right
  // after creating the player is a race that can silently do nothing if the
  // file hasn't finished loading yet, which is exactly why only the
  // vibration was ever firing. Starting playback once status.isLoaded
  // flips true (guarded so it only fires once) avoids that race.
  useEffect(() => {
    if (status.error) {
      console.warn("SOS alarm sound failed to load:", status.error);
      return;
    }
    if (status.isLoaded && !soundStartedRef.current) {
      soundStartedRef.current = true;
      (async () => {
        // Without this, iOS silently mutes the siren if the phone's physical
        // silent switch is on — exactly the moment an emergency alert most
        // needs to be audible.
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix" });
        player.loop = true;
        player.volume = 1.0;
        player.play();
      })();
    }
  }, [status.isLoaded, status.error, player]);

  useEffect(() => {
    Vibration.vibrate(VIBRATE_PATTERN, true);

    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    autoStopRef.current = setTimeout(() => {
      Vibration.cancel();
      safePause();
      setStopped(true);
    }, ALERT_DURATION_MS);

    return () => {
      // Belt-and-braces: cancel vibration on unmount too, in case the screen
      // is torn down (e.g. navigating away) before either stop path runs —
      // a vibration left running with no matching cancel would otherwise
      // outlive this component and keep buzzing forever.
      //
      // Deliberately NOT calling player.pause() here: useAudioPlayer
      // releases its native player as part of its own unmount cleanup, and
      // calling .pause() on it from this cleanup races that release —
      // depending on cleanup order, this pause() can land on an
      // already-released native object and crash with "Cannot use shared
      // object that was already released." Unmounting the player already
      // stops the sound; there's nothing left for us to pause.
      Vibration.cancel();
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guards every other pause() call against the same class of race — e.g. a
  // double-tap on the stop button, or the auto-stop timer firing in the
  // narrow window around a teardown — none of which should ever crash the
  // UI over a sound that's already stopped or stopping.
  function safePause() {
    try {
      player.pause();
    } catch (e) {
      console.warn("SOS alarm pause() failed (likely already stopped):", e);
    }
  }

  function stopNow() {
    Vibration.cancel();
    safePause();
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
                Your phone will keep vibrating and sounding an alarm for up to a minute to get your attention, or
                anyone nearby&apos;s.
              </Text>
              <TouchableOpacity style={styles.stopButton} onPress={stopNow}>
                <Text style={styles.stopButtonText}>I&apos;M OK — STOP ALERT</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>Alert stopped</Text>
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
