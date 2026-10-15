"use client";

import { useEffect, useState } from "react";
import { api, saveError, toDateInput, fromDateInput } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Modal, FormFooter, S } from "@/components/ui";
import { useCan } from "@/lib/useSession";
import { PhotoPicker, VideoPicker } from "@/components/Photos";
import { houseMediaUrl } from "@/components/HouseMedia";
import { MEDIA_ENABLED } from "@/lib/features";
import { findDuplicate, MAX_ROOM_PHOTOS } from "@/lib/houseMode";
import { roomPhotoUrl, Room } from "@/components/CheckInGuide";

export type EdHouseFull = {
  id: string; name: string; address: string; keyStatus: string;
  validFrom?: string | null; validUntil?: string | null;
  hasPhoto?: boolean; hasVideo?: boolean; mediaUpdatedAt?: string | null;
  mode?: string; checkInText?: string | null;
};
type NewRoom = { key: string; label: string; photo: string };
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

  // School / Tourism mode + the tourism check-in guide.
  const [mode, setMode] = useState(house?.mode === "TOURISM" ? "TOURISM" : "SCHOOL");
  const [checkInText, setCheckInText] = useState(house?.checkInText ?? "");
  const [rooms, setRooms] = useState<Room[]>([]);                 // saved room photos
  const [labels, setLabels] = useState<Record<string, string>>({}); // renamed (not saved yet)
  const [removed, setRemoved] = useState<string[]>([]);            // removed (not saved yet)
  const [added, setAdded] = useState<NewRoom[]>([]);               // new (not uploaded yet)
  const [newLabel, setNewLabel] = useState("");
  useEffect(() => {
    if (!house || !MEDIA_ENABLED) return;
    fetch(`/api/houses/${house.id}/rooms`).then((r) => r.json()).then(setRooms).catch(() => {});
  }, [house]);

  // Same name twice in the same mode is not allowed (School + Tourism of one house is fine).
  const [allHouses, setAllHouses] = useState<EdHouseFull[]>([]);
  useEffect(() => { fetch("/api/houses").then((r) => r.json()).then(setAllHouses).catch(() => {}); }, []);
  const duplicate = findDuplicate(allHouses, name, mode, house?.id);
  const duplicateMsg = duplicate
    ? tr("There is already a house called “{name}” in {mode} mode. Change the name, or switch the mode.", { name: duplicate.name, mode: ev(mode) })
    : "";
  const visibleRooms = rooms.filter((r) => !removed.includes(r.id));
  const roomCount = visibleRooms.length + added.length;

  async function save() {
    setSaving(true);
    setError("");
    const validFrom = temporary && from ? fromDateInput(from) : null;
    const validUntil = temporary && until ? fromDateInput(until) : null;
    // Only send the media that was actually changed, so saving a name doesn't re-upload a video.
    const media: Record<string, string | null> = {};
    if (photo !== undefined) media.photo = photo;
    if (video !== undefined) media.video = video;
    const fields = { name, address, mode, checkInText, keyStatus, validFrom, validUntil, ...media };
    try {
      const saved = editing
        ? await api(`/api/houses/${house!.id}`, "PATCH", fields)
        : await api("/api/houses", "POST", fields);
      // Room photos of the check-in guide (tourism): apply the staged changes.
      if (mode === "TOURISM" && MEDIA_ENABLED) {
        const id = saved.id as string;
        for (const r of removed) await api(`/api/houses/${id}/rooms/${r}`, "DELETE");
        for (const [rid, label] of Object.entries(labels)) {
          if (!removed.includes(rid) && label.trim()) await api(`/api/houses/${id}/rooms/${rid}`, "PATCH", { label });
        }
        for (const a of added) await api(`/api/houses/${id}/rooms`, "POST", { label: a.label, photo: a.photo });
      }
      onSaved();
    } catch (e) {
      if ((e as { status?: number })?.status === 409) setError(duplicateMsg || tr("A house with this name already exists in this mode."));
      else setError(saveError(e, tr));
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
      <input style={{ ...S.input, ...(duplicate ? { borderColor: "var(--red)" } : {}) }} value={name} onChange={(e) => setName(e.target.value)} />

      <label style={S.label}>{tr("Mode")}</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        {(["SCHOOL", "TOURISM"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            style={{ ...(mode === m ? S.primary : S.ghost), flex: 1 }}>
            {m === "SCHOOL" ? "🎓" : "🧳"} {ev(m)}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "0 0 4px" }}>
        {mode === "SCHOOL" ? tr("Students group: the house is used as one single block.") : tr("Tourism: guests check in, with a photo and text guide.")}
      </p>
      {duplicate && (
        <div role="alert" style={{ background: "var(--red-bg)", color: "var(--red)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, margin: "8px 0" }}>
          ⚠️ {duplicateMsg}
        </div>
      )}

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

      {mode === "TOURISM" && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, margin: "14px 0 4px", background: "#FBFAF7" }}>
          <b style={{ fontSize: 13.5 }}>🔑 {tr("Check-in guide")}</b>

          <label style={S.label}>{tr("Check-in instructions")}</label>
          <textarea style={{ ...S.input, minHeight: 110, resize: "vertical", fontFamily: "inherit" }} value={checkInText}
            placeholder={tr("Key box code, Wi-Fi, parking, house rules…")} onChange={(e) => setCheckInText(e.target.value)} />

          <label style={S.label}>{tr("Photos of the rooms")}</label>
          {!MEDIA_ENABLED && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("Photos are switched off for now.")}</p>}
          {MEDIA_ENABLED && (
            <>
              {(visibleRooms.length > 0 || added.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: 8 }}>
                  {visibleRooms.map((r) => (
                    <div key={r.id} style={{ position: "relative" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={roomPhotoUrl(house!.id, r.id)} alt="" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
                      <input style={{ ...S.input, marginTop: 4, padding: "4px 6px", fontSize: 12 }} value={labels[r.id] ?? r.label}
                        onChange={(e) => setLabels({ ...labels, [r.id]: e.target.value })} />
                      <button type="button" aria-label={tr("Remove photo")} onClick={() => setRemoved([...removed, r.id])}
                        style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#111", color: "#fff", cursor: "pointer", padding: 0 }}>×</button>
                    </div>
                  ))}
                  {added.map((a) => (
                    <div key={a.key} style={{ position: "relative" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.photo} alt="" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8, border: "1px dashed var(--line)", display: "block" }} />
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{a.label}</div>
                      <button type="button" aria-label={tr("Remove photo")} onClick={() => setAdded(added.filter((x) => x.key !== a.key))}
                        style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#111", color: "#fff", cursor: "pointer", padding: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {roomCount < MAX_ROOM_PHOTOS && (
                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <input style={{ ...S.input, flex: 1, margin: 0 }} value={newLabel} placeholder={tr("Room name (e.g. Kitchen)")} onChange={(e) => setNewLabel(e.target.value)} />
                  <div style={{ opacity: newLabel.trim() ? 1 : 0.5, pointerEvents: newLabel.trim() ? "auto" : "none" }}>
                    <PhotoPicker label={`📷 ${tr("Add room photo")}`} style={S.ghost}
                      onPhoto={(p) => { setAdded((a) => [...a, { key: `${Date.now()}-${a.length}`, label: newLabel.trim(), photo: p }]); setNewLabel(""); }} />
                  </div>
                </div>
              )}
              <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 6 }}>{tr("Type the room name first, then add its photo. Changes are saved with the house.")}</p>
            </>
          )}
        </div>
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

      <FormFooter saving={saving} canSave={!!name.trim() && !!address.trim() && !duplicate} onSave={save} onClose={onClose}
        onDelete={editing && canDelete ? remove : undefined} error={error}
        confirmText={tr("Delete this house and all its tasks, tickets and requests? This cannot be undone.")} />
    </Modal>
  );
}
