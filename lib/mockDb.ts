// In-memory demo database — a tiny Prisma look-alike.
//
// Implements only the subset of the Prisma API the API routes use
// (findMany / findUnique / findFirst / create / update, with where /
// include / orderBy), so NO route code changes when the real backend is
// switched on. Data lives in server memory (globalThis), so every
// browser/phone connected to the same server sees the same live state.
//
// A background simulator (see bottom) moves the demo forward on its own
// — cleaners tick checklists, tickets arrive, materials get requested —
// so dashboards look alive during a client presentation.

import bcrypt from "bcryptjs";
import { notifyChange } from "./events";

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

const MIN = 60_000;
const HOUR = 60 * MIN;

// model -> { relationName: foreignKeyField, targetTable }
const RELATIONS: Record<string, Record<string, [string, string]>> = {
  cleaningTask: {
    house: ["houseId", "house"],
    assignedWorker: ["assignedWorkerId", "worker"],
    completedBy: ["completedByWorkerId", "worker"],
  },
  maintenanceTicket: {
    house: ["houseId", "house"],
    reportedBy: ["reportedById", "worker"],
    assignedWorker: ["assignedWorkerId", "worker"],
  },
  materialRequest: {
    house: ["houseId", "house"],
    requestedBy: ["requestedById", "worker"],
  },
};

const DEFAULTS: Record<string, () => Row> = {
  worker: () => ({ role: "worker", username: null, passwordHash: null, createdAt: new Date() }),
  house: () => ({ validFrom: null, validUntil: null, keyStatus: "AT_OFFICE", keyUpdatedAt: new Date(), createdAt: new Date(), hasPhoto: false, hasVideo: false, mediaUpdatedAt: null }),
  houseMedia: () => ({ photo: null, video: null, updatedAt: new Date() }),
  cleaningTask: () => ({
    assignedWorkerId: null, estimatedMinutes: null, priority: "YELLOW", nextCheckIn: null, notes: null,
    materialsNeeded: null, status: "SCHEDULED", startedAt: null, completedAt: null, completedByWorkerId: null,
    checklistData: {}, createdAt: new Date(), updatedAt: new Date(),
  }),
  maintenanceTicket: () => ({
    priority: "YELLOW", photoUrl: null, afterPhotoUrl: null, mediaData: null, reportedAt: new Date(), assignedWorkerId: null, status: "OPEN",
    startedAt: null, materialsUsed: null, timeSpentMinutes: null, closedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  }),
  materialRequest: () => ({ status: "PENDING", createdAt: new Date(), fulfilledAt: null }),
  auditLog: () => ({ actorId: null, entityId: null, template: null, params: null, createdAt: new Date() }),
  pushSubscription: () => ({ createdAt: new Date() }),
  notification: () => ({ params: null, url: null, readAt: null, createdAt: new Date() }),
};

let idCounter = 1000;
const newId = (prefix: string) => `${prefix}_${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ---------- generic query helpers ----------

function matches(row: Row, where?: Row): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    const v = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("not" in cond) return v !== cond.not;
      if ("in" in cond) return (cond.in as any[]).includes(v);
      if ("lt" in cond) {
        if (v == null) return false; // e.g. a ticket with no closedAt is never "older than"
        return (v instanceof Date ? v.getTime() : v) < (cond.lt instanceof Date ? cond.lt.getTime() : cond.lt);
      }
      return true;
    }
    return v === cond;
  });
}

function sortRows(rows: Row[], orderBy?: Row | Row[]): Row[] {
  if (!orderBy) return rows;
  const keys = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const [field, dir] = Object.entries(k)[0] as [string, string];
      const av = a[field] instanceof Date ? a[field].getTime() : a[field];
      const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
      if (av === bv) continue;
      const cmp = av > bv ? 1 : -1;
      return dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

function makeModel(tables: Tables, name: string) {
  const rel = RELATIONS[name] ?? {};

  const withIncludes = (row: Row | null, include?: Row) => {
    if (!row) return null;
    const out: Row = { ...row };
    if (include) {
      for (const key of Object.keys(include)) {
        const r = rel[key];
        if (r && include[key]) {
          const [fk, table] = r;
          out[key] = row[fk] ? { ...(tables[table].find((x) => x.id === row[fk]) ?? null) } : null;
          if (out[key]) delete out[key].passwordHash; // never leak hashes via includes
          if (out[key] && !Object.keys(out[key]).length) out[key] = null;
        }
      }
    }
    return out;
  };

  return {
    async findMany(args: Row = {}) {
      let rows = sortRows(tables[name].filter((r) => matches(r, args.where)), args.orderBy);
      if (typeof args.take === "number") rows = rows.slice(0, args.take);
      return rows.map((r) => withIncludes(r, args.include));
    },
    async findUnique(args: Row) {
      return withIncludes(tables[name].find((r) => matches(r, args.where)) ?? null, args.include);
    },
    async findFirst(args: Row = {}) {
      const rows = sortRows(tables[name].filter((r) => matches(r, args.where)), args.orderBy);
      return withIncludes(rows[0] ?? null, args.include);
    },
    async create(args: Row) {
      const row: Row = { id: newId(name.slice(0, 2)), ...DEFAULTS[name](), ...args.data };
      tables[name].push(row);
      notifyChange(name);
      return withIncludes(row, args.include);
    },
    async update(args: Row) {
      const row = tables[name].find((r) => matches(r, args.where));
      if (!row) throw new Error(`${name} not found`);
      Object.assign(row, args.data, { updatedAt: new Date() });
      notifyChange(name);
      return withIncludes(row, args.include);
    },
    async updateMany(args: Row) {
      const rows = tables[name].filter((r) => matches(r, args.where));
      rows.forEach((r) => Object.assign(r, args.data, { updatedAt: new Date() }));
      if (rows.length) notifyChange(name);
      return { count: rows.length };
    },
    async delete(args: Row) {
      const i = tables[name].findIndex((r) => matches(r, args.where));
      if (i < 0) throw new Error(`${name} not found`);
      const [row] = tables[name].splice(i, 1);
      notifyChange(name);
      return row;
    },
    async deleteMany(args: Row = {}) {
      const before = tables[name].length;
      tables[name] = tables[name].filter((r) => !matches(r, args.where));
      if (before !== tables[name].length) notifyChange(name);
      return { count: before - tables[name].length };
    },
    async count(args: Row = {}) {
      return tables[name].filter((r) => matches(r, args.where)).length;
    },
  };
}

// ---------- demo data ----------

const CHECKLIST = [
  "Linen & bed sheets changed",
  "Bathroom & toilet disinfected",
  "Kitchen & appliances cleaned",
  "Floors vacuumed & mopped",
  "Windows & mirrors wiped",
  "Trash emptied",
];
const checklist = (doneCount: number, photos: string[] = []) => ({
  checklist: CHECKLIST.map((label, i) => ({ label, done: i < doneCount })),
  photos,
});

// Placeholder "photos" for the demo data (so verification screens have something to show).
const photo = (label: string, bg: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'><rect width='640' height='480' fill='${bg}'/>` +
      `<text x='320' y='255' font-size='46' text-anchor='middle' fill='white' font-family='sans-serif'>${label}</text></svg>`
  );

// Workers whose activity the simulator drives. Maria (cleaner) and Ivan
// (maintenance) are deliberately left alone: they are the "hands-on"
// demo personas, so the presenter can tap through their screens without
// the data changing underneath them.
const SIM_CLEANERS = ["w_joao", "w_sofia", "w_ana"];
const SIM_MAINT = "w_tomas";

function buildSeed(): Tables {
  const now = Date.now();
  const at = (hh: number, mm = 0) => {
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d;
  };
  const pw = bcrypt.hashSync("changeme123", 4);

  const workers: Row[] = [
    { id: "w_maria", name: "Maria Costa", language: "pt", area: "CLEANING", username: "maria", passwordHash: pw },
    { id: "w_joao", name: "João Silva", language: "pt", area: "CLEANING", username: "joao", passwordHash: pw },
    { id: "w_sofia", name: "Sofia Martins", language: "pt", area: "CLEANING", username: "sofia", passwordHash: pw },
    { id: "w_ana", name: "Ana Pereira", language: "es", area: "CLEANING", username: "ana", passwordHash: pw },
    { id: "w_ivan", name: "Ivan Melnyk", language: "uk", area: "MAINTENANCE", username: "ivan", passwordHash: pw },
    { id: "w_tomas", name: "Tomás Rocha", language: "pt", area: "MAINTENANCE", username: "tomas", passwordHash: pw },
    { id: "w_cristina", name: "Cristina Alves", language: "pt", area: "CLEANING", role: "manager", username: "cristina", passwordHash: pw },
    { id: "w_pedro", name: "Pedro Fonseca", language: "pt", area: "CLEANING", role: "coordinator", username: "pedro", passwordHash: pw },
    { id: "w_giuseppe", name: "Giuseppe Romano", language: "it", area: "CLEANING", role: "admin", username: "giuseppe", passwordHash: pw },
  ].map((w, i) => ({ ...DEFAULTS.worker(), createdAt: new Date(now - (30 - i) * 24 * HOUR), ...w }));

  const houses: Row[] = [
    { id: "h_v1", name: "Villa 1 — Room C", address: "Rua das Flores 12, Faro", keyStatus: "AT_OFFICE" },
    { id: "h_v2", name: "Villa 2 — Suite", address: "Rua das Flores 14, Faro", keyStatus: "WITH_GUEST" },
    { id: "h_v3", name: "Villa 3 — Room A", address: "Rua do Mar 45, Faro", keyStatus: "WITH_CLEANER" },
    { id: "h_v4", name: "Villa 4 — Garden Flat", address: "Rua do Mar 47, Faro", keyStatus: "AT_OFFICE" },
    { id: "h_v5", name: "Villa 5 — Room B", address: "Av. da República 8, Faro", keyStatus: "WITH_CLEANER" },
    { id: "h_v6", name: "Marina Apartment 2B", address: "Cais da Marina 21, Faro", keyStatus: "MISSING" },
    { id: "h_ab1", name: "Airbnb — Beco do Sol 3", address: "Beco do Sol 3, Faro", keyStatus: "AT_OFFICE",
      validFrom: new Date(now - 2 * 24 * HOUR), validUntil: new Date(now + 12 * 24 * HOUR) },
    { id: "h_bk1", name: "Booking — Rua Nova 9", address: "Rua Nova 9, Faro", keyStatus: "WITH_GUEST",
      validFrom: new Date(now - 5 * 24 * HOUR), validUntil: new Date(now + 20 * 24 * HOUR) },
  ].map((h, i) => ({
    ...DEFAULTS.house(), createdAt: new Date(now - 60 * 24 * HOUR),
    hasPhoto: true, mediaUpdatedAt: new Date(now - 60 * 24 * HOUR), // demo apartments come with a placeholder photo
    ...h,
  }));
  const HOUSE_COLORS = ["#6b8f71", "#7a6f9b", "#b07d62", "#4f7a8a", "#a3885a", "#5d7a9c", "#8a6d3b", "#7d8f4e"];
  const houseMedia: Row[] = houses.map((h, i) => ({
    ...DEFAULTS.houseMedia(), id: `hm_${h.id}`, houseId: h.id,
    photo: photo(String(h.name).split(" — ")[0], HOUSE_COLORS[i % HOUSE_COLORS.length]),
  }));

  const task = (o: Row): Row => ({ ...DEFAULTS.cleaningTask(), scheduledDate: at(12), createdAt: new Date(now - 5 * HOUR), ...o });

  const tasks: Row[] = [
    task({ id: "t_1", houseId: "h_v3", scheduledTime: "10:00", cleaningTypes: ["CHECKOUT"], assignedWorkerId: "w_maria",
      priority: "RED", status: "IN_PROGRESS", startedAt: new Date(now - 35 * MIN), estimatedMinutes: 90,
      notes: "Same-day check-in at 15:00 — please prioritise", checklistData: checklist(3, [photo("Before", "#8a6d3b")]) }),
    task({ id: "t_2", houseId: "h_v1", scheduledTime: "09:00", cleaningTypes: ["GENERAL"], assignedWorkerId: "w_joao",
      status: "TO_BE_VERIFIED", startedAt: new Date(now - 110 * MIN), completedAt: new Date(now - 8 * MIN),
      completedByWorkerId: "w_joao", estimatedMinutes: 75, checklistData: checklist(6, [photo("Before", "#8a6d3b"), photo("After", "#4f7a26")]) }),
    task({ id: "t_3", houseId: "h_v5", scheduledTime: "13:30", cleaningTypes: ["BEDSHEET_CHANGE"], assignedWorkerId: "w_maria",
      status: "ASSIGNED", estimatedMinutes: 40, checklistData: checklist(0) }),
    task({ id: "t_4", houseId: "h_ab1", scheduledTime: "11:15", cleaningTypes: ["DEEP_CLEAN", "OUTDOOR"], priority: "ORANGE",
      status: "WITH_ISSUE", notes: "Guest reported a broken chair on the balcony", checklistData: checklist(0) }),
    task({ id: "t_5", houseId: "h_v2", scheduledTime: "08:00", cleaningTypes: ["CHECKOUT", "GENERAL"], assignedWorkerId: "w_sofia",
      status: "APPROVED", startedAt: new Date(now - 4 * HOUR), completedAt: new Date(now - 2.5 * HOUR),
      completedByWorkerId: "w_sofia", estimatedMinutes: 80, checklistData: checklist(6) }),
    task({ id: "t_6", houseId: "h_v4", scheduledTime: "10:30", cleaningTypes: ["GENERAL"], assignedWorkerId: "w_sofia",
      status: "IN_PROGRESS", startedAt: new Date(now - 20 * MIN), estimatedMinutes: 60, checklistData: checklist(2) }),
    task({ id: "t_7", houseId: "h_bk1", scheduledTime: "14:00", cleaningTypes: ["CHECKOUT"], assignedWorkerId: "w_ana",
      priority: "ORANGE", status: "ASSIGNED", estimatedMinutes: 70, checklistData: checklist(0) }),
    task({ id: "t_8", houseId: "h_v6", scheduledTime: "07:30", cleaningTypes: ["DEEP_CLEAN"], assignedWorkerId: "w_ana",
      status: "APPROVED", startedAt: new Date(now - 5 * HOUR), completedAt: new Date(now - 3 * HOUR),
      completedByWorkerId: "w_ana", estimatedMinutes: 120, checklistData: checklist(6) }),
    task({ id: "t_9", houseId: "h_v6", scheduledTime: "16:30", cleaningTypes: ["GENERAL"], priority: "YELLOW",
      status: "SCHEDULED", estimatedMinutes: 60, checklistData: checklist(0) }),
    task({ id: "t_10", houseId: "h_v1", scheduledTime: "08:30", cleaningTypes: ["OUTDOOR"], assignedWorkerId: "w_joao",
      status: "APPROVED", startedAt: new Date(now - 6 * HOUR), completedAt: new Date(now - 5 * HOUR),
      completedByWorkerId: "w_joao", estimatedMinutes: 45, checklistData: checklist(6) }),
  ];

  const ticket = (o: Row): Row => ({ ...DEFAULTS.maintenanceTicket(), ...o });
  const tickets: Row[] = [
    ticket({ id: "k_1", houseId: "h_ab1", area: "Outdoor", description: "Balcony chair leg snapped — safety risk", priority: "RED",
      reportedById: "w_joao", reportedAt: new Date(now - 50 * MIN) }),
    ticket({ id: "k_2", houseId: "h_v3", area: "Bathroom", description: "Leaking pipe under the sink, water on floor", priority: "RED",
      reportedById: "w_maria", reportedAt: new Date(now - 25 * MIN), photoUrl: photo("Leak", "#2e6b8a") }),
    ticket({ id: "k_3", houseId: "h_v6", area: "Kitchen", description: "Oven won't heat up", priority: "ORANGE",
      reportedById: "w_ana", reportedAt: new Date(now - 3 * HOUR) }),
    ticket({ id: "k_4", houseId: "h_v2", area: "Bedroom", description: "Wardrobe door off its hinge", priority: "YELLOW",
      reportedById: "w_sofia", reportedAt: new Date(now - 5 * HOUR) }),
    ticket({ id: "k_5", houseId: "h_v4", area: "Living room", description: "Air-con remote not responding", priority: "ORANGE",
      reportedById: "w_sofia", reportedAt: new Date(now - 4 * HOUR), status: "IN_PROGRESS", assignedWorkerId: SIM_MAINT,
      startedAt: new Date(now - 30 * MIN) }),
    ticket({ id: "k_6", houseId: "h_v1", area: "Bathroom", description: "Shower head replaced", priority: "YELLOW",
      reportedById: "w_joao", reportedAt: new Date(now - 26 * HOUR), status: "CLOSED", assignedWorkerId: "w_ivan",
      startedAt: new Date(now - 24 * HOUR), closedAt: new Date(now - 23 * HOUR), materialsUsed: "Shower head, PTFE tape", timeSpentMinutes: 25,
      photoUrl: photo("Before", "#6b4e3a"), afterPhotoUrl: photo("After", "#4f7a26") }),
  ];

  const materials: Row[] = [
    { ...DEFAULTS.materialRequest(), id: "m_1", houseId: "h_v3", requestedById: "w_maria",
      items: "Bathroom disinfectant x2, bin bags", createdAt: new Date(now - 18 * MIN) },
    { ...DEFAULTS.materialRequest(), id: "m_2", houseId: "h_v4", requestedById: "w_sofia",
      items: "Microfibre cloths x6, glass cleaner", createdAt: new Date(now - 70 * MIN) },
    { ...DEFAULTS.materialRequest(), id: "m_3", houseId: "h_v2", requestedById: "w_sofia",
      items: "Dishwasher tablets", status: "FULFILLED", createdAt: new Date(now - 6 * HOUR), fulfilledAt: new Date(now - 5 * HOUR) },
  ];

  return { worker: workers, house: houses, cleaningTask: tasks, maintenanceTicket: tickets, materialRequest: materials, houseMedia, auditLog: [], pushSubscription: [], notification: [] };
}

// ---------- live simulator ----------

const ISSUES: [string, string, string][] = [
  ["Bathroom", "Toilet cistern keeps running", "ORANGE"],
  ["Kitchen", "Dishwasher not draining", "ORANGE"],
  ["Bedroom", "Bedside lamp not working", "YELLOW"],
  ["Living room", "Sofa cushion zip broken", "YELLOW"],
  ["Outdoor", "Gate latch is loose", "ORANGE"],
  ["Bathroom", "No hot water in shower", "RED"],
  ["Kitchen", "Fridge making loud noise", "ORANGE"],
  ["Bedroom", "Window won't close fully", "YELLOW"],
];
const SUPPLIES = [
  "Toilet paper x12", "Laundry detergent", "Bin bags (large)", "Floor cleaner x2",
  "Sponges & scourers", "Hand soap refills", "Coffee pods x30", "Fresh towels x8",
];

// Jobs are dated at local noon; the HH:MM lives in scheduledTime (keeps day/time sorting exact).
const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function tick(t: Tables) {
  const now = new Date();
  const mine = (id: string) => (r: Row) => r.assignedWorkerId === id;
  const simTasks = t.cleaningTask.filter((r) => SIM_CLEANERS.includes(r.assignedWorkerId));
  const roll = Math.random();

  // 1. A cleaner works through a checklist
  const working = simTasks.filter((r) => r.status === "IN_PROGRESS");
  if (roll < 0.5 && working.length) {
    const task = pick(working);
    const list = task.checklistData.checklist as { done: boolean }[];
    const next = list.find((i) => !i.done);
    if (next) next.done = true;
    if (list.every((i) => i.done)) {
      task.status = "TO_BE_VERIFIED";
      task.completedAt = now;
      task.completedByWorkerId = task.assignedWorkerId;
    }
    task.updatedAt = now;
    return;
  }

  // 2. A cleaner starts their next job
  const waiting = simTasks.filter((r) => r.status === "ASSIGNED");
  if (roll < 0.62 && waiting.length) {
    const task = pick(waiting);
    task.status = "IN_PROGRESS";
    task.startedAt = now;
    task.updatedAt = now;
    return;
  }

  // 3. New issue reported (keep a healthy open queue for maintenance)
  const open = t.maintenanceTicket.filter((k) => k.status === "OPEN");
  if (roll < 0.72 && open.length < 5) {
    const [area, description, priority] = pick(ISSUES);
    t.maintenanceTicket.push({
      ...DEFAULTS.maintenanceTicket(), id: newId("k"), houseId: pick(t.house).id, area, description, priority,
      reportedById: pick(SIM_CLEANERS), reportedAt: now,
    });
    return;
  }

  // 4. Maintenance (Tomás) works through tickets — never drains Ivan's queue below 3
  const tomas = t.maintenanceTicket.filter((k) => k.assignedWorkerId === SIM_MAINT);
  const started = tomas.find((k) => k.status === "IN_PROGRESS");
  if (roll < 0.82 && started) {
    Object.assign(started, { status: "TO_BE_VERIFIED", closedAt: now, materialsUsed: "Misc. parts", timeSpentMinutes: 20 + Math.floor(Math.random() * 40) });
    return;
  }
  const accepted = tomas.find((k) => k.status === "ACCEPTED");
  if (roll < 0.86 && accepted) {
    Object.assign(accepted, { status: "IN_PROGRESS", startedAt: now });
    return;
  }
  if (roll < 0.9 && open.length > 3) {
    Object.assign(open[0], { status: "ACCEPTED", assignedWorkerId: SIM_MAINT });
    return;
  }

  // 5. Materials: new requests arrive, old ones get sorted
  const pending = t.materialRequest.filter((m) => m.status === "PENDING");
  if (roll < 0.95 && pending.length < 4) {
    t.materialRequest.push({
      ...DEFAULTS.materialRequest(), id: newId("m"), houseId: pick(t.house).id, requestedById: pick(SIM_CLEANERS),
      items: pick(SUPPLIES), createdAt: now,
    });
    return;
  }
  if (pending.length > 2) {
    Object.assign(pending[0], { status: "FULFILLED", fulfilledAt: now });
    return;
  }
}

// Housekeeping so a long demo never runs dry or piles up.
function housekeeping(t: Tables) {
  const now = new Date();
  if (t.auditLog.length > 500) t.auditLog = t.auditLog.slice(-500);
  if (t.notification && t.notification.length > 1000) t.notification = t.notification.slice(-1000);
  const simTasks = t.cleaningTask.filter((r) => SIM_CLEANERS.includes(r.assignedWorkerId));

  // Keep the cleaners supplied with work
  const active = simTasks.filter((r) => ["ASSIGNED", "IN_PROGRESS"].includes(r.status));
  if (active.length < 4) {
    const cleaner = pick(SIM_CLEANERS);
    const busy = t.cleaningTask.filter((r) => !["APPROVED", "TO_BE_VERIFIED"].includes(r.status)).map((r) => r.houseId);
    const free = t.house.filter((h) => !busy.includes(h.id));
    const hour = 9 + Math.floor(Math.random() * 8);
    t.cleaningTask.push({
      ...DEFAULTS.cleaningTask(), id: newId("t"), houseId: pick(free.length ? free : t.house).id,
      scheduledDate: noon(), scheduledTime: `${String(hour).padStart(2, "0")}:${pick(["00", "30"])}`,
      cleaningTypes: [pick(["GENERAL", "CHECKOUT", "DEEP_CLEAN", "BEDSHEET_CHANGE"])],
      assignedWorkerId: cleaner, status: "ASSIGNED", priority: pick(["YELLOW", "YELLOW", "ORANGE", "RED"]),
      estimatedMinutes: pick([45, 60, 75, 90]), checklistData: checklist(0),
    });
  }

  // Coordinator signs off when too many are waiting for verification
  const verify = t.cleaningTask.filter((r) => r.status === "TO_BE_VERIFIED" && r.id !== "t_2");
  if (verify.length > 3) verify[0].status = "APPROVED";

  // Trim history
  const approved = t.cleaningTask.filter((r) => r.status === "APPROVED");
  if (approved.length > 10) {
    const drop = approved.slice(0, approved.length - 10).map((r) => r.id);
    t.cleaningTask = t.cleaningTask.filter((r) => !drop.includes(r.id));
  }
  const closed = t.maintenanceTicket.filter((k) => k.status === "CLOSED");
  if (closed.length > 6) {
    const drop = closed.slice(0, closed.length - 6).map((r) => r.id);
    t.maintenanceTicket = t.maintenanceTicket.filter((k) => !drop.includes(k.id));
  }
}

// ---------- store (singleton across hot reloads / route bundles) ----------

type Store = { tables: Tables; timer?: ReturnType<typeof setInterval> };
const g = globalThis as unknown as { __wakeupDemo?: Store };

function store(): Store {
  if (!g.__wakeupDemo) {
    g.__wakeupDemo = { tables: buildSeed() };
    startSimulator();
  }
  return g.__wakeupDemo;
}

function startSimulator() {
  const s = g.__wakeupDemo!;
  if (s.timer || process.env.DEMO_SIMULATE === "false") return;
  s.timer = setInterval(() => {
    try {
      tick(s.tables);
      housekeeping(s.tables);
      notifyChange("cleaningTask", "maintenanceTicket", "materialRequest"); // the simulator edits tables directly
    } catch (e) {
      console.error("[demo] simulator error", e);
    }
  }, 6000);
  (s.timer as any).unref?.();
}

export function resetDemo() {
  const s = store();
  const fresh = buildSeed();
  // Phones that subscribed to notifications stay subscribed through a demo reset.
  for (const k of Object.keys(fresh)) if (k !== "pushSubscription" && k !== "notification") s.tables[k] = fresh[k];
  notifyChange("worker", "house", "cleaningTask", "maintenanceTicket", "materialRequest", "auditLog");
}

// Models read `tables[name]` lazily on every call, so reassigning
// arrays above (housekeeping / reset) is always picked up.
const tablesProxy = new Proxy({} as Tables, {
  get: (_t, name: string) => (store().tables[name] ??= []), // ??= : an older in-memory store (dev hot-reload) may lack newer tables
  set: (_t, name: string, value: Row[]) => {
    store().tables[name] = value;
    return true;
  },
});

export const mockDb = {
  worker: makeModel(tablesProxy, "worker"),
  house: makeModel(tablesProxy, "house"),
  houseMedia: makeModel(tablesProxy, "houseMedia"),
  cleaningTask: makeModel(tablesProxy, "cleaningTask"),
  maintenanceTicket: makeModel(tablesProxy, "maintenanceTicket"),
  materialRequest: makeModel(tablesProxy, "materialRequest"),
  auditLog: makeModel(tablesProxy, "auditLog"),
  pushSubscription: makeModel(tablesProxy, "pushSubscription"),
  notification: makeModel(tablesProxy, "notification"),
};

// Demo only: a freshly onboarded cleaner would otherwise open an empty app.
// Give them a believable day: one job in progress and two coming up.
export async function seedDemoTasks(workerId: string) {
  const t = store().tables;
  const now = new Date();
  const mk = (houseId: string, time: string, types: string[], extra: Row) =>
    t.cleaningTask.push({
      ...DEFAULTS.cleaningTask(), id: newId("cl"), houseId, scheduledDate: noon(), scheduledTime: time,
      cleaningTypes: types, assignedWorkerId: workerId, estimatedMinutes: 60, checklistData: checklist(0), ...extra,
    });
  mk("h_v2", "09:30", ["GENERAL"], {
    status: "IN_PROGRESS", startedAt: new Date(Date.now() - 25 * MIN), checklistData: checklist(2),
  });
  mk("h_v4", "12:00", ["CHECKOUT"], { status: "ASSIGNED", priority: "ORANGE", estimatedMinutes: 80 });
  mk("h_v5", "15:00", ["BEDSHEET_CHANGE"], { status: "ASSIGNED", estimatedMinutes: 40 });
}
