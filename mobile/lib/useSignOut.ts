import { useCallback } from "react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { disablePush } from "./push";

/**
 * Sign out everywhere in the app. Drops this phone's push token first, so a
 * shared or handed-back phone stops receiving the last person's alerts.
 */
export function useSignOut() {
  const { signOut } = useAuthActions();
  const unregister = useMutation(api.push.unregisterExpoToken);
  return useCallback(async () => {
    await disablePush(unregister).catch(() => {});
    await signOut();
  }, [signOut, unregister]);
}
