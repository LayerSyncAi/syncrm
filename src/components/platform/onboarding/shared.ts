"use client";

import { useEffect, useState } from "react";

/** Same alphabet as convex/lib/authReconcile.randomPassword: no 0/O/1/l/I. */
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A 12-character temporary password, easy to read out over the phone. */
export function generatePassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
}

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Why a picked file can't be a logo, or null when it can. */
export function logoFileProblem(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Choose an image file (PNG, SVG, JPG or WebP)";
  if (file.size > MAX_LOGO_BYTES) return "Logos must be 2 MB or smaller";
  return null;
}

/** Upload one file to Convex storage through a fresh upload URL; returns its storage id. */
export async function uploadToStorage(file: File, getUploadUrl: () => Promise<string>): Promise<string> {
  const url = await getUploadUrl();
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
  if (!res.ok) throw new Error("The logo upload failed. Please try again.");
  const { storageId } = (await res.json()) as { storageId: string };
  return storageId;
}

/** `value`, but only after it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Suggested primary colours for a new agency. */
export const PRIMARY_SUGGESTIONS = ["#1f5fad", "#0f766e", "#7c3aed", "#be123c", "#b0573a", "#ca8a04", "#15803d", "#1f2937"];

/** Dark sidebar suggestions (the menu text is light, so these stay dark). */
export const SIDEBAR_SUGGESTIONS = ["#0f1419", "#111827", "#0b2545", "#1e1b4b", "#14532d", "#3b0a0a", "#1c1917"];
