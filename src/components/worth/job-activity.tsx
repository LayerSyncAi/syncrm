"use client";

/** Notes and activity log per job (VW-13). */
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatInstant } from "@/lib/worth/format";
import { cn } from "@/lib/utils";
import { Section, attempt } from "./ui";
import type { JobView } from "./job-overview";

type NoteKind = "note" | "call" | "client_query" | "access";

const KIND_LABELS: Record<NoteKind | "system", string> = {
  note: "Note",
  call: "Call",
  client_query: "Client query",
  access: "Access",
  system: "Update",
};

export function JobActivity({ job }: { job: JobView }) {
  const notes = useQuery(api.worth.jobs.listNotes, { jobId: job._id });
  const addNote = useMutation(api.worth.jobs.addNote);
  const [kind, setKind] = React.useState<NoteKind>("note");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    if (await attempt(() => addNote({ jobId: job._id, kind, body }))) setBody("");
    setBusy(false);
  };

  return (
    <Section title="Notes and activity" description="Calls, client queries, access arrangements and every status change.">
      <div className="space-y-2">
        <Textarea rows={3} className="min-h-[80px]" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note" />
        <div className="flex justify-end gap-2">
          <Select className="w-40" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
            {(["note", "call", "client_query", "access"] as const).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </Select>
          <Button onClick={submit} disabled={busy || !body.trim()}>
            Add
          </Button>
        </div>
      </div>
      <ol className="mt-5 space-y-3">
        {notes?.map((n) => (
          <li key={n._id} className="flex gap-3">
            <span
              className={cn(
                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                n.kind === "system" ? "bg-border-strong" : "bg-primary-600"
              )}
            />
            <div className="min-w-0">
              <p className={cn("whitespace-pre-wrap break-words text-sm", n.kind === "system" && "text-text-muted")}>{n.body}</p>
              <p className="text-xs text-text-dim">
                {KIND_LABELS[n.kind]} · {n.byName} · {formatInstant(n.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
