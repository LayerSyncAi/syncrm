import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { tasks } from "@/lib/mock-data";

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Upcoming Tasks</h2>
        <p className="text-sm text-text-muted">
          Scheduled activities assigned to you.
        </p>
      </div>

      <Table>
        <thead>
          <tr>
            <TableHead>Date/Time</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Actions</TableHead>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell>{task.date}</TableCell>
              <TableCell className="font-medium">{task.title}</TableCell>
              <TableCell>{task.lead}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Link href="/app/leads/lead-1">
                    <Button variant="secondary">Open Lead</Button>
                  </Link>
                  <Button variant="ghost">Mark complete</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
