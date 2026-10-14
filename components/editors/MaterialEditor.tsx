"use client";

import { useEffect, useState } from "react";
import { api, saveError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Modal, Pills, FormFooter, S } from "@/components/ui";
import { useCan } from "@/lib/useSession";
import type { EdHouse } from "./TaskEditor";

export type EdMaterial = { id: string; items: string; status: string; house?: { id: string; name: string }; houseId?: string };

// Create or edit a products / materials request; mark fulfilled or reopen.
export default function MaterialEditor({ request, houses, defaultHouseId, onClose, onSaved }: {
  request?: EdMaterial | null; houses: EdHouse[]; defaultHouseId?: string; onClose: () => void; onSaved: () => void;
}) {
  const { tr } = useI18n();
  const editing = !!request;
  const canDelete = useCan("materials.delete");
  const [houseId, setHouseId] = useState(request?.house?.id ?? request?.houseId ?? defaultHouseId ?? houses[0]?.id ?? "");
  const [items, setItems] = useState(request?.items ?? "");
  const [status, setStatus] = useState(request?.status ?? "PENDING");
  const [me, setMe] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((s) => s && setMe(s.workerId));
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api(`/api/materials/${request!.id}`, "PATCH", { action: "update", fields: { items, houseId } });
        if (status !== request!.status) {
          await api(`/api/materials/${request!.id}`, "PATCH", { action: status === "FULFILLED" ? "fulfill" : "reopen" });
        }
      } else {
        await api("/api/materials", "POST", { houseId, items: items.trim(), requestedById: me });
      }
      onSaved();
    } catch (e) {
      setError(saveError(e, tr));
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api(`/api/materials/${request!.id}`, "DELETE");
      onSaved();
    } catch (e) {
      setError(saveError(e, tr));
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? tr("Edit material request") : tr("New material request")} onClose={onClose}>
      <label style={S.label}>{tr("House")}</label>
      <select style={S.input} value={houseId} onChange={(e) => setHouseId(e.target.value)}>
        {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>

      <label style={S.label}>{tr("What do you need?")}</label>
      <textarea style={{ ...S.input, height: 70 }} value={items} onChange={(e) => setItems(e.target.value)}
        placeholder={tr("e.g. Bathroom disinfectant x2, bin bags, hand soap")} />

      {editing && (
        <>
          <label style={S.label}>{tr("Status")}</label>
          <Pills options={["PENDING", "FULFILLED"]} value={status} onChange={setStatus}
            label={(o) => (o === "PENDING" ? tr("Pending") : tr("Fulfilled"))} />
        </>
      )}

      <FormFooter saving={saving} canSave={!!houseId && !!items.trim() && (editing || !!me)} onSave={save} onClose={onClose}
        onDelete={editing && canDelete ? remove : undefined} error={error} confirmText={tr("Delete this request? This cannot be undone.")} />
    </Modal>
  );
}
