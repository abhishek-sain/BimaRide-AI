import React from "react";
import { useRouter } from "expo-router";
import AuthForm from "../components/AuthForm";
import { useAuth } from "../context/AuthContext";
import { useRole } from "../context/RoleContext";

export default function AuthScreen() {
  const { login, register } = useAuth();
  const { clearRole } = useRole();
  const router = useRouter();

  return (
    <AuthForm
      title="BimaRide AI"
      subtitle="Price the ride, not just the rider."
      registerLabel="New rider? Create an account"
      onLogin={login}
      onRegister={register}
      onBack={async () => {
        await clearRole();
        router.replace("/choose-role");
      }}
    />
  );
}
