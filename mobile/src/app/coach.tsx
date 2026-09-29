import React, { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";

interface ChatMsg {
  role: "rider" | "coach";
  text: string;
}

export default function CoachScreen() {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "coach", text: "Ask me anything about your riding score — I'll ground my answer in your actual numbers." },
  ]);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!question.trim()) return;
    const q = question.trim();
    setMessages((m) => [...m, { role: "rider", text: q }]);
    setQuestion("");
    setBusy(true);
    try {
      const res = await api.post<{ answer: string }>("/coach/ask", { trip_id: tripId, question: q });
      setMessages((m) => [...m, { role: "coach", text: res.answer }]);
    } catch {
      setMessages((m) => [...m, { role: "coach", text: "Sorry, I couldn't reach the coach right now." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>AI Coach</Text>
      <ScrollView style={styles.chat} contentContainerStyle={{ paddingBottom: 20 }}>
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === "rider" ? styles.riderBubble : styles.coachBubble]}>
            <Text style={styles.bubbleText}>{m.text}</Text>
          </View>
        ))}
        {busy && <ActivityIndicator color="#3B82F6" style={{ marginTop: 8 }} />}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Why did my score drop?"
          placeholderTextColor="#5B6577"
          value={question}
          onChangeText={setQuestion}
          onSubmitEditing={ask}
        />
        <TouchableOpacity style={styles.sendButton} onPress={ask}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", padding: 20, paddingTop: 60 },
  heading: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 16 },
  chat: { flex: 1 },
  bubble: { borderRadius: 14, padding: 12, marginBottom: 10, maxWidth: "85%" },
  riderBubble: { backgroundColor: "#3B82F6", alignSelf: "flex-end" },
  coachBubble: { backgroundColor: "#161F32", alignSelf: "flex-start" },
  bubbleText: { color: "#fff" },
  inputRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 20 },
  input: { flex: 1, backgroundColor: "#161F32", color: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  sendButton: { backgroundColor: "#3B82F6", borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  sendButtonText: { color: "#fff", fontWeight: "700" },
});
