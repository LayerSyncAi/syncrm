"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RightDrawer } from "@/components/common/right-drawer";
import { contacts, leads, properties, users } from "@/lib/mock-data";

const tabs = ["Timeline", "Matched Properties", "Notes"] as const;

export function LeadDetail() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>(
    "Timeline"
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [contactDetailsOpen, setContactDetailsOpen] = useState(false);
  const [propertyDetailsOpen, setPropertyDetailsOpen] = useState(false);
  const lead = leads[0];
  const contact = contacts.find((item) => item.id === lead?.contactId);
  const property = properties.find((item) => item.id === lead?.propertyId);
  const owner = users.find((item) => item.id === lead?.ownerId);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">
                {contact?.name ?? "Lead"}
              </h2>
              <Badge className="bg-success/10 text-success">Open</Badge>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-text-muted">
              <span>Owner: {owner?.name ?? "Unassigned"}</span>
              <span>Contact: {contact?.name ?? "Unknown"}</span>
              <span>Property: {property?.title ?? "Not linked"}</span>
              <span>Created: Mar 12, 2025</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="h-9 px-3 text-xs"
                onClick={() => setContactDetailsOpen(true)}
              >
                View contact details
              </Button>
              <Button
                variant="secondary"
                className="h-9 px-3 text-xs"
                onClick={() => setPropertyDetailsOpen(true)}
              >
                View property details
              </Button>
            </div>
          </div>
          <div className="min-w-[200px]">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Stage progress</span>
              <span>52%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-border">
              <div className="h-2 w-[52%] rounded-full bg-primary" />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Select className="max-w-xs">
            <option>Prospect</option>
            <option>Contacted</option>
            <option>Viewing Scheduled</option>
            <option>Negotiation</option>
            <option>Closed Won</option>
            <option>Closed Lost</option>
          </Select>
          <Input placeholder="Close reason (if applicable)" />
        </div>
      </Card>

      <div className="border-b border-border">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`pb-3 text-sm font-medium transition duration-150 ${
                activeTab === tab
                  ? "border-b-2 border-primary text-text"
                  : "text-text-muted"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Timeline" ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Log activity
            </h3>
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Select>
                  <option>Call</option>
                  <option>WhatsApp</option>
                  <option>Email</option>
                  <option>Meeting</option>
                  <option>Viewing</option>
                  <option>Note</option>
                </Select>
                <Input placeholder="Title" />
              </div>
              <Input placeholder="Schedule date/time (optional)" />
              <Textarea />
              <div className="flex justify-end">
                <Button>Save activity</Button>
              </div>
            </div>
          </Card>
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Timeline
            </h3>
            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-[10px] border border-border-strong bg-card-bg/40 p-4"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Viewing scheduled</span>
                    <Badge className="bg-warning/10 text-warning">
                      Upcoming
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-text-muted">
                    Mar 18, 10:00 • Assigned to Tafadzwa
                  </p>
                  <div className="mt-3 flex justify-end">
                    <Button variant="secondary">Mark complete</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "Matched Properties" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Matches
            </h3>
            <Button onClick={() => setDrawerOpen(true)}>Attach Property</Button>
          </div>
          <Card className="p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-[10px] border border-border-strong p-3">
                <div>
                  <p className="text-sm font-medium">Borrowdale Villa</p>
                  <p className="text-xs text-text-muted">Suggested · Sale</p>
                </div>
                <Select
                  className="h-9 px-3 text-xs"
                  defaultValue="suggested"
                >
                  <option>Suggested</option>
                  <option>Requested</option>
                  <option>Viewed</option>
                  <option>Offered</option>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-[10px] border border-border-strong p-3">
                <div>
                  <p className="text-sm font-medium">Avondale Garden Apartment</p>
                  <p className="text-xs text-text-muted">Viewed · Rent</p>
                </div>
                <Select
                  className="h-9 px-3 text-xs"
                  defaultValue="viewed"
                >
                  <option>Suggested</option>
                  <option>Viewed</option>
                  <option>Offered</option>
                </Select>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "Notes" ? (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Lead notes
          </h3>
          <Textarea className="min-h-[180px]" />
          <div className="flex justify-end">
            <Button>Save notes</Button>
          </div>
        </Card>
      ) : null}

      <RightDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Attach property"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button>Attach</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input placeholder="Search property" />
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <label
                key={item}
                className="flex items-center justify-between rounded-[10px] border border-border-strong p-3 text-sm"
              >
                <div>
                  <p className="font-medium">Borrowdale Villa {item}</p>
                  <p className="text-xs text-text-muted">Sale · 280m²</p>
                </div>
                <input type="radio" name="property" />
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <Label>Match type</Label>
            <Select>
              <option>Suggested</option>
              <option>Requested</option>
              <option>Viewed</option>
              <option>Offered</option>
            </Select>
          </div>
        </div>
      </RightDrawer>

      <Modal
        open={contactDetailsOpen}
        title={contact ? `Contact: ${contact.name}` : "Contact details"}
        description="Review the contact details linked to this lead."
        onClose={() => setContactDetailsOpen(false)}
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setContactDetailsOpen(false)}>Close</Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={contact?.name ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={contact?.phone ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={contact?.email ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Owner</Label>
            <Input value={owner?.name ?? "Unassigned"} readOnly />
          </div>
        </div>
      </Modal>

      <Modal
        open={propertyDetailsOpen}
        title={
          property ? `Property: ${property.title}` : "Property details"
        }
        description="Review the property details linked to this lead."
        onClose={() => setPropertyDetailsOpen(false)}
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setPropertyDetailsOpen(false)}>Close</Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Title</Label>
            <Input value={property?.title ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Input value={property?.type ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Listing</Label>
            <Input value={property?.listing ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Price</Label>
            <Input value={property?.price ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Input value={property?.currency ?? ""} readOnly />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Location</Label>
            <Input value={property?.location ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Area (m²)</Label>
            <Input value={property?.area ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Input value={property?.status ?? ""} readOnly />
          </div>
        </div>
      </Modal>
    </div>
  );
}
