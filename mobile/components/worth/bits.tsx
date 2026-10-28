/** Small building blocks shared by the Sync Worth screens. */
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { getErrorMessage } from "@/lib/errors";
import type { WorthStatus } from "../../../convex/worth/lib";
import { Badge, Body, Button, Card, Field, Notice, Row, Sheet } from "../ui";
import { colors, font, radius, space } from "../../lib/theme";
import { STATUS_LABELS, STATUS_TONE, formatDay } from "../../lib/worth/util";

export function StatusBadge({ status }: { status: WorthStatus }) {
  return <Badge label={STATUS_LABELS[status]} tone={STATUS_TONE[status]} />;
}

/** Due date, red when overdue and amber when due soon. */
export function DueText({ dueDate, flag, prefix = "" }: { dueDate: string; flag?: "overdue" | "due_soon" | null; prefix?: string }) {
  const color = flag === "overdue" ? colors.danger : flag === "due_soon" ? colors.warning : colors.muted;
  return (
    <Text style={{ fontSize: font.sm, color, fontWeight: flag ? "600" : "400" }}>
      {prefix}
      {formatDay(dueDate)}
      {flag === "overdue" ? " (overdue)" : flag === "due_soon" ? " (due soon)" : ""}
    </Text>
  );
}

/** Buttons that wrap onto a second line on a narrow phone. */
export function Actions({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>{children}</View>;
}

/** A card with a title, optional description and actions. */
export function Panel({ title, description, right, children }: { title: string; description?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <Card>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>{title}</Text>
          {description ? <Body muted small>{description}</Body> : null}
        </View>
        {right}
      </Row>
      {children}
    </Card>
  );
}

/** Two-way switch, e.g. "Choose existing" or "New client". */
export function ModeSwitch<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 2, alignSelf: "flex-start" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{ paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: on ? colors.brand : "transparent" }}
          >
            <Text style={{ fontSize: font.sm, fontWeight: "600", color: on ? "#fff" : colors.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Ask for a reason or comment in a sheet, then run `onSubmit` with it. */
export function ReasonSheet({
  open,
  title,
  description,
  label = "Reason",
  confirmLabel,
  destructive,
  initial = "",
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  confirmLabel: string;
  destructive?: boolean;
  initial?: string;
  onClose: () => void;
  onSubmit: (text: string) => Promise<unknown>;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setText(initial);
      setError(null);
    }
  }, [open, initial]);

  const submit = async () => {
    if (!text.trim()) return setError(`${label} is required.`);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(text.trim());
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={<Button title={busy ? "Saving..." : confirmLabel} variant={destructive ? "danger" : "primary"} onPress={submit} loading={busy} />}
    >
      {description ? <Body muted small>{description}</Body> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label={label} value={text} onChangeText={setText} multiline autoFocus />
    </Sheet>
  );
}

/** Inline error from a form sheet. */
export function ErrorNote({ message }: { message: string | null }) {
  return message ? <Notice tone="danger">{message}</Notice> : null;
}

/** A row of two inputs side by side. */
export function Pair({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      {Array.isArray(children)
        ? children.map((c, i) => (
            <View key={i} style={{ flex: 1 }}>
              {c}
            </View>
          ))
        : children}
    </View>
  );
}
