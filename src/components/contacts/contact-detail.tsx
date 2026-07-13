"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Pencil,
  Phone,
  Mail,
  Building2,
  User,
  Waypoints,
  FileSignature,
  Home,
  Clock,
  CheckSquare,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { ViewingFormsList } from "@/components/viewings/viewing-forms-list";
import { formatMoney } from "@/lib/currency";
import { leadSourceLabel } from "@/lib/lead-sources";

interface ContactDetailProps {
  contactId: Id<"contacts">;
}

const tabs = [
  "Overview",
  "Lead History",
  "Enquiries",
  "Viewings",
  "Activity",
  "Follow-ups",
] as const;
type Tab = (typeof tabs)[number];

const tabContentVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
} as const;

const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const ACTIVITY_ICON: Record<string, typeof Phone> = {
  call: Phone,
  whatsapp: Mail,
  email: Mail,
  meeting: User,
  viewing: FileSignature,
  note: Clock,
};

export function ContactDetail({ contactId }: ContactDetailProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<Tab>("Overview");
  const profile = useQuery(api.contacts.getProfile, { contactId });

  if (profile === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={User}
          title="Contact not found"
          description="This contact doesn't exist or you don't have access to it."
          action={
            <Button onClick={() => router.push("/app/contacts")}>Back to contacts</Button>
          }
        />
      </div>
    );
  }

  const { contact, leadHistory, activities, enquiries, agentHistory } = profile;
  const notes = activities.filter((a) => a.type === "note" || a.status === "completed");
  const followUps = activities.filter((a) => a.status === "todo");

  const hasPreferences =
    contact.interestType ||
    contact.budgetMin != null ||
    contact.budgetMax != null ||
    (contact.preferredAreas?.length ?? 0) > 0 ||
    (contact.preferredPropertyTypes?.length ?? 0) > 0 ||
    contact.minBedrooms != null ||
    contact.minBathrooms != null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Breadcrumb
          items={[{ label: "Contacts", href: "/app/contacts" }, { label: contact.name }]}
        />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => router.push("/app/contacts")}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push(`/app/contacts?edit=${contact._id}`)}
          >
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </div>
      </div>

      {/* Hero */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {contact.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-text">{contact.name}</h1>
              {contact.company && (
                <p className="flex items-center gap-1.5 text-sm text-text-muted">
                  <Building2 className="h-3.5 w-3.5" /> {contact.company}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-text-muted">
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:text-primary">
                    <Phone className="h-3.5 w-3.5" /> {contact.phone}
                  </a>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:text-primary">
                    <Mail className="h-3.5 w-3.5" /> {contact.email}
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Leads" value={leadHistory.length} />
            <Stat label="Enquiries" value={enquiries.length} />
            <Stat label="Follow-ups" value={followUps.length} />
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative whitespace-nowrap pb-3 text-sm font-medium transition-colors duration-150 ${
                activeTab === tab ? "text-text" : "text-text-muted hover:text-text"
              }`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  layoutId="contact-tab-indicator"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "Overview" && (
          <motion.div key="overview" variants={tabContentVariants} initial="initial" animate="animate" exit="exit" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Contact information */}
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-text">Contact Information</h3>
              <dl className="space-y-2 text-sm">
                <Field label="Name" value={contact.name} />
                <Field label="Phone" value={contact.phone} />
                <Field label="Email" value={contact.email} />
                <Field label="Company" value={contact.company} />
                <Field label="Notes" value={contact.notes} />
              </dl>
            </Card>

            {/* Preferences */}
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-text">Preferences</h3>
              {hasPreferences ? (
                <dl className="space-y-2 text-sm">
                  <Field
                    label="Interest"
                    value={contact.interestType ? (contact.interestType === "rent" ? "Renting" : "Buying") : undefined}
                  />
                  <Field
                    label="Budget"
                    value={
                      contact.budgetMin != null || contact.budgetMax != null
                        ? `${formatMoney(contact.budgetMin ?? 0, contact.budgetCurrency ?? "USD")} – ${formatMoney(contact.budgetMax ?? 0, contact.budgetCurrency ?? "USD")}`
                        : undefined
                    }
                  />
                  <Field label="Preferred areas" value={contact.preferredAreas?.join(", ")} />
                  <Field label="Property types" value={contact.preferredPropertyTypes?.join(", ")} />
                  <Field label="Min bedrooms" value={contact.minBedrooms != null ? String(contact.minBedrooms) : undefined} />
                  <Field label="Min bathrooms" value={contact.minBathrooms != null ? String(contact.minBathrooms) : undefined} />
                </dl>
              ) : (
                <p className="text-sm text-text-muted">
                  No preferences captured yet. These carry over from the contact&apos;s leads.
                </p>
              )}
            </Card>

            {/* Assigned agents / history */}
            <Card className="p-5 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-text">Assigned Agents & Ownership History</h3>
              <div className="flex flex-wrap gap-2">
                {agentHistory.map((a) => (
                  <span
                    key={a._id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-2/40 px-3 py-1 text-xs"
                  >
                    <User className="h-3 w-3" />
                    {a.name}
                    {a.isCurrentOwner && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
                    <span className="text-text-muted">· {a.leadCount} lead{a.leadCount === 1 ? "" : "s"}</span>
                  </span>
                ))}
                {agentHistory.length === 0 && (
                  <p className="text-sm text-text-muted">No agents recorded.</p>
                )}
              </div>
            </Card>
          </motion.div>
        )}

        {activeTab === "Lead History" && (
          <motion.div key="leads" variants={tabContentVariants} initial="initial" animate="animate" exit="exit" className="space-y-3">
            {leadHistory.length === 0 ? (
              <EmptyState icon={Waypoints} title="No leads yet" description="Leads created for this contact will appear here — open or closed." />
            ) : (
              leadHistory.map((lead) => (
                <Link key={lead._id} href={`/app/leads/${lead._id}`}>
                  <Card className="p-4 transition-colors hover:bg-surface-2/40">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-text">{lead.fullName}</p>
                          <Badge variant="secondary" className="text-[10px]">{lead.stageName}</Badge>
                          {lead.isClosed && (
                            <Badge variant="secondary" className="text-[10px]">
                              {lead.closeReason || "Closed"}
                            </Badge>
                          )}
                          {lead.isArchived && <Badge variant="secondary" className="text-[10px]">Archived</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {leadSourceLabel(lead.source)} · {lead.interestType === "rent" ? "Renting" : "Buying"} · {lead.ownerName} · {fmtDate(lead.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        {lead.dealValue != null && (
                          <p className="text-sm font-medium text-emerald-600">
                            {formatMoney(lead.dealValue, lead.dealCurrency ?? "USD")}
                          </p>
                        )}
                        {lead.score != null && <p className="text-xs text-text-muted">Score {lead.score}</p>}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </motion.div>
        )}

        {activeTab === "Enquiries" && (
          <motion.div key="enquiries" variants={tabContentVariants} initial="initial" animate="animate" exit="exit" className="space-y-3">
            {enquiries.length === 0 ? (
              <EmptyState icon={Home} title="No property enquiries" description="Properties this contact has enquired about (across all their leads) show here." />
            ) : (
              enquiries.map((e) => (
                <Card key={e._id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">
                        {e.property?.title ?? "Unknown property"}
                      </p>
                      <p className="text-xs text-text-muted">
                        {e.matchType.charAt(0).toUpperCase() + e.matchType.slice(1)}
                        {e.property ? ` · ${e.property.location}` : ""} · {fmtDate(e.createdAt)}
                      </p>
                    </div>
                    {e.property && (
                      <span className="text-sm text-text-muted">
                        {formatMoney(e.property.price, e.property.currency)}
                      </span>
                    )}
                  </div>
                </Card>
              ))
            )}
          </motion.div>
        )}

        {activeTab === "Viewings" && (
          <motion.div key="viewings" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
            <ViewingFormsList
              contactId={contactId}
              prefill={{
                clientName: contact.name,
                clientPhone: contact.phone ?? undefined,
                clientEmail: contact.email ?? undefined,
              }}
            />
          </motion.div>
        )}

        {activeTab === "Activity" && (
          <motion.div key="activity" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
            {notes.length === 0 ? (
              <EmptyState icon={Clock} title="No activity yet" description="Notes and completed activities across all this contact's leads are preserved here." />
            ) : (
              <div className="space-y-3">
                {notes.map((a) => {
                  const Icon = ACTIVITY_ICON[a.type] ?? Clock;
                  return (
                    <Card key={a._id} className="p-4">
                      <div className="flex gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-muted">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-text">{a.title}</p>
                            <span className="shrink-0 text-xs text-text-muted">{fmtDateTime(a.createdAt)}</span>
                          </div>
                          {a.description && <p className="mt-0.5 text-sm text-text-muted">{a.description}</p>}
                          {a.completionNotes && (
                            <p className="mt-1 rounded bg-surface-2/50 px-2 py-1 text-xs text-text-muted">
                              {a.completionNotes}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-text-muted/70">
                            {a.leadName} · {a.assignedToName}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "Follow-ups" && (
          <motion.div key="followups" variants={tabContentVariants} initial="initial" animate="animate" exit="exit">
            {followUps.length === 0 ? (
              <EmptyState icon={CheckSquare} title="No open follow-ups" description="Outstanding tasks across this contact's leads appear here." />
            ) : (
              <div className="space-y-3">
                {followUps.map((a) => (
                  <Card key={a._id} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text">{a.title}</p>
                        <p className="text-xs text-text-muted">
                          {a.leadName} · {a.assignedToName}
                          {a.scheduledAt ? ` · due ${fmtDateTime(a.scheduledAt)}` : ""}
                        </p>
                      </div>
                      {a.leadId && (
                        <Link href={`/app/leads/${a.leadId}`}>
                          <Button variant="secondary" className="h-8 text-xs">Open lead</Button>
                        </Link>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border-strong bg-surface-2/30 px-3 py-2">
      <p className="text-lg font-semibold text-text">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-text">{value || "—"}</dd>
    </div>
  );
}
