/** Landlord monthly statement, shareable as a PDF, and the documents the agency shared. */
import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Body, Button, Card, Field, Loading, Screen, Section, Title } from "../../components/ui";
import { DocumentList, KindGuard, usePortal } from "../../components/portal/common";
import { shareStatementPdf } from "../../lib/portal/pdf";
import { useRun } from "../../lib/useRun";
import { money } from "../../lib/format";
import { colors, font, space } from "../../lib/theme";

/** Last month as YYYY-MM: the statement a landlord usually wants. */
function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontSize: font.md, color: strong ? colors.text : colors.muted, fontWeight: strong ? "700" : "400" }}>{label}</Text>
      <Text style={{ fontSize: font.md, color: colors.text, fontWeight: strong ? "700" : "400" }}>{value}</Text>
    </View>
  );
}

function Inner() {
  const [month, setMonth] = useState(lastMonth);
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const st = useQuery(api.portal.landlord.statement, valid ? { month } : "skip");
  const portal = usePortal();
  const docs = useQuery(api.portal.landlord.documents);
  const { busy, run } = useRun();

  return (
    <Screen>
      <Title>Statements</Title>
      <Card style={{ gap: space.md }}>
        <Field label="Month" hint="Year and month, for example 2026-09" value={month} onChangeText={setMonth} placeholder="YYYY-MM" keyboardType="numbers-and-punctuation" maxLength={7} />
        {valid && st === undefined ? (
          <Loading />
        ) : !valid ? (
          <Body muted>Enter the month as YYYY-MM.</Body>
        ) : !st || st.sections.length === 0 ? (
          <Body muted>Nothing collected or spent in {st?.monthLabel ?? "this month"}.</Body>
        ) : (
          <>
            {st.sections.map((s) => (
              <View key={s.currency} style={{ gap: 2 }}>
                <Line label="Rent collected" value={money(s.collected, s.currency)} />
                {s.depositApplied > 0 && <Line label="Deposit applied" value={money(s.depositApplied, s.currency)} />}
                <Line label="Management fee" value={`-${money(s.fee, s.currency)}`} />
                <Line label="Expenses" value={`-${money(s.expenses, s.currency)}`} />
                <Line label="Due to you" value={money(s.net, s.currency)} strong />
              </View>
            ))}
            <Body small muted>The PDF lists every receipt and expense behind these figures.</Body>
          </>
        )}
        {st ? <Button title="Share PDF" icon="share-outline" variant="secondary" loading={busy} onPress={() => run(() => shareStatementPdf(st, portal?.logoUrl))} /> : null}
      </Card>
      <Section title="Shared documents">
        <Card>{docs === undefined ? <Loading /> : <DocumentList docs={docs} />}</Card>
      </Section>
    </Screen>
  );
}

export default function PortalStatements() {
  return (
    <KindGuard kind="landlord">
      <Inner />
    </KindGuard>
  );
}
