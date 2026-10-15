"use client";

import { useState } from "react";
import { api, saveError, toDateInput, fromDateInput } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Modal, Pills, FormFooter, S } from "@/components/ui";
import { useCan } from "@/lib/useSession";
import { PhotoStrip } from "@/components/Photos";
import { MEDIA_ENABLED } from "@/lib/features";

export type EdHouse = { id: string; name: string };
export type EdWorker = { id: string; name: string; area: string; role: string };
export type EdTask = {
  id: string; houseId?: string; house?: { id: string; name: string }; status: string; priority: string;
  scheduledDate: string; scheduledTime: string; cleaningTypes: string[];
  assignedWorkerId?: string | null; assignedWorker?: { id?: string; name: string } | null;
  estimatedMinutes?: number | null; notes?: string | null;
  nextCheckIn?: string | null; materialsNeeded?: string | null;
  startedAt?: string | null; completedAt?: string | null;
  checklistData?: { checklist?: { label: string; done: boolean }[]; photos?: string[]; videos?: string[] };
};

const TYPES = ["GENERAL", "CHECKOUT", "DEEP_CLEAN", "EXTRAORDINARY", "OUTDOOR", "BEDSHEET_CHANGE"];
const STATUSES = ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "TO_BE_VERIFIED", "APPROVED", "WITH_ISSUE"];
const DEFAULT_ITEMS = [
  "Linen & bed sheets changed", "Bathroom & toilet disinfected", "Kitchen & appliances cleaned", "Trash emptied",
];

// Create or edit a cleaning task: house, date/time, type(s), who does it,
// priority, duration, notes, status and the checklist itself.
export default function TaskEditor({ task, houses, workers, defaultHouseId, onClose, onSaved }: {
  task?: EdTask | null; houses: EdHouse[]; workers: EdWorker[]; defaultHouseId?: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { tr, ev } = useI18n();
  const editing = !!task;
  const canDelete = useCan("tasks.delete");
  const cleaners = workers.filter((w) => w.role === "worker" && w.area === "CLEANING").sort((a, b) => a.name.localeCompare(b.name));

  const [houseId, setHouseId] = useState(task?.house?.id ?? task?.houseId ?? defaultHouseId ?? houses[0]?.id ?? "");
  const [date, setDate] = useState(toDateInput(task?.scheduledDate));
  const [time, setTime] = useState(task?.scheduledTime ?? "10:00");
  const [types, setTypes] = useState<string[]>(task?.cleaningTypes ?? ["GENERAL"]);
  const [workerId, setWorkerId] = useState(task?.assignedWorkerId ?? (task?.assignedWorker as any)?.id ?? "");
  const [priority, setPriority] = useState(task?.priority ?? "YELLOW");
  const [minutes, setMinutes] = useState(task?.estimatedMinutes ? String(task.estimatedMinutes) : "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [nextCheck, setNextCheck] = useState(task?.nextCheckIn ? toDateInput(task.nextCheckIn) : "");
  const [materialsNeeded, setMaterialsNeeded] = useState(task?.materialsNeeded ?? "");
  const [status, setStatus] = useState(task?.status ?? "SCHEDULED");
  const [items, setItems] = useState<{ label: string; done: boolean }[]>(
    task?.checklistData?.checklist ?? DEFAULT_ITEMS.map((label) => ({ label, done: false }))
  );
  const [newItem, setNewItem] = useState("");
  const [photos, setPhotos] = useState<string[]>(task?.checklistData?.photos ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isCheckout = types.includes("CHECKOUT");

  // Workers with a profile pointing to a person no longer in the list still show.
  const workerOptions = [...cleaners];
  if (workerId && !cleaners.some((w) => w.id === workerId) && task?.assignedWorker) {
    workerOptions.push({ id: workerId, name: task.assignedWorker.name, area: "CLEANING", role: "worker" });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const common = {
        houseId, scheduledTime: time, cleaningTypes: types, assignedWorkerId: workerId || null,
        estimatedMinutes: minutes ? Number(minutes) : null, priority, notes: notes.trim() || null,
        scheduledDate: fromDateInput(date),
        // Only meaningful for a check-out cleaning; cleared for every other type.
        nextCheckIn: isCheckout && nextCheck ? fromDateInput(nextCheck) : null,
        materialsNeeded: materialsNeeded.trim() || null,
      };
      if (editing) {
        await api(`/api/tasks/${task!.id}`, "PATCH", { action: "update", fields: { ...common, status, checklist: items } });
      } else {
        await api("/api/tasks", "POST", { ...common, checklist: items });
      }
      onSaved();
    } catch (e) {
      setError(saveError(e, tr));
      setSaving(false);
    }
  }

  async function removePhoto(index: number) {
    setPhotos((p) => p.filter((_, i) => i !== index));
    try {
      await api(`/api/tasks/${task!.id}`, "PATCH", { action: "removePhoto", index });
    } catch (e) {
      setError(saveError(e, tr));
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api(`/api/tasks/${task!.id}`, "DELETE");
      onSaved();
    } catch (e) {
      setError(saveError(e, tr));
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? tr("Edit cleaning task") : tr("New cleaning task")} onClose={onClose}>
      <label style={S.label}>{tr("House")}</label>
      <select style={S.input} value={houseId} onChange={(e) => setHouseId(e.target.value)}>
        {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>{tr("Date")}</label>
          <input style={S.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>{tr("Time")}</label>
          <input style={S.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <label style={S.label}>{tr("Cleaning type")}</label>
      <Pills multi options={TYPES} value={types} onChange={setTypes} label={ev} />

      <label style={S.label}>{tr("Assign to")}</label>
      <select style={S.input} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
        <option value="">{tr("Unassigned")}</option>
        {workerOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>

      <label style={S.label}>{tr("Priority")}</label>
      <Pills options={["YELLOW", "ORANGE", "RED"]} value={priority} onChange={setPriority} label={ev} />

      <label style={S.label}>{tr("Estimated minutes")}</label>
      <input style={S.input} type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="60" />

      {isCheckout && (
        <>
          <label style={S.label}>{tr("Next check-in")}</label>
          <input style={S.input} type="date" value={nextCheck} onChange={(e) => setNextCheck(e.target.value)} />
        </>
      )}

      {editing && (
        <>
          <label style={S.label}>{tr("Status")}</label>
          <select style={S.input} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{ev(s)}</option>)}
          </select>
        </>
      )}

      <label style={S.label}>{tr("Notes")}</label>
      <textarea style={{ ...S.input, height: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <label style={S.label}>{tr("Products / materials needed")}</label>
      <input style={S.input} value={materialsNeeded} onChange={(e) => setMaterialsNeeded(e.target.value)} />

      {MEDIA_ENABLED && editing && photos.length > 0 && (
        <>
          <label style={S.label}>{tr("Photos")}</label>
          <PhotoStrip photos={photos} size={72} onRemove={removePhoto} />
        </>
      )}

      <label style={S.label}>{tr("Checklist")}</label>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
          <input style={S.input} value={it.label} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <button type="button" style={S.small} aria-label={tr("Remove")} onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6 }}>
        <input style={S.input} value={newItem} placeholder={tr("New checklist item")} onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) { setItems([...items, { label: newItem.trim(), done: false }]); setNewItem(""); } }} />
        <button type="button" style={S.small} onClick={() => { if (newItem.trim()) { setItems([...items, { label: newItem.trim(), done: false }]); setNewItem(""); } }}>
          {tr("Add")}
        </button>
      </div>

      <FormFooter saving={saving} canSave={!!houseId && !!date && !!time && types.length > 0} onSave={save} onClose={onClose}
        onDelete={editing && canDelete ? remove : undefined} error={error} confirmText={tr("Delete this task? This cannot be undone.")} />
    </Modal>
  );
}
