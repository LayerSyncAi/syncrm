import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function NewPropertyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">New Property</h2>
        <p className="text-sm text-text-muted">
          Capture key listing details for matching.
        </p>
      </div>
      <Card className="p-5 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Title</Label>
            <Input placeholder="Listing title" />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select>
              <option>House</option>
              <option>Apartment</option>
              <option>Land</option>
              <option>Commercial</option>
              <option>Other</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Listing type</Label>
            <Select>
              <option>Sale</option>
              <option>Rent</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Price</Label>
            <Input placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Input placeholder="USD" />
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input placeholder="Avondale, Harare" />
          </div>
          <div className="space-y-2">
            <Label>Area (m²)</Label>
            <Input placeholder="120" />
          </div>
          <div className="space-y-2">
            <Label>Bedrooms</Label>
            <Input placeholder="3" />
          </div>
          <div className="space-y-2">
            <Label>Bathrooms</Label>
            <Input placeholder="2" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Status</Label>
            <Select>
              <option>Available</option>
              <option>Under offer</option>
              <option>Let</option>
              <option>Sold</option>
              <option>Off market</option>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea className="min-h-[140px]" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button>Save property</Button>
        </div>
      </Card>
    </div>
  );
}
