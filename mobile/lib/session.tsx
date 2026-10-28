/**
 * Who is signed in and what they can open, from the same queries the website
 * uses (users.getMe and hub.getContext). Every screen reads it from here.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

type Hub = NonNullable<ReturnType<typeof useHubQuery>>;
function useHubQuery(enabled: boolean) {
  return useQuery(api.hub.getContext, enabled ? {} : "skip");
}

type Session = {
  /** Still working out who is signed in. */
  loading: boolean;
  signedIn: boolean;
  user: Doc<"users"> | null;
  hub: Hub | null;
  /** Signed in, but the account was switched off. */
  deactivated: boolean;
  isPortal: boolean;
  isPlatformOnly: boolean;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.getMe, isAuthenticated ? {} : "skip");
  const status = useQuery(api.users.getAccountStatus, isAuthenticated && user === null ? {} : "skip");
  const staff = !!user && !user.portalKind && (!!user.orgId || !!user.platformViewOrgId);
  const hub = useHubQuery(staff);
  const loading = isLoading || (isAuthenticated && (user === undefined || (staff && hub === undefined)));
  const value: Session = {
    loading,
    signedIn: isAuthenticated,
    user: user ?? null,
    hub: hub ?? null,
    deactivated: status === "deactivated",
    isPortal: !!user?.portalKind,
    isPlatformOnly: !!user?.isPlatformAdmin && !user.orgId && !user.platformViewOrgId,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used inside SessionProvider");
  return s;
}
