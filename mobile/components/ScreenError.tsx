/**
 * What a person sees if a screen fails to load: a plain explanation, the
 * server's own message when there is one, and a way to try again or get back
 * to the Hub. Exported as expo-router's ErrorBoundary by the layouts.
 */
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { ErrorBoundaryProps } from "expo-router";
import { getErrorMessage } from "@/lib/errors";
import { Body, Button, Ionicons, Title } from "./ui";
import { colors, space } from "../lib/theme";

export function ScreenError({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();
  const message = getErrorMessage(error, "");
  // Access errors from the server read as reasons, not crashes.
  const denied = /not available to you|access|not found|only|required/i.test(message);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md, backgroundColor: colors.background }}>
      <Ionicons name={denied ? "lock-closed-outline" : "cloud-offline-outline"} size={44} color={colors.faint} />
      <Title style={{ textAlign: "center" }}>{denied ? "You cannot open this" : "This screen did not load"}</Title>
      <Body muted style={{ textAlign: "center" }}>
        {message || "Check your connection and try again."}
      </Body>
      <View style={{ gap: space.sm, alignSelf: "stretch", marginTop: space.md }}>
        {!denied && <Button title="Try again" icon="refresh" onPress={retry} />}
        <Button title="Back to the Hub" variant="secondary" onPress={() => router.replace("/")} />
      </View>
    </View>
  );
}
