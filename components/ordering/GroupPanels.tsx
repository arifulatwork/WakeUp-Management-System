"use client";

import { useEffect, useState } from "react";
import { api, saveError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Modal, Pills, FormFooter, S } from "@/components/ui";
import { PanelCard } from "@/components/PanelShell";
import { COUNTRY_CODES, countryName, productInCountry, productName, showCode } from "@/lib/ordering";
import { altLabel, Order, Product, ProductThumb } from "@/components/ordering/common";

export type Group = {
  id: string; name: string; codeActive: boolean; accessCode?: string; studentCount: number; memberLimit: number | null; country?: string | null;
  coordinator: { id: string; name: string } | null; house: { id: string; name: string } | null;
};
export type Student = { id: string; name: string; dietary: string[] };
type Person = { id: string; name: string; role: string };
type House = { id: string; name: string };

// One student group: its secret code (announced by the coordinator), on/off switch, students and their dietary requirements.
export function GroupCard({ group: g, dietary, canCode, canManage, onChanged, onEdit, onOrder }: {
  group: Group; dietary: string[]; canCode: boolean; canManage: boolean; onChanged: () => void; onEdit: () => void; onOrder?: () => void;
}) {
  const { tr, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");
  const [limitText, setLimitText] = useState(g.memberLimit != null ? String(g.memberLimit) : "");
  useEffect(() => { setLimitText(g.memberLimit != null ? String(g.memberLimit) : ""); }, [g.memberLimit]);

  const loadStudents = () => fetch(`/api/groups/${g.id}/students`).then((r) => (r.ok ? r.json() : [])).then(setStudents).catch(() => {});
  useEffect(() => { if (open) loadStudents(); /* eslint-disable-next-line */ }, [open, g.studentCount]);

  async function patch(body: object) {
    setErr("");
    try { await api(`/api/groups/${g.id}`, "PATCH", body); onChanged(); } catch (e) { setErr(saveError(e, tr)); }
  }
  async function saveLimit(value: number | null) {
    setErr("");
    try { await api(`/api/groups/${g.id}`, "PATCH", { memberLimit: value }); onChanged(); }
    catch (e: any) {
      setErr(e?.message === "below current members"
        ? tr("There are already more students in this group than that. Remove some students first.")
        : saveError(e, tr));
    }
  }
  const limitNum = Math.floor(Number(limitText));
  const limitValid = Number.isFinite(limitNum) && limitNum >= 1 && limitNum <= 200;
  const full = g.memberLimit != null && g.studentCount >= g.memberLimit;
  async function setDietary(s: Student, list: string[]) {
    setStudents((cur) => cur.map((x) => (x.id === s.id ? { ...x, dietary: list } : x)));
    try { await api(`/api/groups/${g.id}/students`, "PATCH", { studentId: s.id, dietary: list }); } catch (e) { setErr(saveError(e, tr)); loadStudents(); }
  }
  async function removeStudent(s: Student) {
    try { await api(`/api/groups/${g.id}/students?studentId=${s.id}`, "DELETE"); onChanged(); loadStudents(); }
    catch (e: any) { setErr(e?.message === "has history" ? tr("This student has approved requests on record, so they can't be removed.") : saveError(e, tr)); }
  }
  const copy = () => { navigator.clipboard?.writeText(g.accessCode ?? "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };

  return (
    <PanelCard
      title={g.name}
      subtitle={[g.house?.name, g.country ? countryName(g.country, locale) : null, g.coordinator ? `${tr("Coordinator")}: ${g.coordinator.name}` : tr("No coordinator yet"), g.memberLimit != null ? `${g.studentCount} / ${g.memberLimit} ${tr("students")}` : `${g.studentCount} ${tr("students")}`].filter(Boolean).join(" · ")}
      action={<>
        {onOrder && <button style={S.smallDark} onClick={onOrder}>{tr("Create order")}</button>}
        {canManage && <button style={S.small} onClick={onEdit}>{tr("Edit")}</button>}
        <button style={S.small} onClick={() => setOpen((v) => !v)}>{open ? tr("Hide students") : tr("Students")}</button>
      </>}
    >
      {g.accessCode && canCode && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)" }}>{tr("Group code")} — {tr("announce it to the students")}</div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 3, opacity: g.codeActive ? 1 : 0.35, textDecoration: g.codeActive ? "none" : "line-through" }}>{showCode(g.accessCode)}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
            <button style={S.small} onClick={copy}>{copied ? tr("Copied") : tr("Copy")}</button>
            <button style={S.small} onClick={() => patch({ codeActive: !g.codeActive })}>{g.codeActive ? tr("Switch off") : tr("Switch on")}</button>
            <button style={S.small} onClick={() => setConfirm(true)}>{tr("New code")}</button>
          </div>
        </div>
      )}
      {canCode && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <div style={{ flex: "1 1 180px" }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)" }}>{tr("Number of students in the group")}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{tr("Only this many students can join and order.")}</div>
          </div>
          <input style={{ ...S.input, width: 80 }} type="number" min={1} max={200} placeholder="—" value={limitText} onChange={(e) => setLimitText(e.target.value)} />
          <button style={S.small} disabled={!limitValid || limitNum === g.memberLimit} onClick={() => saveLimit(limitNum)}>{tr("Save")}</button>
          {g.memberLimit != null && <button style={S.small} onClick={() => saveLimit(null)}>{tr("No limit")}</button>}
        </div>
      )}
      {canCode && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <div style={{ flex: "1 1 180px" }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)" }}>{tr("Country")}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{tr("Students of this group only see the products of this country, plus the products for all countries.")}</div>
          </div>
          <select style={{ ...S.input, width: 170 }} value={g.country ?? ""} onChange={(e) => patch({ country: e.target.value || null })}>
            <option value="">—</option>
            {COUNTRY_CODES.map((c) => <option key={c} value={c}>{countryName(c, locale)}</option>)}
          </select>
        </div>
      )}
      {full && <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0" }}>{tr("The group is full: no new students can join.")}</p>}
      {!g.codeActive && <p style={{ fontSize: 12, color: "var(--red)", margin: "4px 0" }}>{tr("The code is off: students of this group cannot sign in.")}</p>}
      {confirm && (
        <div style={{ background: "var(--red-bg)", borderRadius: 10, padding: 12, margin: "8px 0" }}>
          <p style={{ fontSize: 12.5, margin: "0 0 8px" }}>{tr("Make a new code? The old code stops working for new sign-ins.")}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.ghost} onClick={() => setConfirm(false)}>{tr("Cancel")}</button>
            <button style={S.primary} onClick={() => { setConfirm(false); patch({ codeAction: "regenerate" }); }}>{tr("New code")}</button>
          </div>
        </div>
      )}
      {err && <p style={{ color: "var(--red)", fontSize: 12.5 }}>{err}</p>}

      {open && (
        <div style={{ marginTop: 10 }}>
          {!students.length && <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{tr("Nobody has joined yet. Share the group code.")}</p>}
          {students.map((s) => (
            <div key={s.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>{s.name}</strong>
                {canCode && <button style={S.small} onClick={() => removeStudent(s)}>{tr("Remove")}</button>}
              </div>
              {dietary.length > 0 && (canCode
                ? <Pills multi options={dietary} value={s.dietary} label={(d) => d} onChange={(list: string[]) => setDietary(s, list)} />
                : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{s.dietary.join(", ") || "—"}</span>)}
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

// Admin: add a group, or rename it / change its coordinator / house, or delete it.
export function GroupEditor({ group, coordinators, houses, onClose, onSaved }: {
  group: Group | null; coordinators: Person[]; houses: House[]; onClose: () => void; onSaved: () => void;
}) {
  const { tr, locale } = useI18n();
  const [name, setName] = useState(group?.name ?? "");
  const [coordinatorId, setCoordinatorId] = useState(group?.coordinator?.id ?? "");
  const [houseId, setHouseId] = useState(group?.house?.id ?? "");
  const [country, setCountry] = useState(group?.country ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true); setError("");
    try {
      const body = { name: name.trim(), coordinatorId: coordinatorId || null, houseId: houseId || null, country: country || null };
      if (group) await api(`/api/groups/${group.id}`, "PATCH", body); else await api("/api/groups", "POST", body);
      onSaved();
    } catch (e: any) { setError(e?.status === 409 ? tr("A group with that name already exists.") : saveError(e, tr)); setSaving(false); }
  }
  async function remove() {
    setSaving(true);
    try { await api(`/api/groups/${group!.id}`, "DELETE"); onSaved(); }
    catch (e: any) { setError(e?.message === "has history" ? tr("This group has requests or orders on record, so it can't be deleted. Switch its code off instead.") : saveError(e, tr)); setSaving(false); }
  }
  return (
    <Modal title={group ? tr("Edit group") : tr("Add group")} onClose={onClose}>
      <label style={S.label}>{tr("Name")}</label>
      <input style={S.input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      <label style={S.label}>{tr("Coordinator")}</label>
      <select style={S.input} value={coordinatorId} onChange={(e) => setCoordinatorId(e.target.value)}>
        <option value="">—</option>
        {coordinators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label style={S.label}>{tr("House")}</label>
      <select style={S.input} value={houseId} onChange={(e) => setHouseId(e.target.value)}>
        <option value="">—</option>
        {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>
      <label style={S.label}>{tr("Country")}</label>
      <select style={S.input} value={country} onChange={(e) => setCountry(e.target.value)}>
        <option value="">—</option>
        {COUNTRY_CODES.map((c) => <option key={c} value={c}>{countryName(c, locale)}</option>)}
      </select>
      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>{tr("Students of this group only see the products of this country, plus the products for all countries.")}</div>
      <FormFooter saving={saving} canSave={!!name.trim()} onSave={save} onClose={onClose} onDelete={group ? remove : undefined} error={error}
        confirmText={tr("Delete this group and its students? This cannot be undone.")} />
    </Modal>
  );
}

// Coordinator (coordinator-orders model) or admin: build or edit the group's order for today.
export function OrderBuilder({ group, order, products, onClose, onSaved }: {
  group: Group; order: Order | null; products: Product[]; onClose: () => void; onSaved: () => void;
}) {
  const { tr, lang } = useI18n();
  const [students, setStudents] = useState<Student[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [alt, setAlt] = useState<Record<string, string>>({});
  const [note, setNote] = useState(order?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const active = products.filter((p) => p.active && productInCountry(p, group.country)); // each country has its own products

  useEffect(() => {
    fetch(`/api/groups/${group.id}/students`).then((r) => (r.ok ? r.json() : [])).then(setStudents).catch(() => {});
    if (order) {
      const q: Record<string, number> = {}, a: Record<string, string> = {};
      for (const l of order.lines) {
        q[l.productId] = l.quantity;
        const p = products.find((x) => x.id === l.productId);
        const match = p?.alternatives.find((x) => altLabel(x) === l.alternativeName);
        if (match) a[l.productId] = match.id;
      }
      setQty(q); setAlt(a);
    }
    // eslint-disable-next-line
  }, []);

  const fillStandard = () => {
    const n = Math.max(1, group.memberLimit ?? students.length);
    setQty(Object.fromEntries(active.map((p) => [p.id, p.standardQty * n])));
  };
  const lines = active.filter((p) => (qty[p.id] ?? 0) > 0).map((p) => ({ productId: p.id, quantity: qty[p.id], alternativeId: alt[p.id] || undefined }));

  async function save() {
    setSaving(true); setError("");
    try {
      if (order) await api(`/api/orders/${order.id}`, "PATCH", { action: "set_lines", lines, note });
      else await api("/api/orders", "POST", { groupId: group.id, lines, note });
      onSaved();
    } catch (e: any) {
      setError(e?.message === "ordering closed" ? tr("Ordering is closed right now.") : e?.status === 409 ? tr("The order was already sent to the supplier.") : saveError(e, tr));
      setSaving(false);
    }
  }
  const withDiet = students.filter((s) => s.dietary.length);

  return (
    <Modal title={`${order ? tr("Edit order") : tr("Create order")} — ${group.name}`} onClose={onClose}>
      <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
        {withDiet.length > 0 && (
          <div style={{ background: "#FAF3D6", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginTop: 10 }}>
            <strong>{tr("Dietary requirements in this group")}</strong>
            {withDiet.map((s) => <div key={s.id}>{s.name}: {s.dietary.join(", ")}</div>)}
          </div>
        )}
        <button style={{ ...S.small, margin: "10px 0" }} onClick={fillStandard}>{tr("Fill standard quantities × {n} students", { n: Math.max(1, group.memberLimit ?? students.length) })}</button>
        {active.map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
            <ProductThumb p={p} size={36} />
            <div style={{ flex: "1 1 160px", fontSize: 13 }}>{productName(p, lang)}<div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{tr("Standard")}: {p.standardQty} {p.unit}</div></div>
            {p.alternatives.length > 0 && (
              <select style={{ ...S.input, width: 150 }} value={alt[p.id] ?? ""} onChange={(e) => setAlt({ ...alt, [p.id]: e.target.value })}>
                <option value="">{tr("Standard product")}</option>
                {p.alternatives.map((a) => <option key={a.id} value={a.id}>{altLabel(a)}</option>)}
              </select>
            )}
            <input style={{ ...S.input, width: 70 }} type="number" min={0} max={999} value={qty[p.id] ?? 0} onChange={(e) => setQty({ ...qty, [p.id]: Math.max(0, Math.min(999, Math.floor(Number(e.target.value) || 0))) })} />
          </div>
        ))}
        <label style={S.label}>{tr("Note for the supplier")}</label>
        <input style={S.input} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </div>
      <FormFooter saving={saving} canSave={lines.length > 0} onSave={save} onClose={onClose} error={error} />
    </Modal>
  );
}
