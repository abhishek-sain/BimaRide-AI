import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRole } from "../context/RoleContext";

export default function ChooseRoleScreen() {
  const { chooseRole } = useRole();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BimaRide AI</Text>
      <Text style={styles.subtitle}>How will you be using the app?</Text>

      <TouchableOpacity style={styles.card} onPress={() => chooseRole("rider")}>
        <Text style={styles.cardEmoji}>🏍️</Text>
        <Text style={styles.cardTitle}>I&apos;m a Rider</Text>
        <Text style={styles.cardBody}>
          Track your rides, get a safety score, and share your live location and crash alerts with someone you
          trust.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => chooseRole("contact")}>
        <Text style={styles.cardEmoji}>🛡️</Text>
        <Text style={styles.cardTitle}>I&apos;m an Emergency Contact</Text>
        <Text style={styles.cardBody}>
          Connect to a rider using their code. See when they start a ride, follow their live location, and get an
          immediate alert if a crash is detected.
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", padding: 24, paddingTop: 100 },
  title: { color: "#fff", fontSize: 32, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#8892A6", fontSize: 14, textAlign: "center", marginBottom: 40 },
  card: { backgroundColor: "#161F32", borderRadius: 20, padding: 24, marginBottom: 20 },
  cardEmoji: { fontSize: 36, marginBottom: 12 },
  cardTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8 },
  cardBody: { color: "#8892A6", fontSize: 14, lineHeight: 20 },
});
