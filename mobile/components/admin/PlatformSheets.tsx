/** Platform sheets: module switches and the typed-confirmation purge. */
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, CheckList, Field, Sheet } from "../ui";
import { MODULES, MODULE_ORDER, type ModuleKey } from "../../lib/modules";
import { useRun } from "../../lib/useRun";
import { colors, font } from "../../lib/theme";

export type OrgRow = {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  deletingAt?: number;
  counts: { users: number; leads: number; contacts: number; properties: number };
  countCap: number;
  enabledModules: ModuleKey[];
};

export const formatCount = (n: number, cap: number) => (n > cap ? `${cap}+` : String(n));

export function ModulesSheet({ org, onClose }: { org: OrgRow | null; onClose: () => void }) {
  const setOrgModules = useMutation(api.hub.setOrgModules);
  const { busy, run } = useRun();
  const [draft, setDraft] = useState<ModuleKey[]>([]);
  const id = org?._id;
  useEffect(() => setDraft(org?.enabledModules ?? []), [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet
      open={!!org}
      onClose={onClose}
      title="Modules"
      footer={
        <Button
          title="Save"
          loading={busy}
          onPress={async () => {
            if (!org) return;
            const ok = await run(async () => {
              await setOrgModules({ orgId: org._id, modules: draft });
              return true;
            });
            if (ok) onClose();
          }}
        />
      }
    >
      {org && <Body muted>Choose what {org.name} can open.</Body>}
      <CheckList options={MODULE_ORDER.map((k) => ({ value: k, label: MODULES[k].name, hint: MODULES[k].tagline }))} value={draft} onChange={setDraft} />
    </Sheet>
  );
}

/** Purge is destructive and has no undo: the button stays off until the slug is typed exactly. */
export function PurgeSheet({ org, onClose }: { org: OrgRow | null; onClose: () => void }) {
  const purge = useMutation(api.platform.purgeOrganization);
  const { busy, run } = useRun();
  const [typed, setTyped] = useState("");
  const id = org?._id;
  useEffect(() => setTyped(""), [id]);

  return (
    <Sheet
      open={!!org}
      onClose={() => !busy && onClose()}
      title={org ? `Delete ${org.name}?` : "Delete organisation"}
      footer={
        <Button
          title="Delete organisation"
          variant="danger"
          loading={busy}
          disabled={!org || typed.trim() !== org.slug}
          onPress={async () => {
            if (!org) return;
            const ok = await run(
              async () => {
                await purge({ orgId: org._id, confirmSlug: typed.trim() });
                return true;
              },
              { success: `Deletion started. "${org.name}" and all of its data are being removed in the background.` }
            );
            if (ok) onClose();
          }}
        />
      }
    >
      {org && (
        <>
          <Body muted>
            This permanently removes the organisation, every user login in it, and all of its leads, contacts, properties, documents, activities and settings. There is no undo.
          </Body>
          <Body>
            This will delete {formatCount(org.counts.users, org.countCap)} users, {formatCount(org.counts.leads, org.countCap)} leads, {formatCount(org.counts.contacts, org.countCap)} contacts and{" "}
            {formatCount(org.counts.properties, org.countCap)} properties. Nothing is exported first.
          </Body>
          <Text style={{ fontSize: font.sm, color: colors.muted }}>
            Type <Text style={{ fontWeight: "700", color: colors.text }}>{org.slug}</Text> to confirm
          </Text>
          <Field label="Organisation slug" value={typed} onChangeText={setTyped} placeholder={org.slug} autoCapitalize="none" autoCorrect={false} />
        </>
      )}
    </Sheet>
  );
}
