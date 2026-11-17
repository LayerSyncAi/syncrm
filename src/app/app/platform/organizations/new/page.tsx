"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { OrganizationWizard } from "@/components/platform/onboarding/organization-wizard";

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
    </div>
  );
}

function NewOrganization() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isLoading } = useAuth();
  const demo = params.get("demo") === "1";

  useEffect(() => {
    if (!isLoading && user && !user.isPlatformAdmin) router.replace("/app/hub");
  }, [isLoading, user, router]);

  if (isLoading || !user?.isPlatformAdmin) return <Spinner />;
  // Keyed so switching between "New organisation" and "New demo org" starts fresh.
  return <OrganizationWizard key={demo ? "demo" : "org"} demo={demo} />;
}

/** Platform onboarding: create an organisation (or a demo one with `?demo=1`). */
export default function NewOrganizationPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NewOrganization />
    </Suspense>
  );
}
