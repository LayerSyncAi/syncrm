/** One landlord's statement for a month, with Share PDF and Email to landlord. */
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Loading, Row } from "../ui";
import { landlordStatementPdf } from "../../lib/stay/pdf";
import { useLogo } from "../../lib/stay/share";
import { sharePdf } from "../../lib/files";
import { useRun } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";
import { getErrorMessage } from "@/lib/errors";
import { dateLabel, money } from "@/lib/stay/format";

function Lines({ title, rows }: { title: string; rows: Array<{ main: string; date: string; amount: string }> }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{title}</Text>
      {rows.map((r, i) => (
        <Row key={i} style={{ alignItems: "flex-start", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: space.xs }}>
          <View style={{ flex: 1 }}>
            <Body small>{r.main}</Body>
            <Body small muted>
              {r.date}
            </Body>
          </View>
          <Body small style={{ fontWeight: "600" }}>
            {r.amount}
          </Body>
        </Row>
      ))}
    </View>
  );
}

function Total({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Body small muted={!bold} style={bold ? { fontWeight: "700" } : undefined}>
        {label}
      </Body>
      <Body small style={{ fontWeight: bold ? "700" : "500" }}>
        {value}
      </Body>
    </Row>
  );
}

export function LandlordStatement({ landlordContactId, month }: { landlordContactId: Id<"contacts">; month: string }) {
  const st = useQuery(api.stay.statements.get, { landlordContactId, month });
  const email = useMutation(api.stay.statements.email);
  const logo = useLogo();
  const { busy, run } = useRun();
  const [preparing, setPreparing] = useState(false);

  if (st === undefined) return <Loading />;
  if (st === null) return null;

  const share = async () => {
    setPreparing(true);
    try {
      const { html, fileName } = landlordStatementPdf(st, await logo());
      await sharePdf(html, fileName);
    } catch (e) {
      Alert.alert("Could not create the PDF", getErrorMessage(e));
    } finally {
      setPreparing(false);
    }
  };

  const send = () =>
    run(
      async () => {
        await email({ landlordContactId, month });
        return true;
      },
      { success: `Statement emailed to ${st.landlord.email}` },
    );

  return (
    <View style={{ gap: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Body small muted>
        {st.properties.map((p) => `${p.name} (fee ${p.feePct}%)`).join("; ")}
        {!st.landlord.email && ". No email address on file, so this statement can only be shared as a PDF."}
      </Body>
      <Row>
        <Button small variant="secondary" icon="share-outline" title="Share PDF" onPress={share} loading={preparing} disabled={busy} style={{ flex: 1 }} />
        <Button small icon="mail-outline" title="Email landlord" onPress={send} loading={busy} disabled={preparing || !st.landlord.email} style={{ flex: 1 }} />
      </Row>

      {st.sections.length === 0 && (
        <Body small muted>
          No rent was collected and no expenses were recorded in this month.
        </Body>
      )}

      {st.sections.map((s) => {
        const m = (n: number) => money(n, s.currency);
        return (
          <View key={s.currency} style={{ gap: space.sm }}>
            <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.muted }}>{s.currency}</Text>
            {s.collections.length > 0 && (
              <Lines
                title="Rent collected"
                rows={s.collections.map((c) => ({
                  main: `${c.receiptNumber}, ${c.propertyName} ${c.unitLabel}, ${c.tenantName}. Fee ${m(c.fee)} (${c.feePct}%)`,
                  date: dateLabel(c.date),
                  amount: m(c.amount),
                }))}
              />
            )}
            {s.depositLines.length > 0 && (
              <Lines
                title="Deposit applied to amounts owed"
                rows={s.depositLines.map((d) => ({ main: `${d.propertyName} ${d.unitLabel}, ${d.tenantName}`, date: dateLabel(d.date), amount: m(d.amount) }))}
              />
            )}
            {s.expenseLines.length > 0 && (
              <Lines
                title="Expenses recharged"
                rows={s.expenseLines.map((e) => ({ main: [e.propertyName, e.description, e.supplier].filter(Boolean).join(", "), date: dateLabel(e.date), amount: m(e.amount) }))}
              />
            )}
            <View style={{ gap: 4 }}>
              <Total label="Rent collected" value={m(s.collected)} />
              {s.depositApplied > 0 && <Total label="Deposit applied" value={m(s.depositApplied)} />}
              <Total label="Less management fee" value={`-${m(s.fee)}`} />
              <Total label="Less expenses" value={`-${m(s.expenses)}`} />
              <Total label="Net due to landlord" value={m(s.net)} bold />
            </View>
          </View>
        );
      })}
    </View>
  );
}
