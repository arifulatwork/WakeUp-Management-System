"use client";

import { useState } from "react";
import { api, saveError, toDateInput, fromDateInput } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Modal, FormFooter, S } from "@/components/ui";
import { useCan } from "@/lib/useSession";
import { PhotoPicker, VideoPicker } from "@/components/Photos";
import { houseMediaUrl } from "@/components/HouseMedia";
import { MEDIA_ENABLED } from "@/lib/features";

export type EdHouseFull = {
  id: string; name: string; address: string; keyStatus: string;
  validFrom?: string | null; validUntil?: string | null;
  hasPhoto?: boolean; hasVideo?: boolean; mediaUpdatedAt?: string | null;
};
const KEY_STATES = ["AT_OFFICE", "WITH_CLEANER", "WITH_GUEST", "MISSING"];

// Add or edit a house / temporary listing (Airbnb, Booking) incl. key status.
export default function HouseEditor({ house, onClose, onSaved }: {
  house?: EdHouseFull | null; onClose: () => void; onSaved: () => void;
}) {
  const { tr, ev } = useI18n();
  const editing = !!house;
  const canDelete = useCan("houses.delete");
  const [name, setName] = useState(house?.name ?? "");
  const [address, setAddress] = useState(house?.address ?? "");
  const [keyStatus, setKeyStatus] = useState(house?.keyStatus ?? "AT_OFFICE");
  const [temporary, setTemporary] = useState(!!(house?.validFrom || house?.validUntil));
  const [from, setFrom] = useState(house?.validFrom ? toDateInput(house.validFrom) : toDateInput());
  const [until, setUntil] = useState(house?.validUntil ? toDateInput(house.validUntil) : "");
  // Apartment photo / video. undefined = unchanged, null = remove, string = newly chosen file.
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [video, setVideo] = useState<string | null | undefined>(undefined);
  const photoSrc = photo !== undefined ? photo : house?.hasPhoto ? houseMediaUrl(house.id, "photo", house.mediaUpdatedAt) : null;
  const videoSrc = video !== undefined ? video : house?.hasVideo ? houseMediaUrl(house.id, "video", house.mediaUpdatedAt) : null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const validFrom = temporary && from ? fromDateInput(from) : null;
    const validUntil = temporary && until ? fromDateInput(until) : null;
    // Only send the media that was actually changed, so saving a name doesn't re-upload a video.
    const media: Record<string, string | null> = {};
    if (photo !== undefined) media.photo = photo;
    if (video !== undefined) media.video = video;
    try {
      if (editing) {
        await api(`/api/houses/${house!.id}`, "PATCH", { name, address, keyStatus, validFrom, validUntil, ...media });
      } else {
        await api("/api/houses", "POST", { name, address, keyStatus, validFrom, validUntil, ...media });
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
      await api(`/api/houses/${house!.id}`, "DELETE");
      onSaved();
    } catch (e) {
      setError(saveError(e, tr));
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? tr("Edit house") : tr("New house")} onClose={onClose}>
      <label style={S.label}>{tr("Name")}</label>
      <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} />

      <label style={S.label}>{tr("Address")}</label>
      <input style={S.input} value={address} onChange={(e) => setAddress(e.target.value)} />

      <label style={S.label}>{tr("Key status")}</label>
      <select style={S.input} value={keyStatus} onChange={(e) => setKeyStatus(e.target.value)}>
        {KEY_STATES.map((k) => <option key={k} value={k}>{ev(k)}</option>)}
      </select>

      {MEDIA_ENABLED && (
        <>
        <label style={S.label}>{tr("Apartment photo / video")}</label>
        {photoSrc && (
          <div style={{ position: "relative", marginBottom: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            <button type="button" aria-label={tr("Remove photo")} onClick={() => setPhoto(null)}
              style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", border: "none", background: "#111", color: "#fff", cursor: "pointer", padding: 0 }}>×</button>
          </div>
        )}
        {videoSrc && (
          <div style={{ position: "relative", marginBottom: 8 }}>
            <video src={videoSrc} controls playsInline preload="metadata" style={{ width: "100%", maxHeight: 180, borderRadius: 8, background: "#000", display: "block" }} />
            <button type="button" aria-label={tr("Remove video")} onClick={() => setVideo(null)}
              style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", border: "none", background: "#111", color: "#fff", cursor: "pointer", padding: 0 }}>×</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <PhotoPicker label={`📷 ${photoSrc ? tr("Replace photo") : tr("Upload photo")}`} style={{ ...S.ghost, width: "100%" }} onPhoto={setPhoto} />
          </div>
          <div style={{ flex: 1 }}>
            <VideoPicker label={`🎬 ${videoSrc ? tr("Replace video") : tr("Upload video")}`} style={{ ...S.ghost, width: "100%" }} onVideo={setVideo} />
          </div>
        </div>

        </>
      )}

      <label style={{ ...S.label, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={temporary} onChange={(e) => setTemporary(e.target.checked)} />
        {tr("Temporary listing (Airbnb / Booking)")}
      </label>
      {temporary && (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>{tr("Valid from")}</label>
            <input style={S.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>{tr("Valid until")}</label>
            <input style={S.input} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        </div>
      )}

      <FormFooter saving={saving} canSave={!!name.trim() && !!address.trim()} onSave={save} onClose={onClose}
        onDelete={editing && canDelete ? remove : undefined} error={error}
        confirmText={tr("Delete this house and all its tasks, tickets and requests? This cannot be undone.")} />
    </Modal>
  );
}
