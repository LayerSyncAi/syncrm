/** Valuation jobs: search, status and valuer filters. */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { WorthStatus } from "../../../../convex/worth/lib";
import { Chips, EmptyState, Fab, List, SearchBar, Select } from "../../../components/ui";
import { JobCard } from "../../../components/worth/JobCard";
import { STATUS_LABELS, formatMoney, useDebounced, useKeep, usePullRefresh } from "../../../lib/worth/util";
import { space } from "../../../lib/theme";

type StatusFilter = WorthStatus | "open" | "all";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "open", label: "All open" },
  { value: "all", label: "All" },
  ...(Object.keys(STATUS_LABELS) as WorthStatus[]).map((s) => ({ value: s as StatusFilter, label: STATUS_LABELS[s] })),
];

export default function WorthJobs() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const settings = useQuery(api.worth.settings.get);
  const caps = settings?.caps;
  const [status, setStatus] = useState<StatusFilter>((params.status as StatusFilter) || "open");
  const [valuerId, setValuerId] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const { refreshing, onRefresh } = usePullRefresh();

  // The dashboard opens this tab with a status already chosen.
  useEffect(() => {
    if (params.status) setStatus(params.status as StatusFilter);
  }, [params.status]);

  const jobs = useKeep(
    useQuery(api.worth.jobs.list, {
      status: status === "all" ? undefined : status,
      valuerId: (valuerId as Id<"users">) || undefined,
      q: dq || undefined,
    })
  );
  const valuers = useQuery(api.worth.jobs.valuers, caps?.seesAllJobs ? {} : "skip");

  return (
    <View style={{ flex: 1 }}>
      <List
        data={jobs}
        keyExtractor={(j) => j._id}
        onRefresh={onRefresh}
        refreshing={refreshing}
        header={
          <View style={{ gap: space.sm, marginBottom: space.sm }}>
            <SearchBar value={q} onChangeText={setQ} placeholder="Reference, client, address or suburb" />
            <Chips options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            {caps?.seesAllJobs && (
              <Select
                label="Valuer"
                value={valuerId}
                placeholder="All valuers"
                options={[{ value: "", label: "All valuers" }, ...(valuers ?? []).map((v) => ({ value: v.userId as string, label: `${v.name} (${v.openJobs} open)` }))]}
                onChange={setValuerId}
              />
            )}
          </View>
        }
        empty={
          <EmptyState
            icon="clipboard-outline"
            title={dq || status !== "open" ? "No matching jobs" : "No open valuations"}
            message={caps?.canManageJobs ? "Log an instruction when a bank, owner or lawyer asks for a valuation." : "Jobs assigned to you will appear here."}
          />
        }
        renderItem={({ item: j }) => (
          <JobCard
            job={{ ...j, valuerName: j.valuerName ? `${j.valuerName} · ${formatMoney(j.fee, j.currency)}${j.paid ? " paid" : ""}` : `Unassigned · ${formatMoney(j.fee, j.currency)}` }}
            onPress={() => router.push(`/worth/jobs/${j._id}` as Href)}
          />
        )}
      />
      {caps?.canManageJobs && <Fab label="Log instruction" onPress={() => router.push("/worth/jobs/new" as Href)} />}
    </View>
  );
}
