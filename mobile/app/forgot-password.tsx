import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Body, Button, Card, Field, Notice, Screen } from "../components/ui";
import { webUrl } from "../lib/convex";
import { space } from "../lib/theme";

/** Emails a reset link; the link opens the website's reset page. */
export default function ForgotPassword() {
  const request = useAction(api.passwordReset.requestPasswordReset);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await request({ email: email.trim().toLowerCase(), baseUrl: webUrl });
    } catch {
      // Same answer either way, so nobody can test which emails have accounts.
    } finally {
      setBusy(false);
      setSent(true);
    }
  };
  return (
    <Screen>
      <Card style={{ gap: space.md }}>
        <Body muted>Enter the email you sign in with. We will send a link to choose a new password.</Body>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        {sent && <Notice tone="success">If that email has an account, a reset link is on its way.</Notice>}
        <Button title="Send reset link" onPress={submit} loading={busy} />
      </Card>
    </Screen>
  );
}
