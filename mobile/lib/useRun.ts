import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { getErrorMessage } from "@/lib/errors";

/**
 * Wrap a mutation or action call: tracks `busy`, shows the server's message
 * in an alert on failure, and returns the result (or undefined on failure).
 */
export function useRun() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, opts?: { success?: string }): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (opts?.success) Alert.alert(opts.success);
      return r;
    } catch (e) {
      Alert.alert("Could not complete that", getErrorMessage(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

/** Ask before a destructive or irreversible action. Resolves true on confirm. */
export function confirm(title: string, message: string, confirmLabel = "Confirm", destructive = false): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ]);
  });
}
