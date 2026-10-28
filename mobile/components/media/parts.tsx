/**
 * Building blocks shared by the brochure templates. A port of the website's
 * templates/shared.tsx to React Native views: every size is a design unit
 * (1/1080th of the reference canvas) multiplied by `s`, so one layout renders
 * the same at preview size and at export size.
 */
import type { ReactNode } from "react";
import { Platform, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { FormatPreset } from "@/lib/syncmedia/formats";
import { getNudge, type SlotId } from "@/lib/syncmedia/nudges";
import type { BrandKit, BrochureDoc, BrochureTheme, Photo } from "@/lib/syncmedia/types";

export type Scale = (n: number) => number;

export interface TemplateProps {
  doc: BrochureDoc;
  theme: BrochureTheme;
  preset: FormatPreset;
  brand: BrandKit;
  /** Design units to screen pixels. */
  s: Scale;
}

export const SERIF = Platform.select({ ios: "Georgia", default: "serif" });
export const SANS = Platform.select({ ios: "System", default: "sans-serif" });

/**
 * Design units to pixels for a canvas drawn `k` times its export size. The
 * `1.35` caps how wide a short banner is sized off its long edge, as on the web.
 */
export function makeScale(preset: FormatPreset, k: number): Scale {
  const u = Math.min(preset.width, preset.height * 1.35) / 1080;
  return (n) => Math.round(n * u * k * 100) / 100;
}

export function usablePhotos(doc: BrochureDoc, limit: number): Photo[] {
  return doc.photos.slice(0, Math.max(1, limit));
}

export function usableFeatures(doc: BrochureDoc, limit: number): string[] {
  return doc.features.map((f) => f.trim()).filter(Boolean).slice(0, limit);
}

function joinParts(parts: (string | undefined)[], sep = " · "): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(sep);
}

/** A block the agent has nudged on the web keeps its offset here. */
export function Slot({
  id,
  doc,
  style,
  children,
}: {
  id: SlotId;
  doc: BrochureDoc;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const offset = getNudge(doc.nudges, doc.formatKey, id);
  const moved = offset.x !== 0 || offset.y !== 0;
  return <View style={[style, moved && { transform: [{ translateX: offset.x }, { translateY: offset.y }] }]}>{children}</View>;
}

/** Nudges are in canvas pixels, so Slot offsets need the preview ratio. */
export function nudgedDoc(doc: BrochureDoc, k: number): BrochureDoc {
  if (k === 1 || !doc.nudges?.length) return doc;
  return { ...doc, nudges: doc.nudges.map((n) => ({ ...n, x: n.x * k, y: n.y * k })) };
}

export function PhotoBox({ photo, style, radius }: { photo: Photo | undefined; style?: StyleProp<ViewStyle>; radius?: number }) {
  return (
    <View style={[{ overflow: "hidden", borderRadius: radius }, style]}>
      {photo?.url ? <Image source={{ uri: photo.url }} contentFit="cover" style={{ width: "100%", height: "100%" }} /> : null}
    </View>
  );
}

export function ThumbStrip({
  photos,
  vertical,
  thickness,
  radius,
  gap,
  borderWidth,
  borderColor,
}: {
  photos: Photo[];
  vertical: boolean;
  thickness: number;
  radius: number;
  gap: number;
  borderWidth?: number;
  borderColor?: string;
}) {
  if (photos.length === 0) return null;
  return (
    <View
      style={{
        flexDirection: vertical ? "column" : "row",
        gap,
        flexShrink: 0,
        width: vertical ? thickness : undefined,
        height: vertical ? undefined : thickness,
      }}
    >
      {photos.map((photo, i) => (
        <PhotoBox
          key={`${photo.ref}-${i}`}
          photo={photo}
          radius={radius}
          style={{ flex: 1, minWidth: 0, minHeight: 0, borderWidth, borderColor }}
        />
      ))}
    </View>
  );
}

export function Placeholder({ theme, s, style }: { theme: BrochureTheme; s: Scale; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ alignItems: "center", justifyContent: "center", backgroundColor: theme.accentSoft }, style]}>
      <Text style={{ color: theme.onAccentSoft, fontSize: s(22), fontWeight: "600", opacity: 0.65 }}>Add a photo</Text>
    </View>
  );
}

/** The logo, or the organisation name in the display serif when there is none. */
export function BrandMark({
  s,
  color,
  brand,
  onDark = false,
  markHeight = 96,
  wordSize = 40,
}: {
  s: Scale;
  color: string;
  brand: BrandKit;
  onDark?: boolean;
  markHeight?: number;
  wordSize?: number;
}) {
  const src = onDark ? brand.logoOnDarkUrl ?? brand.logoUrl : brand.logoUrl;
  if (src) {
    return <Image source={{ uri: src }} contentFit="contain" style={{ height: s(markHeight), width: s(markHeight * 3) }} />;
  }
  return <Text style={{ fontFamily: SERIF, fontWeight: "500", fontSize: s(wordSize), color }}>{brand.orgName}</Text>;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/** A rounded square holding the logo, or the organisation's initials. */
export function BrandTile({ size, bg, fg, radius, brand }: { size: number; bg: string; fg: string; radius: number; brand: BrandKit }) {
  const src = brand.logoOnDarkUrl ?? brand.logoUrl;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {src ? (
        <Image source={{ uri: src }} contentFit="contain" style={{ width: size * 0.74, height: size * 0.74 }} />
      ) : (
        <Text style={{ fontFamily: SERIF, fontWeight: "600", color: fg, fontSize: size * 0.42 }}>{initialsOf(brand.orgName)}</Text>
      )}
    </View>
  );
}

export function WhatsAppBadge({ size, bg, fg }: { size: number; bg: string; fg: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="logo-whatsapp" size={size * 0.64} color={fg} />
    </View>
  );
}

export function ContactLines({
  doc,
  s,
  color,
  mutedColor,
  behind,
  nameSize = 26,
  detailSize = 24,
  align = "left",
}: {
  doc: BrochureDoc;
  s: Scale;
  color: string;
  mutedColor: string;
  behind: string;
  nameSize?: number;
  detailSize?: number;
  align?: "left" | "right";
}) {
  const details = joinParts([doc.agentPhone, doc.agentEmail], "  ·  ");
  const showMark = doc.whatsappContact && doc.agentPhone.trim().length > 0;
  return (
    <View style={{ minWidth: 0, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      {doc.agentName ? <Text style={{ fontSize: s(nameSize), fontWeight: "700", color, textAlign: align }}>{doc.agentName}</Text> : null}
      {details ? (
        <View style={{ marginTop: s(5), flexDirection: "row", alignItems: "center", gap: s(9) }}>
          {showMark ? <WhatsAppBadge size={s(detailSize * 1.15)} bg={color} fg={behind} /> : null}
          <Text style={{ fontSize: s(detailSize), color: mutedColor, flexShrink: 1 }}>{details}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Text style helpers keep the templates short. */
export function type(s: Scale, size: number, extra?: TextStyle): TextStyle {
  return { fontSize: s(size), ...extra };
}
