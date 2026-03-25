"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Label } from "@/components/ui/label";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Badge } from "@/components/ui/badge";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Breadcrumb } from "@/components/ui/breadcrumb";

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

const formatPrice = (price: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
  }
};

export default function ContactMatchingPage() {
  const currentUser = useQuery(api.users.getMeRequired);
  const contactsResult = useQuery(api.contacts.list, currentUser ? {} : "skip");
  const contacts = React.useMemo(() => {
    if (!contactsResult) return [];
    return (contactsResult as any).items ?? (Array.isArray(contactsResult) ? contactsResult : []);
  }, [contactsResult]);

  const [selectedContactId, setSelectedContactId] = React.useState<Id<"contacts"> | "">("");

  const matches = useQuery(
    api.contacts.matchProperties,
    selectedContactId ? { contactId: selectedContactId as Id<"contacts"> } : "skip"
  );

  const selectedContact = contacts.find((c: any) => c._id === selectedContactId);

  if (!currentUser) {
    return <div className="p-6 text-text-muted">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Contacts", href: "/app/contacts" }, { label: "Property Matching" }]} />

      <div>
        <h2 className="text-lg font-semibold">Property Matching</h2>
        <p className="text-sm text-text-muted">
          Select a contact to find properties that match their stored preferences.
        </p>
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Contact</Label>
            <StaggeredDropDown
              value={selectedContactId}
              onChange={(val) => setSelectedContactId(val as Id<"contacts"> | "")}
              options={[
                { value: "", label: "Select a contact..." },
                ...contacts.map((c: any) => ({
                  value: c._id,
                  label: `${c.name}${c.phone ? ` (${c.phone})` : ""}`,
                })),
              ]}
            />
          </div>
          {selectedContact && (
            <div className="space-y-1 text-sm text-text-muted">
              <p><span className="font-medium text-text">Preferences:</span></p>
              {selectedContact.interestType && (
                <p>Interest: <Badge variant="secondary">{selectedContact.interestType}</Badge></p>
              )}
              {selectedContact.preferredAreas?.length > 0 && (
                <p>Areas: {selectedContact.preferredAreas.map((a: string) => (
                  <Badge key={a} variant="secondary" className="mr-1">{a}</Badge>
                ))}</p>
              )}
              {(selectedContact.budgetMin || selectedContact.budgetMax) && (
                <p>Budget: {selectedContact.budgetMin ? formatPrice(selectedContact.budgetMin, selectedContact.budgetCurrency || "USD") : "Any"} - {selectedContact.budgetMax ? formatPrice(selectedContact.budgetMax, selectedContact.budgetCurrency || "USD") : "Any"}</p>
              )}
              {!selectedContact.interestType && !selectedContact.preferredAreas?.length && !selectedContact.budgetMin && !selectedContact.budgetMax && (
                <p className="text-warning">No preferences set. Edit the contact to add preferences.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedContactId && matches !== undefined && (
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          {matches.length === 0 ? (
            <div className="rounded-[12px] border border-border-strong bg-card-bg p-8 text-center text-text-muted">
              No matching properties found. Try updating the contact&apos;s preferences or adding more properties.
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-text-muted">{matches.length} matching {matches.length === 1 ? "property" : "properties"} found</p>
              <Table>
                <thead>
                  <tr>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Listing</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Beds</TableHead>
                    <TableHead>Baths</TableHead>
                    <TableHead>Status</TableHead>
                  </tr>
                </thead>
                <motion.tbody variants={listVariants} initial="hidden" animate="show">
                  {matches.map((property: any) => (
                    <motion.tr
                      key={property._id}
                      variants={rowVariants}
                      className="h-11 border-b border-[rgba(148,163,184,0.1)] transition-all duration-150 hover:bg-row-hover"
                    >
                      <TableCell className="font-medium">{property.title}</TableCell>
                      <TableCell><Badge variant="secondary">{property.type}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{property.listingType}</Badge></TableCell>
                      <TableCell>{formatPrice(property.price, property.currency)}</TableCell>
                      <TableCell>{property.location}</TableCell>
                      <TableCell>{property.bedrooms ?? "-"}</TableCell>
                      <TableCell>{property.bathrooms ?? "-"}</TableCell>
                      <TableCell><Badge variant={property.status === "available" ? "success" : "secondary"}>{property.status}</Badge></TableCell>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </Table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
