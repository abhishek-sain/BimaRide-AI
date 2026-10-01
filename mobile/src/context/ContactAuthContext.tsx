import React, { createContext, useContext, useEffect, useState } from "react";
import { api, loadToken, setToken } from "../api/client";
import { registerForPushNotificationsAsync } from "../services/pushNotifications";
import { ContactUser } from "../types";

interface ContactAuthContextValue {
  contact: ContactUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const ContactAuthContext = createContext<ContactAuthContextValue | undefined>(undefined);

async function registerPushToken() {
  // This IS the token that matters for this app — a contact with no push
  // token registered will never receive a crash alert, only see one if
  // they happen to have the app open and poll for it, so this is worth
  // retrying more insistently than the rider side eventually, but for now
  // matches the same best-effort pattern.
  const pushToken = await registerForPushNotificationsAsync();
  if (pushToken) {
    try {
      await api.put("/contact-auth/me/push-token", { push_token: pushToken });
    } catch (e) {
      console.warn("Could not save push token:", e);
    }
  }
}

export function ContactAuthProvider({ children }: { children: React.ReactNode }) {
  const [contact, setContact] = useState<ContactUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    try {
      const me = await api.get<ContactUser>("/contact-auth/me");
      setContact(me);
    } catch {
      setContact(null);
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
    const res = await api.post<{ access_token: string }>("/contact-auth/login", { email, password }, false);
    await setToken(res.access_token);
    await fetchMe();
    registerPushToken();
  }

  async function register(payload: { name: string; email: string; password: string; phone?: string }) {
    const res = await api.post<{ access_token: string }>("/contact-auth/register", payload, false);
    await setToken(res.access_token);
    await fetchMe();
    registerPushToken();
  }

  async function logout() {
    await setToken(null);
    setContact(null);
  }

  return (
    <ContactAuthContext.Provider value={{ contact, loading, login, register, logout }}>
      {children}
    </ContactAuthContext.Provider>
  );
}

export function useContactAuth() {
  const ctx = useContext(ContactAuthContext);
  if (!ctx) throw new Error("useContactAuth must be used within ContactAuthProvider");
  return ctx;
}
