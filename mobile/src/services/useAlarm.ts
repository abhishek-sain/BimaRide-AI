import { useEffect, useRef, useState } from "react";
import { Vibration } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

const ALARM_SOUND = require("../../assets/audio/sos-alarm.wav");

const ALERT_DURATION_MS = 60_000; // 1 minute
// 800ms buzz / 400ms pause, repeated. Android honors the custom duration;
// iOS always does a fixed ~400ms buzz per cycle regardless of the number
// given — on both platforms this reads as a continuous, attention-grabbing
// pulse until cancelled or the minute is up.
const VIBRATE_PATTERN = [800, 400];

/**
 * Continuous vibration + looping siren for up to a minute, with a manual
 * stop. Shared by the rider's own SOS overlay and the emergency contact's
 * crash-alert screen — same alert, same "don't crash on stop" lessons
 * learned the first time this was built, just a different UI around it.
 */
export function useAlarm() {
  const [stopped, setStopped] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(ALERT_DURATION_MS / 1000);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = useAudioPlayer(ALARM_SOUND);
  const status = useAudioPlayerStatus(player);
  const soundStartedRef = useRef(false);

  // useAudioPlayer loads the file asynchronously — calling .play() right
  // after creating the player is a race that can silently do nothing if the
  // file hasn't finished loading yet. Starting playback once status.isLoaded
  // flips true (guarded so it only fires once) avoids that race.
  //
  // expo-audio's AudioPlayer is an imperative, native-backed handle —
  // setting `.loop`/`.volume` and calling `.play()`/`.pause()` is its
  // documented API, not React-managed state. react-hooks/immutability
  // doesn't know that and flags any mutation of a hook's return value, so
  // it's disabled for this effect and safePause() below rather than chased
  // across every call site it reports from.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    if (status.error) {
      console.warn("Alarm sound failed to load:", status.error);
      return;
    }
    if (status.isLoaded && !soundStartedRef.current) {
      soundStartedRef.current = true;
      (async () => {
        // Without this, iOS silently mutes the siren if the phone's physical
        // silent switch is on — exactly the moment an alert most needs to
        // be audible.
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix" });
        player.loop = true;
        player.volume = 1.0;
        player.play();
      })();
    }
  }, [status.isLoaded, status.error, player]);

  // Guards every pause() call against a native-bridge race with
  // useAudioPlayer's own unmount cleanup — see stop()'s comment.
  function safePause() {
    try {
      player.pause();
    } catch (e) {
      console.warn("Alarm pause() failed (likely already stopped):", e);
    }
  }

  function stop() {
    Vibration.cancel();
    safePause();
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    setStopped(true);
  }
  /* eslint-enable react-hooks/immutability */

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
      // is torn down (e.g. navigating away) before either stop path runs.
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

  return { stopped, secondsLeft, stop };
}
