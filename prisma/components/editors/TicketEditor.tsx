"use client";

import { useEffect, useState } from "react";
import { api, saveError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Modal, Pills, FormFooter, S } from "@/components/ui";
import { useCan } from "@/lib/useSession";
import { PhotoPicker, PhotoStrip, VideoPicker, VideoStrip } from "@/components/Photos";
import { MEDIA_ENABLED } from "@/lib/features";
import type { EdHouse, EdWorker } from "./TaskEditor";

export type EdTicket = {
  id: string; area: string; description: string; priority: string; status: string; reportedAt: string;
  house?: { id: string; name: string }; houseId?: string;
  assignedWorkerId?: string | null; assignedWorker?: { id?: string; name: string } | null;
  materialsUsed?: string | null; timeSpentMinutes?: number | null;
  photoUrl?: string | null; afterPhotoUrl?: string | null; mediaData?: { photos?: string[]; videos?: string[]; reportVideos?: string[] } | null;
};

const AREAS = ["Bathroom", "Kitchen", "Bedroom", "Living room", "Outdoor", "Other"];
const STATUSES = ["OPEN", "ACCEPTED", "REJECTED", "IN_PROGRESS", "TO_BE_VERIFIED", "CLOSED"];

// Report a new maintenance issue, or edit / reassign / close / reopen / delete one.
export default function TicketEditor({ ticket, houses, workers, defaultHouseId, onClose, onSaved }: {
  ticket?: EdTicket | null; houses: EdHouse[]; workers: EdWorker[]; defaultHouseId?: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { tr, ev } = useI18n();
  const editing = !!ticket;
  const canDelete = useCan("tickets.delete");
  const techs = workers.filter((w) => w.role === "worker" && w.area === "MAINTENANCE").sort((a, b) => a.name.localeCompare(b.name));

  const [houseId, setHouseId] = useState(ticket?.house?.id ?? ticket?.houseId ?? defaultHouseId ?? houses[0]?.id ?? "");
  const [area, setArea] = useState(ticket?.area ?? "Other");
  const [priority, setPriority] = useState(ticket?.priority ?? "YELLOW");
  const [description, setDescription] = useState(ticket?.description ?? "");
  const [status, setStatus] = useState(ticket?.status ?? "OPEN");
  const [workerId, setWorkerId] = useState(ticket?.assignedWorkerId ?? (ticket?.assignedWorker as any)?.id ?? "");
  const [materials, setMaterials] = useState(ticket?.materialsUsed ?? "");
  const [minutes, setMinutes] = useState(ticket?.timeSpentMinutes ? String(ticket.timeSpentMinutes) : "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
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
        await api(`/api/tickets/${ticket!.id}`, "PATCH", {
          action: "update",
          fields: {
            houseId, area, priority, description: description.trim(), status, assignedWorkerId: workerId || null,
            materialsUsed: materials, timeSpentMinutes: minutes ? Number(minutes) : null,
          },
        });
      } else {
        await api("/api/tickets", "POST", { houseId, area, priority, description: description.trim(), photoUrl: photo, videoUrl: video, reportedById: me });
      }
      onSaved();
    } catch (e) {
      setError(saveError(e, tr));
      setSaving(false);
    }
  }

  // Review of finished work: confirm it (ticket is closed, reporter told) or send it back to maintenance.
  async function review(action: "confirm" | "sendBack") {
    setSaving(true);
    setError("");
    try {
      await api(`/api/tickets/${ticket!.id}`, "PATCH", { action });
      onSaved();
    } catch (e) {
      setError(saveError(e, tr));
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api(`/api/tickets/${ticket!.id}`, "DELETE");
      onSaved();
    } catch (e) {
      setError(saveError(e, tr));
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? tr("Edit ticket") : tr("Report an Issue")} onClose={onClose}>
      <label style={S.label}>{tr("House")}</label>
      <select style={S.input} value={houseId} onChange={(e) => setHouseId(e.target.value)}>
        {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>

      <label style={S.label}>{tr("Area")}</label>
      <Pills options={AREAS} value={area} onChange={setArea} label={tr} />

      <label style={S.label}>{tr("Priority")}</label>
      <Pills options={["YELLOW", "ORANGE", "RED"]} value={priority} onChange={setPriority} label={ev} />

      <label style={S.label}>{tr("What's wrong?")}</label>
      <textarea style={{ ...S.input, height: 70 }} value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder={tr("e.g. Leaking pipe under the sink")} />

      {!editing && (
        photo ? (
          <PhotoStrip photos={[photo]} size={84} onRemove={() => setPhoto(null)} />
        ) : (
          <PhotoPicker showWhenOff label={`📷 ${tr("Attach photo")}`} style={S.ghost} onPhoto={setPhoto} />
        )
      )}
      {!editing && (
        video ? (
          <VideoStrip videos={[video]} onRemove={() => setVideo(null)} />
        ) : (
          <VideoPicker showWhenOff label={`🎥 ${tr("Attach video")}`} style={S.ghost} onVideo={setVideo} />
        )
      )}
      {MEDIA_ENABLED && editing && (ticket!.mediaData?.reportVideos?.length ?? 0) > 0 && (
        <>
          <label style={S.label}>{tr("Video of the problem")}</label>
          <VideoStrip videos={ticket!.mediaData!.reportVideos!} />
        </>
      )}

      {MEDIA_ENABLED && editing && (ticket!.photoUrl || ticket!.afterPhotoUrl) && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {ticket!.photoUrl && (
            <div>
              <label style={S.label}>{tr("Photo of the issue")}</label>
              <PhotoStrip photos={[ticket!.photoUrl]} size={84} />
            </div>
          )}
          {ticket!.afterPhotoUrl && (
            <div>
              <label style={S.label}>{tr("After-work photo")}</label>
              <PhotoStrip photos={[ticket!.afterPhotoUrl]} size={84} />
            </div>
          )}
        </div>
      )}

      {MEDIA_ENABLED && editing && ((ticket!.mediaData?.photos?.length ?? 0) > 0 || (ticket!.mediaData?.videos?.length ?? 0) > 0) && (
        <div>
          <label style={S.label}>{tr("After-work photo")}</label>
          <PhotoStrip photos={ticket!.mediaData?.photos ?? []} size={84} />
          <VideoStrip videos={ticket!.mediaData?.videos ?? []} />
        </div>
      )}

      {editing && ticket!.status === "TO_BE_VERIFIED" && (
        <div style={{ background: "#E6F0F8", borderRadius: 10, padding: "10px 12px", margin: "10px 0" }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, margin: "0 0 4px" }}>{tr("Maintenance finished this ticket — please check the work.")}</p>
          <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "0 0 8px" }}>
            {ticket!.assignedWorker?.name ? `${ticket!.assignedWorker.name} · ` : ""}
            {ticket!.timeSpentMinutes ? `${ticket!.timeSpentMinutes} min · ` : ""}
            {ticket!.materialsUsed ?? ""}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={saving} style={{ ...S.smallDark, flex: 1, padding: "9px 10px" }} onClick={() => review("confirm")}>✓ {tr("Confirm fixed")}</button>
            <button type="button" disabled={saving} style={{ ...S.small, flex: 1, padding: "9px 10px" }} onClick={() => review("sendBack")}>{tr("Send back")}</button>
          </div>
        </div>
      )}

      {editing && (
        <>
          <label style={S.label}>{tr("Status")}</label>
          <select style={S.input} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{ev(s)}</option>)}
          </select>

          <label style={S.label}>{tr("Assign to")}</label>
          <select style={S.input} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            <option value="">{tr("Unassigned")}</option>
            {techs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>

          <label style={S.label}>{tr("Materials used")}</label>
          <input style={S.input} value={materials} onChange={(e) => setMaterials(e.target.value)} />

          <label style={S.label}>{tr("Time spent (minutes)")}</label>
          <input style={S.input} type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </>
      )}

      <FormFooter saving={saving} canSave={!!houseId && !!description.trim() && (editing || !!me)} onSave={save} onClose={onClose}
        onDelete={editing && canDelete ? remove : undefined} error={error} confirmText={tr("Delete this ticket? This cannot be undone.")} />
    </Modal>
  );
}
