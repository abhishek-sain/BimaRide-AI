import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Trip } from "../types";
import { tierColor, tierLabel } from "../services/tiers";

const TIERS = [
  { range: "90 – 100", name: "Safe Rider", perks: ["Max reward points", "Priority renewal", "Partner discounts", "Safe Rider badge"] },
  { range: "75 – 89", name: "Good Rider", perks: ["Moderate rewards", "Personalised coaching tips", "Small partner offers"] },
  { range: "60 – 74", name: "Needs Improvement", perks: ["Guided coaching", "Weekly targets", "Micro-rewards on wins"] },
  { range: "< 60", name: "High Risk", perks: ["Safety alerts", "Compulsory tutorial", "Human review flag"] },
];

export default function RewardsScreen() {
  const [latestScore, setLatestScore] = useState<number | null>(null);

  useEffect(() => {
    api.get<Trip[]>("/trips").then((trips) => {
      const scored = trips.find((t) => t.trip_score != null);
      if (scored) setLatestScore(scored.trip_score!);
    }).catch(console.warn);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
      <Text style={styles.heading}>Reward tiers</Text>
      {latestScore != null && (
        <View style={styles.currentCard}>
          <Text style={styles.currentLabel}>Your current tier</Text>
          <Text style={[styles.currentTier, { color: tierColor(latestScore) }]}>{tierLabel(latestScore)}</Text>
          <Text style={styles.currentScore}>{Math.round(latestScore)} / 100</Text>
        </View>
      )}
      {TIERS.map((t) => (
        <View key={t.name} style={styles.tierCard}>
          <View style={styles.tierHeader}>
            <Text style={styles.tierRange}>{t.range}</Text>
            <Text style={styles.tierName}>{t.name}</Text>
          </View>
          {t.perks.map((p) => (
            <Text key={p} style={styles.perk}>• {p}</Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  heading: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 16 },
  currentCard: { backgroundColor: "#161F32", borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 20 },
  currentLabel: { color: "#8892A6", fontSize: 12 },
  currentTier: { fontSize: 20, fontWeight: "800", marginVertical: 4 },
  currentScore: { color: "#fff" },
  tierCard: { backgroundColor: "#161F32", borderRadius: 14, padding: 16, marginBottom: 12 },
  tierHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  tierRange: { color: "#8892A6", fontWeight: "700" },
  tierName: { color: "#fff", fontWeight: "800" },
  perk: { color: "#B7C0D0", marginBottom: 4 },
});
