/**
 * Wraps a module's screens: when the person's role or the agency's plan does
 * not include the module, they see why straight away instead of a screen that
 * fails to load. The server enforces the same rule on every request.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Ionicons, Loading, Title } from "./ui";
import { useSession } from "../lib/session";
import { MODULES, type ModuleKey } from "../lib/modules";
import { colors, space } from "../lib/theme";

export function ModuleGate({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const router = useRouter();
  const { hub, loading } = useSession();
  // Decide only once we know what the person can open, so a cold start on a
  // deep link never fires the module's queries first.
  if (loading) return <Loading />;
  if (!hub || hub.myModules.includes(module)) return <>{children}</>;
  const onPlan = hub.enabledModules.includes(module);
  const name = MODULES[module].name;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md, backgroundColor: colors.background }}>
      <Ionicons name="lock-closed-outline" size={44} color={colors.faint} />
      <Title style={{ textAlign: "center" }}>{name} is not open to you</Title>
      <Body muted style={{ textAlign: "center" }}>
        {!onPlan
          ? hub.isAdmin
            ? `${name} is not switched on for your agency. Ask LayerSync to add it.`
            : `${name} is not part of your agency's plan.`
          : "Your role does not include it. Ask your administrator to add the right role in Hub admin."}
      </Body>
      <Button title="Back to the Hub" variant="secondary" onPress={() => router.replace("/hub")} style={{ alignSelf: "stretch", marginTop: space.md }} />
    </View>
  );
}
