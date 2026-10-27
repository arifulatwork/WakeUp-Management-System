import { db } from "@/lib/db";
import { DEFAULT_CHECKLIST, DEFAULT_TASK_FIELDS, TASK_FIELD_TYPES, TaskField } from "@/lib/settingsDefaults";

// Server-side access to the AppSetting table (one row per setting, JSON value).
// Works with the demo database and with Supabase — only findUnique/create/update are used.

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.appSetting.findUnique({ where: { key } });
    return row && row.value != null ? (row.value as T) : fallback;
  } catch {
    return fallback; // e.g. migration not applied yet: the app keeps working with defaults
  }
}

async function write(key: string, value: unknown) {
  const existing = await db.appSetting.findUnique({ where: { key } });
  if (existing) await db.appSetting.update({ where: { key }, data: { value } });
  else await db.appSetting.create({ data: { key, value } });
}

export async function getChecklistDefaults(): Promise<string[]> {
  const v = await read<unknown>("checklist", DEFAULT_CHECKLIST);
  return cleanChecklist(v) ?? DEFAULT_CHECKLIST;
}
export const setChecklistDefaults = (items: string[]) => write("checklist", items);

export async function getTaskFields(): Promise<TaskField[]> {
  const v = await read<unknown>("taskFields", DEFAULT_TASK_FIELDS);
  return cleanFields(v) ?? DEFAULT_TASK_FIELDS;
}
export const setTaskFields = (fields: TaskField[]) => write("taskFields", fields);

export function cleanChecklist(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 60).map((s) => s.slice(0, 120));
  return out;
}

export function cleanFields(v: unknown): TaskField[] | null {
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  const out: TaskField[] = [];
  for (const f of v.slice(0, 30)) {
    const label = String((f as any)?.label ?? "").trim().slice(0, 60);
    if (!label) continue;
    const type = TASK_FIELD_TYPES.includes((f as any)?.type) ? (f as any).type : "text";
    let id = String((f as any)?.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    if (!id || seen.has(id)) id = "f" + Math.random().toString(36).slice(2, 8);
    seen.add(id);
    out.push({ id, label, type });
  }
  return out;
}
