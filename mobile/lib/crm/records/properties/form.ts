/**
 * The property form's state and validation, shared by the new and edit
 * screens. Rules match the website: title of 3 or more characters, a price
 * and area above zero, a location, and at least 2 photos (the backend
 * refuses fewer).
 */
import { useState } from "react";
import { parseCurrencyInput } from "@/lib/currency";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { isResidential, type CommercialType, type ListingType, type PropertyStatus, type PropertyType } from "./labels";

export type PropertyFormValues = {
  title: string;
  type: PropertyType;
  listingType: ListingType;
  price: string;
  currency: string;
  location: string;
  area: string;
  bedrooms: string;
  bathrooms: string;
  commercialType: CommercialType | "";
  zoning: string;
  usageType: string;
  status: PropertyStatus;
  description: string;
  images: string[];
};

export type PropertyFormErrors = Partial<Record<"title" | "price" | "location" | "area" | "images", string>>;

export const EMPTY_FORM: PropertyFormValues = {
  title: "",
  type: "house",
  listingType: "sale",
  price: "",
  currency: "USD",
  location: "",
  area: "",
  bedrooms: "",
  bathrooms: "",
  commercialType: "",
  zoning: "",
  usageType: "",
  status: "available",
  description: "",
  images: [],
};

export function formFromProperty(p: Doc<"properties">): PropertyFormValues {
  return {
    title: p.title,
    type: p.type,
    listingType: p.listingType,
    price: String(p.price),
    currency: p.currency,
    location: p.location,
    area: String(p.area),
    bedrooms: p.bedrooms?.toString() ?? "",
    bathrooms: p.bathrooms?.toString() ?? "",
    commercialType: p.commercialType ?? "",
    zoning: p.zoning ?? "",
    usageType: p.usageType ?? "",
    status: p.status,
    description: p.description,
    images: p.images ?? [],
  };
}

export function validate(v: PropertyFormValues): PropertyFormErrors {
  const e: PropertyFormErrors = {};
  if (!v.title.trim()) e.title = "Title is required";
  else if (v.title.trim().length < 3) e.title = "Title must be at least 3 characters";
  const price = parseFloat(parseCurrencyInput(v.price));
  if (!v.price.trim()) e.price = "Price is required";
  else if (isNaN(price) || price <= 0) e.price = "Enter a valid price";
  if (!v.location.trim()) e.location = "Location is required";
  const area = parseFloat(v.area);
  if (!v.area.trim()) e.area = "Area is required";
  else if (isNaN(area) || area <= 0) e.area = "Enter a valid area";
  if (v.images.length < 2) e.images = "Add at least 2 photos";
  return e;
}

/** The fields create and update both take, built the same way as the website. */
export function toPayload(v: PropertyFormValues) {
  const commercial = v.type === "commercial";
  const home = isResidential(v.type);
  return {
    title: v.title.trim(),
    type: v.type,
    listingType: v.listingType,
    price: parseFloat(parseCurrencyInput(v.price)),
    currency: v.currency,
    location: v.location.trim(),
    area: parseFloat(v.area),
    bedrooms: home && v.bedrooms ? parseInt(v.bedrooms, 10) : undefined,
    bathrooms: home && v.bathrooms ? parseInt(v.bathrooms, 10) : undefined,
    commercialType: commercial && v.commercialType ? v.commercialType : undefined,
    zoning: commercial && v.zoning.trim() ? v.zoning.trim() : undefined,
    usageType: commercial && v.usageType.trim() ? v.usageType.trim() : undefined,
    status: v.status,
    description: v.description.trim(),
    images: v.images,
  };
}

export function usePropertyForm(initial: PropertyFormValues = EMPTY_FORM) {
  const [values, setValues] = useState<PropertyFormValues>(initial);
  const [errors, setErrors] = useState<PropertyFormErrors>({});
  const set = <K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key in errors) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  /** Validate everything; true when the form can be saved. */
  const check = () => {
    const e = validate(values);
    setErrors(e);
    return Object.values(e).every((x) => !x);
  };
  return { values, setValues, set, errors, check };
}
