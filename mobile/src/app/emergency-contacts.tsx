import React, { useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

const MAX_CONTACTS = 5;

interface ContactDraft {
  name: string;
  phone: string;
}

export default function EmergencyContactsScreen() {
  const router = useRouter();
  const { rider, updateEmergencyContacts } = useAuth();
  const [contacts, setContacts] = useState<ContactDraft[]>(
    rider?.emergency_contacts?.length ? rider.emergency_contacts.map((c) => ({ ...c })) : [{ name: "", phone: "" }]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateContact(index: number, field: keyof ContactDraft, value: string) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addContact() {
    if (contacts.length >= MAX_CONTACTS) {
      Alert.alert("Limit reached", `You can save up to ${MAX_CONTACTS} emergency contacts.`);
      return;
    }
    setContacts((prev) => [...prev, { name: "", phone: "" }]);
  }

  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setError(null);
    // Drop fully-empty rows (e.g. an unused trailing "+ Add contact" row)
    // before validating, so the user isn't blocked by a blank they never filled in.
    const cleaned = contacts.map((c) => ({ name: c.name.trim(), phone: c.phone.trim() })).filter((c) => c.name || c.phone);

    for (const c of cleaned) {
      if (!c.name || !c.phone) {
        setError("Every contact needs both a name and a phone number.");
        return;
      }
    }

    setBusy(true);
    try {
      await updateEmergencyContacts(cleaned);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save your emergency contacts.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Emergency contacts</Text>
        <Text style={styles.subtitle}>
          If a crash is detected — or you tap the SOS button — every contact below is texted your location and last
          recorded speed automatically, with no action needed from you.
        </Text>

        {contacts.map((contact, index) => (
          <View key={index} style={styles.contactCard}>
            <View style={styles.contactFields}>
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor="#5B6577"
                value={contact.name}
                onChangeText={(v) => updateContact(index, "name", v)}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.input}
                placeholder="Phone number, e.g. +1 555 123 4567"
                placeholderTextColor="#5B6577"
                value={contact.phone}
                onChangeText={(v) => updateContact(index, "phone", v)}
                keyboardType="phone-pad"
              />
            </View>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeContact(index)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={20} color="#F87171" />
            </TouchableOpacity>
          </View>
        ))}

        {contacts.length < MAX_CONTACTS && (
          <TouchableOpacity style={styles.addButton} onPress={addContact}>
            <Ionicons name="add" size={18} color="#3B82F6" />
            <Text style={styles.addButtonText}>Add another contact</Text>
          </TouchableOpacity>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.saveButton} onPress={save} disabled={busy}>
          {busy ? <ActivityIndicator color="#06210F" /> : <Text style={styles.saveButtonText}>Save contacts</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  scroll: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  subtitle: { color: "#8892A6", fontSize: 13, marginBottom: 24, lineHeight: 18 },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161F32",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  contactFields: { flex: 1, gap: 8 },
  input: { backgroundColor: "#0B1220", color: "#fff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  removeButton: { padding: 6 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, justifyContent: "center" },
  addButtonText: { color: "#3B82F6", fontWeight: "600" },
  error: { color: "#F87171", textAlign: "center", marginVertical: 8 },
  saveButton: { backgroundColor: "#22C55E", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 16 },
  saveButtonText: { color: "#06210F", fontWeight: "800", fontSize: 16 },
});
