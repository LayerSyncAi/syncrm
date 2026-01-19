import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { currentUser, properties } from "@/lib/mock-data";

export default function PropertiesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Properties</h2>
          <p className="text-sm text-text-muted">
            Browse and match inventory across the pipeline.
          </p>
        </div>
        {currentUser.role === "admin" ? (
          <Link href="/app/properties/new">
            <Button>+ New Property</Button>
          </Link>
        ) : null}
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-2">
            <Label>Listing</Label>
            <Select>
              <option>All</option>
              <option>Rent</option>
              <option>Sale</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select>
              <option>All</option>
              <option>Available</option>
              <option>Under offer</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select>
              <option>Any</option>
              <option>House</option>
              <option>Apartment</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input placeholder="Avondale" />
          </div>
          <div className="space-y-2">
            <Label>Price min</Label>
            <Input placeholder="$" />
          </div>
          <div className="space-y-2">
            <Label>Search</Label>
            <Input placeholder="Title" />
          </div>
        </div>
      </div>

      <Table>
        <thead>
          <tr>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Listing</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Area (m²)</TableHead>
            <TableHead>Status</TableHead>
          </tr>
        </thead>
        <tbody>
          {properties.map((property) => (
            <TableRow key={property.id} className="cursor-pointer">
              <TableCell className="font-medium">{property.title}</TableCell>
              <TableCell>{property.type}</TableCell>
              <TableCell>{property.listing}</TableCell>
              <TableCell>{property.price}</TableCell>
              <TableCell>{property.currency}</TableCell>
              <TableCell>{property.location}</TableCell>
              <TableCell className="text-right">{property.area}</TableCell>
              <TableCell>{property.status}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
