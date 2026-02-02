"use client";

import * as React from "react";
import { useMutation, useConvex } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

export interface ImageItem {
  url: string; // The actual displayable URL
  storageId?: string; // Optional: storage ID if uploaded via Convex
}

interface ImageUploadProps {
  images: ImageItem[];
  onChange: (images: ImageItem[]) => void;
  minImages?: number;
  maxImages?: number;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export function ImageUpload({
  images,
  onChange,
  minImages = 2,
  maxImages = 10,
  disabled = false,
  error,
  className,
}: ImageUploadProps) {
  const convex = useConvex();
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = React.useState(false);
  const [urlInput, setUrlInput] = React.useState("");

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const newImages: ImageItem[] = [];

      for (const file of Array.from(files)) {
        // Validate file type
        if (!file.type.startsWith("image/")) {
          setUploadError(`${file.name} is not an image file`);
          continue;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          setUploadError(`${file.name} is too large (max 5MB)`);
          continue;
        }

        // Check if we've hit the max
        if (images.length + newImages.length >= maxImages) {
          setUploadError(`Maximum ${maxImages} images allowed`);
          break;
        }

        // Get upload URL from Convex
        const uploadUrl = await generateUploadUrl();

        // Upload the file
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const { storageId } = await response.json();

        // Get the permanent URL for this storage item
        // We'll use a local blob URL for preview until the component re-renders
        const previewUrl = URL.createObjectURL(file);

        // Fetch the actual Convex storage URL
        const storageUrl = await fetchStorageUrl(storageId);

        newImages.push({
          url: storageUrl || previewUrl,
          storageId,
        });
      }

      if (newImages.length > 0) {
        onChange([...images, ...newImages]);
      }
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setIsUploading(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Helper to fetch storage URL using Convex client
  const fetchStorageUrl = async (storageId: string): Promise<string | null> => {
    try {
      const url = await convex.query(api.storage.getUrl, {
        storageId: storageId as Id<"_storage">
      });
      return url;
    } catch (err) {
      console.error("Failed to get storage URL:", err);
      return null;
    }
  };

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;

    // Basic URL validation
    try {
      new URL(urlInput);
    } catch {
      setUploadError("Please enter a valid URL");
      return;
    }

    if (images.length >= maxImages) {
      setUploadError(`Maximum ${maxImages} images allowed`);
      return;
    }

    onChange([
      ...images,
      {
        url: urlInput.trim(),
      },
    ]);
    setUrlInput("");
    setShowUrlInput(false);
    setUploadError(null);
  };

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onChange(newImages);
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          {images.map((image, index) => (
            <div
              key={`image-${index}-${image.url}`}
              className="relative aspect-[4/3] w-full overflow-hidden rounded-[10px] border border-border-strong bg-muted group"
            >
              <img
                src={image.url}
                alt={`Property image ${index + 1}`}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999'%3ENo image%3C/text%3E%3C/svg%3E";
                }}
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  className="absolute top-2 right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove image"
                >
                  ×
                </button>
              )}
              {image.storageId && (
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/50 text-white text-xs">
                  Uploaded
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload Controls */}
      {!disabled && images.length < maxImages && (
        <div className="space-y-3">
          {/* File Upload */}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={isUploading}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex-1"
            >
              {isUploading ? "Uploading..." : "Upload Images"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowUrlInput(!showUrlInput)}
              disabled={isUploading}
            >
              {showUrlInput ? "Cancel" : "Add URL"}
            </Button>
          </div>

          {/* URL Input */}
          {showUrlInput && (
            <div className="flex gap-2">
              <Input
                placeholder="Enter image URL..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddUrl();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={handleAddUrl}>
                Add
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Status and Errors */}
      <div className="flex items-center justify-between text-xs">
        <span className={cn("text-text-muted", images.length < minImages && "text-danger")}>
          {images.length} of {minImages} minimum images
          {maxImages && ` (max ${maxImages})`}
        </span>
      </div>

      {(error || uploadError) && (
        <p className="text-xs text-danger">{error || uploadError}</p>
      )}
    </div>
  );
}

/**
 * Helper to convert ImageItem array to string array for storage.
 * We just store the URLs directly since we resolve them at upload time.
 */
export function serializeImages(images: ImageItem[]): string[] {
  return images.map((img) => img.url);
}

/**
 * Helper to convert stored string array back to ImageItem array.
 */
export function deserializeImages(stored: string[]): ImageItem[] {
  return stored.map((url) => ({ url }));
}
