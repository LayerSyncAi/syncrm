"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { CurrencyInput } from "@/components/ui/currency-input";
import { parseCurrencyInput } from "@/lib/currency";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { ImageUpload, ImageItem, serializeImages, deserializeImages } from "@/components/ui/image-upload";

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

  // Mutations
  const updateProperty = useMutation(api.properties.update);
  const removeProperty = useMutation(api.properties.remove);

  // UI state
  const [viewMode, setViewMode] = React.useState<"list" | "cards">("list");
  const [selectedProperty, setSelectedProperty] = React.useState<Property | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Property | null>(null);
  const [formError, setFormError] = React.useState("");

  // Form state with validation
  const [title, setTitle] = React.useState<FieldState>(createEmptyFieldState());
  const [type, setType] = React.useState<PropertyType>("house");
  const [listingType, setListingType] = React.useState<ListingType>("sale");
  const [price, setPrice] = React.useState<FieldState>(createEmptyFieldState());
  const [currency, setCurrency] = React.useState("USD");
  const [location, setLocation] = React.useState<FieldState>(createEmptyFieldState());
  const [area, setArea] = React.useState<FieldState>(createEmptyFieldState());
  const [bedrooms, setBedrooms] = React.useState("");
  const [bathrooms, setBathrooms] = React.useState("");
  const [status, setStatus] = React.useState<PropertyStatus>("available");
  const [description, setDescription] = React.useState("");
  const [images, setImages] = React.useState<ImageItem[]>([]);
  const [imagesError, setImagesError] = React.useState<string | undefined>();

  const isAdmin = currentUser?.role === "admin";

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
    if (!value.trim()) return "Location is required";
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
    field: "title" | "price" | "location" | "area",
    value: string,
    validator: (value: string) => string | undefined
  ) => {
    const setters: Record<"title" | "price" | "location" | "area", React.Dispatch<React.SetStateAction<FieldState>>> = {
      title: setTitle,
      price: setPrice,
      location: setLocation,
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
    field: "title" | "price" | "location" | "area",
    validator: (value: string) => string | undefined
  ) => {
    const setters: Record<"title" | "price" | "location" | "area", React.Dispatch<React.SetStateAction<FieldState>>> = {
      title: setTitle,
      price: setPrice,
      location: setLocation,
      area: setArea,
    };
    const states: Record<"title" | "price" | "location" | "area", FieldState> = {
      title,
      price,
      location,
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
      setLocation(createEmptyFieldState(selectedProperty.location));
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
    setLocation(createEmptyFieldState());
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
    resetForm();
  };

  const validateForm = (): boolean => {
    const titleError = validateTitle(title.value);
    const priceError = validatePrice(price.value);
    const locationError = validateLocation(location.value);
    const areaError = validateArea(area.value);
    const imgsError = validateImages(images);

    setTitle((prev) => ({ ...prev, touched: true, error: titleError }));
    setPrice((prev) => ({ ...prev, touched: true, error: priceError }));
    setLocation((prev) => ({ ...prev, touched: true, error: locationError }));
    setArea((prev) => ({ ...prev, touched: true, error: areaError }));
    setImagesError(imgsError);

    return !titleError && !priceError && !locationError && !areaError && !imgsError;
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
        location: location.value.trim(),
        area: parseFloat(area.value),
        bedrooms: bedrooms ? parseInt(bedrooms) : undefined,
        bathrooms: bathrooms ? parseInt(bathrooms) : undefined,
        status,
        description: description.trim(),
        images: serializeImages(images),
      });
      closeModal();
    } catch (error) {
      console.error("Failed to update property:", error);
      setFormError(error instanceof Error ? error.message : "Failed to update property. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeProperty({ propertyId: deleteTarget._id });
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete property:", error);
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
          {isAdmin && (
            <Link href="/app/properties/new">
              <Button>+ New Property</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-2">
            <Label>Listing</Label>
            <Select
              value={listingTypeFilter}
              onChange={(e) => setListingTypeFilter(e.target.value as ListingType | "")}
            >
              <option value="">All</option>
              <option value="rent">Rent</option>
              <option value="sale">Sale</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PropertyStatus | "")}
            >
              <option value="">All</option>
              <option value="available">Available</option>
              <option value="under_offer">Under Offer</option>
              <option value="let">Let</option>
              <option value="sold">Sold</option>
              <option value="off_market">Off Market</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as PropertyType | "")}
            >
              <option value="">Any</option>
              <option value="house">House</option>
              <option value="apartment">Apartment</option>
              <option value="land">Land</option>
              <option value="commercial">Commercial</option>
              <option value="other">Other</option>
            </Select>
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
              <TableHead className="text-right">Action</TableHead>
            </tr>
          </thead>
          <tbody>
            {!properties ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-text-muted">
                  Loading properties...
                </TableCell>
              </TableRow>
            ) : properties.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-text-muted">
                  {debouncedSearch || listingTypeFilter || statusFilter || typeFilter || debouncedLocation || priceMin
                    ? "No properties match your filters"
                    : "No properties yet. Create one to get started."}
                </TableCell>
              </TableRow>
            ) : (
              properties.map((property: Property) => (
                <TableRow key={property._id} className="cursor-pointer">
                  <TableCell className="font-medium">{property.title}</TableCell>
                  <TableCell>{formatType(property.type)}</TableCell>
                  <TableCell>{formatListingType(property.listingType)}</TableCell>
                  <TableCell>{formatPrice(property.price, property.currency)}</TableCell>
                  <TableCell>{property.location}</TableCell>
                  <TableCell className="text-right">{property.area}</TableCell>
                  <TableCell>{formatStatus(property.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </tbody>
        </Table>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {!properties ? (
            <div className="col-span-full text-center text-text-muted py-8">
              Loading properties...
            </div>
          ) : properties.length === 0 ? (
            <div className="col-span-full text-center text-text-muted py-8">
              {debouncedSearch || listingTypeFilter || statusFilter || typeFilter || debouncedLocation || priceMin
                ? "No properties match your filters"
                : "No properties yet. Create one to get started."}
            </div>
          ) : (
            properties.map((property: Property) => (
              <Card key={property._id} className="flex h-full flex-col">
                <div className="aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-border-strong bg-muted">
                  {property.images && property.images.length > 0 ? (
                    <img
                      src={property.images[0]}
                      alt={`${property.title} cover`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-text-muted">
                      No image
                    </div>
                  )}
                </div>
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
                  <div className="text-sm font-medium">
                    {formatPrice(property.price, property.currency)}
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
                  <div className="mt-auto flex justify-end gap-2">
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
            ))
          )}
        </div>
      )}

      {/* View/Edit Modal */}
      <Modal
        open={Boolean(selectedProperty)}
        title={selectedProperty ? `Property: ${selectedProperty.title}` : "Property"}
        description="Review the listing details and make updates as needed."
        onClose={closeModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal} disabled={isSaving}>
              Cancel
            </Button>
            {isAdmin && (
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-6">
          {formError && (
            <div className="rounded-lg bg-danger/10 p-4 text-danger text-sm">
              {formError}
            </div>
          )}

          {/* Images Section */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Images <span className="text-danger">*</span>
            </Label>
            <ImageUpload
              images={images}
              onChange={handleImagesChange}
              minImages={2}
              maxImages={10}
              disabled={!isAdmin}
              error={imagesError}
            />
          </div>

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
                readOnly={!isAdmin}
                error={title.touched && !!title.error}
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as PropertyType)}
                disabled={!isAdmin}
              >
                <option value="house">House</option>
                <option value="apartment">Apartment</option>
                <option value="land">Land</option>
                <option value="commercial">Commercial</option>
                <option value="other">Other</option>
              </Select>
            </div>

            {/* Listing Type */}
            <div className="space-y-2">
              <Label>Listing</Label>
              <Select
                value={listingType}
                onChange={(e) => setListingType(e.target.value as ListingType)}
                disabled={!isAdmin}
              >
                <option value="sale">Sale</option>
                <option value="rent">Rent</option>
              </Select>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Price <span className="text-danger">*</span>
              </Label>
              {price.touched && price.error && (
                <p className="text-xs text-danger">{price.error}</p>
              )}
              <CurrencyInput
                value={price.value}
                onChange={(val) => isAdmin && handleFieldChange("price", val, validatePrice)}
                onBlur={() => handleFieldBlur("price", validatePrice)}
                currency={currency}
                onCurrencyChange={(c) => isAdmin && setCurrency(c)}
                placeholder="0"
                error={price.touched ? price.error : undefined}
                touched={price.touched}
                disabled={!isAdmin}
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Location <span className="text-danger">*</span>
              </Label>
              {location.touched && location.error && (
                <p className="text-xs text-danger">{location.error}</p>
              )}
              <Input
                value={location.value}
                onChange={(e) => handleFieldChange("location", e.target.value, validateLocation)}
                onBlur={() => handleFieldBlur("location", validateLocation)}
                readOnly={!isAdmin}
                error={location.touched && !!location.error}
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
                readOnly={!isAdmin}
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
                readOnly={!isAdmin}
              />
            </div>

            {/* Bathrooms */}
            <div className="space-y-2">
              <Label>Bathrooms</Label>
              <Input
                type="number"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                readOnly={!isAdmin}
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as PropertyStatus)}
                disabled={!isAdmin}
              >
                <option value="available">Available</option>
                <option value="under_offer">Under Offer</option>
                <option value="let">Let</option>
                <option value="sold">Sold</option>
                <option value="off_market">Off Market</option>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              readOnly={!isAdmin}
            />
          </div>
        </div>
      </Modal>

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
