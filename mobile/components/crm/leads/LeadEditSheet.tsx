/**
 * Edit a lead after creation (leads.updateDetails). Name, phone and email also
 * update the linked contact and its other leads on the server.
 */
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { Button, Field, Notice, Select, Sheet } from "../../ui";
import { getErrorMessage } from "@/lib/errors";
import { validateEmail, validateName, validatePhone } from "@/lib/validators";
import { INTEREST_OPTIONS, LEAD_SOURCE_OPTIONS, parseMoney, type InterestType, type LeadSource } from "../../../lib/crm/leads/helpers";
import { AreaPicker, MoneyField } from "./bits";
import { DuplicateWarning } from "./DuplicateWarning";

export function LeadEditSheet({ open, onClose, lead }: { open: boolean; onClose: () => void; lead: Doc<"leads"> }) {
  const updateDetails = useMutation(api.leads.updateDetails);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState<InterestType>("rent");
  const [source, setSource] = useState<LeadSource>("walk_in");
  const [currency, setCurrency] = useState("USD");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed each time it opens so stale edits never linger.
  useEffect(() => {
    if (!open) return;
    setFullName(lead.fullName);
    setPhone(lead.phone ?? "");
    setEmail(lead.email ?? "");
    setInterest(lead.interestType);
    setSource(lead.source as LeadSource);
    setCurrency(lead.budgetCurrency || "USD");
    setMin(lead.budgetMin !== undefined ? String(lead.budgetMin) : "");
    setMax(lead.budgetMax !== undefined ? String(lead.budgetMax) : "");
    setAreas(lead.preferredAreas);
    setError("");
  }, [open, lead]);

  const minV = parseMoney(min);
  const maxV = parseMoney(max);
  const budgetError = minV !== null && maxV !== null && minV > maxV ? "Minimum cannot be more than maximum" : undefined;
  const nameError = validateName(fullName);
  const phoneError = validatePhone(phone);
  const emailError = validateEmail(email);

  const save = async () => {
    const first = nameError || phoneError || emailError || budgetError;
    if (first) {
      setError(first);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateDetails({
        leadId: lead._id,
        fullName,
        phone,
        email,
        source,
        interestType: interest,
        budgetCurrency: currency,
        budgetMin: minV,
        budgetMax: maxV,
        preferredAreas: areas,
      });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit lead" footer={<Button title="Save changes" loading={busy} onPress={save} />}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="Name" value={fullName} onChangeText={setFullName} error={fullName ? nameError : undefined} />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+263 77 000 0000" error={phone ? phoneError : undefined} />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" error={email ? emailError : undefined} />
      {!phone.trim() && !email.trim() && <Notice tone="warning">Add a phone number or email. Leads past the first stage must stay contactable.</Notice>}
      <Select label="Interest" value={interest} options={INTEREST_OPTIONS} onChange={setInterest} />
      <Select label="Source" value={source} options={LEAD_SOURCE_OPTIONS} onChange={setSource} />
      <MoneyField label="Budget minimum" value={min} onChange={setMin} currency={currency} onCurrency={setCurrency} error={budgetError} />
      <MoneyField label="Budget maximum" value={max} onChange={setMax} currency={currency} />
      <AreaPicker value={areas} onChange={setAreas} />
      <DuplicateWarning email={email.trim() || undefined} phone={phone.trim() || undefined} excludeLeadId={lead._id} />
    </Sheet>
  );
}
