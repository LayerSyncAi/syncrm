import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { Body, Button, Card, Field, Notice, PasswordField, Screen, Title } from "../components/ui";
import { colors, space } from "../lib/theme";

/**
 * Sign in with the same email and password as the website. There is no
 * sign-up in the app: agencies are set up on the website, and landlords and
 * tenants are invited by their agency.
 */
export default function SignIn() {
  const { signIn } = useAuthActions();
  const recordLogin = useMutation(api.logs.recordLogin);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    try {
      await signIn("password", { email: email.trim().toLowerCase(), password, flow: "signIn" });
      recordLogin().catch(() => {});
      router.replace("/");
    } catch {
      setError("That email and password do not match.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brand }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Screen style={{ backgroundColor: colors.brand }} contentStyle={{ justifyContent: "center", flexGrow: 1 }}>
          <View style={{ alignItems: "center", gap: space.sm, marginBottom: space.md }}>
            <Image source={require("../assets/images/icon.png")} style={{ width: 72, height: 72, borderRadius: 16 }} />
            <Title style={{ color: "#fff" }}>Sync Estate</Title>
            <Body style={{ color: "#dfe9dc" }}>One login for every module</Body>
          </View>
          <Card style={{ gap: space.md }}>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
            <PasswordField label="Password" value={password} onChangeText={setPassword} textContentType="password" onSubmitEditing={submit} />
            {error && <Notice tone="danger">{error}</Notice>}
            <Button title="Sign in" onPress={submit} loading={busy} />
            <Button title="Forgot your password?" variant="ghost" onPress={() => router.push("/forgot-password")} />
          </Card>
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
