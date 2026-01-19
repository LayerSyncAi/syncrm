import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { contacts, currentUser, leads, properties, users } from "@/lib/mock-data";

export default function LeadsPage() {
  const contactMap = new Map(contacts.map((contact) => [contact.id, contact]));
  const propertyMap = new Map(
    properties.map((property) => [property.id, property])
  );
  const userMap = new Map(users.map((user) => [user.id, user]));
  const visibleLeads =
    currentUser.role === "admin"
      ? leads
      : leads.filter((lead) => lead.ownerId === currentUser.id);
  const stageOptions = ["Prospect", "Contacted", "Viewing Scheduled", "Negotiation"];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Leads</h2>
          <p className="text-sm text-text-muted">
            Leads link a contact to the property they are interested in.
          </p>
        </div>
        <Link href="/app/leads/new">
          <Button>+ New Lead</Button>
        </Link>
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
          <div className="space-y-2">
            <Label>Stage</Label>
            <Select>
              <option>All stages</option>
              <option>Prospect</option>
              <option>Contacted</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Interest type</Label>
            <Select>
              <option>Rent / Buy</option>
              <option>Rent</option>
              <option>Buy</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Location keyword</Label>
            <Input placeholder="Avondale" />
          </div>
          <div className="space-y-2">
            <Label>Search</Label>
            <Input placeholder="Name, phone" />
          </div>
          {currentUser.role === "admin" ? (
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select>
                <option>All owners</option>
                {users.map((user) => (
                  <option key={user.id}>{user.name}</option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      </div>

      <Table>
        <thead>
          <tr>
            <TableHead>Contact</TableHead>
            <TableHead>Property</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Actions</TableHead>
          </tr>
        </thead>
        <tbody>
          {visibleLeads.map((lead) => {
            const contact = contactMap.get(lead.contactId);
            const property = propertyMap.get(lead.propertyId);
            const owner = userMap.get(lead.ownerId);
            return (
              <TableRow key={lead.id}>
                <TableCell>
                  <Link href={`/app/leads/${lead.id}`} className="font-medium">
                    {contact?.name ?? "Unknown contact"}
                  </Link>
                  <p className="text-xs text-text-muted">
                    {contact?.phone ?? "No phone on file"}
                  </p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">
                    {property?.title ?? "Unknown property"}
                  </p>
                  <p className="text-xs text-text-muted">
                    {property?.location ?? "No location"} ·{" "}
                    {property?.listing ?? "Listing"}
                  </p>
                </TableCell>
                <TableCell>
                  <Select
                    defaultValue={lead.stage}
                    aria-label={`Update stage for ${contact?.name ?? "lead"}`}
                    className="h-9"
                  >
                    {stageOptions.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>{owner?.name ?? "Unassigned"}</TableCell>
                <TableCell>{lead.updated}</TableCell>
                <TableCell>
                  <Link href={`/app/leads/${lead.id}`}>
                    <Button variant="secondary" className="h-9 px-3">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
