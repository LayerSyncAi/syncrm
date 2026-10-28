/**
 * Sheets for activities (tasks), shared by the lead timeline and the Tasks
 * screen: log or create one, complete it with notes, and reschedule it.
 */
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Field, Select, Sheet } from "../../ui";
import { getErrorMessage } from "@/lib/errors";
import { ACTIVITY_TYPE_OPTIONS, fromInstant, timezone, toInstant, type ActivityType } from "../../../lib/crm/leads/helpers";
import { DateTimeFields } from "./bits";

/**
 * New activity. With a leadId it is logged on that lead (activities.createForLead);
 * without one it is a standalone task that may name a property or contact.
 */
export function ActivityFormSheet({ open, onClose, leadId }: { open: boolean; onClose: () => void; leadId?: Id<"leads"> }) {
  const createForLead = useMutation(api.activities.createForLead);
  const createStandalone = useMutation(api.activities.createStandalone);
  const standalone = !leadId;
  const properties = useQuery(api.properties.list, open && standalone ? {} : "skip");
  const contacts = useQuery(api.contacts.list, open && standalone ? { role: "all" as const } : "skip");
  const [type, setType] = useState<ActivityType>(standalone ? "meeting" : "call");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(standalone ? "meeting" : "call");
    setTitle("");
    setDescription("");
    setDate("");
    setTime("");
    setPropertyId("");
    setContactId("");
  }, [open, standalone]);

  const save = async () => {
    const scheduledAt = date ? toInstant(date, time) : null;
    if (date && scheduledAt === null) {
      Alert.alert("Check the date and time", "Use YYYY-MM-DD and HH:MM.");
      return;
    }
    const common = {
      type,
      title: title.trim(),
      description: description.trim(),
      scheduledAt: scheduledAt ?? undefined,
      scheduledTimezone: scheduledAt ? timezone() : undefined,
    };
    setBusy(true);
    try {
      if (leadId) await createForLead({ leadId, ...common });
      else
        await createStandalone({
          ...common,
          propertyId: propertyId ? (propertyId as Id<"properties">) : undefined,
          contactId: contactId ? (contactId as Id<"contacts">) : undefined,
        });
      onClose();
    } catch (e) {
      Alert.alert("Could not save", getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={standalone ? "New task" : "Log activity"}
      footer={<Button title={standalone ? "Create task" : "Save activity"} loading={busy} disabled={!title.trim()} onPress={save} />}
    >
      <Select label="Type" value={type} options={ACTIVITY_TYPE_OPTIONS} onChange={setType} />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Call about the Borrowdale house" />
      <DateTimeFields date={date} time={time} onDate={setDate} onTime={setTime} label="Scheduled date" />
      <Field label="Description" value={description} onChangeText={setDescription} multiline placeholder="Details" />
      {standalone && (
        <>
          <Select
            label="Property"
            value={propertyId}
            options={[{ value: "", label: "No property" }, ...(properties?.items ?? []).map((p) => ({ value: p._id as string, label: p.title }))]}
            onChange={setPropertyId}
          />
          <Select
            label="Contact"
            value={contactId}
            options={[{ value: "", label: "No contact" }, ...(contacts?.items ?? []).map((c) => ({ value: c._id as string, label: c.name }))]}
            onChange={setContactId}
          />
        </>
      )}
    </Sheet>
  );
}

/** Mark an activity done. Notes are required, as on the website. */
export function CompleteSheet({ activity, onClose }: { activity: { _id: Id<"activities">; title: string } | null; onClose: () => void }) {
  const markComplete = useMutation(api.activities.markComplete);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setNotes(""), [activity?._id]);
  const save = async () => {
    if (!activity) return;
    setBusy(true);
    try {
      await markComplete({ activityId: activity._id, completionNotes: notes.trim() });
      onClose();
    } catch (e) {
      Alert.alert("Could not complete", getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={!!activity} onClose={onClose} title="Complete activity" footer={<Button title="Mark complete" loading={busy} disabled={!notes.trim()} onPress={save} />}>
      <Body muted>{activity?.title}</Body>
      <Field label="Completion notes" value={notes} onChangeText={setNotes} multiline placeholder="What happened, or the next steps" hint="Shown in the timeline and on the Tasks screen." />
    </Sheet>
  );
}

/** Move an activity to a new date and time (activities.update). */
export function RescheduleSheet({ activity, onClose }: { activity: { _id: Id<"activities">; title: string; scheduledAt?: number } | null; onClose: () => void }) {
  const update = useMutation(api.activities.update);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const f = fromInstant(activity?.scheduledAt);
    setDate(f.date);
    setTime(f.time || "09:00");
  }, [activity?._id, activity?.scheduledAt]);
  const save = async () => {
    if (!activity) return;
    const at = toInstant(date, time);
    if (at === null) {
      Alert.alert("Check the date and time", "Use YYYY-MM-DD and HH:MM.");
      return;
    }
    setBusy(true);
    try {
      await update({ activityId: activity._id, scheduledAt: at, scheduledTimezone: timezone() });
      onClose();
    } catch (e) {
      Alert.alert("Could not reschedule", getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const quick = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDate(fromInstant(d.getTime()).date);
  };
  return (
    <Sheet
      open={!!activity}
      onClose={onClose}
      title="Reschedule"
      footer={<Button title="Save new time" loading={busy} disabled={!date} onPress={save} />}
    >
      <Body muted>{activity?.title}</Body>
      <DateTimeFields date={date} time={time} onDate={setDate} onTime={setTime} label="New date" />
      <Button small variant="secondary" title="Tomorrow" onPress={() => quick(1)} />
      <Button small variant="secondary" title="Next week" onPress={() => quick(7)} />
    </Sheet>
  );
}
