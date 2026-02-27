"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { parseCurrencyInput } from "@/lib/currency";
import { ImageUpload, ImageItem, serializeImages } from "@/components/ui/image-upload";
import { propertyToasts } from "@/lib/toast";

type PropertyType = "house" | "apartment" | "land" | "commercial" | "other";
type ListingType = "rent" | "sale";
type PropertyStatus = "available" | "under_offer" | "let" | "sold" | "off_market";

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

export default function NewPropertyPage() {
  const router = useRouter();
  const currentUser = useQuery(api.users.getMeRequired);
  const createProperty = useMutation(api.properties.create);
  const locations = useQuery(api.locations.list);

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

  const [isSaving, setIsSaving] = React.useState(false);
  const [formError, setFormError] = React.useState("");

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

  const handleImagesChange = (newImages: ImageItem[]) => {
    setImages(newImages);
    setImagesError(validateImages(newImages));
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

  const closeModal = () => {
    router.push("/app/properties");
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

    setIsSaving(true);
    setFormError("");
    try {
      await createProperty({
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
      propertyToasts.created(title.value.trim());
      router.push("/app/properties");
    } catch (error) {
      console.error("Failed to create property:", error);
      const msg = error instanceof Error ? error.message : "Failed to create property. Please try again.";
      setFormError(msg);
      propertyToasts.createFailed(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Modal
      open
      title="New Property"
      description="Capture key listing details for matching. At least 2 images are required."
      onClose={closeModal}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={closeModal} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save property"}
          </Button>
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
              placeholder="e.g., Borrowdale Villa"
              error={title.touched && !!title.error}
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as PropertyType)}
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
            <CurrencyInput
              value={price.value}
              onChange={(val) => handleFieldChange("price", val, validatePrice)}
              onBlur={() => handleFieldBlur("price", validatePrice)}
              currency={currency}
              onCurrencyChange={setCurrency}
              placeholder="0"
              error={price.touched ? price.error : undefined}
              touched={price.touched}
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
            <Select
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setLocationError(validateLocation(e.target.value));
              }}
            >
              <option value="">Select a location...</option>
              {locations?.map((loc) => (
                <option key={loc._id} value={loc.name}>
                  {loc.name}
                </option>
              ))}
            </Select>
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
              placeholder="e.g., 280"
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
              placeholder="e.g., 4"
            />
          </div>

          {/* Bathrooms */}
          <div className="space-y-2">
            <Label>Bathrooms</Label>
            <Input
              type="number"
              value={bathrooms}
              onChange={(e) => setBathrooms(e.target.value)}
              placeholder="e.g., 2"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as PropertyStatus)}
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
            placeholder="Enter property description..."
          />
        </div>
      </div>
    </Modal>
  );
}
