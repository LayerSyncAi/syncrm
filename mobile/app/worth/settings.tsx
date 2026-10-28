/**
 * Worth settings: standard report wording, reference prefix, due-soon days,
 * hold-until-paid (directors), and valuer profiles with registration number,
 * qualifications and scanned signature (each valuer edits their own).
 */
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { getErrorMessage } from "@/lib/errors";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Card, Field, Loading, Notice, Row, Screen, Section, Sheet, Toggle } from "../../components/ui";
import { ErrorNote, Panel } from "../../components/worth/bits";
import { pickDocument, pickPhoto, uploadFile, type PickedFile } from "../../lib/files";
import { colors, font, radius, space } from "../../lib/theme";
import { toast } from "../../lib/toast";

type Profile = NonNullable<ReturnType<typeof useProfiles>>[number];

function useProfiles() {
  return useQuery(api.worth.settings.listProfiles);
}

/** Camera, photo library, or a PNG from Files (keeps a transparent background). */
function chooseSignature(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    Alert.alert("Signature image", "A PNG with a transparent background prints best.", [
      { text: "Take photo", onPress: () => pickPhoto("camera").then(resolve) },
      { text: "Photo library", onPress: () => pickPhoto("library").then(resolve) },
      { text: "Files", onPress: () => pickDocument(["image/png", "image/jpeg"]).then(resolve) },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
}

export default function WorthSettings() {
  const settings = useQuery(api.worth.settings.get);
  const profiles = useProfiles();
  const update = useMutation(api.worth.settings.update);
  const [f, setF] = useState<null | {
    assumptions: string;
    limitingConditions: string;
    disclaimer: string;
    holdReportUntilPaid: boolean;
    dueSoonDays: string;
    referencePrefix: string;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  useEffect(() => {
    if (settings && !f) {
      setF({
        assumptions: settings.assumptions,
        limitingConditions: settings.limitingConditions,
        disclaimer: settings.disclaimer,
        holdReportUntilPaid: settings.holdReportUntilPaid,
        dueSoonDays: String(settings.dueSoonDays),
        referencePrefix: settings.referencePrefix,
      });
    }
  }, [settings, f]);

  if (settings === undefined || !f) return <Loading />;
  const canAdmin = settings.caps.canAdmin;
  const mine = profiles?.filter((p) => p.userId === settings.userId) ?? [];
  const others = profiles?.filter((p) => p.userId !== settings.userId) ?? [];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await update({ ...f, dueSoonDays: Number(f.dueSoonDays) || 0 });
      toast.success("Settings saved");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const profileRow = (p: Profile) => (
    <Card key={p.userId}>
      <Row style={{ alignItems: "flex-start" }}>
        <View style={{ width: 96, height: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
          {p.signatureUrl ? (
            <Image source={{ uri: p.signatureUrl }} style={{ width: 88, height: 40 }} contentFit="contain" />
          ) : (
            <Text style={{ fontSize: 10, color: colors.faint }}>No signature</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>
            {p.name}
            {p.isSigning ? <Text style={{ fontSize: font.xs, color: colors.muted, fontWeight: "400" }}> · Signing valuer</Text> : null}
          </Text>
          <Text style={{ fontSize: font.xs, color: colors.muted }}>
            {p.registrationNumber ? `Reg. ${p.registrationNumber}` : "No registration number"}
            {p.qualifications ? ` · ${p.qualifications}` : ""}
          </Text>
        </View>
      </Row>
      {p.canEdit && <Button small variant="secondary" title="Edit profile" onPress={() => setEditing(p)} />}
    </Card>
  );

  return (
    <Screen automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: "Worth settings" }} />
      <Body muted small>
        Standard report wording, fee rules and valuer profiles. Agency name, address and logo come from the Hub settings and brand kit.
      </Body>

      {mine.length > 0 && <Section title="My valuer profile">{mine.map(profileRow)}</Section>}

      <Panel title="Report wording" description="Set once and printed on every report. One point per line.">
        {!canAdmin && <Notice tone="info">Only a director can change these settings.</Notice>}
        <ErrorNote message={error} />
        <Field label="Assumptions" value={f.assumptions} editable={canAdmin} multiline onChangeText={(t) => setF({ ...f, assumptions: t })} />
        <Field label="Limiting conditions" value={f.limitingConditions} editable={canAdmin} multiline onChangeText={(t) => setF({ ...f, limitingConditions: t })} />
        <Field label="Disclaimer" value={f.disclaimer} editable={canAdmin} multiline onChangeText={(t) => setF({ ...f, disclaimer: t })} />
      </Panel>

      <Panel title="Jobs and fees">
        <Field
          label="Reference prefix"
          hint={`Next reference looks like ${f.referencePrefix || "VAL"}-${new Date().getFullYear()}-0001.`}
          value={f.referencePrefix}
          editable={canAdmin}
          maxLength={8}
          autoCapitalize="characters"
          onChangeText={(t) => setF({ ...f, referencePrefix: t.toUpperCase() })}
        />
        <Field
          label="Flag jobs as due soon (days before due date)"
          value={f.dueSoonDays}
          editable={canAdmin}
          keyboardType="number-pad"
          onChangeText={(t) => setF({ ...f, dueSoonDays: t })}
        />
        <View pointerEvents={canAdmin ? "auto" : "none"} style={{ opacity: canAdmin ? 1 : 0.6 }}>
          <Toggle label="Hold issued reports until the fee is paid" value={f.holdReportUntilPaid} onChange={(v) => setF({ ...f, holdReportUntilPaid: v })} />
        </View>
        {canAdmin && <Button title="Save settings" loading={busy} onPress={save} />}
      </Panel>

      <Section title="Valuer profiles">
        <Body muted small>
          Names, registration numbers and scanned signatures printed on signed reports. Give people the Valuer or Signing valuer role under Users first.
        </Body>
        {profiles === undefined ? <Loading /> : others.length === 0 && mine.length === 0 ? <Body muted small>No valuers yet.</Body> : others.map(profileRow)}
      </Section>

      <ProfileSheet profile={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

function ProfileSheet({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const saveProfile = useMutation(api.worth.settings.saveProfile);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const [reg, setReg] = useState("");
  const [quals, setQuals] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [clear, setClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setReg(profile.registrationNumber);
      setQuals(profile.qualifications);
      setFile(null);
      setClear(false);
      setError(null);
    }
  }, [profile]);

  const save = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      let signatureStorageId: Id<"_storage"> | null | undefined;
      if (file) signatureStorageId = (await uploadFile(() => generateUploadUrl({}), file)) as Id<"_storage">;
      else if (clear) signatureStorageId = null;
      await saveProfile({ userId: profile.userId, registrationNumber: reg, qualifications: quals, signatureStorageId });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = file?.uri ?? (clear ? null : profile?.signatureUrl);

  return (
    <Sheet open={!!profile} onClose={onClose} title={profile ? `Valuer profile: ${profile.name}` : "Valuer profile"} footer={<Button title="Save" loading={busy} onPress={save} />}>
      <Body muted small>
        Printed in the signature block of every report this valuer prepares or signs.
      </Body>
      <ErrorNote message={error} />
      <Field label="Registration number" hint="Required before a signing valuer can issue reports." value={reg} onChangeText={setReg} />
      <Field label="Qualifications" value={quals} onChangeText={setQuals} placeholder="e.g. BSc Rural and Urban Planning, MRICS" />
      <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Scanned signature</Text>
      <View style={{ height: 80, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
        {preview ? <Image source={{ uri: preview }} style={{ width: "90%", height: 70 }} contentFit="contain" /> : <Text style={{ color: colors.faint }}>No signature</Text>}
      </View>
      <Row style={{ gap: space.sm }}>
        <Button
          small
          variant="secondary"
          icon="image-outline"
          title={file ? "Choose another" : "Choose image"}
          onPress={async () => {
            const picked = await chooseSignature();
            if (picked) {
              setFile(picked);
              setClear(false);
            }
          }}
        />
        {(file || (profile?.signatureUrl && !clear)) && (
          <Button
            small
            variant="danger"
            title="Remove"
            onPress={() => {
              setFile(null);
              setClear(!!profile?.signatureUrl);
            }}
          />
        )}
      </Row>
    </Sheet>
  );
}
