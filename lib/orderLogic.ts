import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { db } from "@/lib/db";
import type { FullSession } from "@/lib/guard";
import { CODE_ALPHABET, CODE_LENGTH, MAX_QTY, Alternative } from "@/lib/ordering";

// Server-side helpers shared by the ordering routes (groups, products, requests, orders).

export const jerr = (error: string, status = 400) => NextResponse.json({ error }, { status });

// A fresh, unused group code (8 characters from CODE_ALPHABET).
export async function newGroupCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    let c = "";
    for (let j = 0; j < CODE_LENGTH; j++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!(await db.group.findUnique({ where: { accessCode: c } }))) return c;
  }
  throw new Error("could not make a unique group code");
}

// Which groups may this person see? admin/manager: all; coordinator: the ones they coordinate; student: their own.
export async function groupsFor(s: FullSession): Promise<any[]> {
  const include = { coordinator: true, house: true };
  if (s.role === "admin" || s.role === "manager") return db.group.findMany({ orderBy: { name: "asc" }, include });
  if (s.role === "coordinator") return db.group.findMany({ where: { coordinatorId: s.workerId }, orderBy: { name: "asc" }, include });
  if (s.role === "student" && s.groupId) {
    const g = await db.group.findUnique({ where: { id: s.groupId }, include });
    return g ? [g] : [];
  }
  return [];
}

// Admin, or the coordinator OF THIS group. (Managers only read.)
export async function canManageGroup(s: FullSession, groupId: string): Promise<boolean> {
  if (s.role === "admin") return true;
  if (s.role !== "coordinator") return false;
  const g = await db.group.findUnique({ where: { id: groupId } });
  return !!g && g.coordinatorId === s.workerId;
}

export async function requestsWithLines(requests: any[]) {
  if (!requests.length) return [];
  const lines = await db.requestLine.findMany({ where: { requestId: { in: requests.map((r) => r.id) } }, include: { product: true } });
  return requests.map((r) => ({ ...r, lines: lines.filter((l: any) => l.requestId === r.id) }));
}

export async function ordersWithLines(orders: any[]) {
  if (!orders.length) return [];
  const lines = await db.orderLine.findMany({ where: { orderId: { in: orders.map((o) => o.id) } }, include: { product: true } });
  return orders.map((o) => ({ ...o, lines: lines.filter((l: any) => l.orderId === o.id) }));
}

export const MAX_MEMBER_LIMIT = 200;

// The students of a group, oldest first (the order they joined in).
export async function groupStudents(groupId: string): Promise<any[]> {
  const rows = await db.worker.findMany({ where: { groupId } });
  return rows
    .filter((w: any) => w.role === "student")
    .sort((a: any, b: any) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

// Clean the member limit sent by the coordinator: null/"" = no limit, otherwise a whole number 1..MAX_MEMBER_LIMIT.
export function cleanMemberLimit(v: unknown): { value?: number | null; error?: string } {
  if (v === null || v === "" || v === undefined) return { value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > MAX_MEMBER_LIMIT) return { error: `group size must be 1-${MAX_MEMBER_LIMIT}` };
  return { value: n };
}

// May this student still order? Only the first `memberLimit` students of the group count (extra ones, if any
// slipped in, are blocked). No limit set = everybody may.
export async function studentWithinLimit(group: any, studentId: string): Promise<boolean> {
  if (!group || group.memberLimit == null) return true;
  const students = await groupStudents(group.id);
  return students.slice(0, group.memberLimit).some((s: any) => s.id === studentId);
}

export class OrderLocked extends Error {}

// Put approved items into the group's order for that ordering day (created if needed).
// Only an OPEN order can still take items: once it was sent to the supplier it is closed.
export async function addToGroupOrder(groupId: string, orderDate: string, actorId: string, items: { productId: string; quantity: number; alternativeName?: string | null }[]) {
  let order = (await db.order.findMany({ where: { groupId, orderDate } })).find((o: any) => o.status !== "CANCELLED");
  if (order && order.status !== "OPEN") throw new OrderLocked();
  if (!order) order = await db.order.create({ data: { groupId, orderDate, createdById: actorId, status: "OPEN" } });
  const existing = await db.orderLine.findMany({ where: { orderId: order.id } });
  for (const it of items) {
    const alt = it.alternativeName ?? null;
    const same = existing.find((l: any) => l.productId === it.productId && (l.alternativeName ?? null) === alt);
    if (same) {
      same.quantity = Math.min(999, same.quantity + it.quantity);
      await db.orderLine.update({ where: { id: same.id }, data: { quantity: same.quantity } });
    } else {
      const row = await db.orderLine.create({ data: { orderId: order.id, productId: it.productId, quantity: it.quantity, alternativeName: alt } });
      existing.push(row);
    }
  }
  return order;
}

// After the supplier marks a line: PENDING lines left -> PREPARING (or APPROVED if none done yet), none left -> PREPARED.
export async function refreshOrderStatus(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || !["APPROVED", "PREPARING", "PREPARED"].includes(order.status)) return order;
  const lines = await db.orderLine.findMany({ where: { orderId } });
  const pending = lines.filter((l: any) => l.status === "PENDING").length;
  const status = pending === 0 && lines.length ? "PREPARED" : pending < lines.length ? "PREPARING" : "APPROVED";
  if (status === order.status) return order;
  return db.order.update({ where: { id: orderId }, data: { status, preparedAt: status === "PREPARED" ? new Date() : null } });
}

// ---- product input ----
const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const qty = (v: unknown) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 1 && n <= MAX_QTY ? n : null; };
export const intQty = qty;

export async function dietaryNames(): Promise<string[]> {
  return (await db.dietaryRequirement.findMany({})).map((d: any) => d.name as string);
}

// Validates a product body (create: everything; update: only the fields that were sent).
export async function cleanProduct(b: any, partial: boolean): Promise<{ data?: Record<string, any>; error?: string }> {
  const data: Record<string, any> = {};
  const has = (k: string) => !partial || b[k] !== undefined;
  if (has("name")) { const n = str(b.name, 80); if (!n) return { error: "name required" }; data.name = n; }
  if (has("category")) data.category = str(b.category, 40) || "General";
  if (has("unit")) data.unit = str(b.unit, 20) || "pcs";
  if (has("brand")) data.brand = str(b.brand, 60) || null;
  if (has("standardQty")) { const q = qty(b.standardQty ?? 1); if (q === null) return { error: `standard quantity must be 1-${MAX_QTY}` }; data.standardQty = q; }
  if (has("active")) data.active = b.active !== false;
  const known = await dietaryNames();
  const tags = (v: unknown) => (Array.isArray(v) ? Array.from(new Set(v.map((x) => String(x))))  .filter((x) => known.includes(x)) : []);
  if (has("dietaryTags")) data.dietaryTags = tags(b.dietaryTags);
  if (has("alternatives")) {
    const arr = Array.isArray(b.alternatives) ? b.alternatives.slice(0, 12) : [];
    const out: Alternative[] = [];
    for (const a of arr) {
      const name = str(a?.name, 80);
      if (!name) continue;
      const id = String(a?.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30) || "a" + Math.random().toString(36).slice(2, 8);
      out.push({ id, name, brand: str(a?.brand, 60) || undefined, dietaryTags: tags(a?.dietaryTags) });
    }
    data.alternatives = out;
  }
  return { data };
}

// Validates [{ productId, quantity, alternativeId? }] for a coordinator-made order.
export async function cleanOrderLines(input: unknown): Promise<{ lines?: { productId: string; quantity: number; alternativeName: string | null }[]; error?: string }> {
  if (!Array.isArray(input) || !input.length) return { error: "choose at least one product" };
  if (input.length > 80) return { error: "too many products" };
  const products = await db.product.findMany({});
  const seen = new Set<string>();
  const lines = [];
  for (const l of input) {
    const p = products.find((x: any) => x.id === l?.productId && x.active);
    if (!p) return { error: "product not available" };
    const alt = l.alternativeId ? ((p.alternatives ?? []) as any[]).find((a) => a.id === l.alternativeId) : null;
    if (l.alternativeId && !alt) return { error: "alternative not found" };
    const key = p.id + "|" + (alt?.id ?? "");
    if (seen.has(key)) return { error: "each product only once" };
    seen.add(key);
    const quantity = Math.floor(Number(l.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) return { error: "invalid quantity" };
    lines.push({ productId: p.id, quantity, alternativeName: alt ? `${alt.name}${alt.brand ? ` (${alt.brand})` : ""}` : null });
  }
  return { lines };
}

