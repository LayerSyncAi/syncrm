/**
 * Leads: a searchable, filterable list (leads.list) and a board view
 * (leads.listByStage) where stage chips stand in for kanban columns. Admins see
 * every lead; agents see their own, as the server decides.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button, Chips, EmptyState, Fab, List, Notice, Row, SearchBar } from "../../../components/ui";
import { LeadCard } from "../../../components/crm/leads/LeadCard";
import { LeadFilters, EMPTY_FILTERS, activeFilterCount, type LeadFilterState } from "../../../components/crm/leads/LeadFilters";
import { StageMover, type MovableLead } from "../../../components/crm/leads/StageMover";
import { DeleteLeadSheet } from "../../../components/crm/leads/DeleteLeadSheet";
import { BulkMatchSheet } from "../../../components/crm/leads/BulkMatchSheet";
import { scoreRange } from "../../../lib/crm/leads/helpers";
import { isEffectiveAdmin, useDebounced, useRefresh, useSticky } from "../../../lib/crm/leads/useRefresh";
import { useSession } from "../../../lib/session";
import { space } from "../../../lib/theme";

const PAGE = 25;

type Mode = "list" | "board";

export default function LeadsTab() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = isEffectiveAdmin(user);
  const [mode, setMode] = useState<Mode>("list");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [filters, setFilters] = useState<LeadFilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [boardStage, setBoardStage] = useState<string>("");
  const [moving, setMoving] = useState<MovableLead | null>(null);
  const [deleting, setDeleting] = useState<{ _id: Id<"leads">; fullName: string; propertyTitle?: string | null } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const { refreshing, onRefresh } = useRefresh();

  const stages = useQuery(api.stages.list, {});
  const range = scoreRange(filters.score);
  const common = {
    interestType: filters.interest || undefined,
    q: q || undefined,
    ownerUserId: filters.ownerId ? (filters.ownerId as Id<"users">) : undefined,
    scoreMin: range.scoreMin,
    scoreMax: range.scoreMax,
  };
  // One growing page keeps the list stable while scrolling.
  const list = useSticky(useQuery(
    api.leads.list,
    mode === "list"
      ? {
          ...common,
          stageId: filters.stageId ? (filters.stageId as Id<"pipelineStages">) : undefined,
          propertyId: filters.propertyId ? (filters.propertyId as Id<"properties">) : undefined,
          sortBy: filters.sort || undefined,
          pageSize: limit,
        }
      : "skip"
  ));
  const board = useSticky(useQuery(api.leads.listByStage, mode === "board" ? common : "skip"));
  const review = useQuery(api.leads.listNeedsSourceReview, {});
  const reviewCount = review?.items.length ?? 0;

  const stageName = useMemo(() => new Map((stages ?? []).map((s) => [s._id as string, s.name])), [stages]);
  const activeBoardStage = boardStage || (board?.stages[0]?._id as string | undefined) || "";
  const boardItems = board ? (board.columns[activeBoardStage] ?? []) : undefined;
  const filterCount = activeFilterCount(filters, mode === "board");

  const header = (
    <View style={{ gap: space.md }}>
      <Chips<Mode>
        options={[
          { value: "list", label: "List" },
          { value: "board", label: "Board" },
        ]}
        value={mode}
        onChange={setMode}
      />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name, phone or email" />
      <Row>
        <Button small variant="secondary" icon="options-outline" title={filterCount ? `Filters (${filterCount})` : "Filters"} onPress={() => setFiltersOpen(true)} />
        <Button small variant="secondary" icon="git-compare-outline" title="Bulk match" onPress={() => setBulkOpen(true)} />
      </Row>
      {reviewCount > 0 && (
        <View style={{ gap: space.sm }}>
          <Notice tone="warning">
            {reviewCount} lead{reviewCount === 1 ? "" : "s"} still use the old generic "Property portal" source. Reassign them to see where they really came from.
          </Notice>
          <Button small variant="secondary" title="Review sources" onPress={() => router.push("/crm/leads/source-review")} />
        </View>
      )}
      {mode === "board" && board && (
        <Chips
          options={board.stages.map((s) => ({ value: s._id as string, label: `${s.name} (${board.columns[s._id]?.length ?? 0})` }))}
          value={activeBoardStage}
          onChange={setBoardStage}
        />
      )}
    </View>
  );

  const empty = (
    <EmptyState
      icon="git-network-outline"
      title="No leads to show"
      message="Capture a new opportunity, or change your filters if you expected results here."
      action={<Button title="New lead" icon="add" onPress={() => router.push("/crm/leads/new")} />}
    />
  );

  const open = (id: string) => router.push(`/crm/leads/${id}` as Href);
  const listItems = list?.items;

  return (
    <View style={{ flex: 1 }}>
      {mode === "list" ? (
        <List
          data={listItems}
          header={header}
          empty={empty}
          keyExtractor={(l) => l._id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReachedThreshold={0.4}
          onEndReached={() => list?.hasMore && setLimit((n) => n + PAGE)}
          renderItem={({ item: l }) => (
            <LeadCard
              lead={{ ...l, stageName: l.stageName }}
              onPress={() => open(l._id)}
              onStage={() => setMoving(l)}
              onDelete={() => setDeleting(l)}
            />
          )}
        />
      ) : (
        <List
          data={boardItems}
          header={header}
          empty={<EmptyState icon="albums-outline" title="No leads in this stage" />}
          keyExtractor={(l) => l._id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          renderItem={({ item: l }) => (
            <LeadCard
              lead={{ ...l, stageName: stageName.get(l.stageId) }}
              onPress={() => open(l._id)}
              onStage={() => setMoving({ ...l })}
            />
          )}
        />
      )}
      <Fab label="New lead" onPress={() => router.push("/crm/leads/new")} />
      <LeadFilters open={filtersOpen} onClose={() => setFiltersOpen(false)} value={filters} onChange={(f) => { setFilters(f); setLimit(PAGE); }} stages={stages} isAdmin={isAdmin} board={mode === "board"} />
      <StageMover open={!!moving} onClose={() => setMoving(null)} lead={moving} stages={stages} />
      <DeleteLeadSheet lead={deleting} onClose={() => setDeleting(null)} />
      <BulkMatchSheet open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </View>
  );
}
