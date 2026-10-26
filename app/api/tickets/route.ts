import { NextRequest, NextResponse } from "next/server";
import { slimAny } from "@/lib/mediaSlim";
import { db } from "@/lib/db";
import { currentSession, actingWorkerId } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { pushAsync, STAFF_ROLES } from "@/lib/push";
import { isValidPhoto } from "@/lib/photoValidation";
import { MEDIA_ENABLED } from "@/lib/features";
import { maybePurgeTickets } from "@/lib/retention";

const json = (v: any, init?: ResponseInit) => NextResponse.json(slimAny(v), init);
const PRIORITIES = ["YELLOW", "ORANGE", "RED"];

// GET /api/tickets
//   ?open=1            -> not closed and not rejected
//   ?open=1&queue=1    -> (maintenance app) new issues anyone can accept + the ones assigned to me
//   ?mine=1&closed=1   -> my finished tickets (history)
export async function GET(req: NextRequest) {
  const me = await currentSession(req);
  if (!me) return json({ error: "sign in required" }, { status: 401 });
  await maybePurgeTickets();

  const q = req.nextUrl.searchParams;
  const asked = q.get("workerId");
  // Field staff are always themselves; office roles may ask for someone else.
  const myId = me.role === "worker" ? me.workerId : asked || me.workerId;
  const office = can(me.role, "data.read");

  let tickets = await db.maintenanceTicket.findMany({
    include: { house: true, reportedBy: true, assignedWorker: true },
    orderBy: { reportedAt: "desc" },
  });

  if (q.get("mine") === "1") {
    tickets = tickets.filter((t: any) => t.assignedWorkerId === myId);
    if (q.get("closed") === "1") tickets = tickets.filter((t: any) => t.status === "CLOSED");
  } else {
    // Field staff never get the full list: only new issues and their own.
    if (!office) tickets = tickets.filter((t: any) => t.status === "OPEN" || t.assignedWorkerId === me.workerId || t.reportedById === me.workerId);
    if (q.get("open") === "1") tickets = tickets.filter((t: any) => t.status !== "CLOSED" && t.status !== "REJECTED");
    if (q.get("queue") === "1") tickets = tickets.filter((t: any) => t.status === "OPEN" || t.assignedWorkerId === myId);
  }
  return json(tickets);
}

// POST /api/tickets — anyone signed in can REPORT an issue.
// Body: { houseId, area, description, priority?, photoUrl?, reportedById }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const reportedById = await actingWorkerId(req, b.reportedById);
  if (!reportedById) return json({ error: "sign in required" }, { status: 401 });

  const area = String(b.area ?? "").trim();
  const description = String(b.description ?? "").trim();
  if (!b.houseId || !area || !description) return json({ error: "house, area and description required" }, { status: 400 });
  const priority = b.priority ?? "YELLOW";
  if (!PRIORITIES.includes(priority)) return json({ error: "invalid priority" }, { status: 400 });
  const house = await db.house.findUnique({ where: { id: b.houseId } });
  if (!house) return json({ error: "house not found" }, { status: 404 });
  if (!(await db.worker.findUnique({ where: { id: reportedById } }))) return json({ error: "worker not found" }, { status: 404 });

  let photoUrl: string | null = null;
  if (MEDIA_ENABLED && b.photoUrl) {
    if (!isValidPhoto(b.photoUrl)) return json({ error: "invalid photo (JPEG, PNG or WebP, max ~650 KB)" }, { status: 400 });
    photoUrl = b.photoUrl;
  }

  const ticket = await db.maintenanceTicket.create({
    data: { houseId: b.houseId, area, description, priority, photoUrl, reportedById, status: "OPEN" },
    include: { house: true, reportedBy: true },
  });
  await logAudit(req, "ticket", ticket.id, "create", "Reported issue at {house}: {area}", { house: house.name, area }, reportedById);

  const key = priority === "RED" ? "ticket_urgent" : "ticket_new";
  const msg = { house: house.name, room: area };
  pushAsync({ roles: STAFF_ROLES, excludeWorkerId: reportedById }, key, msg, `ticket-${ticket.id}`);
  pushAsync({ roles: ["worker"], area: "MAINTENANCE", excludeWorkerId: reportedById }, key, msg, `ticket-${ticket.id}`);
  return json(ticket, { status: 201 });
}
