"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RightDrawer } from "@/components/common/right-drawer";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useState } from "react";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { users } from "@/lib/mock-data";

export default function UsersPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-text-muted">Manage access and roles.</p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>Create user</Button>
      </div>

      <Table>
        <thead>
          <tr>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Active</TableHead>
            <TableHead>Actions</TableHead>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.role}</TableCell>
              <TableCell>{user.active ? "Yes" : "No"}</TableCell>
              <TableCell>
                <Button variant="secondary">
                  {user.active ? "Disable" : "Enable"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
      <RightDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Create user"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button>Create user</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input placeholder="Full name" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input placeholder="email@agency.com" />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select>
              <option>Agent</option>
              <option>Admin</option>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <input type="checkbox" defaultChecked />
            <span>Active</span>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
