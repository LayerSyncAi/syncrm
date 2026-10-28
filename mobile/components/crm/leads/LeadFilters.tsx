/** The lead list filters, in a bottom sheet. Owner is for admins only, as the server only widens for them. */
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button, Select, Sheet } from "../../ui";
import { INTEREST_OPTIONS, SCORE_OPTIONS, type ScoreBucket, type StageLite } from "../../../lib/crm/leads/helpers";

export type LeadFilterState = {
  stageId: string;
  interest: "" | "rent" | "buy";
  score: ScoreBucket;
  propertyId: string;
  ownerId: string;
  sort: "" | "score_desc" | "score_asc";
};

export const EMPTY_FILTERS: LeadFilterState = { stageId: "", interest: "", score: "", propertyId: "", ownerId: "", sort: "" };

export function activeFilterCount(f: LeadFilterState, board: boolean): number {
  return [board ? "" : f.stageId, f.interest, f.score, board ? "" : f.propertyId, f.ownerId, board ? "" : f.sort].filter(Boolean).length;
}

export function LeadFilters({
  open,
  onClose,
  value,
  onChange,
  stages,
  isAdmin,
  board,
}: {
  open: boolean;
  onClose: () => void;
  value: LeadFilterState;
  onChange: (v: LeadFilterState) => void;
  stages: StageLite[] | undefined;
  isAdmin: boolean;
  /** The board shows every stage, and has no property filter or sort. */
  board: boolean;
}) {
  const users = useQuery(api.users.listActiveUsers, open && isAdmin ? {} : "skip");
  const properties = useQuery(api.properties.list, open && !board ? {} : "skip");
  const set = <K extends keyof LeadFilterState>(k: K, v: LeadFilterState[K]) => onChange({ ...value, [k]: v });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter leads"
      footer={
        <>
          <Button title="Show leads" onPress={onClose} />
          <Button title="Clear filters" variant="secondary" onPress={() => onChange(EMPTY_FILTERS)} />
        </>
      }
    >
      {!board && (
        <Select label="Stage" value={value.stageId} options={[{ value: "", label: "All stages" }, ...(stages ?? []).map((s) => ({ value: s._id as string, label: s.name }))]} onChange={(v) => set("stageId", v)} />
      )}
      <Select label="Interest" value={value.interest} options={[{ value: "" as const, label: "Rent or buy" }, ...INTEREST_OPTIONS]} onChange={(v) => set("interest", v)} />
      <Select label="Lead score" value={value.score} options={SCORE_OPTIONS} onChange={(v) => set("score", v)} />
      {!board && (
        <Select
          label="Property"
          value={value.propertyId}
          options={[{ value: "", label: "All properties" }, ...(properties?.items ?? []).map((p) => ({ value: p._id as string, label: p.title }))]}
          onChange={(v) => set("propertyId", v)}
        />
      )}
      {isAdmin && (
        <Select label="Owner" value={value.ownerId} options={[{ value: "", label: "All owners" }, ...(users ?? []).map((u) => ({ value: u._id as string, label: u.name }))]} onChange={(v) => set("ownerId", v)} />
      )}
      {!board && (
        <Select
          label="Sort"
          value={value.sort}
          options={[
            { value: "" as const, label: "Default order" },
            { value: "score_desc" as const, label: "Score, highest first" },
            { value: "score_asc" as const, label: "Score, lowest first" },
          ]}
          onChange={(v) => set("sort", v)}
        />
      )}
    </Sheet>
  );
}
