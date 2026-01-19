"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { currentUser, properties } from "@/lib/mock-data";

const emptyPropertyDraft = {
  title: "",
  type: "",
  listing: "",
  price: "",
  currency: "",
  location: "",
  area: "",
  status: "",
};

type Property = (typeof properties)[number];

export default function PropertiesPage() {
  const [selectedProperty, setSelectedProperty] = React.useState<Property | null>(
    null
  );
  const [propertyDraft, setPropertyDraft] = React.useState(emptyPropertyDraft);
  const [viewMode, setViewMode] = React.useState<"list" | "cards">("list");

  React.useEffect(() => {
    if (selectedProperty) {
      setPropertyDraft({
        title: selectedProperty.title,
        type: selectedProperty.type,
        listing: selectedProperty.listing,
        price: selectedProperty.price,
        currency: selectedProperty.currency,
        location: selectedProperty.location,
        area: selectedProperty.area,
        status: selectedProperty.status,
      });
    }
  }, [selectedProperty]);

  const closeModal = () => {
    setSelectedProperty(null);
    setPropertyDraft(emptyPropertyDraft);
  };

  const handleSave = () => {
    closeModal();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Properties</h2>
          <p className="text-sm text-text-muted">
            Browse and match inventory across the pipeline.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-[12px] border border-border-strong bg-card-bg p-1">
            <Button
              variant={viewMode === "list" ? "primary" : "ghost"}
              className="h-8 px-3"
              onClick={() => setViewMode("list")}
            >
              List
            </Button>
            <Button
              variant={viewMode === "cards" ? "primary" : "ghost"}
              className="h-8 px-3"
              onClick={() => setViewMode("cards")}
            >
              Cards
            </Button>
          </div>
          {currentUser.role === "admin" ? (
            <Link href="/app/properties/new">
              <Button>+ New Property</Button>
            </Link>
          ) : null}
        </div>
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

      {viewMode === "list" ? (
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
              <TableHead className="text-right">Action</TableHead>
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
                <TableCell className="text-right">
                  <Button
                    variant="secondary"
                    className="h-9 px-3"
                    onClick={() => setSelectedProperty(property)}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {properties.map((property) => (
            <Card key={property.id} className="flex h-full flex-col">
              <div className="aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-border-strong bg-muted">
                <img
                  src={property.images[0]}
                  alt={`${property.title} cover`}
                  className="h-full w-full object-cover"
                />
              </div>
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-text-muted">
                      {property.listing} • {property.type}
                    </p>
                    <h3 className="text-base font-semibold">
                      {property.title}
                    </h3>
                  </div>
                  <span className="rounded-full border border-border-strong px-2 py-1 text-xs text-text-muted">
                    {property.status}
                  </span>
                </div>
                <div className="text-sm font-medium">
                  {property.price} {property.currency}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <div className="grid gap-2 text-sm text-text-muted">
                  <div className="flex items-center justify-between gap-2 text-text">
                    <span className="text-text-muted">Location</span>
                    <span>{property.location}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-text">
                    <span className="text-text-muted">Area</span>
                    <span>{property.area} m²</span>
                  </div>
                </div>
                <div className="mt-auto flex justify-end">
                  <Button
                    variant="secondary"
                    className="h-9 px-3"
                    onClick={() => setSelectedProperty(property)}
                  >
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selectedProperty)}
        title={
          selectedProperty ? `Property: ${selectedProperty.title}` : "Property"
        }
        description="Review the listing details and make updates as needed."
        onClose={closeModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save changes</Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <Label>Images</Label>
            <div className="grid gap-3 md:grid-cols-3">
              {(selectedProperty?.images ?? []).map((image, index) => (
                <div
                  key={`${selectedProperty?.id ?? "property"}-image-${index}`}
                  className="aspect-[4/3] w-full overflow-hidden rounded-[10px] border border-border-strong bg-muted"
                >
                  <img
                    src={image}
                    alt={`${selectedProperty?.title ?? "Property"} image ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Title</Label>
              <Input
                value={propertyDraft.title}
                onChange={(event) =>
                  setPropertyDraft((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={propertyDraft.type}
                onChange={(event) =>
                  setPropertyDraft((prev) => ({
                    ...prev,
                    type: event.target.value,
                  }))
                }
              >
                <option value="House">House</option>
                <option value="Apartment">Apartment</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Listing</Label>
              <Select
                value={propertyDraft.listing}
                onChange={(event) =>
                  setPropertyDraft((prev) => ({
                    ...prev,
                    listing: event.target.value,
                  }))
                }
              >
                <option value="Sale">Sale</option>
                <option value="Rent">Rent</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Price</Label>
              <Input
                value={propertyDraft.price}
                onChange={(event) =>
                  setPropertyDraft((prev) => ({
                    ...prev,
                    price: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select
                value={propertyDraft.currency}
                onChange={(event) =>
                  setPropertyDraft((prev) => ({
                    ...prev,
                    currency: event.target.value,
                  }))
                }
              >
                <option value="USD">USD</option>
                <option value="ZWL">ZWL</option>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Location</Label>
              <Input
                value={propertyDraft.location}
                onChange={(event) =>
                  setPropertyDraft((prev) => ({
                    ...prev,
                    location: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Area (m²)</Label>
              <Input
                value={propertyDraft.area}
                onChange={(event) =>
                  setPropertyDraft((prev) => ({
                    ...prev,
                    area: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={propertyDraft.status}
                onChange={(event) =>
                  setPropertyDraft((prev) => ({
                    ...prev,
                    status: event.target.value,
                  }))
                }
              >
                <option value="Available">Available</option>
                <option value="Under Offer">Under Offer</option>
              </Select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
