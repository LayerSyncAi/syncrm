/**
 * Short, non-blocking confirmations ("Payment recorded") that slide in at the
 * top and fade on their own, like the website's toasts. Errors that need a
 * decision still use an alert (lib/useRun.ts).
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "../components/ui";
import { colors, font, radius, space } from "./theme";

type Tone = "success" | "error" | "info";
type Toast = { id: number; tone: Tone; message: string };

let push: ((t: Omit<Toast, "id">) => void) | null = null;
let seq = 0;

export const toast = {
  success: (message: string) => push?.({ tone: "success", message }),
  error: (message: string) => push?.({ tone: "error", message }),
  info: (message: string) => push?.({ tone: "info", message }),
};

const TONE: Record<Tone, { bg: string; icon: "checkmark-circle" | "alert-circle" | "information-circle" }> = {
  success: { bg: colors.brand, icon: "checkmark-circle" },
  error: { bg: colors.danger, icon: "alert-circle" },
  info: { bg: colors.text, icon: "information-circle" },
};

/** Rendered once at the root of the app. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<Toast | null>(null);
  const y = useRef(new Animated.Value(-120)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    push = (t) => {
      clearTimeout(timer.current);
      setCurrent({ ...t, id: ++seq });
    };
    return () => {
      push = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    timer.current = setTimeout(hide, current.tone === "error" ? 4500 : 2600);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  function hide() {
    Animated.timing(y, { toValue: -120, duration: 180, useNativeDriver: true }).start(() => setCurrent(null));
  }

  if (!current) return null;
  const t = TONE[current.tone];
  return (
    <Animated.View
      style={{ position: "absolute", left: space.lg, right: space.lg, top: insets.top + space.sm, transform: [{ translateY: y }], zIndex: 1000, elevation: 8 }}
    >
      <Pressable
        onPress={hide}
        accessibilityRole="alert"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          backgroundColor: t.bg,
          borderRadius: radius.md,
          paddingVertical: space.md,
          paddingHorizontal: space.lg,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Ionicons name={t.icon} size={20} color="#fff" />
        <Text style={{ color: "#fff", fontSize: font.md, fontWeight: "600", flex: 1 }}>{current.message}</Text>
      </Pressable>
    </Animated.View>
  );
}
