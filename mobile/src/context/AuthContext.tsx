import React, { createContext, useContext, useEffect, useState } from "react";
import { api, loadToken, setToken } from "../api/client";
import { Rider } from "../types";

interface AuthContextValue {
  rider: Rider | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [rider, setRider] = useState<Rider | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMe() {
    try {
      const me = await api.get<Rider>("/auth/me");
      setRider(me);
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
  }

  async function register(payload: { name: string; email: string; password: string; phone?: string }) {
    const res = await api.post<{ access_token: string }>("/auth/register", payload, false);
    await setToken(res.access_token);
    await fetchMe();
  }

  async function logout() {
    await setToken(null);
    setRider(null);
  }

  return (
    <AuthContext.Provider value={{ rider, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
