import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";

const COUNTDOWN_SECONDS = 15;

interface SosStatus {
  dispatched: boolean;
  contacts_notified: number;
}

export default function SosOverlay({
  alertId,
  onResolved,
}: {
  alertId: string;
  onResolved: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [dispatched, setDispatched] = useState(false);
  const [contactsNotified, setContactsNotified] = useState(0);
  const resolvedRef = useRef(false);

  const dispatch = useCallback(async () => {
    resolvedRef.current = true;
    try {
      const res = await api.post<SosStatus>(`/sos/${alertId}/timeout`, {});
      setContactsNotified(res.contacts_notified);
    } catch (e) {
      console.warn(e);
    }
    setDispatched(true);
  }, [alertId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          if (!resolvedRef.current) dispatch();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [dispatch]);

  async function imOk() {
    resolvedRef.current = true;
    try {
      await api.post(`/sos/${alertId}/confirm`, { confirmed_ok: true });
    } catch (e) {
      console.warn(e);
    }
    onResolved();
  }

  async function needHelp() {
    resolvedRef.current = true;
    try {
      const res = await api.post<SosStatus>(`/sos/${alertId}/confirm`, { confirmed_ok: false });
      setContactsNotified(res.contacts_notified);
    } catch (e) {
      console.warn(e);
    }
    setDispatched(true);
  }

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {!dispatched ? (
            <>
              <Text style={styles.title}>Possible crash detected</Text>
              <Text style={styles.countdown}>{secondsLeft}</Text>
              <Text style={styles.body}>Are you OK? Emergency contacts will be alerted automatically.</Text>
              <TouchableOpacity style={styles.okButton} onPress={imOk}>
                <Text style={styles.okButtonText}>I&apos;M OK</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.helpButton} onPress={needHelp}>
                <Text style={styles.helpButtonText}>I NEED HELP — ALERT NOW</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>
                {contactsNotified > 0 ? "Emergency contacts alerted" : "No emergency contacts alerted"}
              </Text>
              <Text style={styles.body}>
                {contactsNotified > 0
                  ? `Texted your location and last speed to ${contactsNotified} emergency contact${contactsNotified === 1 ? "" : "s"}.`
                  : "No SMS could be sent — add emergency contacts from the home screen so this works next time."}
              </Text>
              <TouchableOpacity style={styles.okButton} onPress={onResolved}>
                <Text style={styles.okButtonText}>CLOSE</Text>
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
  countdown: { color: "#EF4444", fontSize: 56, fontWeight: "800", marginBottom: 12 },
  body: { color: "#8892A6", textAlign: "center", marginBottom: 20 },
  okButton: { backgroundColor: "#22C55E", borderRadius: 12, paddingVertical: 14, width: "100%", alignItems: "center", marginBottom: 10 },
  okButtonText: { color: "#06210F", fontWeight: "800" },
  helpButton: { backgroundColor: "#EF4444", borderRadius: 12, paddingVertical: 14, width: "100%", alignItems: "center" },
  helpButtonText: { color: "#fff", fontWeight: "800" },
});
