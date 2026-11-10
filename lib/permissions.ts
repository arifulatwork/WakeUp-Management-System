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
//
// Product-ordering roles (added later, nothing above changed):
//   student      NOT a staff account: joins with the group code the coordinator announces + their
//                own name. Sees the catalogue, sends requests, follows the order. Only /student.
//   supplier     warehouse staff (username + password made by the admin). Prepares and dispatches
//                the approved orders. Only /supplier.
// Coordinators and admins also get the ordering tools; managers can read orders and reports.

export type Role = "worker" | "coordinator" | "manager" | "admin" | "student" | "supplier";

const OPS: Role[] = ["coordinator", "manager", "admin"];
const MGMT: Role[] = ["manager", "admin"];
const ADMIN: Role[] = ["admin"];
const COORD_ADMIN: Role[] = ["coordinator", "admin"];

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

  // ---- product ordering ----
  "catalogue.manage": ADMIN,   // products, brands, approved alternatives, standard quantities, dietary requirements
  "catalogue.products": COORD_ADMIN, // add / edit / delete products — coordinators only for the countries of their own groups (checked in the product routes)
  "ordering.configure": ADMIN, // ordering days, cut-off time, who orders, approval rules
  "groups.manage": ADMIN,      // create / rename / delete student groups, assign their coordinator
  "groups.code": COORD_ADMIN,  // group code, student list, dietary exceptions (coordinators: their own groups only)
  "requests.review": COORD_ADMIN, // approve / reject student requests and quantity exceptions (own groups only)
  "orders.create": COORD_ADMIN,   // create the group's order (coordinators only when that ordering model is selected)
  "orders.read.all": MGMT,     // every group's orders
  "orders.fulfil": ["supplier", "admin"], // prepare, mark missing, dispatch, deliver
  "reports.read": MGMT,        // reports and order history
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
  "/group-orders": ["coordinator", "manager", "admin"],
  "/catalogue": ["coordinator", "manager", "admin"],
  "/student": ["student"],
  "/supplier": ["supplier", "admin"],
};

// The screen each role lands on after signing in / when sent back from a screen it may not open.
export const HOME: Record<string, string> = { admin: "/admin", manager: "/manager", coordinator: "/coordinator", student: "/student", supplier: "/supplier" };

// Rows of the read-only table shown on the Admin screen. Built from the
// rules above so it can never drift out of date.
export const ROLE_COLUMNS: Role[] = ["worker", "coordinator", "manager", "admin", "student", "supplier"];
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
  // product ordering
  { label: "See products, standard quantities & own order status", roles: ["student", "coordinator", "manager", "admin", "supplier"] },
  { label: "Send product requests / quantity exceptions (when students order)", roles: ["student"] },
  { label: "Manage groups & the coordinator of each group", roles: PERMS["groups.manage"] },
  { label: "Group code, student list & dietary exceptions", roles: PERMS["groups.code"] },
  { label: "Approve / reject requests & quantity changes", roles: PERMS["requests.review"] },
  { label: "Create the group order (when coordinators order)", roles: PERMS["orders.create"] },
  { label: "Manage products, brands, alternatives & quantities", roles: PERMS["catalogue.manage"] },
  { label: "Add & edit products of the countries of their own groups", roles: PERMS["catalogue.products"] },
  { label: "Ordering days, cut-off time & workflow", roles: PERMS["ordering.configure"] },
  { label: "View all orders, reports & history", roles: PERMS["orders.read.all"] },
  { label: "Prepare, mark missing, dispatch & deliver orders", roles: PERMS["orders.fulfil"] },
];
