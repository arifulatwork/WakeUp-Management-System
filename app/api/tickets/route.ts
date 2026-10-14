import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm, actingWorkerId } from "@/lib/guard";
import { isValidPhoto } from "@/lib/photoValidation";
import { logAudit } from "@/lib/audit";
import { pushAsync, STAFF_ROLES } from "@/lib/push";
import { maybePurgeTickets } from "@/lib/retention";

// GET /api/tickets
//   ?open=1       -> only tickets not yet closed (maintenance worker's queue)
//   (no params)   -> every ticket (ops overview)
// Sorted by priority (RED first) then oldest first, matching the spec's
// "sort requests by both entry date and severity."
export async function GET(req: NextRequest) {
  const openOnly = req.nextUrl.searchParams.get("open");

  // The maintenance team reads the open queue (their own login); the full history is management only.
  if (!openOnly) {
    const g = await requirePerm(req, "data.read");
    if (g.error) return g.error;
  }

  await maybePurgeTickets(); // six-month cleanup of closed tickets (at most hourly)

  const tickets = await db.maintenanceTicket.findMany({
    where: openOnly ? { status: { not: "CLOSED" } } : undefined,
    include: { house: true, reportedBy: true, assignedWorker: true },
    orderBy: [{ reportedAt: "asc" }],
  });

  const priorityRank: Record<string, number> = { RED: 0, ORANGE: 1, YELLOW: 2 };
  tickets.sort((a: { priority: string }, b: { priority: string }) => priorityRank[a.priority] - priorityRank[b.priority]);

  return NextResponse.json(tickets);
}

// POST /api/tickets — this is what the cleaner's "Report Issue" button
// submits to. Also reachable from a house menu per spec, and from
// Coordinators reporting a problem directly.
export async function POST(req: NextRequest) {
  const { houseId, area, description, priority, photoUrl, reportedById: claimedReporter } = await req.json();
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
