import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function NewLeadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Create Lead</h2>
        <p className="text-sm text-text-muted">
          Quick capture for new opportunities.
        </p>
      </div>
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input placeholder="Client name" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input placeholder="+263" />
          </div>
          <div className="space-y-2">
            <Label>Email (optional)</Label>
            <Input placeholder="name@email.com" />
          </div>
          <div className="space-y-2">
            <Label>Interest type</Label>
            <Select>
              <option>Rent</option>
              <option>Buy</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Budget min</Label>
            <Input placeholder="$" />
          </div>
          <div className="space-y-2">
            <Label>Budget max</Label>
            <Input placeholder="$" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Source</Label>
            <Select>
              <option>Walk-in</option>
              <option>Referral</option>
              <option>Facebook</option>
              <option>WhatsApp</option>
              <option>Website</option>
              <option>Property portal</option>
              <option>Other</option>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Preferred areas</Label>
            <Input placeholder="Add suburbs separated by commas" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Notes</Label>
            <Textarea />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button>Save lead</Button>
        </div>
      </Card>
    </div>
  );
}
