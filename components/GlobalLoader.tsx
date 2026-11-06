"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

// One loading indicator for the whole app.
//
//  - A green bar slides across the top whenever ANY request to the server is running
//    (reads, saves, deletes, photo uploads), while a page is opening after a tap on a link,
//    and for a moment after ANY tap on a button, tab or link (instant feedback).
//  - Saves / deletes / uploads (anything that is not a plain read) also show a small spinner
//    in the middle, so a tap on a button always gets an answer, even on a slow connection.
//
// It listens to fetch and XMLHttpRequest itself, so no screen has to call anything.
// The live connection and the background notification poll are ignored on purpose, or the bar
// would never go away.

const SILENT = ["/api/events", "/api/push/key", "/api/notifications"];
const MIN_VISIBLE_MS = 500; // once shown, stay long enough to be seen (fast answers would flash)

let reads = 0;
let writes = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function begin(write: boolean) {
  if (write) writes++; else reads++;
  emit();
}
function end(write: boolean) {
  if (write) writes = Math.max(0, writes - 1); else reads = Math.max(0, reads - 1);
  emit();
}

function tracked(url: string, method: string): boolean {
  let u: URL;
  try { u = new URL(url, window.location.href); } catch { return false; }
  const sameApi = u.origin === window.location.origin && u.pathname.startsWith("/api/");
  const write = method !== "GET" && method !== "HEAD";
  // Our own API calls, plus any save/upload (e.g. a photo going straight to cloud storage).
  if (!(sameApi || write)) return false;
  if (sameApi && SILENT.some((p) => u.pathname === p || u.pathname.startsWith(p + "/"))) {
    // Silent background traffic. A write to these (mark as read, subscribe) is user-driven, so it still shows.
    if (!write) return false;
  }
  return true;
}

function install() {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w.__wakeupLoaderInstalled) return;
  w.__wakeupLoaderInstalled = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!tracked(url, method)) return origFetch(input, init);
    const write = method !== "GET" && method !== "HEAD";
    begin(write);
    return origFetch(input, init).finally(() => end(write));
  };

  // Uploads that use XMLHttpRequest (photos / videos) do not go through fetch.
  const proto = XMLHttpRequest.prototype;
  const origOpen = proto.open;
  const origSend = proto.send;
  proto.open = function (this: any, method: string, url: string | URL, ...rest: any[]) {
    this.__wk = { method: String(method).toUpperCase(), url: String(url) };
    return (origOpen as any).call(this, method, url, ...rest);
  };
  proto.send = function (this: any, body?: any) {
    const info = this.__wk as { method: string; url: string } | undefined;
    if (info && tracked(info.url, info.method)) {
      const write = info.method !== "GET" && info.method !== "HEAD";
      begin(write);
      this.addEventListener("loadend", () => end(write), { once: true });
    }
    return origSend.call(this, body);
  };
}
install(); // as early as possible, before any screen asks for its data

// true while `active`, and for at least `minMs` after it first turned on
function useHold(active: boolean, minMs: number) {
  const [on, setOn] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (active) {
      if (!on) since.current = Date.now();
      setOn(true);
      return;
    }
    if (!on) return;
    const t = setTimeout(() => setOn(false), Math.max(0, minMs - (Date.now() - since.current)));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return on;
}

export default function GlobalLoader() {
  const { tr } = useI18n();
  const pathname = usePathname();
  const [snap, setSnap] = useState({ reads, writes });
  const [navigating, setNavigating] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const f = () => setSnap({ reads, writes });
    subs.add(f);
    f();
    return () => { subs.delete(f); };
  }, []);

  // A tap on a link to another page: show the bar until that page has opened.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let u: URL;
      try { u = new URL(a.href, window.location.href); } catch { return; }
      if (u.origin !== window.location.origin || u.pathname === window.location.pathname) return;
      setNavigating(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => { setNavigating(false); }, [pathname]);

  // Any tap on a button, link, tab or menu gets an instant answer too, even when it only opens
  // a form or changes the sort order and sends nothing to the server.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onTap = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(
        "button, a[href], summary, select, label[for], [role='button'], [role='tab'], [role='menuitem'], input[type='checkbox'], input[type='radio'], input[type='submit']"
      ) as (HTMLElement & { disabled?: boolean }) | null;
      if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
      setPulse(true);
      clearTimeout(timer);
      timer = setTimeout(() => setPulse(false), 600);
    };
    document.addEventListener("click", onTap, true);
    return () => { document.removeEventListener("click", onTap, true); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!navigating) return;
    const t = setTimeout(() => setNavigating(false), 10_000); // never stuck
    return () => clearTimeout(t);
  }, [navigating]);

  const bar = useHold(snap.reads + snap.writes > 0 || navigating || pulse, MIN_VISIBLE_MS);
  const spin = useHold(snap.writes > 0, MIN_VISIBLE_MS);

  return (
    <>
      {bar && <div className="gl-bar" role="progressbar" aria-label={tr("Loading…")}><span /></div>}
      {spin && (
        <div className="gl-spin" role="status" aria-label={tr("Loading…")}>
          <span />
        </div>
      )}
    </>
  );
}
