/** Small building blocks shared by the lead and task screens. */
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge, Button, DateField, Field, Ionicons, Row, Select } from "../../ui";
import { canonicalizeArea } from "../../../../convex/lib/locations";
import { getErrorMessage } from "@/lib/errors";
import { CURRENCY_OPTIONS } from "../../../lib/crm/leads/helpers";
import { TEMPERATURE_LABELS, temperatureOf } from "@/lib/temperature";
import { colors, font, radius, space } from "../../../lib/theme";

const TEMPERATURE_COLOURS = {
  hot: { bg: colors.hotBg, fg: colors.hot },
  warm: { bg: colors.warmBg, fg: colors.warm },
  cold: { bg: colors.coldBg, fg: colors.cold },
} as const;

/** Temperature and score in one chip ("Hot 72"), as on the website. */
export function ScoreBadge({ score }: { score: number | undefined | null }) {
  const t = temperatureOf(score);
  if (!t) return <Badge label="No score" />;
  const c = TEMPERATURE_COLOURS[t];
  return (
    <View style={{ borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", backgroundColor: c.bg }}>
      <Text style={{ fontSize: font.xs, fontWeight: "700", color: c.fg }}>
        {TEMPERATURE_LABELS[t]} {score}
      </Text>
    </View>
  );
}

/** A thin progress bar, 0 to 100. */
export function Bar({ percent, color = colors.primary }: { percent: number; color?: string }) {
  const w = Math.max(0, Math.min(100, percent));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}>
      <View style={{ height: 8, width: `${w}%`, backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

/** Label on the left, value on the right, then a bar. */
export function BarRow({ label, value, percent, color, hint }: { label: string; value: string; percent: number; color?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={{ fontSize: font.sm, color: colors.text, flex: 1 }} numberOfLines={1}>
          {label}
          {hint ? <Text style={{ color: colors.faint }}> {hint}</Text> : null}
        </Text>
        <Text style={{ fontSize: font.sm, color: colors.muted, fontWeight: "600" }}>{value}</Text>
      </Row>
      <Bar percent={percent} color={color} />
    </View>
  );
}

/** An amount with its currency. Currencies are never mixed. */
export function MoneyField({
  label,
  value,
  onChange,
  currency,
  onCurrency,
  error,
  editable = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  currency: string;
  onCurrency?: (c: string) => void;
  error?: string;
  editable?: boolean;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <Field label={label} value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="0.00" error={error} editable={editable} />
      {onCurrency && editable && <Select label="Currency" value={currency} options={CURRENCY_OPTIONS} onChange={onCurrency} />}
    </View>
  );
}

/** Optional date and time for scheduling a task. Time is HH:MM, 24 hour. */
export function DateTimeFields({
  date,
  time,
  onDate,
  onTime,
  label = "Date",
}: {
  date: string;
  time: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  label?: string;
}) {
  const valid = !time || /^(\d{1,2}):(\d{2})$/.test(time);
  return (
    <View style={{ gap: space.sm }}>
      <DateField label={label} value={date} onChange={onDate} hint="Leave empty for no schedule" />
      {!!date && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Time</Text>
          <TextInput
            value={time}
            onChangeText={onTime}
            placeholder="09:00"
            placeholderTextColor={colors.faint}
            keyboardType="numbers-and-punctuation"
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: valid ? colors.borderStrong : colors.danger,
              borderRadius: radius.md,
              paddingHorizontal: space.md,
              paddingVertical: 12,
              fontSize: font.md,
              color: colors.text,
            }}
          />
          <Row style={{ flexWrap: "wrap" }}>
            {["08:00", "10:00", "12:00", "14:00", "16:00"].map((t) => (
              <Pressable key={t} onPress={() => onTime(t)} style={[chip, time === t && chipOn]}>
                <Text style={{ fontSize: font.sm, color: time === t ? "#fff" : colors.text }}>{t}</Text>
              </Pressable>
            ))}
          </Row>
          {!valid && <Text style={{ fontSize: font.xs, color: colors.danger }}>Use HH:MM, e.g. 14:30</Text>}
        </View>
      )}
    </View>
  );
}

const chip = { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card };
const chipOn = { backgroundColor: colors.brand, borderColor: colors.brand };

/** A removable tag. */
export function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandLight, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ fontSize: font.sm, color: colors.brand }}>{label}</Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${label}`}>
          <Ionicons name="close" size={14} color={colors.brand} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * Preferred areas: pick from the agency's saved locations or type a new one.
 * New names are canonicalised and saved as a suggestion on a best-effort basis,
 * as on the website; a failed save never blocks the lead.
 */
export function AreaPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const locations = useQuery(api.locations.list, {});
  const createLocation = useMutation(api.locations.create);
  const [typed, setTyped] = useState("");
  const add = (area: string) => {
    const canonical = canonicalizeArea(area);
    if (canonical && !value.some((a) => a.toLowerCase() === canonical.toLowerCase())) onChange([...value, canonical]);
  };
  const addTyped = async () => {
    const name = typed.trim();
    if (!name) return;
    add(name);
    setTyped("");
    try {
      await createLocation({ name });
    } catch (e) {
      // Duplicates are expected; anything else is not worth interrupting for.
      void getErrorMessage(e);
    }
  };
  const options = (locations ?? []).filter((l) => !value.includes(l.name)).map((l) => ({ value: l.name, label: l.name }));
  return (
    <View style={{ gap: space.sm }}>
      <Select label="Preferred areas" value="" placeholder="Choose a location" options={options} onChange={add} />
      <Row>
        <View style={{ flex: 1 }}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder="Or type a new area"
            placeholderTextColor={colors.faint}
            onSubmitEditing={addTyped}
            style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: font.md, color: colors.text }}
          />
        </View>
        <Button small variant="secondary" title="Add" onPress={addTyped} disabled={!typed.trim()} />
      </Row>
      {value.length > 0 && (
        <Row style={{ flexWrap: "wrap" }}>
          {value.map((a) => (
            <Tag key={a} label={a} onRemove={() => onChange(value.filter((x) => x !== a))} />
          ))}
        </Row>
      )}
    </View>
  );
}

/** A tappable selectable row with a checkbox, for multi-select lists. */
export function CheckRow({ on, onPress, title, subtitle, right }: { on: boolean; onPress: () => void; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: on ? colors.brand : colors.border,
        backgroundColor: on ? colors.brandLight : colors.card,
      }}
    >
      <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.brand : colors.faint} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: font.sm, color: colors.muted }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

/** A field where the user types a phrase to confirm a destructive action. */
export function ConfirmPhrase({ phrase, value, onChange }: { phrase: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: font.sm, color: colors.muted }}>
        Type <Text style={{ fontWeight: "700", color: colors.text }}>{phrase}</Text> to confirm
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={phrase}
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: "#fecaca", borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: font.md, color: colors.text }}
      />
    </View>
  );
}
