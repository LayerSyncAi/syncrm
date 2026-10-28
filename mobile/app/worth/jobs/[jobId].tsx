/**
 * A valuation job, split into sections like the website's tabs: overview,
 * inspection, evidence, valuation, report, documents and activity. Accounts
 * see the overview and activity only, never values.
 */
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Card, Chips, EmptyState, Loading, Row, Screen } from "../../../components/ui";
import { DueText, StatusBadge } from "../../../components/worth/bits";
import { InspectionForm } from "../../../components/worth/InspectionForm";
import { JobActivity } from "../../../components/worth/JobActivity";
import { JobDocuments } from "../../../components/worth/JobDocuments";
import { JobEvidence } from "../../../components/worth/JobEvidence";
import { JobOverview } from "../../../components/worth/JobOverview";
import { JobReport } from "../../../components/worth/JobReport";
import { ValuationForm } from "../../../components/worth/ValuationForm";
import { PURPOSE_LABELS } from "../../../lib/worth/util";
import { colors, font } from "../../../lib/theme";

type Tab = "overview" | "inspection" | "evidence" | "valuation" | "report" | "documents" | "activity";

export default function WorthJob() {
  const params = useLocalSearchParams<{ jobId: string; tab?: string }>();
  const job = useQuery(api.worth.jobs.get, { jobId: params.jobId as Id<"worthJobs"> });
  const [tab, setTab] = useState<Tab>((params.tab as Tab) || "overview");

  useEffect(() => {
    if (params.tab) setTab(params.tab as Tab);
  }, [params.tab]);

  if (job === undefined) return <Loading />;
  if (job === null) {
    return (
      <>
        <Stack.Screen options={{ title: "Valuation" }} />
        <EmptyState icon="search-outline" title="Job not found" message="It may belong to another valuer, or you may not have access to it." />
      </>
    );
  }

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "overview", label: "Overview" },
    ...(job.caps.seesValues
      ? ([
          { value: "inspection", label: "Inspection" },
          { value: "evidence", label: "Evidence" },
          { value: "valuation", label: "Valuation" },
          { value: "report", label: "Report" },
          { value: "documents", label: "Documents" },
        ] as Array<{ value: Tab; label: string }>)
      : []),
    { value: "activity", label: "Activity" },
  ];
  const active = tabs.some((t) => t.value === tab) ? tab : "overview";

  return (
    <Screen automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: job.reference }} />
      <Card>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={{ flex: 1, fontSize: font.xl, fontWeight: "700", color: colors.text }}>{job.propertyAddress}</Text>
          <StatusBadge status={job.status} />
        </Row>
        <Text style={{ fontSize: font.sm, color: colors.muted }}>
          {[job.reference, job.version > 1 ? `Version ${job.version}` : "", job.suburb, job.clientName, PURPOSE_LABELS[job.purpose]].filter(Boolean).join(" · ")}
        </Text>
        <DueText dueDate={job.dueDate} flag={job.dueFlag} prefix="Due " />
      </Card>
      <Chips options={tabs} value={active} onChange={setTab} />
      {active === "overview" && <JobOverview job={job} />}
      {active === "inspection" && <InspectionForm job={job} />}
      {active === "evidence" && <JobEvidence job={job} />}
      {active === "valuation" && <ValuationForm key={`${job.status}-${job.version}`} job={job} />}
      {active === "report" && <JobReport job={job} />}
      {active === "documents" && <JobDocuments job={job} />}
      {active === "activity" && <JobActivity job={job} />}
    </Screen>
  );
}
