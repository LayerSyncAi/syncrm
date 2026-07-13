"use client";

import { use } from "react";
import { ContactDetail } from "@/components/contacts/contact-detail";
import { Id } from "../../../../../convex/_generated/dataModel";

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = use(params);
  return <ContactDetail contactId={contactId as Id<"contacts">} />;
}
