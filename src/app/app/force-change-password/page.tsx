"use client";

import { useRouter } from "next/navigation";
import { ForceChangePasswordCard } from "@/components/auth/force-change-password-card";

export default function ForceChangePasswordPage() {
  const router = useRouter();
  return <ForceChangePasswordCard onChanged={() => router.replace("/app/hub")} />;
}
