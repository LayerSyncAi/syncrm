import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { currentUser, leads, users } from "@/lib/mock-data";

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Leads</h2>
          <p className="text-sm text-text-muted">
            Contact book and pipeline overview.
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
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Updated</TableHead>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <TableRow key={lead.id} className="cursor-pointer">
              <TableCell>
                <Link href={`/app/leads/${lead.id}`} className="font-medium">
                  {lead.name}
                </Link>
              </TableCell>
              <TableCell>{lead.phone}</TableCell>
              <TableCell>{lead.stage}</TableCell>
              <TableCell>{lead.updated}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
