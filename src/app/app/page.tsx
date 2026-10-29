"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";

/**
 * Where every sign-in lands: each role opens on its own page (HB-51). Signed
 * out or with no organisation in scope (platform staff), the Hub decides.
 */
export default function AppIndex() {
  const router = useRouter();
  const hub = useQuery(api.hub.getContext);

  useEffect(() => {
    if (hub === undefined) return;
    router.replace(hub?.landingHref ?? "/app/hub");
  }, [hub, router]);

  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
    </div>
  );
}
