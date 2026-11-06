"use client";

import { useEffect, useState } from "react";
import { api, saveError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { S } from "@/components/ui";
import { DEFAULT_CHECKLIST, TASK_FIELD_TYPES, TaskField, TaskFieldType } from "@/lib/settingsDefaults";

// Super Admin: edit the default checklist and add extra fields to every cleaning task,
// without touching code. Saved in the AppSetting table (see lib/settings.ts).
const TYPE_LABEL: Record<TaskFieldType, string> = { text: "Text", number: "Number", yesno: "Yes / No" };

export default function TaskSettings() {
  const { tr } = useI18n();
  const [items, setItems] = useState<string[]>(DEFAULT_CHECKLIST);
  const [fields, setFields] = useState<TaskField[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newField, setNewField] = useState("");
  const [newType, setNewType] = useState<TaskFieldType>("text");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/checklist").then((r) => (r.ok ? r.json() : null)).then((d) => d && setItems(d.items ?? []));
    fetch("/api/settings/task-fields").then((r) => (r.ok ? r.json() : null)).then((d) => d && setFields(d.fields ?? []));
  }, []);

  function addItem() {
    if (newItem.trim()) { setItems([...items, newItem.trim()]); setNewItem(""); }
  }
  function addField() {
    if (!newField.trim()) return;
    setFields([...fields, { id: "f" + Math.random().toString(36).slice(2, 8), label: newField.trim(), type: newType }]);
    setNewField("");
  }
  const move = <T,>(list: T[], i: number, d: number): T[] => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const c = [...list];
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  };

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const a = await api<{ items: string[] }>("/api/settings/checklist", "PUT", { items });
      const b = await api<{ fields: TaskField[] }>("/api/settings/task-fields", "PUT", { fields });
      setItems(a.items);
      setFields(b.fields);
      setMsg({ ok: true, text: tr("Saved. New tasks will use these settings.") });
    } catch (e) {
      setMsg({ ok: false, text: saveError(e, tr) });
    }
    setSaving(false);
  }

  const row: React.CSSProperties = { display: "flex", gap: 6, marginBottom: 5, alignItems: "center" };
  return (
    <div style={{ padding: 14, background: "#fff" }}>
      <label style={S.label}>{tr("Default checklist for new cleaning tasks")}</label>
      {items.map((it, i) => (
        <div key={i} style={row}>
          <input style={S.input} value={it} onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" style={S.small} aria-label={tr("Move up")} onClick={() => setItems(move(items, i, -1))}>↑</button>
          <button type="button" style={S.small} aria-label={tr("Move down")} onClick={() => setItems(move(items, i, 1))}>↓</button>
          <button type="button" style={S.small} aria-label={tr("Remove")} onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div style={row}>
        <input style={S.input} value={newItem} placeholder={tr("New checklist item")} onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addItem(); }} />
        <button type="button" style={S.small} onClick={addItem}>{tr("Add")}</button>
      </div>

      <label style={{ ...S.label, marginTop: 20 }}>{tr("Extra fields on every cleaning task")}</label>
      {fields.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 8px" }}>{tr("No extra fields yet.")}</p>}
      {fields.map((f, i) => (
        <div key={f.id} style={row}>
          <input style={S.input} value={f.label} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <select style={{ ...S.input, width: 120 }} value={f.type} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as TaskFieldType } : x)))}>
            {TASK_FIELD_TYPES.map((t) => <option key={t} value={t}>{tr(TYPE_LABEL[t])}</option>)}
          </select>
          <button type="button" style={S.small} aria-label={tr("Move up")} onClick={() => setFields(move(fields, i, -1))}>↑</button>
          <button type="button" style={S.small} aria-label={tr("Move down")} onClick={() => setFields(move(fields, i, 1))}>↓</button>
          <button type="button" style={S.small} aria-label={tr("Remove")} onClick={() => setFields(fields.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div style={row}>
        <input style={S.input} value={newField} placeholder={tr("New field name, e.g. Number of guests")} onChange={(e) => setNewField(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addField(); }} />
        <select style={{ ...S.input, width: 120 }} value={newType} onChange={(e) => setNewType(e.target.value as TaskFieldType)}>
          {TASK_FIELD_TYPES.map((t) => <option key={t} value={t}>{tr(TYPE_LABEL[t])}</option>)}
        </select>
        <button type="button" style={S.small} onClick={addField}>{tr("Add")}</button>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "4px 0 12px" }}>
        {tr("Changing these does not alter tasks that already exist; a removed field only disappears from the screens.")}
      </p>

      <button style={{ ...S.primary, flex: "none", padding: "10px 18px" }} disabled={saving} onClick={save}>
        {saving ? tr("Saving…") : tr("Save settings")}
      </button>
      {msg && <p style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? "var(--green-dark)" : "var(--red)" }}>{msg.text}</p>}
    </div>
  );
}
