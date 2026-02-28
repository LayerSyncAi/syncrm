"use client";

import React, { useState, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ImageUpload } from "@/components/ui/image-upload";
import { DocumentManager } from "@/components/documents/document-manager";

const viewPropertyTabs = ["Details", "Documentation", "Gallery"] as const;
type ViewPropertyTab = (typeof viewPropertyTabs)[number];

interface PropertyData {
  _id: Id<"properties">;
  title: string;
  type: string;
  listingType: string;
  price: number;
  currency: string;
  location: string;
  area: number;
  bedrooms?: number;
  bathrooms?: number;
  status: string;
  description: string;
  images: string[];
}

interface PropertyViewModalProps {
  open: boolean;
  property: PropertyData | null | undefined;
  propertyId: string | null;
  onClose: () => void;
}

export const PropertyViewModal = React.memo(function PropertyViewModal({
  open,
  property,
  propertyId,
  onClose,
}: PropertyViewModalProps) {
  const [activeTab, setActiveTab] = useState<ViewPropertyTab>("Details");

  const handleClose = () => {
    setActiveTab("Details");
    onClose();
  };

  return (
    <Modal
      open={open}
      title={property ? `Property: ${property.title}` : "Loading property..."}
      description="Read-only view of property details."
      onClose={handleClose}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={handleClose}>Close</Button>
        </div>
      }
    >
      {property ? (
        <div className="space-y-5">
          <div className="border-b border-border">
            <div className="flex gap-6 relative">
              {viewPropertyTabs.map((tab) => (
                <button
                  key={tab}
                  className={`relative pb-3 text-sm font-medium transition-colors duration-150 ${
                    activeTab === tab ? "text-text" : "text-text-muted hover:text-text"
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                  {activeTab === tab && (
                    <motion.div
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                      layoutId="view-property-tab-indicator"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "Details" && (
              <motion.div
                key="details"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                className="space-y-6"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label className="flex items-center gap-1">Title <span className="text-danger">*</span></Label>
                    <Input value={property.title} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <StaggeredDropDown
                      value={property.type}
                      onChange={() => {}}
                      disabled
                      options={[
                        { value: "house", label: "House" },
                        { value: "apartment", label: "Apartment" },
                        { value: "land", label: "Land" },
                        { value: "commercial", label: "Commercial" },
                        { value: "other", label: "Other" },
                      ]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Listing</Label>
                    <StaggeredDropDown
                      value={property.listingType}
                      onChange={() => {}}
                      disabled
                      options={[
                        { value: "sale", label: "Sale" },
                        { value: "rent", label: "Rent" },
                      ]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Price <span className="text-danger">*</span></Label>
                    <CurrencyInput
                      value={property.price.toString()}
                      onChange={() => {}}
                      currency={property.currency}
                      onCurrencyChange={() => {}}
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Location <span className="text-danger">*</span></Label>
                    <Input value={property.location} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">Area (m²) <span className="text-danger">*</span></Label>
                    <Input value={property.area?.toString() || "-"} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Bedrooms</Label>
                    <Input value={property.bedrooms?.toString() || "-"} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Bathrooms</Label>
                    <Input value={property.bathrooms?.toString() || "-"} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <StaggeredDropDown
                      value={property.status}
                      onChange={() => {}}
                      disabled
                      options={[
                        { value: "available", label: "Available" },
                        { value: "under_offer", label: "Under Offer" },
                        { value: "let", label: "Let" },
                        { value: "sold", label: "Sold" },
                        { value: "off_market", label: "Off Market" },
                      ]}
                    />
                  </div>
                </div>
                {property.description && (
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={property.description} readOnly />
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "Documentation" && (
              <motion.div
                key="documentation"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
              >
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    </div>
                  }
                >
                  <DocumentManager
                    propertyId={propertyId as Id<"properties">}
                    folders={["mandates_to_sell", "contracts", "id_copies", "proof_of_funds"]}
                  />
                </Suspense>
              </motion.div>
            )}

            {activeTab === "Gallery" && (
              <motion.div
                key="gallery"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                className="space-y-2"
              >
                <Label className="flex items-center gap-1">Images <span className="text-danger">*</span></Label>
                <ImageUpload
                  images={(property.images || []).map((url: string) => ({ url }))}
                  onChange={() => {}}
                  minImages={2}
                  maxImages={10}
                  disabled
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      )}
    </Modal>
  );
});
