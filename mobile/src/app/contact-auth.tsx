import React from "react";
import { useRouter } from "expo-router";
import AuthForm from "../components/AuthForm";
import { useContactAuth } from "../context/ContactAuthContext";
import { useRole } from "../context/RoleContext";

export default function ContactAuthScreen() {
  const { login, register } = useContactAuth();
  const { clearRole } = useRole();
  const router = useRouter();

  return (
    <AuthForm
      title="BimaRide AI"
      subtitle="Emergency Contact — follow a rider's trips and get alerted if something goes wrong."
      registerLabel="New here? Create an account"
      onLogin={login}
      onRegister={register}
      onBack={async () => {
        await clearRole();
        router.replace("/choose-role");
      }}
    />
  );
}
