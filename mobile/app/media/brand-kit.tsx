/**
 * The organisation's brochure brand kit: logo, accent, paper style and contact
 * defaults. Admins edit it; everyone else sees it read-only.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Body, Button, Card, Chips, Field, Loading, Notice, Screen, Section } from "../../components/ui";
import { BrochureCanvas } from "../../components/media/BrochureCanvas";
import { useBrandKit } from "../../lib/media/doc";
import { useSession } from "../../lib/session";
import { pickPhoto, uploadFile } from "../../lib/files";
import { useRun } from "../../lib/useRun";
import { colors, font, radius, space } from "../../lib/theme";
import { ACCENT_SUGGESTIONS, PAGE_STYLES, PAPER, resolveBrandKit } from "@/lib/syncmedia/theme";
import { EMPTY_DOC, type BrochureDoc, type PageStyle } from "@/lib/syncmedia/types";

const HEX = /^#[0-9a-f]{6}$/i;

/** A stand-in brochure so the palette is judged on the real thing. */
const PREVIEW_DOC: BrochureDoc = {
  ...EMPTY_DOC,
  templateId: "housestyle",
  title: "Four Bedroom Cluster",
  location: "Borrowdale, Harare",
  price: "$285,000",
  eyebrow: "FOR SALE",
  features: ["4 Bedrooms", "3 Bathrooms", "Double garage", "Borehole"],
  agentName: "Tendai Moyo",
  agentPhone: "+263 775 920 436",
  reference: "REF1564",
};

export default function BrandKitScreen() {
  const { hub } = useSession();
  const isAdmin = !!hub?.isAdmin;
  const { row } = useBrandKit();
  const { width } = useWindowDimensions();
  const save = useMutation(api.branding.save);
  const clearLogo = useMutation(api.branding.clearLogo);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const { busy, run } = useRun();

  const [accent, setAccent] = useState("");
  const [pageStyle, setPageStyle] = useState<PageStyle>("cream");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");

  // Seed once, so a half-typed accent is not overwritten by a reactive update.
  const seeded = useRef(false);
  useEffect(() => {
    if (!row || seeded.current) return;
    seeded.current = true;
    const k = resolveBrandKit(row);
    setAccent(k.accent);
    setPageStyle(k.pageStyle);
    setPhone(k.contactPhone);
    setEmail(k.contactEmail);
    setWebsite(k.website);
  }, [row]);

  if (row === undefined) return <Loading />;

  // The preview follows the form, not the saved row.
  const previewKit = resolveBrandKit({ ...row, accent: HEX.test(accent) ? accent : undefined, pageStyle });

  async function uploadLogo(which: "logo" | "logoOnDark") {
    const file = await pickPhoto("library");
    if (!file) return;
    await run(async () => {
      const storageId = await uploadFile(() => generateUploadUrl({}), file);
      await save(which === "logo" ? { logoRef: storageId } : { logoOnDarkRef: storageId });
    });
  }

  async function saveAll() {
    if (!HEX.test(accent)) {
      await run(async () => {
        throw new Error("Accent must be a hex colour like #3b6812.");
      });
      return;
    }
    await run(() => save({ accent, pageStyle, contactPhone: phone.trim(), contactEmail: email.trim(), website: website.trim() }), { success: "Brand kit saved" });
  }

  const logos: Array<{ which: "logo" | "logoOnDark"; label: string; hint: string; url?: string; dark: boolean }> = [
    { which: "logo", label: "Logo", hint: "Used on light backgrounds.", url: row.logoUrl, dark: false },
    { which: "logoOnDark", label: "Logo for dark backgrounds", hint: "Used on colour blocks. Falls back to the main logo.", url: row.logoOnDarkUrl, dark: true },
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: "Brand kit" }} />
      <Body muted>The logo and colours every SyncMedia brochure is built from. Changes affect new brochures across the organisation.</Body>
      {!isAdmin ? <Notice tone="info">Only admins can change the brand kit. You can see what it is set to.</Notice> : null}

      <View style={{ alignItems: "center" }}>
        <View style={{ borderWidth: 1, borderColor: colors.borderStrong }}>
          <BrochureCanvas doc={PREVIEW_DOC} brand={previewKit} width={Math.min(width - space.lg * 2, 300)} />
        </View>
      </View>

      <Section title="Logos">
        {logos.map((l) => (
          <Card key={l.which}>
            <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{l.label}</Text>
            <Body small muted>
              {l.hint}
            </Body>
            <View style={{ height: 80, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: l.dark ? "#101613" : colors.surface }}>
              {l.url ? <Image source={{ uri: l.url }} contentFit="contain" style={{ width: "80%", height: 64 }} /> : <Text style={{ color: colors.faint }}>No logo uploaded</Text>}
            </View>
            {isAdmin ? (
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button title={l.url ? "Replace" : "Upload"} icon="image-outline" variant="secondary" small onPress={() => uploadLogo(l.which)} disabled={busy} />
                {l.url ? <Button title="Remove" variant="danger" small onPress={() => run(() => clearLogo({ which: l.which }))} disabled={busy} /> : null}
              </View>
            ) : null}
          </Card>
        ))}
      </Section>

      <Section title="Colour">
        <Field label="Accent colour" value={accent} onChangeText={setAccent} editable={isAdmin} autoCapitalize="none" autoCorrect={false} maxLength={7} hint="Hex, like #3b6812." error={accent && !HEX.test(accent) ? "Use a six digit hex colour." : null} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {ACCENT_SUGGESTIONS.map((c) => (
            <Pressable
              key={c}
              disabled={!isAdmin}
              onPress={() => setAccent(c)}
              accessibilityLabel={`Use ${c}`}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: accent.toLowerCase() === c.toLowerCase() ? 3 : 1, borderColor: accent.toLowerCase() === c.toLowerCase() ? colors.text : colors.border }}
            />
          ))}
        </View>
        <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Page style</Text>
        {isAdmin ? (
          <Chips options={PAGE_STYLES.map((p) => ({ value: p, label: PAPER[p].label }))} value={pageStyle} onChange={setPageStyle} />
        ) : (
          <Body>{PAPER[pageStyle].label}</Body>
        )}
      </Section>

      <Section title="Contact defaults">
        <Field label="Phone" value={phone} onChangeText={setPhone} editable={isAdmin} keyboardType="phone-pad" hint="Fills new brochures when the agent has none." />
        <Field label="Email" value={email} onChangeText={setEmail} editable={isAdmin} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Website" value={website} onChangeText={setWebsite} editable={isAdmin} autoCapitalize="none" keyboardType="url" />
      </Section>

      {isAdmin ? <Button title="Save brand kit" variant="brand" onPress={saveAll} loading={busy} /> : null}
    </Screen>
  );
}
