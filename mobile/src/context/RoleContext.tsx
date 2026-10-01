import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

export type AccountRole = "rider" | "contact";

const ROLE_KEY = "bimaride_account_role";

interface RoleContextValue {
  role: AccountRole | null;
  loading: boolean;
  chooseRole: (role: AccountRole) => Promise<void>;
  clearRole: () => Promise<void>;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<AccountRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync(ROLE_KEY);
      if (stored === "rider" || stored === "contact") setRole(stored);
      setLoading(false);
    })();
  }, []);

  async function chooseRole(next: AccountRole) {
    await SecureStore.setItemAsync(ROLE_KEY, next);
    setRole(next);
  }

  async function clearRole() {
    await SecureStore.deleteItemAsync(ROLE_KEY);
    setRole(null);
  }

  return (
    <RoleContext.Provider value={{ role, loading, chooseRole, clearRole }}>{children}</RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
