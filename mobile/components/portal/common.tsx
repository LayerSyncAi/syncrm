/** Shared pieces of the landlord and tenant portals. */
import { useState, type ReactNode } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Body, Card, EmptyState, Ionicons, Loading, Select } from "../ui";
import { colors, font, space } from "../../lib/theme";
import { moneyMap } from "../../lib/format";

export type PortalKind = "tenant" | "landlord";

export function usePortal() {
  return useQuery(api.portal.context.get);
}

/** The portal never shows a page that belongs to the other kind. */
export function NotAvailable() {
  return <EmptyState icon="lock-closed-outline" title="Not available" message="This page is not part of your portal." />;
}

/** Mounts children only for the expected kind, so their queries never run for the wrong one. */
export function KindGuard({ kind, children }: { kind: PortalKind; children: ReactNode }) {
  const portal = usePortal();
  if (portal === undefined) return <Loading />;
  if (!portal || portal.kind !== kind) return <NotAvailable />;
  return <>{children}</>;
}

/** One line per currency, never summed across currencies. */
export function moneyLines(value: Partial<Record<string, number>>): string {
  return moneyMap(value).split(" · ").join("\n");
}

/** Documents the agency shared. Opening one hands the link to the phone. */
export function DocumentList({ docs }: { docs: { _id: string; name: string; kind: string; url: string | null; propertyTitle?: string }[] }) {
  if (docs.length === 0) return <Body muted>No documents have been shared yet.</Body>;
  return (
    <View>
      {docs.map((d) => (
        <Pressable
          key={d._id}
          disabled={!d.url}
          onPress={() => d.url && Linking.openURL(d.url)}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingVertical: space.sm }}
        >
          <Ionicons name="document-text-outline" size={22} color={d.url ? colors.brand : colors.faint} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: font.md, color: d.url ? colors.brand : colors.muted }}>
              {d.name}
              {d.url ? "" : " (unavailable)"}
            </Text>
            {d.propertyTitle ? <Text style={{ fontSize: font.xs, color: colors.muted }}>{d.propertyTitle}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

type LeaseOption = { _id: string; propertyTitle: string; unitLabel: string };

/** Picks one of several leases. Hidden when there is only one. */
export function LeaseSelect({ leases, value, onChange }: { leases: LeaseOption[]; value: string; onChange: (id: string) => void }) {
  if (leases.length < 2) return null;
  return (
    <Select
      label="Lease"
      value={value}
      options={leases.map((l) => ({ value: l._id, label: `${l.propertyTitle}, ${l.unitLabel}` }))}
      onChange={onChange}
    />
  );
}

/** Selected lease id, falling back to the first. */
export function useSelectedLease<T extends { _id: string }>(leases: T[] | undefined) {
  const [picked, setPicked] = useState<string | null>(null);
  const id = picked && leases?.some((l) => l._id === picked) ? picked : (leases?.[0]?._id ?? "");
  return [id, setPicked] as const;
}

/** Photos load only when the card is opened, to save data. */
export function PhotoStrip({ urls, count }: { urls: string[]; count: number }) {
  const [show, setShow] = useState(false);
  if (count === 0) return null;
  if (!show) {
    return (
      <Pressable onPress={() => setShow(true)} style={{ minHeight: 40, justifyContent: "center" }}>
        <Text style={{ color: colors.brand, fontWeight: "600" }}>
          Show {count} photo{count === 1 ? "" : "s"}
        </Text>
      </Pressable>
    );
  }
  return <Photos urls={urls} />;
}

export function Photos({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {urls.map((u) => (
        <Pressable key={u} onPress={() => Linking.openURL(u)}>
          <Image source={{ uri: u }} style={{ width: 104, height: 104, borderRadius: 8, backgroundColor: colors.surface }} />
        </Pressable>
      ))}
    </View>
  );
}

export { Card };
