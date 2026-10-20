import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm, actingWorkerId } from "@/lib/guard";
import { isValidPhoto } from "@/lib/photoValidation";
import { MEDIA_ENABLED } from "@/lib/features";
import { logAudit } from "@/lib/audit";
import { pushAsync, STAFF_ROLES } from "@/lib/push";
import { maybePurgeTickets } from "@/lib/retention";

// GET /api/tickets
//   ?open=1       -> only tickets not yet closed (office screens; includes "to be verified")
//   ?open=1&queue=1 -> the maintenance worker's queue (handed-in tickets waiting for review are left out)
//   ?mine=1&closed=1 -> the maintenance worker's OWN finished tickets (waiting for review or closed), newest first
//   (no params)   -> every ticket (ops overview)
// Sorted by priority (RED first) then oldest first, matching the spec's
// "sort requests by both entry date and severity."
export async function GET(req: NextRequest) {
  const openOnly = req.nextUrl.searchParams.get("open");

  // The worker's own history: tickets they closed (kept 6 months, see lib/retention.ts).
  // Only ever their own — the id comes from their login, whatever the URL says.
  if (req.nextUrl.searchParams.get("mine") && req.nextUrl.searchParams.get("closed")) {
    const me = await actingWorkerId(req, req.nextUrl.searchParams.get("workerId"));
    if (!me) return NextResponse.json({ error: "sign in required" }, { status: 401 });
    await maybePurgeTickets();
    const done = await db.maintenanceTicket.findMany({
      // Also tickets nobody was assigned to (e.g. status set from the office Edit dialog), so they never vanish.
      where: { status: { in: ["TO_BE_VERIFIED", "CLOSED"] }, OR: [{ assignedWorkerId: me }, { assignedWorkerId: null }] },
      include: { house: true, reportedBy: true },
    });
    done.sort((a: any, b: any) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime());
    return NextResponse.json(done);
  }

  // The maintenance team reads the open queue (their own login); the full history is management only.
  if (!openOnly) {
    const g = await requirePerm(req, "data.read");
    if (g.error) return g.error;
  }

  await maybePurgeTickets(); // six-month cleanup of closed tickets (at most hourly)

  let tickets = await db.maintenanceTicket.findMany({
    where: openOnly ? { status: { not: "CLOSED" } } : undefined,
    include: { house: true, reportedBy: true, assignedWorker: true },
    orderBy: [{ reportedAt: "asc" }],
  });

  // A ticket the worker already handed in is waiting for the office: not part of their queue any more.
  if (req.nextUrl.searchParams.get("queue")) tickets = tickets.filter((t: any) => t.status !== "TO_BE_VERIFIED");

  const priorityRank: Record<string, number> = { RED: 0, ORANGE: 1, YELLOW: 2 };
  tickets.sort((a: { priority: string }, b: { priority: string }) => priorityRank[a.priority] - priorityRank[b.priority]);

  return NextResponse.json(tickets);
}

// POST /api/tickets — this is what the cleaner's "Report Issue" button
// submits to. Also reachable from a house menu per spec, and from
// Coordinators reporting a problem directly.
export async function POST(req: NextRequest) {
  const { houseId, area, description, priority, photoUrl: sentPhoto, reportedById: claimedReporter } = await req.json();
  // Photos switched off (lib/features.ts): the issue is still saved, just without the photo.
  const photoUrl = MEDIA_ENABLED ? sentPhoto : null;
  const reportedById = await actingWorkerId(req, claimedReporter);

  if (!houseId || !area || !description || !reportedById) {
    return NextResponse.json(
      { error: "houseId, area, description and reportedById are required" },
      { status: 400 }
    );
  }

  if (photoUrl && !isValidPhoto(photoUrl)) {
    return NextResponse.json({ error: "invalid or too large photo" }, { status: 400 });
  }

  const ticket = await db.maintenanceTicket.create({
    data: {
      houseId,
      area,
      description,
      priority: priority ?? "YELLOW",
      photoUrl: photoUrl ?? null,
      reportedById,
    },
    include: { house: true, reportedBy: true },
  });

  // A reported issue also flips the related house's current cleaning
  // task (if one's in progress) to WITH_ISSUE, so Cristina/Manager sees
  // it immediately on the dashboard without cross-referencing tickets.
  const activeTask = await db.cleaningTask.findFirst({
    where: { houseId, status: { in: ["IN_PROGRESS", "ASSIGNED", "SCHEDULED"] } },
    orderBy: { scheduledDate: "desc" },
  });
  if (activeTask) {
    await db.cleaningTask.update({
      where: { id: activeTask.id },
      data: { status: "WITH_ISSUE" },
    });
  }

  await logAudit(req, "ticket", ticket.id, "create", "Reported issue at {house}: {room}",
    { house: ticket.house?.name ?? houseId, room: String(area) }, reportedById);

  // Wake the maintenance team; an urgent (red) issue also goes to the office.
  const urgent = ticket.priority === "RED";
  const msg = { house: ticket.house?.name ?? "", room: String(area) };
  pushAsync({ roles: ["worker"], area: "MAINTENANCE", excludeWorkerId: reportedById }, urgent ? "ticket_urgent" : "ticket_new", msg, `ticket-${ticket.id}`);
  if (urgent) pushAsync({ roles: STAFF_ROLES, excludeWorkerId: reportedById }, "ticket_urgent", msg, `ticket-${ticket.id}`);
  return NextResponse.json(ticket, { status: 201 });
}
