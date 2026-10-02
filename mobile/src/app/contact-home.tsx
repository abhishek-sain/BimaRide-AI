import React, { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../api/client";
import { useContactAuth } from "../context/ContactAuthContext";
import { useRole } from "../context/RoleContext";
import { openCrashAlert } from "../services/openCrashAlert";
import { Connection, CrashAlertRecord } from "../types";

export default function ContactHomeScreen() {
  const router = useRouter();
  const { contact, logout } = useContactAuth();
  const { clearRole } = useRole();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeTrips, setActiveTrips] = useState<Record<string, string | null>>({});
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Connection[]>("/connections");
      setConnections(data);

      const accepted = data.filter((c) => c.status === "accepted");
      const entries = await Promise.all(
        accepted.map(async (c) => {
          try {
            const res = await api.get<{ trip_id: string | null }>(`/connections/${c.id}/active-trip`);
            return [c.id, res.trip_id] as const;
          } catch {
            return [c.id, null] as const;
          }
        })
      );
      setActiveTrips(Object.fromEntries(entries));
    } catch (e) {
      console.warn(e);
    }
  }, []);

  // Replay: any unresolved alert from a connected rider that this contact
  // hasn't acknowledged. This is what makes an alert raised while the app
  // was offline, backgrounded, or on this screen (no live socket here) still
  // surface — and the only crash-alert path besides the live map in Expo Go.
  const checkPendingAlerts = useCallback(async () => {
    try {
      const pending = await api.get<CrashAlertRecord[]>("/alerts/pending");
      for (const a of pending) {
        openCrashAlert(router, {
          alert_id: a.id,
          kind: a.kind,
          trip_id: a.trip_id,
          rider_name: a.rider_name,
          lat: a.lat,
          lon: a.lon,
          speed_kmh: a.speed_kmh,
        });
      }
    } catch {
      // offline or transient — next tick
    }
  }, [router]);

  // While this screen is focused, refresh every 5s: "Riding now" status,
  // incoming/accepted connection requests, and pending alerts all stay current
  // without pulling to refresh.
  useFocusEffect(
    useCallback(() => {
      load();
      checkPendingAlerts();
      const timer = setInterval(() => {
        load();
        checkPendingAlerts();
      }, 5000);
      return () => clearInterval(timer);
    }, [load, checkPendingAlerts])
  );

  async function shareCode() {
    if (!contact) return;
    try {
      await Share.share({
        message: `Add me as your emergency contact on BimaRide AI — my connect code is ${contact.connect_code}.`,
      });
    } catch (e) {
      console.warn(e);
    }
  }

  async function requestConnection() {
    if (!code.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api.post("/connections/request", { code: code.trim().toUpperCase() });
      setCode("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the request.");
    } finally {
      setBusy(false);
    }
  }

  async function accept(id: string) {
    try {
      await api.post(`/connections/${id}/accept`);
      await load();
    } catch (e) {
      Alert.alert("Could not accept", e instanceof ApiError ? e.message : String(e));
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/connections/${id}`);
      await load();
    } catch (e) {
      Alert.alert("Could not remove", e instanceof ApiError ? e.message : String(e));
    }
  }

  async function handleLogout() {
    await logout();
    await clearRole();
    router.replace("/choose-role");
  }

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
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi {contact?.name?.split(" ")[0]}</Text>
          <Text style={styles.sub}>Emergency Contact</Text>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logout}>Log out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>YOUR CODE</Text>
        <Text style={styles.code}>{contact?.connect_code}</Text>
        <TouchableOpacity style={styles.shareButton} onPress={shareCode}>
          <Ionicons name="share-outline" size={16} color="#fff" />
          <Text style={styles.shareButtonText}>Share code</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.historyButton} onPress={() => router.push("/alerts")}>
        <Ionicons name="time-outline" size={16} color="#fff" />
        <Text style={styles.historyButtonText}>Alert history</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Connect to a rider</Text>
      <View style={styles.enterRow}>
        <TextInput
          style={styles.input}
          placeholder="Enter their code"
          placeholderTextColor="#5B6577"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
        />
        <TouchableOpacity style={styles.connectButton} onPress={requestConnection} disabled={busy}>
          {busy ? <ActivityIndicator color="#06210F" /> : <Text style={styles.connectButtonText}>Connect</Text>}
        </TouchableOpacity>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.sectionTitle}>Riders</Text>
      {connections.length === 0 && (
        <Text style={styles.empty}>No riders connected yet — enter their code above.</Text>
      )}
      {connections.map((c) => {
        const activeTripId = activeTrips[c.id];
        return (
          <View key={c.id} style={styles.riderCard}>
            <View style={styles.riderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.riderName}>{c.rider_name}</Text>
                <Text style={styles.connectionStatus}>
                  {c.status === "accepted"
                    ? activeTripId
                      ? "🟢 Riding now"
                      : "Connected"
                    : `Pending — ${c.requested_by === "contact" ? "waiting on them" : "waiting on you"}`}
                </Text>
              </View>
              {c.status === "pending" && c.requested_by === "rider" && (
                <TouchableOpacity style={styles.acceptButton} onPress={() => accept(c.id)}>
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => remove(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={18} color="#F87171" />
              </TouchableOpacity>
            </View>
            {activeTripId && (
              <TouchableOpacity
                style={styles.liveButton}
                onPress={() =>
                  router.push(`/contact-live-map?tripId=${activeTripId}&riderName=${encodeURIComponent(c.rider_name)}`)
                }
              >
                <Ionicons name="navigate" size={16} color="#06210F" />
                <Text style={styles.liveButtonText}>View live location</Text>
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  greeting: { color: "#fff", fontSize: 22, fontWeight: "700" },
  sub: { color: "#8892A6", fontSize: 13 },
  logout: { color: "#F87171" },
  codeCard: { backgroundColor: "#161F32", borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 24 },
  codeLabel: { color: "#8892A6", fontSize: 12, letterSpacing: 2 },
  code: { color: "#fff", fontSize: 32, fontWeight: "800", letterSpacing: 4, marginVertical: 8 },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
  },
  shareButtonText: { color: "#fff", fontWeight: "700" },
  historyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#1E2A45",
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 16,
  },
  historyButtonText: { color: "#fff", fontWeight: "600" },
  sectionTitle: { color: "#fff", fontWeight: "700", fontSize: 15, marginBottom: 10, marginTop: 8 },
  enterRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  input: {
    flex: 1,
    backgroundColor: "#161F32",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  connectButton: { backgroundColor: "#22C55E", borderRadius: 10, paddingHorizontal: 18, justifyContent: "center" },
  connectButtonText: { color: "#06210F", fontWeight: "800" },
  error: { color: "#F87171", marginBottom: 8 },
  empty: { color: "#8892A6" },
  riderCard: { backgroundColor: "#161F32", borderRadius: 12, padding: 14, marginBottom: 10 },
  riderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  riderName: { color: "#fff", fontWeight: "700" },
  connectionStatus: { color: "#8892A6", fontSize: 12, marginTop: 2 },
  acceptButton: { backgroundColor: "#22C55E", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  acceptButtonText: { color: "#06210F", fontWeight: "700", fontSize: 12 },
  liveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#22C55E",
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
  },
  liveButtonText: { color: "#06210F", fontWeight: "800" },
});
