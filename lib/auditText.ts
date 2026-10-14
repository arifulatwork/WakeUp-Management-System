// AUDIT TEXT — makes the change history readable in every language.
//
// The database stores a TEMPLATE (always English, e.g. "Closed ticket" or
// "Key status of {name} → {state}") plus PARAMS (the changing parts). Each viewer's
// browser translates the template into the viewer's language and fills the params in.
// People's names, house names and notes are shown exactly as typed.
//
// Old entries (written before this existed) have no template; they show the saved
// English summary.

type Vars = Record<string, string | number>;
type Tr = (s: string, vars?: Vars) => string;

// English field names that appear in "Edited …(fields)" entries.
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  houseId: "House", scheduledDate: "Date", scheduledTime: "Time", cleaningTypes: "Cleaning types",
  assignedWorkerId: "Assigned to", estimatedMinutes: "Estimated minutes", priority: "Priority",
  notes: "Notes", materialsNeeded: "Materials needed", status: "Status", checklist: "Checklist",
  area: "Area", description: "Description", materialsUsed: "Materials used", timeSpentMinutes: "Time spent",
  items: "Items", name: "Name", address: "Address", keyStatus: "Key status", validFrom: "Valid from",
  validUntil: "Valid until", language: "Language", role: "Role", username: "Username", password: "Password",
  team: "Team",
};

// Params whose value is a database code (statuses, roles, key states, teams) → translated with ev().
const CODE_PARAMS = new Set(["from", "to", "state", "team"]);

// English version, used for the stored fallback summary.
export function renderEnglish(template: string, params: Vars = {}): string {
  let out = template;
  for (const [k, v] of Object.entries(params)) {
    let val = String(v);
    if (k === "fields") val = val.split(",").map((f) => AUDIT_FIELD_LABELS[f.trim()] ?? f.trim()).join(", ");
    out = out.split(`{${k}}`).join(val);
  }
  return out;
}

export function renderAudit(
  entry: { summary: string; template?: string | null; params?: Vars | null },
  tr: Tr,
  ev: (code: string) => string
): string {
  if (!entry.template) return entry.summary;
  const vars: Vars = {};
  for (const [k, v] of Object.entries(entry.params ?? {})) {
    const s = String(v);
    if (k === "fields") {
      vars[k] = s.split(",").map((f) => tr(AUDIT_FIELD_LABELS[f.trim()] ?? f.trim())).join(", ");
    } else if (CODE_PARAMS.has(k)) {
      vars[k] = s === "worker" ? tr("Staff") : ev(s);
    } else if (k === "room") {
      vars[k] = tr(s); // "Bathroom", "Kitchen" … have translations
    } else {
      vars[k] = s; // names, times, counts: as written
    }
  }
  return tr(entry.template, vars);
}
