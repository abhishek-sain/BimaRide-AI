import React, { useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import { ProfileUpdatePayload } from "../types";
import {
  isFallDetectionActive,
  requestFallDetectionPermissions,
  startFallDetection,
  stopFallDetection,
} from "../services/fallDetectionService";

function toIntOrUndefined(v: string): number | undefined {
  const n = parseInt(v, 10);
  return v.trim() === "" || Number.isNaN(n) ? undefined : n;
}

function toFloatOrUndefined(v: string): number | undefined {
  const n = parseFloat(v);
  return v.trim() === "" || Number.isNaN(n) ? undefined : n;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { rider, updateProfile, updateMutualAidOptin } = useAuth();
  const [mutualAidBusy, setMutualAidBusy] = useState(false);

  const [fallDetectionOn, setFallDetectionOn] = useState(() => Platform.OS === "android" && isFallDetectionActive());
  const [fallDetectionBusy, setFallDetectionBusy] = useState(false);

  async function toggleFallDetection(value: boolean) {
    setFallDetectionBusy(true);
    try {
      if (value) {
        const permission = await requestFallDetectionPermissions();
        if (!permission.granted) {
          Alert.alert("Can't turn this on", permission.reason ?? "Required permissions were not granted.");
          return;
        }
        const started = await startFallDetection();
        setFallDetectionOn(started);
        if (!started) Alert.alert("Could not start monitoring", "Please try again.");
      } else {
        stopFallDetection();
        setFallDetectionOn(false);
      }
    } finally {
      setFallDetectionBusy(false);
    }
  }

  async function toggleMutualAid(value: boolean) {
    setMutualAidBusy(true);
    try {
      await updateMutualAidOptin(value);
    } catch (e) {
      // revert is implicit: the Switch reads from rider.mutual_aid_optin, which only
      // changes once the request actually succeeds
      console.warn("Could not update mutual aid opt-in:", e);
    } finally {
      setMutualAidBusy(false);
    }
  }

  const [name, setName] = useState(rider?.name ?? "");
  const [phone, setPhone] = useState(rider?.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(rider?.date_of_birth ?? "");
  const [city, setCity] = useState(rider?.city ?? "");

  const [bikeModel, setBikeModel] = useState(rider?.bike_model ?? "");
  const [bikeRegNumber, setBikeRegNumber] = useState(rider?.bike_reg_number ?? "");
  const [bikeYear, setBikeYear] = useState(rider?.bike_year ? String(rider.bike_year) : "");

  const [insurerName, setInsurerName] = useState(rider?.insurer_name ?? "");
  const [policyNumber, setPolicyNumber] = useState(rider?.policy_number ?? "");
  const [idv, setIdv] = useState(rider?.idv != null ? String(rider.idv) : "");
  const [ncbPercent, setNcbPercent] = useState(rider?.ncb_percent != null ? String(rider.ncb_percent) : "");
  const [policyExpiry, setPolicyExpiry] = useState(rider?.policy_expiry ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    const payload: ProfileUpdatePayload = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      date_of_birth: dateOfBirth.trim() || undefined,
      city: city.trim() || undefined,
      bike_model: bikeModel.trim() || undefined,
      bike_reg_number: bikeRegNumber.trim() || undefined,
      bike_year: toIntOrUndefined(bikeYear),
      insurer_name: insurerName.trim() || undefined,
      policy_number: policyNumber.trim() || undefined,
      idv: toFloatOrUndefined(idv),
      ncb_percent: toFloatOrUndefined(ncbPercent),
      policy_expiry: policyExpiry.trim() || undefined,
    };
    try {
      await updateProfile(payload);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Complete your profile</Text>

        <Section title="Personal details">
          <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="Date of birth (YYYY-MM-DD)" value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="1995-06-20" />
          <Field label="City" value={city} onChangeText={setCity} autoCapitalize="words" />
        </Section>

        <Section title="Vehicle">
          <Field label="Bike model" value={bikeModel} onChangeText={setBikeModel} placeholder="Royal Enfield Classic 350" />
          <Field label="Registration number" value={bikeRegNumber} onChangeText={setBikeRegNumber} autoCapitalize="characters" placeholder="KA01AB1234" />
          <Field label="Year" value={bikeYear} onChangeText={setBikeYear} keyboardType="number-pad" placeholder="2022" />
        </Section>

        <Section
          title="Insurance policy"
          note="Reference only — for now, this just displays alongside your Rider Score. It doesn't buy, price, or bind a policy. See the app's README for how this connects to a real insurer."
        >
          <Field label="Insurer name" value={insurerName} onChangeText={setInsurerName} placeholder="e.g. Acme General Insurance" />
          <Field label="Policy number" value={policyNumber} onChangeText={setPolicyNumber} autoCapitalize="characters" />
          <Field label="IDV (Insured Declared Value, ₹)" value={idv} onChangeText={setIdv} keyboardType="numeric" placeholder="85000" />
          <Field label="NCB (No-Claim Bonus, %)" value={ncbPercent} onChangeText={setNcbPercent} keyboardType="numeric" placeholder="20" />
          <Field label="Policy expiry (YYYY-MM-DD)" value={policyExpiry} onChangeText={setPolicyExpiry} placeholder="2027-03-15" />
        </Section>

        {Platform.OS === "android" && (
          <Section
            title="Background fall detection"
            note="Watches for a sudden drop (free-fall followed by impact) even when BimaRide is closed or your phone is locked — not just during a tracked ride. This runs a permanent, low-priority notification (Android requires that for any always-on background monitoring) and needs background location access so a fall can be reported with where it happened. It uses noticeably more battery than normal."
          >
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Always-on fall detection</Text>
              <Switch
                value={fallDetectionOn}
                onValueChange={toggleFallDetection}
                disabled={fallDetectionBusy}
                trackColor={{ false: "#2A3450", true: "#22C55E" }}
                thumbColor="#fff"
              />
            </View>
          </Section>
        )}

        <Section
          title="Mutual aid network"
          note="When someone else's BimaRide crash alert is raised, opted-in riders within ~3 km of the crash get a push notification immediately — alongside the crashed rider's own emergency contact, not instead of them — asking if they can help. Your location is only shared this way while you're on an active ride — not continuously."
        >
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Help nearby riders in emergencies</Text>
            <Switch
              value={rider?.mutual_aid_optin ?? false}
              onValueChange={toggleMutualAid}
              disabled={mutualAidBusy}
              trackColor={{ false: "#2A3450", true: "#22C55E" }}
              thumbColor="#fff"
            />
          </View>
        </Section>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.saveButton} onPress={save} disabled={busy}>
          {busy ? <ActivityIndicator color="#06210F" /> : <Text style={styles.saveButtonText}>Save profile</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {note && <Text style={styles.sectionNote}>{note}</Text>}
      {children}
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "number-pad" | "numeric";
  autoCapitalize?: "none" | "words" | "characters";
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor="#5B6577"
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        keyboardType={props.keyboardType ?? "default"}
        autoCapitalize={props.autoCapitalize ?? "none"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  scroll: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 20 },
  section: { backgroundColor: "#161F32", borderRadius: 16, padding: 16, marginBottom: 16 },
  sectionTitle: { color: "#fff", fontWeight: "700", fontSize: 15, marginBottom: 8 },
  sectionNote: { color: "#8892A6", fontSize: 12, lineHeight: 17, marginBottom: 12 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  switchLabel: { color: "#fff", fontSize: 14, fontWeight: "600", flex: 1, marginRight: 12 },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: { color: "#8892A6", fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: "#0B1220", color: "#fff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  error: { color: "#F87171", textAlign: "center", marginVertical: 8 },
  saveButton: { backgroundColor: "#22C55E", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  saveButtonText: { color: "#06210F", fontWeight: "800", fontSize: 16 },
});
