import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { contacts, currentUser, users } from "@/lib/mock-data";

export default function ContactsPage() {
  const userMap = new Map(users.map((user) => [user.id, user]));
  const visibleContacts =
    currentUser.role === "admin"
      ? contacts
      : contacts.filter((contact) => contact.ownerId === currentUser.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Contacts</h2>
          <p className="text-sm text-text-muted">
            Contacts are the people you engage, separate from property-specific
            leads.
          </p>
        </div>
        <Button>+ New Contact</Button>
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Search</Label>
            <Input placeholder="Name, phone, email" />
          </div>
          <div className="space-y-2">
            <Label>Engagement</Label>
            <Select>
              <option>All contacts</option>
              <option>Active</option>
              <option>Inactive</option>
            </Select>
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
            <TableHead>Email</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </tr>
        </thead>
        <tbody>
          {visibleContacts.map((contact) => (
            <TableRow key={contact.id} className="cursor-pointer">
              <TableCell>
                <p className="font-medium">{contact.name}</p>
              </TableCell>
              <TableCell>{contact.phone}</TableCell>
              <TableCell>{contact.email}</TableCell>
              <TableCell>{userMap.get(contact.ownerId)?.name ?? "Unassigned"}</TableCell>
              <TableCell className="text-right">
                <Button variant="secondary" className="h-9 px-3">
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
