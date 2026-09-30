import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-hide a revealed password when the app leaves the foreground, so a
  // plaintext password isn't left on screen in the OS app-switcher preview
  // or captured by a background screenshot/recording.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") setShowPassword(false);
    });
    return () => sub.remove();
  }, []);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register({ name: name.trim(), email: email.trim(), password });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>BimaRide AI</Text>
      <Text style={styles.subtitle}>Price the ride, not just the rider.</Text>

      {mode === "register" && (
        <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#5B6577" value={name} onChangeText={setName} autoCapitalize="words" />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#5B6577"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <View style={styles.passwordWrap}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          placeholderTextColor="#5B6577"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword((v) => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#8892A6" />
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mode === "login" ? "Log in" : "Create account"}</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setMode(mode === "login" ? "register" : "login")}>
        <Text style={styles.switch}>{mode === "login" ? "New rider? Create an account" : "Already have an account? Log in"}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#0B1220" },
  title: { fontSize: 32, fontWeight: "800", color: "#fff", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#8892A6", textAlign: "center", marginBottom: 32 },
  input: { backgroundColor: "#161F32", color: "#fff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, fontSize: 16 },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161F32",
    borderRadius: 12,
    marginBottom: 12,
  },
  passwordInput: { flex: 1, color: "#fff", paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  eyeButton: { paddingHorizontal: 14, paddingVertical: 14 },
  button: { backgroundColor: "#3B82F6", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  switch: { color: "#8892A6", textAlign: "center", marginTop: 20 },
  error: { color: "#F87171", textAlign: "center", marginBottom: 8 },
});
