// WHO CAN DO WHAT — the single source of truth.
//
// Used by the API routes (enforced on the server, via lib/guard.ts), by the
// screens (to hide buttons people can't use) and by the "What each role can
// do" table on the Admin screen. Change a rule here and all three follow.
//
// Roles:
//   worker       cleaners & maintenance staff — sign in like everyone else,
//                only their own jobs (see the "worker actions" in the routes)
//   coordinator  verifies readiness, can create/edit but never delete
//   manager      runs operations day to day, can also delete operational data
//   admin        "Super Admin" — everything, plus staff, roles, logins, deleting houses

export type Role = "worker" | "coordinator" | "manager" | "admin";

const OPS: Role[] = ["coordinator", "manager", "admin"];
const MGMT: Role[] = ["manager", "admin"];
const ADMIN: Role[] = ["admin"];

export const PERMS = {
  // cleaning tasks
  "tasks.write": OPS,       // create, edit, reassign, change status/checklist
  "tasks.review": OPS,      // approve / confirm ready / send back
  "tasks.delete": MGMT,
  // maintenance tickets
  "tickets.write": OPS,     // edit, reassign, reopen (anyone can REPORT one)
  "tickets.delete": MGMT,
  // material requests
  "materials.write": OPS,   // edit, fulfil, reopen (anyone can REQUEST)
  "materials.delete": MGMT,
  // houses
  "houses.key": OPS,        // change key status
  "houses.edit": MGMT,      // name, address, temporary-listing dates
  "houses.create": MGMT,
  "houses.delete": ADMIN,
  // staff
  "staff.manage": ADMIN,
  "settings.edit": ADMIN,   // default checklist + extra task fields
  "audit.read": ADMIN,      // see the change history    // add / edit / remove staff, roles, logins, passwords
  // reading the all-houses dashboards
  "data.read": OPS,         // every task, every ticket, every material request
} as const;

export type Perm = keyof typeof PERMS;

export const can = (role: string | null | undefined, perm: Perm): boolean =>
  !!role && (PERMS[perm] as readonly string[]).includes(role);

// Which screens each role may open (the middleware uses this too).
export const SCREENS: Record<string, Role[]> = {
  "/admin": ["admin"],
  "/manager": ["manager", "admin"],
  "/coordinator": ["coordinator", "manager", "admin"],
  "/ops": ["manager", "admin"],
};

// Rows of the read-only table shown on the Admin screen. Built from the
// rules above so it can never drift out of date.
export const ROLE_COLUMNS: Role[] = ["worker", "coordinator", "manager", "admin"];
export const MATRIX: { label: string; roles: readonly Role[] }[] = [
  { label: "Do jobs on the phone (cleaning / maintenance)", roles: ["worker"] },
  { label: "Report an issue / request materials", roles: ["worker", "coordinator", "manager", "admin"] },
  { label: "Open the Coordinator screen", roles: SCREENS["/coordinator"] },
  { label: "Create & edit cleaning tasks", roles: PERMS["tasks.write"] },
  { label: "Approve / send back finished jobs", roles: PERMS["tasks.review"] },
  { label: "Edit tickets & material requests", roles: PERMS["tickets.write"] },
  { label: "Change key status", roles: PERMS["houses.key"] },
  { label: "Open the Manager & Ops screens", roles: SCREENS["/manager"] },
  { label: "Delete tasks, tickets & requests", roles: PERMS["tasks.delete"] },
  { label: "Edit house details", roles: PERMS["houses.edit"] },
  { label: "Add houses", roles: PERMS["houses.create"] },
  { label: "Delete houses", roles: PERMS["houses.delete"] },
  { label: "Staff, roles, logins & passwords (Admin screen)", roles: PERMS["staff.manage"] },
  { label: "See the change history (who changed what)", roles: PERMS["audit.read"] },
  { label: "Edit default checklist & extra task fields", roles: PERMS["settings.edit"] },
];
