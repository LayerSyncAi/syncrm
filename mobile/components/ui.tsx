/**
 * The app's building blocks. Every module builds its screens from these so
 * the whole suite looks and behaves the same. Kept plain: phone first, large
 * tap targets, no heavy images by default.
 */
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type FlatListProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, radius, space } from "../lib/theme";

export type IconName = keyof typeof Ionicons.glyphMap;
export { Ionicons };

// ── Layout ─────────────────────────────────────────────────────────────

/** A scrolling page with the app background and side gutters. */
export function Screen({
  children,
  contentStyle,
  onRefresh,
  refreshing = false,
  ...rest
}: ScrollViewProps & { children: ReactNode; contentStyle?: StyleProp<ViewStyle>; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

/** A scrolling list with the same gutters, empty state and loading state. */
export function List<T>({
  data,
  loading,
  empty,
  header,
  ...rest
}: Omit<FlatListProps<T>, "data"> & { data: T[] | undefined; loading?: boolean; empty?: ReactNode; header?: ReactNode }) {
  if (data === undefined || loading) return <Loading />;
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      data={data}
      ListHeaderComponent={header ? <>{header}</> : undefined}
      ListEmptyComponent={empty ? <>{empty}</> : undefined}
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      keyboardShouldPersistTaps="handled"
      {...rest}
    />
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({ title, right, children, style }: { title: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: space.sm }, style]}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Body({ children, muted, small, style, numberOfLines }: { children: ReactNode; muted?: boolean; small?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text numberOfLines={numberOfLines} style={[styles.body, muted && { color: colors.muted }, small && { fontSize: font.sm }, style]}>
      {children}
    </Text>
  );
}

/** Label and value pairs, e.g. lease terms. Empty values are skipped. */
export function Facts({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <View style={{ gap: space.sm }}>
      {items
        .filter((i) => i.value !== undefined && i.value !== null && i.value !== "")
        .map((i) => (
          <View key={i.label} style={styles.fact}>
            <Text style={styles.factLabel}>{i.label}</Text>
            {typeof i.value === "string" || typeof i.value === "number" ? (
              <Text style={styles.factValue}>{i.value}</Text>
            ) : (
              <View style={{ flex: 1, alignItems: "flex-end" }}>{i.value}</View>
            )}
          </View>
        ))}
    </View>
  );
}

// ── Feedback ───────────────────────────────────────────────────────────

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brand} />
      {label && <Text style={[styles.body, { color: colors.muted, marginTop: space.sm }]}>{label}</Text>}
    </View>
  );
}

export function EmptyState({ icon = "file-tray-outline", title, message, action }: { icon?: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={36} color={colors.faint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {message && <Text style={styles.emptyMessage}>{message}</Text>}
      {action}
    </View>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "danger" | "success"; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg, borderColor: t.fg + "33" }]}>
      <Text style={{ color: t.fg, fontSize: font.sm, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}

const TONES = {
  info: { bg: colors.infoBg, fg: colors.info },
  warning: { bg: colors.warningBg, fg: colors.warning },
  danger: { bg: colors.dangerBg, fg: colors.danger },
  success: { bg: colors.successBg, fg: colors.success },
  neutral: { bg: colors.surface, fg: colors.muted },
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** A headline number, e.g. arrears or open jobs. */
export function Stat({ label, value, hint, tone, onPress }: { label: string; value: string; hint?: string; tone?: "good" | "warning" | "danger"; onPress?: () => void }) {
  const color = tone === "good" ? colors.success : tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.text;
  return (
    <Card style={styles.stat} onPress={onPress}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={2}>
        {value}
      </Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </Card>
  );
}

/** Two stats per row on a phone. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={styles.statGrid}>{children}</View>;
}

// ── Lists ──────────────────────────────────────────────────────────────

/** A tappable list row: title, subtitle, optional right text or badge. */
export function ListItem({
  title,
  subtitle,
  meta,
  right,
  icon,
  onPress,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  right?: ReactNode;
  icon?: IconName;
  onPress?: () => void;
}) {
  return (
    <Card onPress={onPress} style={styles.listItem}>
      {icon && (
        <View style={styles.listIcon}>
          <Ionicons name={icon} size={18} color={colors.brand} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.listSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? <Text style={styles.listMeta}>{meta}</Text> : null}
      </View>
      {typeof right === "string" ? <Text style={styles.listRight}>{right}</Text> : right}
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.faint} />}
    </Card>
  );
}

export function SearchBar({ value, onChangeText, placeholder = "Search" }: { value: string; onChangeText: (s: string) => void; placeholder?: string }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={16} color={colors.faint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

/** Horizontal filter chips, e.g. status filters. */
export function Chips<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Actions ────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "brand";

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  style,
  small = false,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const v = BUTTONS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: v.bg, borderColor: v.border },
        (pressed || inactive) && { opacity: inactive ? 0.55 : 0.8 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} size="small" /> : icon && <Ionicons name={icon} size={small ? 15 : 18} color={v.fg} />}
      <Text style={[styles.buttonText, small && { fontSize: font.sm }, { color: v.fg }]}>{title}</Text>
    </Pressable>
  );
}

const BUTTONS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  brand: { bg: colors.brand, fg: "#fff", border: colors.brand },
  secondary: { bg: colors.card, fg: colors.text, border: colors.borderStrong },
  danger: { bg: colors.card, fg: colors.danger, border: "#fecaca" },
  ghost: { bg: "transparent", fg: colors.brand, border: "transparent" },
};

/** Round floating button for the main action on a list screen. */
export function Fab({ icon = "add", onPress, label }: { icon?: IconName; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={26} color="#fff" />
    </Pressable>
  );
}

// ── Forms ──────────────────────────────────────────────────────────────

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.faint}
        style={[styles.input, input.multiline && styles.inputMultiline, error ? { borderColor: colors.danger } : null]}
        {...input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function PasswordField({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View>
        <TextInput
          placeholderTextColor={colors.faint}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { paddingRight: 44 }]}
          {...input}
        />
        <Pressable onPress={() => setShown((s) => !s)} style={styles.eye} accessibilityLabel={shown ? "Hide password" : "Show password"}>
          <Ionicons name={shown ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
        </Pressable>
      </View>
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

/** A select that opens a bottom sheet of options. */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose",
  hint,
}: {
  label: string;
  value: T | "" | null | undefined;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={[styles.input, styles.selectBox]}>
        <Text style={{ color: current ? colors.text : colors.faint, fontSize: font.md, flex: 1 }} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </Pressable>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <ScrollView style={{ maxHeight: 420 }}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={styles.option}
            >
              <Text style={[styles.body, o.value === value && { fontWeight: "700", color: colors.brand }]}>{o.label}</Text>
              {o.value === value && <Ionicons name="checkmark" size={18} color={colors.brand} />}
            </Pressable>
          ))}
          {options.length === 0 && <Text style={[styles.body, { color: colors.muted, padding: space.lg }]}>Nothing to choose from yet.</Text>}
        </ScrollView>
      </Sheet>
    </View>
  );
}

/** Several checkboxes in a list. */
export function CheckList<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string; hint?: string }>; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <View style={{ gap: space.xs }}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <Pressable key={o.value} onPress={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])} style={styles.check}>
            <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.brand : colors.faint} />
            <View style={{ flex: 1 }}>
              <Text style={styles.body}>{o.label}</Text>
              {o.hint && <Text style={styles.hint}>{o.hint}</Text>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.check}>
      <Ionicons name={value ? "checkbox" : "square-outline"} size={22} color={value ? colors.brand : colors.faint} />
      <View style={{ flex: 1 }}>
        <Text style={styles.body}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

/** Date typed as YYYY-MM-DD, with quick "Today" fill. Stored the same way as on the website. */
export function DateField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const valid = !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.faint}
          keyboardType="numbers-and-punctuation"
          style={[styles.input, { flex: 1 }, !valid && { borderColor: colors.danger }]}
        />
        <Button
          small
          variant="secondary"
          title="Today"
          onPress={() => {
            const d = new Date();
            onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
          }}
        />
      </View>
      {!valid ? <Text style={styles.error}>Use YYYY-MM-DD</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

// ── Sheets ─────────────────────────────────────────────────────────────

/** A bottom sheet for forms and pickers. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer && <View style={styles.sheetFoot}>{footer}</View>}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: space.lg, gap: space.lg, paddingBottom: 96 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: colors.background },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: font.sm, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  title: { fontSize: font.xl, fontWeight: "700", color: colors.text },
  body: { fontSize: font.md, color: colors.text, lineHeight: 21 },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  factLabel: { fontSize: font.sm, color: colors.muted, flexShrink: 0 },
  factValue: { fontSize: font.sm, color: colors.text, fontWeight: "500", textAlign: "right", flex: 1 },
  empty: { alignItems: "center", padding: space.xxl, gap: space.sm },
  emptyTitle: { fontSize: font.lg, fontWeight: "600", color: colors.text, textAlign: "center" },
  emptyMessage: { fontSize: font.sm, color: colors.muted, textAlign: "center", lineHeight: 19 },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  badgeText: { fontSize: font.xs, fontWeight: "700" },
  stat: { flexBasis: "47%", flexGrow: 1, gap: 2, padding: space.md },
  statLabel: { fontSize: font.xs, color: colors.muted, fontWeight: "600" },
  statValue: { fontSize: font.lg, fontWeight: "700" },
  statHint: { fontSize: font.xs, color: colors.faint },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  listItem: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  listIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandLight, alignItems: "center", justifyContent: "center" },
  listTitle: { fontSize: font.md, fontWeight: "600", color: colors.text },
  listSubtitle: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  listMeta: { fontSize: font.xs, color: colors.faint, marginTop: 2 },
  listRight: { fontSize: font.sm, fontWeight: "600", color: colors.text },
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: font.md, color: colors.text },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: font.sm, color: colors.text, fontWeight: "500" },
  chipTextOn: { color: "#fff" },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1 },
  buttonSmall: { minHeight: 36, paddingHorizontal: space.md },
  buttonText: { fontSize: font.md, fontWeight: "600" },
  fab: { position: "absolute", right: space.lg, bottom: space.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  field: { gap: 6 },
  label: { fontSize: font.sm, fontWeight: "600", color: colors.text },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: font.md, color: colors.text },
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },
  selectBox: { flexDirection: "row", alignItems: "center" },
  hint: { fontSize: font.xs, color: colors.muted },
  error: { fontSize: font.xs, color: colors.danger },
  eye: { position: "absolute", right: 0, top: 0, bottom: 0, width: 44, alignItems: "center", justifyContent: "center" },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  check: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingVertical: space.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "88%" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { fontSize: font.lg, fontWeight: "700", color: colors.text },
  sheetFoot: { padding: space.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: space.sm },
});
