/**
 * Platform (LayerSync staff): every organisation, module switches, read-only
 * access into any of them, platform admins and organisation deletion.
 */
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Field, Loading, Notice, Screen, SearchBar, Section } from "../components/ui";
import { ModulesSheet, PurgeSheet, formatCount, type OrgRow } from "../components/admin/PlatformSheets";
import { MODULES } from "../lib/modules";
import { useSession } from "../lib/session";
import { confirm, useRun } from "../lib/useRun";
import { dateLabel } from "../lib/format";
import { colors, font, space } from "../lib/theme";

export default function Platform() {
  const router = useRouter();
  const { loading, user } = useSession();
  const { signOut } = useAuthActions();
  const isPlatformAdmin = !!user?.isPlatformAdmin;
  const orgs = useQuery(api.platform.listOrganizations, isPlatformAdmin ? {} : "skip");
  const admins = useQuery(api.platform.listPlatformAdmins, isPlatformAdmin ? {} : "skip");
  const setViewOrg = useMutation(api.platform.setViewOrg);
  const exitViewOrg = useMutation(api.platform.exitViewOrg);
  const grant = useAction(api.platform.grantPlatformAdmin);
  const revoke = useMutation(api.platform.revokePlatformAdmin);
  const { busy, run } = useRun();

  const [search, setSearch] = useState("");
  const [modulesFor, setModulesFor] = useState<OrgRow | null>(null);
  const [purgeFor, setPurgeFor] = useState<OrgRow | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [grantResult, setGrantResult] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!orgs) return undefined;
    const q = search.trim().toLowerCase();
    return q ? orgs.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q)) : orgs;
  }, [orgs, search]);
  const viewing = orgs?.find((o) => o.isViewing) ?? null;

  if (loading) return <Loading />;
  if (!isPlatformAdmin) return <EmptyState icon="lock-closed-outline" title="Access denied" message="Platform staff only." />;

  const open = async (org: OrgRow) => {
    const ok = await run(async () => {
      await setViewOrg({ orgId: org._id });
      return true;
    });
    if (ok) router.replace("/hub");
  };

  const doGrant = async () => {
    setGrantResult(null);
    const r = await run(() => grant({ email: email.trim(), fullName: name.trim() || undefined }));
    if (!r) return;
    setGrantResult(
      r.alreadyAdmin
        ? `${email.trim()} is already a platform admin.`
        : r.created
          ? `Account created for ${email.trim()}. Temporary password: ${r.tempPasswordHint}. They must change it on first sign-in.`
          : `${email.trim()} now has platform access.`
    );
    setEmail("");
    setName("");
  };

  const doRevoke = async (id: Id<"users">, mail: string) => {
    if (!(await confirm("Revoke platform access?", `${mail} will lose platform access and be signed out. The account is deactivated. You can grant access again later by email.`, "Revoke", true))) return;
    await run(() => revoke({ userId: id }));
  };

  return (
    <>
      <Stack.Screen options={{ title: "Platform", headerBackVisible: false }} />
      <Screen>
        <Body muted>Every organisation on this deployment. Open one to inspect it read-only, without a user account inside it.</Body>

        {viewing && (
          <Notice tone="warning">
            Viewing {viewing.name}
          </Notice>
        )}
        {viewing && (
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Go to it" variant="secondary" style={{ flex: 1 }} onPress={() => router.replace("/hub")} />
            <Button title="Exit" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => run(() => exitViewOrg(), { success: "Left organisation view" })} />
          </View>
        )}

        <Section title={`Organisations${orgs ? ` (${orgs.length})` : ""}`}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name or slug" />
          {filtered === undefined ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <Body muted>No organisations match.</Body>
          ) : (
            filtered.map((org) => (
              <Card key={org._id} style={[{ gap: space.sm }, org.deletingAt ? { opacity: 0.6 } : null]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{org.name}</Text>
                    <Body small muted>{org.slug} · created {dateLabel(org.createdAt)}</Body>
                  </View>
                  {org.deletingAt ? <Badge label="Deleting" tone="danger" /> : org.isViewing ? <Badge label="Viewing" tone="warning" /> : null}
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                  {org.enabledModules.length === 0 ? <Badge label="No modules" /> : org.enabledModules.map((k) => <Badge key={k} label={MODULES[k].name} />)}
                </View>
                <Body small muted>
                  {formatCount(org.counts.users, org.countCap)} users · {formatCount(org.counts.leads, org.countCap)} leads · {formatCount(org.counts.contacts, org.countCap)} contacts · {formatCount(org.counts.properties, org.countCap)} properties
                </Body>
                <Body small muted>Last activity {org.lastActivityAt ? dateLabel(org.lastActivityAt) : "none"}</Body>
                <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                  <Button title="Open" icon="eye-outline" small variant="secondary" disabled={!!org.deletingAt || busy} onPress={() => open(org)} />
                  <Button title="Modules" icon="apps-outline" small variant="secondary" disabled={!!org.deletingAt} onPress={() => setModulesFor(org)} />
                  <Button title="Delete" icon="trash-outline" small variant="danger" disabled={!!org.deletingAt || org.isViewing} onPress={() => setPurgeFor(org)} />
                </View>
                {org.isViewing && <Body small muted>Exit the organisation view before deleting it.</Body>}
              </Card>
            ))
          )}
        </Section>

        <Section title="Platform admins">
          <Body muted>Separate accounts for LayerSync staff. They are not members of any organisation and never appear in a client's user list.</Body>
          <Card style={{ gap: space.md }}>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="person@layersync.ai" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <Field label="Name (new accounts)" value={name} onChangeText={setName} placeholder="Full name" />
            <Button title="Grant access" icon="person-add-outline" loading={busy} disabled={!email.trim()} onPress={doGrant} />
            {grantResult ? <Notice tone="success">{grantResult}</Notice> : null}
          </Card>
          {(admins ?? []).map((a) => (
            <Card key={a._id} style={{ gap: space.xs }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>
                    {a.fullName || "-"}
                    {a.isMe ? " (you)" : ""}
                  </Text>
                  <Body small muted>{a.email} · since {dateLabel(a.createdAt)}</Body>
                </View>
                <Badge label={a.isActive ? "Active" : "Inactive"} tone={a.isActive ? "success" : "neutral"} />
              </View>
              {!a.isMe && a.isActive && <Button title="Revoke" small variant="secondary" disabled={busy} onPress={() => doRevoke(a._id, a.email)} />}
            </Card>
          ))}
        </Section>

        <Button title="Sign out" icon="log-out-outline" variant="ghost" onPress={async () => { await signOut(); router.replace("/sign-in"); }} />
      </Screen>
      <ModulesSheet org={modulesFor} onClose={() => setModulesFor(null)} />
      <PurgeSheet org={purgeFor} onClose={() => setPurgeFor(null)} />
    </>
  );
}
