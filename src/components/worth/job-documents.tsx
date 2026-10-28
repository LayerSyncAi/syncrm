"use client";

/** Supporting documents on a job (VW-23). */
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { FileText, Trash2, Upload } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatInstant } from "@/lib/worth/format";
import { uploadBlob } from "@/lib/worth/image";
import { Section, attempt, worthToast } from "./ui";
import type { JobView } from "./job-overview";

type Kind = "title_deed" | "plans" | "lease" | "rates_statement" | "other";

const KIND_LABELS: Record<Kind, string> = {
  title_deed: "Title deed",
  plans: "Plans",
  lease: "Lease",
  rates_statement: "Rates statement",
  other: "Other",
};

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function JobDocuments({ job }: { job: JobView }) {
  const docs = useQuery(api.worth.documents.list, { jobId: job._id });
  const add = useMutation(api.worth.documents.add);
  const remove = useMutation(api.worth.documents.remove);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const [kind, setKind] = React.useState<Kind>("title_deed");
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const canUpload =
    (job.canWork || job.caps.canManageJobs) && job.status !== "issued" && job.status !== "cancelled";

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      if (file.size > 15 * 1024 * 1024) {
        worthToast.failed(new Error(`${file.name} is larger than 15 MB`));
        continue;
      }
      try {
        const url = await generateUploadUrl();
        const storageId = await uploadBlob(url, file, file.type || "application/octet-stream");
        await add({
          jobId: job._id,
          name: file.name,
          kind,
          storageId: storageId as Id<"_storage">,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        });
      } catch (e) {
        worthToast.failed(e, `Could not upload ${file.name}`);
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Section
      title="Supporting documents"
      description="Title deed, plans, lease and rates statement."
      actions={
        canUpload && (
          <div className="flex gap-2">
            <Select className="h-8 w-40 text-xs" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {Object.entries(KIND_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4" />
              {busy ? "Uploading..." : "Upload"}
            </Button>
          </div>
        )
      }
    >
      {docs === undefined ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-text-muted">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={d._id} className="flex items-center justify-between gap-3 py-2.5">
              <a href={d.url ?? "#"} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 hover:underline">
                <FileText className="h-4 w-4 shrink-0 text-text-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  <span className="block text-xs text-text-muted">
                    {KIND_LABELS[d.kind]} · {size(d.size)} · {d.uploadedBy} · {formatInstant(d.createdAt)}
                  </span>
                </span>
              </a>
              {canUpload && (
                <Button
                  variant="ghost"
                  className="h-9 w-9 shrink-0 p-0"
                  aria-label={`Remove ${d.name}`}
                  onClick={() => attempt(() => remove({ documentId: d._id }), "Document removed")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
