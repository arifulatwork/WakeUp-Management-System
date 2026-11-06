"use client";

import { useState } from "react";
import { api, saveError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Modal, Pills, FormFooter, S } from "@/components/ui";
import { MAX_QTY } from "@/lib/ordering";
import { Product } from "@/components/ordering/common";

// Admin: add / edit a product with brand, standard quantity, dietary suitability and approved alternatives.
export default function ProductEditor({ product, dietary, onClose, onSaved }: {
  product: Product | null; dietary: string[]; onClose: () => void; onSaved: () => void;
}) {
  const { tr } = useI18n();
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "General");
  const [unit, setUnit] = useState(product?.unit ?? "pcs");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [standardQty, setStandardQty] = useState(product?.standardQty ?? 1);
  const [tags, setTags] = useState<string[]>(product?.dietaryTags ?? []);
  const [active, setActive] = useState(product?.active ?? true);
  const [alts, setAlts] = useState(product?.alternatives ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setAlt = (i: number, patch: object) => setAlts(alts.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  async function save() {
    setSaving(true); setError("");
    const body = { name, category, unit, brand, standardQty, dietaryTags: tags, active, alternatives: alts };
    try {
      if (product) await api(`/api/products/${product.id}`, "PATCH", body); else await api("/api/products", "POST", body);
      onSaved();
    } catch (e) { setError(saveError(e, tr)); setSaving(false); }
  }
  async function remove() {
    setSaving(true);
    try { await api(`/api/products/${product!.id}`, "DELETE"); onSaved(); }
    catch (e: any) { setError(e?.message === "in use" ? tr("This product is used in requests or orders. Set it to inactive instead.") : saveError(e, tr)); setSaving(false); }
  }

  return (
    <Modal title={product ? tr("Edit product") : tr("Add product")} onClose={onClose}>
      <div style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: 4 }}>
        <label style={S.label}>{tr("Name")}</label>
        <input style={S.input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={S.label}>{tr("Category")}</label><input style={S.input} value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} /></div>
          <div><label style={S.label}>{tr("Brand")}</label><input style={S.input} value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} /></div>
          <div><label style={S.label}>{tr("Unit")}</label><input style={S.input} value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} /></div>
          <div><label style={S.label}>{tr("Standard quantity (per student)")}</label>
            <input style={S.input} type="number" min={1} max={MAX_QTY} value={standardQty} onChange={(e) => setStandardQty(Math.max(1, Math.min(MAX_QTY, Math.floor(Number(e.target.value) || 1))))} /></div>
        </div>
        {dietary.length > 0 && (<>
          <label style={S.label}>{tr("Suitable for")}</label>
          <Pills multi options={dietary} value={tags} label={(d) => d} onChange={setTags} />
        </>)}
        <label style={S.label}>{tr("Approved alternatives / other brands")}</label>
        {alts.map((a, i) => (
          <div key={a.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8, marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input style={S.input} placeholder={tr("Name")} value={a.name} maxLength={80} onChange={(e) => setAlt(i, { name: e.target.value })} />
              <input style={S.input} placeholder={tr("Brand")} value={a.brand ?? ""} maxLength={60} onChange={(e) => setAlt(i, { brand: e.target.value })} />
              <button style={S.small} onClick={() => setAlts(alts.filter((_, j) => j !== i))} aria-label={tr("Remove")}>×</button>
            </div>
            {dietary.length > 0 && <div style={{ marginTop: 6 }}><Pills multi options={dietary} value={a.dietaryTags} label={(d) => d} onChange={(v: string[]) => setAlt(i, { dietaryTags: v })} /></div>}
          </div>
        ))}
        <button style={S.small} onClick={() => setAlts([...alts, { id: "a" + Math.random().toString(36).slice(2, 8), name: "", brand: "", dietaryTags: [] }])}>+ {tr("Add alternative")}</button>
        <label style={{ ...S.label, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {tr("Available to order")}
        </label>
      </div>
      <FormFooter saving={saving} canSave={!!name.trim()} onSave={save} onClose={onClose} onDelete={product ? remove : undefined} error={error} />
    </Modal>
  );
}
