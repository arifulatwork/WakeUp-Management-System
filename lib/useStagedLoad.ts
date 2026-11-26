"use client";

import { useEffect, useState } from "react";

// Load a screen's lists one after the other instead of all at once.
//
//   const stages = useStages(want);                       // BEFORE the lists
//   const orders = useJson("orders", stages.on("orders") ? "/api/orders" : null);
//   ...
//   useStagesAdvance(stages, { orders: orders.loaded });  // AFTER the lists: true = arrived (or failed)
//
// `want` = the lists the open tab needs, in the order they should arrive (most important first).
// A list starts only when the one before it in `want` has settled. Lists of tabs that were never
// opened are never requested. A started list stays started (`on` stays true), so changing tab never
// fetches the same list a second time. The first start waits one beat after mount, so that a link
// like /ops#keys opens that tab directly instead of first starting the default tab's lists.
export function useStages<R extends string>(want: readonly R[]) {
  const [started, setStarted] = useState<R[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return { want, started, setStarted, ready, on: (r: R) => started.includes(r) };
}

export function useStagesAdvance<R extends string>(st: ReturnType<typeof useStages<R>>, settledBy: Record<R, boolean>) {
  const { want, started, setStarted, ready } = st;
  const wantKey = want.join(",");
  const settledKey = (Object.keys(settledBy) as R[]).map((r) => (settledBy[r] ? 1 : 0)).join("");
  useEffect(() => {
    if (!ready) return;
    const next = want.find((r) => !started.includes(r));
    if (!next) return;
    if (want.slice(0, want.indexOf(next)).every((r) => settledBy[r])) setStarted((s) => (s.includes(next) ? s : [...s, next]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, wantKey, started, settledKey]);
}
