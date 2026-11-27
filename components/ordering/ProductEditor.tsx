"use client";

import { useState } from "react";
import Link from "next/link";
import { api, saveError } from "@/lib/api";
import { LANGS, useI18n } from "@/lib/i18n";
import { PhotoPicker } from "@/components/Photos";
import { Pills, FormFooter, S } from "@/components/ui";
import { MAX_QTY, matchCategory, suggestCategory } from "@/lib/ordering";
import { CountrySelect, Product } from "@/components/ordering/common";

// Admin: add / edit a product on its own full page (/catalogue/product): standard quantity, dietary suitability and approved alternatives.
// `countries`: the countries this person may use (a coordinator: those of their own groups). Empty/undefined = any country, plus "All countries" (admin).
export default function ProductEditor({ product, dietary, categories, defaultCategory, countries, onClose, onSaved }: {
  product: Product | null; dietary: string[]; categories: string[]; defaultCategory?: string; countries?: string[] | null; onClose: () => void; onSaved: () => void;
}) {
  const { tr, locale } = useI18n();
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? defaultCategory ?? "General");
  // The Super Admin creates the categories (Catalogue → Categories); here one is only chosen. "General" is always there,
  // and an older product keeps the category it already has.
  const [catTouched, setCatTouched] = useState(!!product || !!defaultCategory); // a new product gets a category suggested from its name until someone picks one
  const catOptions = Array.from(new Set<string>(["General", ...categories, ...(product?.category ? [product.category] : [])]));
  const changeName = (v: string) => {
    setName(v);
    if (!catTouched) { const s = suggestCategory(v); setCategory((s && matchCategory(s, categories)) || "General"); }
  };
  const pickCategory = (v: string) => { setCatTouched(true); setCategory(v); };
  const [unit, setUnit] = useState(product?.unit ?? "pcs");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [standardQty, setStandardQty] = useState(product?.standardQty ?? 1);
  const [perStudent, setPerStudent] = useState(product?.perStudent ?? false);
  const [tags, setTags] = useState<string[]>(product?.dietaryTags ?? []);
  const [active, setActive] = useState(product?.active ?? true);
  const [alts, setAlts] = useState(product?.alternatives ?? []);
  const [names, setNames] = useState<Record<string, string>>(product?.names ?? {});
  const [country, setCountry] = useState(product?.country ?? countries?.[0] ?? "");
  // photo: undefined = unchanged, null = remove, string = newly chosen file
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const photoSrc = photo !== undefined ? photo : product?.photo ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setAlt = (i: number, patch: object) => setAlts(alts.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  async function save() {
    setSaving(true); setError("");
    const body = { name, names, country: country || null, category: category || "General", unit, brand, standardQty, perStudent, dietaryTags: tags, active, alternatives: alts, ...(photo !== undefined ? { photo } : {}) };
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

  const sec: React.CSSProperties = { background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: 18, marginBottom: 16 };
  const secTitle: React.CSSProperties = { fontSize: 14, margin: "0 0 2px", fontWeight: 700 };
  const hint: React.CSSProperties = { fontSize: 11.5, color: "var(--ink-soft)", margin: "2px 0 8px" };
  const grid = (min: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 12 });

  return (
    <div style={{ maxWidth: 860 }}>
      <section style={sec}>
        <h2 style={secTitle}>{tr("Basic information")}</h2>
        <label style={S.label}>{tr("Name")}</label>
        <input style={S.input} value={name} maxLength={80} autoFocus={!product} onChange={(e) => changeName(e.target.value)} />
        <div style={grid(180)}>
          <div>
            <label style={S.label}>{tr("Category")}</label>
            <select aria-label={tr("Category")} style={{ ...S.input, width: "100%", boxSizing: "border-box" }} value={category} onChange={(e) => pickCategory(e.target.value)}>
              {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {!categories.length && <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>{tr("No categories yet. The Super Admin creates them in Catalogue → Categories.")}</div>}
          </div>
          <div><label style={S.label}>{tr("Unit")}</label><input style={S.input} value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} /></div>
          <div><label style={S.label}>{perStudent ? tr("Standard quantity (per student)") : tr("Standard quantity (for the group)")}</label>
            <input style={S.input} type="number" min={1} max={MAX_QTY} value={standardQty} onChange={(e) => setStandardQty(Math.max(1, Math.min(MAX_QTY, Math.floor(Number(e.target.value) || 1))))} /></div>
        </div>
        <label style={{ ...S.label, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={perStudent} onChange={(e) => setPerStudent(e.target.checked)} /> {tr("Per student (e.g. fruit). Off = one quantity for the whole group (e.g. 1 pack).")}
        </label>
        <label style={S.label}>{tr("Country")}</label>
        <div style={{ maxWidth: 360 }}><CountrySelect value={country} onChange={setCountry} only={countries} firstLabel={countries ? undefined : tr("All countries")} /></div>
        <div style={hint}>{tr("Only groups of this country can order this product. Choose All countries to let every group order it.")}</div>
        <label style={{ ...S.label, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {tr("Available to order")}
        </label>
      </section>

      <section style={sec}>
        <h2 style={secTitle}>{tr("Name in other languages")}</h2>
        <div style={hint}>{tr("Shown to people who use that language. Empty = the name above.")}</div>
        <div style={grid(200)}>
          {LANGS.map((l) => (
            <input key={l.code} style={S.input} placeholder={l.label} aria-label={l.label} value={names[l.code] ?? ""} maxLength={80}
              onChange={(e) => setNames({ ...names, [l.code]: e.target.value })} />
          ))}
        </div>
      </section>

      <section style={sec}>
        <h2 style={secTitle}>{tr("Product photo")}</h2>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          {photoSrc ? (
            <div style={{ position: "relative", width: 120 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)", display: "block" }} />
              <button type="button" aria-label={tr("Remove photo")} onClick={() => setPhoto(null)}
                style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", border: "none", background: "#111", color: "#fff", cursor: "pointer", padding: 0 }}>×</button>
            </div>
          ) : (
            <div aria-hidden="true" style={{ width: 120, height: 120, borderRadius: 10, border: "1px dashed var(--line)", background: "#F3F2EE", display: "grid", placeItems: "center", fontSize: 28, opacity: 0.7 }}>📷</div>
          )}
          <div style={{ minWidth: 200 }}>
            <PhotoPicker showWhenOff label={`📷 ${photoSrc ? tr("Replace photo") : tr("Upload photo")}`} style={{ ...S.ghost, width: "100%" }} onPhoto={setPhoto} />
          </div>
        </div>
      </section>

      <section style={sec}>
        <h2 style={secTitle}>{tr("Suitable for")}</h2>
        {dietary.length > 0
          ? <div style={{ marginTop: 8 }}><Pills multi options={dietary} value={tags} label={(d) => d} onChange={setTags} /></div>
          : <div style={hint}>
              {tr("Dietary requirements will show here after they are added in the Dietary requirements tab (e.g. Vegan, Gluten-free, Nut-free).")}{" "}
              <Link href="/catalogue#dietary" style={{ color: "var(--green-dark)", fontWeight: 600 }}>{tr("Dietary requirements")} →</Link>
            </div>}
      </section>

      <section style={sec}>
        <h2 style={secTitle}>{tr("Approved alternatives / other brands")}</h2>
        <div style={{ marginTop: 8 }}>
          {alts.map((a, i) => (
            <div key={a.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, marginBottom: 8, background: "#fcfcfb" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...S.input, flex: "2 1 200px", width: "auto" }} placeholder={tr("Name")} value={a.name} maxLength={80} onChange={(e) => setAlt(i, { name: e.target.value })} />
                <input style={{ ...S.input, flex: "1 1 140px", width: "auto" }} placeholder={tr("Brand")} value={a.brand ?? ""} maxLength={60} onChange={(e) => setAlt(i, { brand: e.target.value })} />
                <button style={S.small} onClick={() => setAlts(alts.filter((_, j) => j !== i))} aria-label={tr("Remove")}>×</button>
              </div>
              {dietary.length > 0 && <div style={{ marginTop: 8 }}><Pills multi options={dietary} value={a.dietaryTags} label={(d) => d} onChange={(v: string[]) => setAlt(i, { dietaryTags: v })} /></div>}
            </div>
          ))}
          <button style={S.small} onClick={() => setAlts([...alts, { id: "a" + Math.random().toString(36).slice(2, 8), name: "", brand: "", dietaryTags: [] }])}>+ {tr("Add alternative")}</button>
        </div>
      </section>

      <div style={{ position: "sticky", bottom: 0, background: "var(--paper)", padding: "6px 0 14px", marginTop: -4 }}>
        <FormFooter saving={saving} canSave={!!name.trim() && (!countries || !!country)} onSave={save} onClose={onClose} onDelete={product ? remove : undefined} error={error} />
      </div>
    </div>
  );
}
