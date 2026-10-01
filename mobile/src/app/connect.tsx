import React, { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Connection } from "../types";

export default function ConnectScreen() {
  const router = useRouter();
  const { rider } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Connection[]>("/connections");
      setConnections(data);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function shareCode() {
    if (!rider) return;
    try {
      await Share.share({
        message: `Add me as a rider on BimaRide AI so you can see my live location and get a crash alert — my connect code is ${rider.connect_code}.`,
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

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color="#8892A6" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Emergency contact</Text>
      <Text style={styles.subtitle}>
        Connect with someone you trust so they can see when you start a ride, follow your live location, and get an
        immediate alert if a crash is detected.
      </Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>YOUR CODE</Text>
        <Text style={styles.code}>{rider?.connect_code}</Text>
        <TouchableOpacity style={styles.shareButton} onPress={shareCode}>
          <Ionicons name="share-outline" size={16} color="#fff" />
          <Text style={styles.shareButtonText}>Share code</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Have their code?</Text>
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

      <Text style={styles.sectionTitle}>Connections</Text>
      {connections.length === 0 && <Text style={styles.empty}>No connections yet.</Text>}
      {connections.map((c) => (
        <View key={c.id} style={styles.connectionRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.connectionName}>{c.contact_name}</Text>
            <Text style={styles.connectionStatus}>
              {c.status === "accepted" ? "Connected" : `Pending — ${c.requested_by === "rider" ? "waiting on them" : "waiting on you"}`}
            </Text>
          </View>
          {c.status === "pending" && c.requested_by === "contact" && (
            <TouchableOpacity style={styles.acceptButton} onPress={() => accept(c.id)}>
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => remove(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color="#F87171" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", padding: 20, paddingTop: 60 },
  back: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backText: { color: "#8892A6", marginLeft: 2 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 6 },
  subtitle: { color: "#8892A6", fontSize: 13, lineHeight: 18, marginBottom: 20 },
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
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161F32",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  connectionName: { color: "#fff", fontWeight: "700" },
  connectionStatus: { color: "#8892A6", fontSize: 12, marginTop: 2 },
  acceptButton: { backgroundColor: "#22C55E", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  acceptButtonText: { color: "#06210F", fontWeight: "700", fontSize: 12 },
});
