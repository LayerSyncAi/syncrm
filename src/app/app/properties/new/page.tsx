"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

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

export default function NewPropertyPage() {
  const router = useRouter();
  const [propertyDraft, setPropertyDraft] = React.useState(emptyPropertyDraft);

  const closeModal = () => {
    router.push("/app/properties");
  };

  const handleSave = () => {
    closeModal();
  };

  return (
    <Modal
      open
      title="New Property"
      description="Capture key listing details for matching."
      onClose={closeModal}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={closeModal}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save property</Button>
        </div>
      }
    >
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
    </Modal>
  );
}
