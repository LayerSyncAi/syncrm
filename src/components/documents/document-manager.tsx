"use client";

import * as React from "react";
import { useMutation, useQuery, useConvex } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { documentToasts } from "@/lib/toast";

type Folder =
  | "mandates_to_sell"
  | "contracts"
  | "id_copies"
  | "proof_of_funds"
  | "lead_documentation";

const FOLDER_LABELS: Record<Folder, string> = {
  mandates_to_sell: "Mandates to Sell",
  contracts: "Contracts",
  id_copies: "ID Copies",
  proof_of_funds: "Proof of Funds",
  lead_documentation: "Lead Documentation",
};

const FOLDER_ICONS: Record<Folder, string> = {
  mandates_to_sell: "M12 3L2 7v13h20V7L12 3zm0 2.24L18.76 8H5.24L12 5.24zM4 9h16v9H4V9z",
  contracts: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 13h8v2H8v-2zm0 4h5v2H8v-2z",
  id_copies: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6v-2zm0 4h8v2H6v-2zm10-4h2v2h-2v-2z",
  proof_of_funds: "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
  lead_documentation: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7v-7zm4-3h2v10h-2V7zm4 6h2v4h-2v-4z",
};

interface DocumentManagerProps {
  leadId?: Id<"leads">;
  propertyId?: Id<"properties">;
  folders: Folder[];
}

type DocumentWithUrl = {
  _id: Id<"documents">;
  name: string;
  folder: Folder;
  storageId: Id<"_storage">;
  mimeType: string;
  size: number;
  url: string | null;
  createdAt: number;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

export function DocumentManager({ leadId, propertyId, folders }: DocumentManagerProps) {
  const [activeFolder, setActiveFolder] = React.useState<Folder>(folders[0]);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const uploadDocument = useMutation(api.documents.upload);
  const removeDocument = useMutation(api.documents.remove);

  const documents = useQuery(
    leadId ? api.documents.listByLead : api.documents.listByProperty,
    leadId ? { leadId } : propertyId ? { propertyId } : "skip"
  ) as DocumentWithUrl[] | undefined;

  const folderDocs = React.useMemo(
    () => documents?.filter((d) => d.folder === activeFolder) ?? [],
    [documents, activeFolder]
  );

  const folderCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of folders) {
      counts[f] = documents?.filter((d) => d.folder === f).length ?? 0;
    }
    return counts;
  }, [documents, folders]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          documentToasts.uploadFailed(`${file.name} is too large (max 10MB)`);
          continue;
        }

        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!response.ok) {
          documentToasts.uploadFailed(`Failed to upload ${file.name}`);
          continue;
        }

        const { storageId } = await response.json();

        await uploadDocument({
          name: file.name,
          folder: activeFolder,
          storageId: storageId as Id<"_storage">,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          leadId,
          propertyId,
        });

        documentToasts.uploaded(file.name);
      }
    } catch (err) {
      documentToasts.uploadFailed(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (doc: DocumentWithUrl) => {
    try {
      await removeDocument({ documentId: doc._id });
      documentToasts.deleted(doc.name);
    } catch (err) {
      documentToasts.deleteFailed(
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const getMimeIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return "img";
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.includes("word") || mimeType.includes("document")) return "doc";
    if (mimeType.includes("sheet") || mimeType.includes("excel")) return "xls";
    return "file";
  };

  return (
    <div className="space-y-4">
      {/* Folder tabs */}
      <div className="flex gap-2 flex-wrap">
        {folders.map((folder) => (
          <button
            key={folder}
            onClick={() => setActiveFolder(folder)}
            className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
              activeFolder === folder
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-surface-2/60 text-text-muted hover:bg-surface-2 hover:text-text border border-transparent"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
              <path d={FOLDER_ICONS[folder]} />
            </svg>
            {FOLDER_LABELS[folder]}
            {folderCounts[folder] > 0 && (
              <span className={`ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                activeFolder === folder
                  ? "bg-primary text-white"
                  : "bg-border text-text-muted"
              }`}>
                {folderCounts[folder]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Upload area */}
      <div
        className="flex items-center justify-between rounded-lg border border-dashed border-border-strong bg-surface-2/30 p-3"
      >
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Upload to <strong>{FOLDER_LABELS[activeFolder]}</strong></span>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          <Button
            variant="secondary"
            className="h-8 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? "Uploading..." : "Choose Files"}
          </Button>
        </div>
      </div>

      {/* Document list */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeFolder}
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-2"
        >
          {folderDocs.length === 0 ? (
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-2/20 py-8 text-center"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-text-muted/40 mb-2">
                <path d={FOLDER_ICONS[activeFolder]} />
              </svg>
              <p className="text-sm text-text-muted">No documents in {FOLDER_LABELS[activeFolder]}</p>
              <p className="text-xs text-text-muted/60 mt-1">Upload files to get started</p>
            </motion.div>
          ) : (
            folderDocs.map((doc) => (
              <motion.div
                key={doc._id}
                variants={itemVariants}
                className="group flex items-center gap-3 rounded-lg border border-border-strong bg-card-bg p-3 transition-colors hover:bg-surface-2/40"
              >
                {/* File type icon */}
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold uppercase ${
                  getMimeIcon(doc.mimeType) === "pdf"
                    ? "bg-red-500/10 text-red-500"
                    : getMimeIcon(doc.mimeType) === "img"
                    ? "bg-blue-500/10 text-blue-500"
                    : getMimeIcon(doc.mimeType) === "doc"
                    ? "bg-blue-600/10 text-blue-600"
                    : getMimeIcon(doc.mimeType) === "xls"
                    ? "bg-green-600/10 text-green-600"
                    : "bg-gray-500/10 text-gray-500"
                }`}>
                  {getMimeIcon(doc.mimeType)}
                </div>

                {/* Name + meta */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{doc.name}</p>
                  <p className="text-xs text-text-muted">
                    {formatFileSize(doc.size)} &middot; {formatDate(doc.createdAt)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
                      title="Download"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(doc)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    title="Delete"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
