"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { CurrencyInput } from "@/components/ui/currency-input";
import { parseCurrencyInput } from "@/lib/currency";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { ImageUpload, ImageItem, serializeImages, deserializeImages } from "@/components/ui/image-upload";
import { propertyToasts } from "@/lib/toast";
import { DocumentManager } from "@/components/documents/document-manager";
import { PropertyShare } from "@/components/properties/property-share";

const propertyTabs = ["Details", "Sharing", "Documentation", "Gallery"] as const;
type PropertyTab = (typeof propertyTabs)[number];

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const gridItemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

type PropertyType = "house" | "apartment" | "land" | "commercial" | "other";
type ListingType = "rent" | "sale";
type PropertyStatus = "available" | "under_offer" | "let" | "sold" | "off_market";

type Property = {
  _id: Id<"properties">;
  title: string;
  type: PropertyType;
  listingType: ListingType;
  price: number;
  currency: string;
  location: string;
  area: number;
  bedrooms?: number;
  bathrooms?: number;
  status: PropertyStatus;
  description: string;
  images: string[];
  createdByUserId?: Id<"users">;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
};

interface FieldState {
  value: string;
  touched: boolean;
  error?: string;
}

const createEmptyFieldState = (value: string = ""): FieldState => ({
  value,
  touched: false,
  error: undefined,
});

const formatPrice = (price: number, currency: string) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

const formatStatus = (status: PropertyStatus): string => {
  const statusMap: Record<PropertyStatus, string> = {
    available: "Available",
    under_offer: "Under Offer",
    let: "Let",
    sold: "Sold",
    off_market: "Off Market",
  };
  return statusMap[status] || status;
};

const formatType = (type: PropertyType): string => {
  const typeMap: Record<PropertyType, string> = {
    house: "House",
    apartment: "Apartment",
    land: "Land",
    commercial: "Commercial",
    other: "Other",
  };
  return typeMap[type] || type;
};

const formatListingType = (type: ListingType): string => {
  return type === "rent" ? "Rent" : "Sale";
};

// #38 – Card Image Parallax
function ParallaxImage({ src, alt, layoutId, onClick }: { src: string; alt: string; layoutId?: string; onClick?: () => void }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!wrapRef.current || !imgRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * -16;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -16;
    imgRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.05)`;
  };

  const handleMouseLeave = () => {
    if (imgRef.current) {
      imgRef.current.style.transform = "translate3d(0,0,0) scale(1)";
    }
  };

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-border-strong bg-surface-2 cursor-pointer"
      onClick={onClick}
    >
      {layoutId ? (
        <motion.img
          layoutId={layoutId}
          ref={imgRef as any}
          src={src}
          alt={alt}
          className="h-full w-full object-cover transition-transform duration-300 ease-out will-change-transform"
        />
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="h-full w-full object-cover transition-transform duration-300 ease-out will-change-transform"
        />
      )}
    </div>
  );
}

// #40 – Comparison bottom-sheet item variants
const sheetBackdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const sheetPanelVariants = {
  hidden: { y: "100%" },
  visible: { y: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
  exit: { y: "100%", transition: { type: "spring", stiffness: 300, damping: 30 } },
};

export default function PropertiesPage() {
  const currentUser = useQuery(api.users.getMeRequired);

  // Filter state with debouncing
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [listingTypeFilter, setListingTypeFilter] = React.useState<ListingType | "">("");
  const [statusFilter, setStatusFilter] = React.useState<PropertyStatus | "">("");
  const [typeFilter, setTypeFilter] = React.useState<PropertyType | "">("");
  const [locationFilter, setLocationFilter] = React.useState("");
  const [debouncedLocation, setDebouncedLocation] = React.useState("");
  const [priceMin, setPriceMin] = React.useState("");

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounce location
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedLocation(locationFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [locationFilter]);

  const properties = useQuery(
    api.properties.list,
    currentUser
      ? {
          q: debouncedSearch || undefined,
          listingType: listingTypeFilter || undefined,
          status: statusFilter || undefined,
          type: typeFilter || undefined,
          location: debouncedLocation || undefined,
          priceMin: priceMin ? parseFloat(parseCurrencyInput(priceMin)) : undefined,
        }
      : "skip"
  );

  // Locations for dropdown
  const locations = useQuery(api.locations.list);

  // Mutations
  const updateProperty = useMutation(api.properties.update);
  const removeProperty = useMutation(api.properties.remove);

  // UI state
  const [viewMode, setViewMode] = React.useState<"list" | "cards">("list");
  const [selectedProperty, setSelectedProperty] = React.useState<Property | null>(null);
  const [propertyTab, setPropertyTab] = React.useState<PropertyTab>("Details");
  const [isSaving, setIsSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Property | null>(null);
  const [formError, setFormError] = React.useState("");

  // #40 – Comparison state
  const [compareIds, setCompareIds] = React.useState<string[]>([]);
  const [showCompare, setShowCompare] = React.useState(false);

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const compareProperties = React.useMemo(
    () => (properties ?? []).filter((p: Property) => compareIds.includes(p._id)),
    [properties, compareIds]
  );

  // #41 – Lightbox state
  const [lightboxImage, setLightboxImage] = React.useState<{ url: string; id: string } | null>(null);

  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxImage(null);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  // Form state with validation
  const [title, setTitle] = React.useState<FieldState>(createEmptyFieldState());
  const [type, setType] = React.useState<PropertyType>("house");
  const [listingType, setListingType] = React.useState<ListingType>("sale");
  const [price, setPrice] = React.useState<FieldState>(createEmptyFieldState());
  const [currency, setCurrency] = React.useState("USD");
  const [location, setLocation] = React.useState("");
  const [locationError, setLocationError] = React.useState<string | undefined>();
  const [area, setArea] = React.useState<FieldState>(createEmptyFieldState());
  const [bedrooms, setBedrooms] = React.useState("");
  const [bathrooms, setBathrooms] = React.useState("");
  const [status, setStatus] = React.useState<PropertyStatus>("available");
  const [description, setDescription] = React.useState("");
  const [images, setImages] = React.useState<ImageItem[]>([]);
  const [imagesError, setImagesError] = React.useState<string | undefined>();

  const isAdmin = currentUser?.role === "admin";
  // Allow editing if admin or the property creator
  const canEditProperty = isAdmin || (selectedProperty?.createdByUserId != null && selectedProperty?.createdByUserId === currentUser?._id);

  // Validation functions
  const validateTitle = (value: string): string | undefined => {
    if (!value.trim()) return "Title is required";
    if (value.trim().length < 3) return "Title must be at least 3 characters";
    return undefined;
  };

  const validatePrice = (value: string): string | undefined => {
    if (!value.trim()) return "Price is required";
    const numValue = parseFloat(parseCurrencyInput(value));
    if (isNaN(numValue) || numValue <= 0) return "Please enter a valid price";
    return undefined;
  };

  const validateLocation = (value: string): string | undefined => {
    if (!value) return "Location is required";
    return undefined;
  };

  const validateArea = (value: string): string | undefined => {
    if (!value.trim()) return "Area is required";
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return "Please enter a valid area";
    return undefined;
  };

  const validateImages = (imgs: ImageItem[]): string | undefined => {
    if (imgs.length < 2) return "At least 2 property images are required";
    return undefined;
  };

  const handleFieldChange = (
    field: "title" | "price" | "area",
    value: string,
    validator: (value: string) => string | undefined
  ) => {
    const setters: Record<"title" | "price" | "area", React.Dispatch<React.SetStateAction<FieldState>>> = {
      title: setTitle,
      price: setPrice,
      area: setArea,
    };
    const setter = setters[field];
    setter((prev) => ({
      value,
      touched: prev.touched,
      error: prev.touched ? validator(value) : undefined,
    }));
  };

  const handleFieldBlur = (
    field: "title" | "price" | "area",
    validator: (value: string) => string | undefined
  ) => {
    const setters: Record<"title" | "price" | "area", React.Dispatch<React.SetStateAction<FieldState>>> = {
      title: setTitle,
      price: setPrice,
      area: setArea,
    };
    const states: Record<"title" | "price" | "area", FieldState> = {
      title,
      price,
      area,
    };
    const setter = setters[field];
    const state = states[field];
    setter({
      ...state,
      touched: true,
      error: validator(state.value),
    });
  };

  // Initialize form when selecting a property
  React.useEffect(() => {
    if (selectedProperty) {
      setTitle(createEmptyFieldState(selectedProperty.title));
      setType(selectedProperty.type);
      setListingType(selectedProperty.listingType);
      setPrice(createEmptyFieldState(selectedProperty.price.toString()));
      setCurrency(selectedProperty.currency);
      setLocation(selectedProperty.location);
      setLocationError(undefined);
      setArea(createEmptyFieldState(selectedProperty.area.toString()));
      setBedrooms(selectedProperty.bedrooms?.toString() || "");
      setBathrooms(selectedProperty.bathrooms?.toString() || "");
      setStatus(selectedProperty.status);
      setDescription(selectedProperty.description);
      setImages(deserializeImages(selectedProperty.images || []));
      setImagesError(undefined);
      setFormError("");
    }
  }, [selectedProperty]);

  const resetForm = () => {
    setTitle(createEmptyFieldState());
    setType("house");
    setListingType("sale");
    setPrice(createEmptyFieldState());
    setCurrency("USD");
    setLocation("");
    setLocationError(undefined);
    setArea(createEmptyFieldState());
    setBedrooms("");
    setBathrooms("");
    setStatus("available");
    setDescription("");
    setImages([]);
    setImagesError(undefined);
    setFormError("");
  };

  const closeModal = () => {
    setSelectedProperty(null);
    setPropertyTab("Details");
    resetForm();
  };

  const validateForm = (): boolean => {
    const titleError = validateTitle(title.value);
    const priceError = validatePrice(price.value);
    const locError = validateLocation(location);
    const areaError = validateArea(area.value);
    const imgsError = validateImages(images);

    setTitle((prev) => ({ ...prev, touched: true, error: titleError }));
    setPrice((prev) => ({ ...prev, touched: true, error: priceError }));
    setLocationError(locError);
    setArea((prev) => ({ ...prev, touched: true, error: areaError }));
    setImagesError(imgsError);

    return !titleError && !priceError && !locError && !areaError && !imgsError;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    if (!selectedProperty) return;

    setIsSaving(true);
    setFormError("");
    try {
      await updateProperty({
        propertyId: selectedProperty._id,
        title: title.value.trim(),
        type,
        listingType,
        price: parseFloat(parseCurrencyInput(price.value)),
        currency,
        location,
        area: parseFloat(area.value),
        bedrooms: bedrooms ? parseInt(bedrooms) : undefined,
        bathrooms: bathrooms ? parseInt(bathrooms) : undefined,
        status,
        description: description.trim(),
        images: serializeImages(images),
      });
      propertyToasts.updated(title.value.trim());
      closeModal();
    } catch (error) {
      console.error("Failed to update property:", error);
      const msg = error instanceof Error ? error.message : "Failed to update property. Please try again.";
      setFormError(msg);
      propertyToasts.updateFailed(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeProperty({ propertyId: deleteTarget._id });
      propertyToasts.deleted(deleteTarget.title);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete property:", error);
      propertyToasts.deleteFailed(error instanceof Error ? error.message : undefined);
    }
  };

  const handleImagesChange = (newImages: ImageItem[]) => {
    setImages(newImages);
    setImagesError(validateImages(newImages));
  };

  // Loading state
  if (!currentUser) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Properties</h2>
            <p className="text-sm text-text-muted">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

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
          <Link
            href="/app/properties/new"
            className="group flex h-10 items-center gap-2 rounded-full bg-border pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-primary hover:pl-2 hover:text-white active:bg-primary-600"
          >
            <span className="flex items-center justify-center overflow-hidden rounded-full bg-primary p-1 text-white transition-all duration-300 group-hover:bg-white">
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="h-0 w-0 transition-all duration-300 group-hover:h-4 group-hover:w-4 group-hover:text-primary"
              >
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="text-sm font-medium">New Property</span>
          </Link>
        </div>
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-2">
            <Label>Listing</Label>
            <StaggeredDropDown
              value={listingTypeFilter}
              onChange={(val) => setListingTypeFilter(val as ListingType | "")}
              options={[
                { value: "", label: "All" },
                { value: "rent", label: "Rent" },
                { value: "sale", label: "Sale" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <StaggeredDropDown
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as PropertyStatus | "")}
              options={[
                { value: "", label: "All" },
                { value: "available", label: "Available" },
                { value: "under_offer", label: "Under Offer" },
                { value: "let", label: "Let" },
                { value: "sold", label: "Sold" },
                { value: "off_market", label: "Off Market" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <StaggeredDropDown
              value={typeFilter}
              onChange={(val) => setTypeFilter(val as PropertyType | "")}
              options={[
                { value: "", label: "Any" },
                { value: "house", label: "House" },
                { value: "apartment", label: "Apartment" },
                { value: "land", label: "Land" },
                { value: "commercial", label: "Commercial" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input
              placeholder="Search location..."
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Price min</Label>
            <Input
              placeholder="$"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Search</Label>
            <Input
              placeholder="Title"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 text-sm text-text-muted">
          {properties ? `${properties.length} propert${properties.length !== 1 ? "ies" : "y"}` : "Loading..."}
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
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Area (m²)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added by</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </tr>
          </thead>
          {!properties ? (
            <tbody>
              <TableRow>
                <TableCell colSpan={9} className="text-center text-text-muted">
                  Loading properties...
                </TableCell>
              </TableRow>
            </tbody>
          ) : properties.length === 0 ? (
            <tbody>
              <TableRow>
                <TableCell colSpan={9} className="text-center text-text-muted">
                  {debouncedSearch || listingTypeFilter || statusFilter || typeFilter || debouncedLocation || priceMin
                    ? "No properties match your filters"
                    : "No properties yet. Create one to get started."}
                </TableCell>
              </TableRow>
            </tbody>
          ) : (
            <motion.tbody variants={listVariants} initial="hidden" animate="show" key="data">
              {properties.map((property: Property) => (
                <motion.tr
                  key={property._id}
                  variants={rowVariants}
                  className="h-11 cursor-pointer border-b border-[rgba(148,163,184,0.1)] transition-all duration-150 hover:bg-row-hover hover:shadow-[inset_3px_0_0_var(--primary)]"
                >
                  <TableCell className="font-medium">{property.title}</TableCell>
                  <TableCell>{formatType(property.type)}</TableCell>
                  <TableCell>{formatListingType(property.listingType)}</TableCell>
                  <TableCell>{formatPrice(property.price, property.currency)}</TableCell>
                  <TableCell>{property.location}</TableCell>
                  <TableCell className="text-right">{property.area}</TableCell>
                  <TableCell>{formatStatus(property.status)}</TableCell>
                  <TableCell className="text-sm text-text-muted">{property.createdByName || "System"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/app/leads/new?propertyId=${property._id}&interestType=${property.listingType === "sale" ? "buy" : "rent"}`}
                      >
                        <Button variant="secondary" className="h-9 px-3">
                          + Lead
                        </Button>
                      </Link>
                      <Button
                        variant="secondary"
                        className="h-9 px-3"
                        onClick={() => setSelectedProperty(property)}
                      >
                        View
                      </Button>
                      {(isAdmin || property.createdByUserId === currentUser?._id) && (
                        <Button
                          variant="secondary"
                          className="h-9 px-3 text-red-500 hover:text-red-600"
                          onClick={() => setDeleteTarget(property)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </motion.tr>
              ))}
            </motion.tbody>
          )}
        </Table>
      ) : !properties ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full text-center text-text-muted py-8">
            Loading properties...
          </div>
        </div>
      ) : properties.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full text-center text-text-muted py-8">
            {debouncedSearch || listingTypeFilter || statusFilter || typeFilter || debouncedLocation || priceMin
              ? "No properties match your filters"
              : "No properties yet. Create one to get started."}
          </div>
        </div>
      ) : (
        <motion.div
            variants={gridVariants}
            initial="hidden"
            animate="show"
            key="card-data"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {properties.map((property: Property) => {
              const isCompared = compareIds.includes(property._id);
              return (
              <motion.div
                key={property._id}
                variants={gridItemVariants}
                whileHover={{ y: -4, boxShadow: "0 12px 28px rgba(0,0,0,0.12)" }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
              <Card className="flex h-full flex-col relative">
                {/* #40 – Compare checkbox */}
                <button
                  type="button"
                  onClick={() => toggleCompare(property._id)}
                  className={`absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg border-2 transition ${
                    isCompared
                      ? "border-primary bg-primary text-white"
                      : "border-white/70 bg-white/60 text-transparent backdrop-blur-sm hover:border-primary/50"
                  }`}
                >
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                    <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* #38 – Parallax image / #41 – Lightbox trigger */}
                {property.images && property.images.length > 0 ? (
                  <ParallaxImage
                    src={property.images[0]}
                    alt={`${property.title} cover`}
                    layoutId={`prop-img-${property._id}`}
                    onClick={() => setLightboxImage({ url: property.images[0], id: `prop-img-${property._id}` })}
                  />
                ) : (
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-border-strong bg-surface-2 flex items-center justify-center text-text-muted">
                    No image
                  </div>
                )}

                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-text-muted">
                        {formatListingType(property.listingType)} • {formatType(property.type)}
                      </p>
                      <h3 className="text-base font-semibold">{property.title}</h3>
                    </div>
                    <span className="rounded-full border border-border-strong px-2 py-1 text-xs text-text-muted">
                      {formatStatus(property.status)}
                    </span>
                  </div>
                  {/* #39 – Price Tag Pop + Shine */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.15 }}
                    className="text-sm font-medium"
                  >
                    <span className="price-shine">{formatPrice(property.price, property.currency)}</span>
                  </motion.div>
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
                  <div className="mt-auto flex justify-end gap-2">
                    <Link
                      href={`/app/leads/new?propertyId=${property._id}&interestType=${property.listingType === "sale" ? "buy" : "rent"}`}
                    >
                      <Button variant="secondary" className="h-9 px-3">
                        + Lead
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      className="h-9 px-3"
                      onClick={() => setSelectedProperty(property)}
                    >
                      View
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="secondary"
                        className="h-9 px-3 text-red-500 hover:text-red-600"
                        onClick={() => setDeleteTarget(property)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
              </motion.div>
              );
            })}
          </motion.div>
      )}

      {/* View/Edit Modal */}
      <Modal
        open={Boolean(selectedProperty)}
        title={selectedProperty ? `Property: ${selectedProperty.title}` : "Property"}
        description="Review the listing details and make updates as needed."
        onClose={closeModal}
        footer={
          propertyTab === "Details" ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeModal} disabled={isSaving}>
                Cancel
              </Button>
              {(isAdmin || selectedProperty?.createdByUserId === currentUser?._id) && (
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save changes"}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={closeModal}>
                Close
              </Button>
            </div>
          )
        }
      >
        <div className="space-y-5">
          {/* Property tab bar */}
          <div className="border-b border-border">
            <div className="flex gap-6 relative">
              {propertyTabs.map((tab) => (
                <button
                  key={tab}
                  className={`relative pb-3 text-sm font-medium transition-colors duration-150 ${
                    propertyTab === tab
                      ? "text-text"
                      : "text-text-muted hover:text-text"
                  }`}
                  onClick={() => setPropertyTab(tab)}
                >
                  {tab}
                  {propertyTab === tab && (
                    <motion.div
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                      layoutId="property-tab-indicator"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {propertyTab === "Details" && (
              <motion.div
                key="details"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                className="space-y-6"
              >
                {formError && (
                  <div className="rounded-lg bg-danger/10 p-4 text-danger text-sm">
                    {formError}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Title */}
                  <div className="space-y-2 md:col-span-2">
                    <Label className="flex items-center gap-1">
                      Title <span className="text-danger">*</span>
                    </Label>
                    {title.touched && title.error && (
                      <p className="text-xs text-danger">{title.error}</p>
                    )}
                    <Input
                      value={title.value}
                      onChange={(e) => handleFieldChange("title", e.target.value, validateTitle)}
                      onBlur={() => handleFieldBlur("title", validateTitle)}
                      readOnly={!canEditProperty}
                      error={title.touched && !!title.error}
                    />
                  </div>

                  {/* Type */}
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <StaggeredDropDown
                      value={type}
                      onChange={(val) => setType(val as PropertyType)}
                      disabled={!canEditProperty}
                      options={[
                        { value: "house", label: "House" },
                        { value: "apartment", label: "Apartment" },
                        { value: "land", label: "Land" },
                        { value: "commercial", label: "Commercial" },
                        { value: "other", label: "Other" },
                      ]}
                    />
                  </div>

                  {/* Listing Type */}
                  <div className="space-y-2">
                    <Label>Listing</Label>
                    <StaggeredDropDown
                      value={listingType}
                      onChange={(val) => setListingType(val as ListingType)}
                      disabled={!canEditProperty}
                      options={[
                        { value: "sale", label: "Sale" },
                        { value: "rent", label: "Rent" },
                      ]}
                    />
                  </div>

                  {/* Price */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Price <span className="text-danger">*</span>
                    </Label>
                    <CurrencyInput
                      value={price.value}
                      onChange={(val) => isAdmin && handleFieldChange("price", val, validatePrice)}
                      onBlur={() => handleFieldBlur("price", validatePrice)}
                      currency={currency}
                      onCurrencyChange={(c) => isAdmin && setCurrency(c)}
                      placeholder="0"
                      error={price.touched ? price.error : undefined}
                      touched={price.touched}
                      disabled={!canEditProperty}
                    />
                  </div>

                  {/* Location */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Location <span className="text-danger">*</span>
                    </Label>
                    {locationError && (
                      <p className="text-xs text-danger">{locationError}</p>
                    )}
                    <StaggeredDropDown
                      value={location}
                      onChange={(val) => {
                        setLocation(val);
                        setLocationError(validateLocation(val));
                      }}
                      disabled={!canEditProperty}
                      placeholder="Select a location..."
                      options={[
                        { value: "", label: "Select a location..." },
                        ...(locations?.map((loc) => ({ value: loc.name, label: loc.name })) ?? []),
                      ]}
                    />
                  </div>

                  {/* Area */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      Area (m²) <span className="text-danger">*</span>
                    </Label>
                    {area.touched && area.error && (
                      <p className="text-xs text-danger">{area.error}</p>
                    )}
                    <Input
                      type="number"
                      value={area.value}
                      onChange={(e) => handleFieldChange("area", e.target.value, validateArea)}
                      onBlur={() => handleFieldBlur("area", validateArea)}
                      readOnly={!canEditProperty}
                      error={area.touched && !!area.error}
                    />
                  </div>

                  {/* Bedrooms */}
                  <div className="space-y-2">
                    <Label>Bedrooms</Label>
                    <Input
                      type="number"
                      value={bedrooms}
                      onChange={(e) => setBedrooms(e.target.value)}
                      readOnly={!canEditProperty}
                    />
                  </div>

                  {/* Bathrooms */}
                  <div className="space-y-2">
                    <Label>Bathrooms</Label>
                    <Input
                      type="number"
                      value={bathrooms}
                      onChange={(e) => setBathrooms(e.target.value)}
                      readOnly={!canEditProperty}
                    />
                  </div>

                  {/* Status */}
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <StaggeredDropDown
                      value={status}
                      onChange={(val) => setStatus(val as PropertyStatus)}
                      disabled={!canEditProperty}
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

                {/* Description */}
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    readOnly={!canEditProperty}
                  />
                </div>
              </motion.div>
            )}

            {propertyTab === "Sharing" && selectedProperty && currentUser && (
              <motion.div
                key="sharing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
              >
                <PropertyShare
                  propertyId={selectedProperty._id}
                  currentUserId={currentUser._id}
                />
              </motion.div>
            )}

            {propertyTab === "Documentation" && selectedProperty && (
              <motion.div
                key="documentation"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
              >
                <DocumentManager
                  propertyId={selectedProperty._id}
                  folders={["mandates_to_sell", "contracts", "id_copies", "proof_of_funds"]}
                />
              </motion.div>
            )}

            {propertyTab === "Gallery" && (
              <motion.div
                key="gallery"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                className="space-y-2"
              >
                <Label className="flex items-center gap-1">
                  Images <span className="text-danger">*</span>
                </Label>
                <ImageUpload
                  images={images}
                  onChange={handleImagesChange}
                  minImages={2}
                  maxImages={10}
                  disabled={!canEditProperty}
                  error={imagesError}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Modal>

      {/* #40 – Comparison floating bar */}
      <AnimatePresence>
        {compareIds.length >= 2 && !showCompare && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-full border border-border-strong bg-card-bg px-5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.15)]"
          >
            <span className="text-sm font-medium text-text">{compareIds.length} selected</span>
            <Button className="h-8 rounded-full px-4" onClick={() => setShowCompare(true)}>
              Compare
            </Button>
            <Button variant="ghost" className="h-8 rounded-full px-3 text-text-muted" onClick={() => setCompareIds([])}>
              Clear
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* #40 – Comparison bottom sheet */}
      <AnimatePresence>
        {showCompare && (
          <>
            <motion.div
              key="compare-backdrop"
              variants={sheetBackdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setShowCompare(false)}
              className="fixed inset-0 z-50 bg-black/40"
            />
            <motion.div
              key="compare-sheet"
              variants={sheetPanelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-border-strong bg-card-bg p-6 shadow-[0_-12px_40px_rgba(0,0,0,0.12)]"
            >
              <div className="mx-auto max-w-5xl">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-text">Property Comparison</h3>
                  <Button variant="ghost" className="h-8 px-3 text-text-muted" onClick={() => setShowCompare(false)}>
                    Close
                  </Button>
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${compareProperties.length}, minmax(0, 1fr))` }}>
                  {compareProperties.map((prop: Property, idx: number) => (
                    <motion.div
                      key={prop._id}
                      initial={{ opacity: 0, x: idx % 2 === 0 ? -40 : 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 24, delay: idx * 0.1 }}
                      className="rounded-xl border border-border-strong bg-surface-2/40 p-4 space-y-3"
                    >
                      {prop.images?.[0] && (
                        <img src={prop.images[0]} alt={prop.title} className="w-full aspect-[4/3] rounded-lg object-cover" />
                      )}
                      <h4 className="text-sm font-semibold text-text">{prop.title}</h4>
                      <div className="space-y-1 text-xs text-text-muted">
                        <div className="flex justify-between"><span>Price</span><span className="font-medium text-text">{formatPrice(prop.price, prop.currency)}</span></div>
                        <div className="flex justify-between"><span>Location</span><span className="text-text">{prop.location}</span></div>
                        <div className="flex justify-between"><span>Area</span><span className="text-text">{prop.area} m²</span></div>
                        <div className="flex justify-between"><span>Type</span><span className="text-text">{formatType(prop.type)}</span></div>
                        <div className="flex justify-between"><span>Listing</span><span className="text-text">{formatListingType(prop.listingType)}</span></div>
                        {prop.bedrooms != null && <div className="flex justify-between"><span>Beds</span><span className="text-text">{prop.bedrooms}</span></div>}
                        {prop.bathrooms != null && <div className="flex justify-between"><span>Baths</span><span className="text-text">{prop.bathrooms}</span></div>}
                        <div className="flex justify-between"><span>Status</span><span className="text-text">{formatStatus(prop.status)}</span></div>
                      </div>
                      <Button
                        variant="ghost"
                        className="h-7 w-full text-xs text-danger"
                        onClick={() => {
                          const next = compareIds.filter((x) => x !== prop._id);
                          setCompareIds(next);
                          if (next.length < 2) setShowCompare(false);
                        }}
                      >
                        Remove
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* #41 – Image Gallery Lightbox */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-8"
            onClick={() => setLightboxImage(null)}
          >
            <button
              type="button"
              className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
              onClick={() => setLightboxImage(null)}
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <motion.img
              layoutId={lightboxImage.id}
              src={lightboxImage.url}
              alt="Property"
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete Property"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? Type Delete to confirm.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
