"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Badge } from "@/components/ui/badge";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { PaginationControls } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { CurrencyInput } from "@/components/ui/currency-input";

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

export default function ContactSegmentsPage() {
  const currentUser = useQuery(api.users.getMeRequired);
  const locations = useQuery(api.locations.list);
  const pagination = usePagination(50);

  // Filter state
  const [interestType, setInterestType] = React.useState<"rent" | "buy" | "">("");
  const [propertyType, setPropertyType] = React.useState("");
  const [area, setArea] = React.useState("");
  const [budgetCurrency, setBudgetCurrency] = React.useState("USD");
  const [budgetMin, setBudgetMin] = React.useState("");
  const [budgetMax, setBudgetMax] = React.useState("");
  const [minBedrooms, setMinBedrooms] = React.useState("");
  const [includeHistorical, setIncludeHistorical] = React.useState(true);

  // Build query args — only include set filters
  const queryArgs = React.useMemo(() => {
    const args: Record<string, unknown> = {
      includeHistorical,
      page: pagination.page > 0 ? pagination.page : undefined,
      pageSize: pagination.pageSize !== 50 ? pagination.pageSize : undefined,
    };
    if (interestType) args.interestType = interestType;
    if (propertyType) args.propertyType = propertyType;
    if (area) args.area = area;
    if (budgetMin) args.budgetMin = parseFloat(budgetMin);
    if (budgetMax) args.budgetMax = parseFloat(budgetMax);
    if (minBedrooms) args.minBedrooms = parseInt(minBedrooms, 10);
    return args;
  }, [interestType, propertyType, area, budgetMin, budgetMax, minBedrooms, includeHistorical, pagination.page, pagination.pageSize]);

  const result = useQuery(
    api.contacts.segmentedList,
    currentUser ? queryArgs as any : "skip"
  );

  const contacts = result?.items ?? [];
  const totalCount = result?.totalCount ?? 0;
  const hasMore = result?.hasMore ?? false;

  const clearFilters = () => {
    setInterestType("");
    setPropertyType("");
    setArea("");
    setBudgetMin("");
    setBudgetMax("");
    setMinBedrooms("");
    setIncludeHistorical(true);
  };

  if (!currentUser) {
    return <div className="p-6 text-text-muted">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Contacts", href: "/app/contacts" }, { label: "Segmentation" }]} />

      <div>
        <h2 className="text-lg font-semibold">Contact Segmentation</h2>
        <p className="text-sm text-text-muted">
          Target contacts by their stored preferences and historical lead interests for campaigning and property matching.
        </p>
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Interest Type</Label>
            <StaggeredDropDown
              value={interestType}
              onChange={(val) => setInterestType(val as "rent" | "buy" | "")}
              options={[
                { value: "", label: "Any" },
                { value: "rent", label: "Rent" },
                { value: "buy", label: "Buy" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label>Property Type</Label>
            <StaggeredDropDown
              value={propertyType}
              onChange={setPropertyType}
              options={[
                { value: "", label: "Any" },
                { value: "house", label: "House" },
                { value: "apartment", label: "Apartment" },
                { value: "land", label: "Land" },
                { value: "commercial", label: "Commercial" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label>Area / Location</Label>
            <StaggeredDropDown
              value={area}
              onChange={setArea}
              options={[
                { value: "", label: "Any" },
                ...(locations?.map((loc) => ({ value: loc.name, label: loc.name })) ?? []),
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label>Min Bedrooms</Label>
            <Input
              type="number"
              min="0"
              value={minBedrooms}
              onChange={(e) => setMinBedrooms(e.target.value)}
              placeholder="Any"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Budget Min</Label>
            <CurrencyInput
              value={budgetMin}
              onChange={setBudgetMin}
              currency={budgetCurrency}
              onCurrencyChange={setBudgetCurrency}
              placeholder="Min"
            />
          </div>
          <div className="space-y-2">
            <Label>Budget Max</Label>
            <CurrencyInput
              value={budgetMax}
              onChange={setBudgetMax}
              currency={budgetCurrency}
              onCurrencyChange={setBudgetCurrency}
              placeholder="Max"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeHistorical}
              onChange={(e) => setIncludeHistorical(e.target.checked)}
              className="rounded border-border-strong"
            />
            Include historical lead interests
          </label>
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      </div>

      <p className="text-sm text-text-muted">
        {totalCount} contact{totalCount !== 1 ? "s" : ""} match your criteria
      </p>

      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        <Table>
          <thead>
            <tr>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Interest</TableHead>
              <TableHead>Areas</TableHead>
              <TableHead>Owners</TableHead>
              {includeHistorical && <TableHead>Historical</TableHead>}
            </tr>
          </thead>
          {contacts.length === 0 ? (
            <tbody>
              <TableRow>
                <TableCell colSpan={includeHistorical ? 7 : 6} className="text-center text-text-muted">
                  {result === undefined ? "Loading..." : "No contacts match the current filters."}
                </TableCell>
              </TableRow>
            </tbody>
          ) : (
            <motion.tbody variants={listVariants} initial="hidden" animate="show" key={JSON.stringify(queryArgs)}>
              {contacts.map((contact: any) => (
                <motion.tr
                  key={contact._id}
                  variants={rowVariants}
                  className="h-11 border-b border-[rgba(148,163,184,0.1)] transition-all duration-150 hover:bg-row-hover"
                >
                  <TableCell className="font-medium">{contact.name}</TableCell>
                  <TableCell>{contact.phone || "-"}</TableCell>
                  <TableCell>{contact.email || "-"}</TableCell>
                  <TableCell>
                    {contact.interestType ? (
                      <Badge variant="secondary">{contact.interestType}</Badge>
                    ) : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contact.preferredAreas?.slice(0, 2).map((a: string) => (
                        <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>
                      ))}
                      {(contact.preferredAreas?.length ?? 0) > 2 && (
                        <Badge variant="secondary" className="text-xs">+{contact.preferredAreas.length - 2}</Badge>
                      )}
                      {!contact.preferredAreas?.length && "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contact.ownerNames?.slice(0, 2).map((n: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">{n}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  {includeHistorical && (
                    <TableCell>
                      {contact.historicalInterests ? (
                        <div className="flex flex-wrap gap-1">
                          {contact.historicalInterests.interestTypes?.map((t: string) => (
                            <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                          ))}
                          {contact.historicalInterests.areas?.slice(0, 2).map((a: string) => (
                            <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-text-muted text-xs">No lead history</span>
                      )}
                    </TableCell>
                  )}
                </motion.tr>
              ))}
            </motion.tbody>
          )}
        </Table>
      </div>

      <PaginationControls
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalCount={totalCount}
        hasMore={hasMore}
        onNextPage={pagination.nextPage}
        onPrevPage={pagination.prevPage}
      />
    </div>
  );
}
