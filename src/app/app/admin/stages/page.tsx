import { Button } from "@/components/ui/button";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { stages } from "@/lib/mock-data";

export default function StagesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Pipeline Stages</h2>
          <p className="text-sm text-text-muted">
            Configure ordering and terminal outcomes.
          </p>
        </div>
        <Button>Add stage</Button>
      </div>

      <Table>
        <thead>
          <tr>
            <TableHead>Order</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Terminal</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Actions</TableHead>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => (
            <TableRow key={stage.id}>
              <TableCell>{stage.order}</TableCell>
              <TableCell className="font-medium">{stage.name}</TableCell>
              <TableCell>{stage.terminal ? "Yes" : "No"}</TableCell>
              <TableCell>{stage.outcome}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="secondary">Edit</Button>
                  <Button variant="ghost">Move up</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
