// Defaults for the admin-editable settings (lib/settings.ts stores the edited versions).
// Plain constants only — safe to import from both server routes and browser screens.

export const DEFAULT_CHECKLIST: string[] = [
  "Linen & bed sheets changed",
  "Bathroom & toilet disinfected",
  "Kitchen & appliances cleaned",
  "Trash emptied",
];

// An extra field the Super Admin adds to every cleaning task (no code needed).
export type TaskFieldType = "text" | "number" | "yesno";
export type TaskField = { id: string; label: string; type: TaskFieldType };
export const TASK_FIELD_TYPES: TaskFieldType[] = ["text", "number", "yesno"];
export const DEFAULT_TASK_FIELDS: TaskField[] = [];
