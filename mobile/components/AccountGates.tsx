/** Screens that cover the whole app: forced password change and a switched-off account. */
import { useState } from "react";
import { View } from "react-native";
import { useAction } from "convex/react";
import { useSignOut } from "../lib/useSignOut";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { Body, Button, Card, Notice, PasswordField, Screen, Title } from "./ui";
import { colors, space } from "../lib/theme";

export function ForcedPasswordChange() {
  const change = useAction(api.users.forceChangePassword);
  const signOut = useSignOut();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== again) return setError("The passwords do not match.");
    setBusy(true);
    try {
      const r = await change({ newPassword: pw });
      if (!r.success) setError(r.error ?? "Could not change your password.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen>
        <Title>Choose your password</Title>
        <Body muted>You signed in with a temporary password. Choose your own to continue.</Body>
        <Card style={{ gap: space.md }}>
          <PasswordField label="New password" value={pw} onChangeText={setPw} hint="At least 8 characters" />
          <PasswordField label="Confirm password" value={again} onChangeText={setAgain} />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button title="Save password" onPress={submit} loading={busy} />
        </Card>
        <Button title="Sign out" variant="ghost" onPress={() => signOut()} />
      </Screen>
    </SafeAreaView>
  );
}

export function DeactivatedAccount() {
  const signOut = useSignOut();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center" }}>
      <View style={{ padding: space.xl, gap: space.lg }}>
        <Title>Account switched off</Title>
        <Body muted>Your account has been deactivated. Ask your administrator to switch it back on.</Body>
        <Button title="Sign out" onPress={() => signOut()} />
      </View>
    </SafeAreaView>
  );
}
