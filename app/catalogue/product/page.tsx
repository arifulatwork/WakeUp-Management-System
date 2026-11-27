"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PanelShell from "@/components/PanelShell";
import { LoadError, SkeletonRows } from "@/components/PanelKit";
import { useI18n } from "@/lib/i18n";
import { useCan } from "@/lib/useSession";
import { S } from "@/components/ui";
import { Product, useJson } from "@/components/ordering/common";
import ProductEditor from "@/components/ordering/ProductEditor";

// ADD / EDIT A PRODUCT — its own page (instead of a pop-up): /catalogue/product, or /catalogue/product?id=…
function ProductPageInner() {
  const { tr } = useI18n();
  const router = useRouter();
  const id = useSearchParams().get("id");
  const canEdit = useCan("catalogue.manage");      // admin: any country
  const canProducts = useCan("catalogue.products"); // coordinator: only the countries of their own groups
  const back = () => router.push("/catalogue#products");

  const products = useJson<Product[]>("/api/products", []);
  const dietary = useJson<{ id: string; name: string }[]>("/api/dietary", []);
  const cats = useJson<{ categories: string[] }>("/api/categories", { categories: [] });
  const groups = useJson<{ country?: string | null }[]>(!canEdit && canProducts ? "/api/groups" : null, []);
  const myCountries = Array.from(new Set(groups.data.map((g) => g.country).filter((c): c is string => !!c)));

  const product = id ? products.data.find((p) => p.id === id) ?? null : null;
  const ready = products.loaded && dietary.loaded && cats.loaded && (canEdit || !canProducts || groups.loaded);
  const failed = (products.error && !products.loaded) || (dietary.error && !dietary.loaded);

  return (
    <PanelShell
      title={id ? tr("Edit product") : tr("Add product")}
      actions={<Link href="/catalogue#products" style={{ ...S.nav }}>← {tr("Products")}</Link>}
    >
      {failed ? <LoadError onRetry={() => { products.reload(); dietary.reload(); }} />
        : !ready ? <SkeletonRows rows={6} />
        : id && !product ? <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>{tr("No matching products.")}</p>
        : (
          <ProductEditor
            key={product?.id ?? "new"}
            product={product}
            dietary={dietary.data.map((d) => d.name)}
            categories={cats.data.categories}
            countries={canEdit ? null : myCountries}
            onClose={back}
            onSaved={back}
          />
        )}
    </PanelShell>
  );
}

export default function ProductPage() {
  return <Suspense fallback={null}><ProductPageInner /></Suspense>;
}
