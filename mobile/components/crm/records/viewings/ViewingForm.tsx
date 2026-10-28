/**
 * Create or edit a viewing form, ported from the website's ViewingFormModal.
 * "Save draft" keeps it editable; "Complete and lock" needs the client's
 * signature and locks the form for audit.
 */
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { validateViewingForm } from "../../../../../convex/viewingFormLib";
import { Button, Card, DateField, Field, Notice, Section, Select } from "../../../ui";
import { SignatureField, type SignatureValue } from "./SignatureField";
import { useRun } from "../../../../lib/useRun";
import { todayIso } from "../../../../lib/format";
import { space } from "../../../../lib/theme";

export type ViewingPrefill = {
  propertyId?: Id<"properties">;
  contactId?: Id<"contacts">;
  leadId?: Id<"leads">;
  propertyAddress?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  agentUserId?: Id<"users">;
};

export function ViewingForm({
  formId,
  prefill,
  onSaved,
  onCancel,
}: {
  formId?: Id<"viewingForms">;
  prefill?: ViewingPrefill;
  onSaved: (id: Id<"viewingForms">) => void;
  onCancel?: () => void;
}) {
  const agents = useQuery(api.users.listForAssignment);
  const me = useQuery(api.users.getMe);
  const existing = useQuery(api.viewingForms.getById, formId ? { formId } : "skip");
  const createForm = useMutation(api.viewingForms.create);
  const updateForm = useMutation(api.viewingForms.update);
  const { busy, run } = useRun();

  const [viewingDate, setViewingDate] = useState(todayIso());
  const [viewingTime, setViewingTime] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientIdNumber, setClientIdNumber] = useState("");
  const [clientSpouseName, setClientSpouseName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [agentUserId, setAgentUserId] = useState("");
  const [negotiatorName, setNegotiatorName] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [clientSig, setClientSig] = useState<SignatureValue | null>(null);
  const [negotiatorSig, setNegotiatorSig] = useState<SignatureValue | null>(null);
  const [sellerSig, setSellerSig] = useState<SignatureValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locked = existing?.status === "completed";

  // Fill once from the saved form (edit) or the prefill and signed-in user (new).
  const inited = useRef(false);
  useEffect(() => {
    if (inited.current) return;
    if (formId) {
      if (!existing) return;
      setViewingDate(existing.viewingDate);
      setViewingTime(existing.viewingTime ?? "");
      setPropertyAddress(existing.propertyAddress);
      setClientName(existing.clientName);
      setClientCompany(existing.clientCompany ?? "");
      setClientIdNumber(existing.clientIdNumber ?? "");
      setClientSpouseName(existing.clientSpouseName ?? "");
      setClientPhone(existing.clientPhone ?? "");
      setClientEmail(existing.clientEmail ?? "");
      setAgentUserId(existing.agentUserId);
      setNegotiatorName(existing.negotiatorName ?? "");
      setSellerName(existing.sellerName ?? "");
      const sig = (id?: string, url?: string | null) => (id && url ? { storageId: id, url } : null);
      setClientSig(sig(existing.clientSignatureId, existing.clientSignatureUrl));
      setNegotiatorSig(sig(existing.negotiatorSignatureId, existing.negotiatorSignatureUrl));
      setSellerSig(sig(existing.sellerSignatureId, existing.sellerSignatureUrl));
      inited.current = true;
    } else {
      if (me === undefined) return;
      setPropertyAddress(prefill?.propertyAddress ?? "");
      setClientName(prefill?.clientName ?? "");
      setClientPhone(prefill?.clientPhone ?? "");
      setClientEmail(prefill?.clientEmail ?? "");
      setAgentUserId(prefill?.agentUserId ?? me?._id ?? "");
      setNegotiatorName(me?.fullName || me?.name || "");
      inited.current = true;
    }
  }, [formId, existing, me, prefill]);

  const save = async (complete: boolean) => {
    const problem = validateViewingForm({ clientName, propertyAddress, hasClientSignature: !!clientSig }, { requireSignature: complete });
    if (viewingTime && !/^\d{1,2}:\d{2}$/.test(viewingTime)) {
      setError("Enter the time as HH:MM, for example 14:30");
      return;
    }
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const args = {
      viewingDate,
      viewingTime: viewingTime || undefined,
      propertyAddress: propertyAddress.trim(),
      clientName: clientName.trim(),
      clientCompany: clientCompany.trim() || undefined,
      clientIdNumber: clientIdNumber.trim() || undefined,
      clientSpouseName: clientSpouseName.trim() || undefined,
      clientPhone: clientPhone.trim() || undefined,
      clientEmail: clientEmail.trim() || undefined,
      agentUserId: (agentUserId || me?._id) as Id<"users"> | undefined,
      negotiatorName: negotiatorName.trim(),
      clientSignatureId: clientSig?.storageId as Id<"_storage"> | undefined,
      negotiatorSignatureId: negotiatorSig?.storageId as Id<"_storage"> | undefined,
      sellerName: sellerName.trim() || undefined,
      sellerSignatureId: sellerSig?.storageId as Id<"_storage"> | undefined,
    };
    const id = await run(
      async () => {
        if (formId) {
          await updateForm({ formId, ...args, status: complete ? "completed" : undefined });
          return formId;
        }
        return await createForm({
          ...args,
          propertyId: prefill?.propertyId,
          contactId: prefill?.contactId,
          leadId: prefill?.leadId,
          status: complete ? "completed" : "draft",
        });
      },
      { success: complete ? "Viewing form completed and locked" : formId ? "Viewing form updated" : "Draft saved" }
    );
    if (id) onSaved(id);
  };

  return (
    <View style={{ gap: space.lg }}>
      {locked && <Notice tone="success">This form is completed and locked for audit. It can no longer be edited.</Notice>}

      <Card>
        <DateField label="Viewing date" value={viewingDate} onChange={setViewingDate} />
        <Field label="Viewing time" value={viewingTime} onChangeText={setViewingTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation" editable={!locked} />
        <Field label="Property address *" value={propertyAddress} onChangeText={setPropertyAddress} placeholder="e.g. 12 Enterprise Rd, Highlands, Harare" editable={!locked} />
      </Card>

      <Section title="Client details">
        <Card>
          <Field label="Client's name *" value={clientName} onChangeText={setClientName} editable={!locked} />
          <Field label="Client's company name" value={clientCompany} onChangeText={setClientCompany} editable={!locked} />
          <Field label="Client's ID no." value={clientIdNumber} onChangeText={setClientIdNumber} editable={!locked} />
          <Field label="Client's spouse's name" value={clientSpouseName} onChangeText={setClientSpouseName} editable={!locked} />
          <Field label="Client's telephone no." value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" editable={!locked} />
          <Field label="Client's email address" value={clientEmail} onChangeText={setClientEmail} keyboardType="email-address" autoCapitalize="none" editable={!locked} />
        </Card>
      </Section>

      <Section title="Negotiator">
        <Card>
          {locked ? (
            <Field label="Property negotiator (agent)" value={agents?.find((a) => a._id === agentUserId)?.name ?? ""} editable={false} />
          ) : (
            <Select label="Property negotiator (agent)" value={agentUserId} onChange={setAgentUserId} placeholder="Select agent" options={(agents ?? []).map((a) => ({ value: a._id as string, label: a.name }))} />
          )}
          <Field label="Negotiator name (as signed)" value={negotiatorName} onChangeText={setNegotiatorName} editable={!locked} />
        </Card>
      </Section>

      <Section title="Signatures">
        <Card style={{ gap: space.lg }}>
          <SignatureField label="Client signature" value={clientSig} onChange={setClientSig} disabled={locked} required />
          <SignatureField label="Property negotiator signature" value={negotiatorSig} onChange={setNegotiatorSig} disabled={locked} />
          <Field label="Seller / caretaker name" value={sellerName} onChangeText={setSellerName} editable={!locked} />
          <SignatureField label="Seller / caretaker signature" value={sellerSig} onChange={setSellerSig} disabled={locked} />
        </Card>
      </Section>

      {error && <Notice tone="danger">{error}</Notice>}

      {!locked && (
        <View style={{ gap: space.sm }}>
          <Button title="Complete and lock" icon="lock-closed-outline" onPress={() => save(true)} loading={busy} />
          <Button variant="secondary" title="Save draft" onPress={() => save(false)} disabled={busy} />
          {onCancel && <Button variant="ghost" title="Cancel" onPress={onCancel} disabled={busy} />}
        </View>
      )}
    </View>
  );
}
