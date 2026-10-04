import React, { createContext, useContext, useEffect, useState } from "react";
import { api, loadToken, setToken } from "../api/client";
import { registerForPushNotificationsAsync } from "../services/pushNotifications";
import { refreshFallDetectionToken } from "../services/fallDetectionService";
import { ProfileUpdatePayload, Rider } from "../types";

async function registerPushToken() {
  const pushToken = await registerForPushNotificationsAsync();
  if (pushToken) {
    try {
      await api.put("/auth/me/push-token", { push_token: pushToken });
    } catch (e) {
      console.warn("Could not save push token:", e);
    }
  }
}

interface AuthContextValue {
  rider: Rider | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateEmergencyContacts: (contacts: { name: string; phone: string }[]) => Promise<void>;
  updateProfile: (payload: ProfileUpdatePayload) => Promise<void>;
  updateMutualAidOptin: (optIn: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [rider, setRider] = useState<Rider | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    try {
      const me = await api.get<Rider>("/auth/me");
      setRider(me);
      // Background fall detection's native service caches the bearer
      // token on-device so it keeps working with the app closed — JWTs
      // expire after 7 days, so refresh that cache on every app open
      // rather than leaving a long-running service stuck with a stale one.
      refreshFallDetectionToken();
    } catch {
      setRider(null);
    }
  }

  useEffect(() => {
    (async () => {
      const token = await loadToken();
      if (token) await fetchMe();
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ access_token: string }>("/auth/login", { email, password }, false);
    await setToken(res.access_token);
    await fetchMe();
    registerPushToken(); // fire-and-forget: a rider without push set up can still do everything else
  }

  async function register(payload: { name: string; email: string; password: string; phone?: string }) {
    const res = await api.post<{ access_token: string }>("/auth/register", payload, false);
    await setToken(res.access_token);
    await fetchMe();
    registerPushToken();
  }

  async function logout() {
    await setToken(null);
    setRider(null);
  }

  async function updateEmergencyContacts(contacts: { name: string; phone: string }[]) {
    const updated = await api.put<Rider>("/auth/me/emergency-contacts", { contacts });
    setRider(updated);
  }

  async function updateProfile(payload: ProfileUpdatePayload) {
    const updated = await api.put<Rider>("/auth/me", payload);
    setRider(updated);
  }

  async function updateMutualAidOptin(optIn: boolean) {
    const updated = await api.put<Rider>("/mutual-aid/optin", { opt_in: optIn });
    setRider(updated);
  }

  return (
    <AuthContext.Provider
      value={{ rider, loading, login, register, logout, updateEmergencyContacts, updateProfile, updateMutualAidOptin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
