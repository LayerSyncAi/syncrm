/** Renders children for agency admins only, so their queries never run for anyone else. */
import type { ReactNode } from "react";
import { EmptyState, Loading } from "../ui";
import { useSession } from "../../lib/session";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { loading, user, hub } = useSession();
  if (loading) return <Loading />;
  if (user?.role !== "admin" && !hub?.isAdmin) {
    return <EmptyState icon="lock-closed-outline" title="Admins only" message="Ask an admin if you need this." />;
  }
  return <>{children}</>;
}
