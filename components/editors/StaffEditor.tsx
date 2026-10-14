"use client";

import { useState } from "react";
import { api, saveError } from "@/lib/api";
import { LANGS, useI18n } from "@/lib/i18n";
import { Modal, Pills, FormFooter, S } from "@/components/ui";

export type EdStaff = { id: string; name: string; area: string; language?: string; role: string; username?: string | null };

// Admin: add a staff member (with their login), or edit name / team / language / password, or remove them.
export default function StaffEditor({ worker, selfId, onClose, onSaved }: {
  worker?: EdStaff | null; selfId?: string; onClose: () => void; onSaved: () => void;
}) {
  const { tr, ev } = useI18n();
  const editing = !!worker;
  const [name, setName] = useState(worker?.name ?? "");
  const [area, setArea] = useState(worker?.area ?? "CLEANING");
  const [language, setLanguage] = useState(worker?.language ?? "pt");
  const [username, setUsername] = useState(worker?.username ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Everyone signs in, so a new person needs a username and a password (min. 8 characters).
  // When editing, leave the password empty to keep the current one.
  const hasLogin = !!worker?.username;
  const pwOk = editing ? password === "" || password.length >= 8 : password.length >= 8;
  const userOk = !!username.trim();

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api(`/api/workers/${worker!.id}`, "PATCH", { name, area, language });
        if (password) await api("/api/auth/register", "POST", { workerId: worker!.id, username: username.trim(), password });
      } else {
        await api("/api/workers", "POST", { name: name.trim(), area, language, username: username.trim(), password });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message === "username already taken" ? tr("That username is already taken.") : saveError(e, tr));
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api(`/api/workers/${worker!.id}`, "DELETE");
      onSaved();
    } catch (e: any) {
      setError(e.message === "has history" ? tr("This person has reports on record, so they can't be deleted.") : saveError(e, tr));
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? tr("Edit staff") : tr("Add staff")} onClose={onClose}>
      <label style={S.label}>{tr("Name")}</label>
      <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} />

      <label style={S.label}>{tr("Team")}</label>
      <Pills options={["CLEANING", "MAINTENANCE"]} value={area} onChange={setArea} label={ev} />

      <label style={S.label}>{tr("Language")}</label>
      <select style={S.input} value={language} onChange={(e) => setLanguage(e.target.value)}>
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>

      <label style={S.label}>{tr("Username")}</label>
      <input style={S.input} value={username} onChange={(e) => setUsername(e.target.value)}
        disabled={hasLogin} autoCapitalize="none" autoCorrect="off" spellCheck={false} />

      <label style={S.label}>{editing ? tr("New password (leave empty to keep the current one)") : tr("Password")}</label>
      <input style={S.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password" />
      <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "-6px 0 10px" }}>{tr("At least 8 characters.")}</p>

      <FormFooter saving={saving} canSave={!!name.trim() && userOk && pwOk} onSave={save} onClose={onClose}
        onDelete={editing && worker!.id !== selfId ? remove : undefined} error={error}
        confirmText={tr("Remove this person? Their jobs will become unassigned.")} />
    </Modal>
  );
}
