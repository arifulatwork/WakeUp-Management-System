import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm, actingWorkerId, currentSession } from "@/lib/guard";
import { logAudit, changedFields } from "@/lib/audit";
import { pushAsync, STAFF_ROLES } from "@/lib/push";
import { isValidPhoto } from "@/lib/photoValidation";
import { MEDIA_ENABLED } from "@/lib/features";

// PATCH /api/tickets/:id
//   { action: "accept", workerId }                        -> ACCEPTED, assigned
//   { action: "reject" }                                   -> REJECTED
//   { action: "start" }                                     -> IN_PROGRESS, startedAt now
//   { action: "close", materialsUsed, timeSpentMinutes }    -> CLOSED, closedAt now
//     (closed tickets are kept 6 months, then removed — see lib/retention.ts)
//   { action: "undoClose" }                                 -> CLOSED taken back -> IN_PROGRESS (the worker who
//     closed it, or an office role)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  body.workerId = await actingWorkerId(req, body.workerId);
  // Photos switched off (lib/features.ts): closing still works, the photo is just ignored.
  if (!MEDIA_ENABLED) delete body.afterPhotoUrl;

  // accept / reject / start / close = the maintenance team's own app (signed in as themselves).
  // reopen / update = management.
  if (body.action === "reopen" || body.action === "update") {
    const g = await requirePerm(req, "tickets.write");
    if (g.error) return g.error;
  }

  const ticket = await db.maintenanceTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return NextResponse.json({ error: "ticket not found" }, { status: 404 });

  const LABELS: Record<string, string> = {
    accept: "Accepted ticket", reject: "Rejected ticket", start: "Started intervention",
    close: "Closed ticket", reopen: "Reopened ticket", undoClose: "Took back closed ticket",
  };
  // Closed by mistake: only the worker who did the job (or the office) can take it back,
  // and only while it is still closed. Checked BEFORE the audit entry so refusals aren't logged.
  if (body.action === "undoClose") {
    if (ticket.status !== "CLOSED") {
      return NextResponse.json({ error: "ticket is not closed" }, { status: 409 });
    }
    const who = await currentSession(req);
    if (who?.role === "worker" && ticket.assignedWorkerId !== who.workerId) {
      return NextResponse.json({ error: "this ticket is not yours" }, { status: 403 });
    }
  }
  const badPhoto = body.action === "close" && body.afterPhotoUrl && !isValidPhoto(body.afterPhotoUrl);
  if (LABELS[body.action] && !badPhoto) {
    await logAudit(req, "ticket", params.id, body.action, LABELS[body.action], {}, body.workerId ?? ticket.assignedWorkerId);
  }

  switch (body.action) {
    case "accept": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: "ACCEPTED", assignedWorkerId: body.workerId ?? null },
      });
      return NextResponse.json(updated);
    }
    case "reject": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: "REJECTED" },
      });
      return NextResponse.json(updated);
    }
    case "start": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      return NextResponse.json(updated);
    }
    case "close": {
      if (body.afterPhotoUrl && !isValidPhoto(body.afterPhotoUrl)) {
        return NextResponse.json({ error: "invalid or too large photo" }, { status: 400 });
      }
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          materialsUsed: body.materialsUsed ?? null,
          timeSpentMinutes: body.timeSpentMinutes ?? null,
          ...(body.afterPhotoUrl ? { afterPhotoUrl: body.afterPhotoUrl } : {}),
        },
      });
      // Tell whoever reported it that it is fixed.
      if (ticket.reportedById && ticket.reportedById !== body.workerId) {
        const house = await db.house.findUnique({ where: { id: ticket.houseId } });
        pushAsync({ workerIds: [ticket.reportedById] }, "ticket_closed", { house: house?.name ?? "" }, `closed-${params.id}`);
      }
      return NextResponse.json(updated);
    }
    // Back into the queue (e.g. closed by mistake, or the fix didn't hold).
    case "reopen": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: "OPEN", closedAt: null, assignedWorkerId: null },
      });
      return NextResponse.json(updated);
    }
    // Closed by mistake -> back to "In progress" with the same worker, so they can carry on and
    // close it again properly. The closing details (materials, time, after-photo) are cleared.
    case "undoClose": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: "IN_PROGRESS", closedAt: null, materialsUsed: null, timeSpentMinutes: null, afterPhotoUrl: null },
        include: { house: true, reportedBy: true },
      });
      return NextResponse.json(updated);
    }
    // Full edit from Manager / Coordinator / Admin.
    // Body: { action: "update", fields: { houseId, area, description, priority,
    //   status, assignedWorkerId, materialsUsed, timeSpentMinutes } }
    case "update": {
      const f = body.fields ?? {};
      const data: Record<string, unknown> = {};
      if (f.houseId) data.houseId = f.houseId;
      if (f.area) data.area = f.area;
      if (f.description) data.description = f.description;
      if (f.priority) data.priority = f.priority;
      if ("assignedWorkerId" in f) data.assignedWorkerId = f.assignedWorkerId || null;
      if ("materialsUsed" in f) data.materialsUsed = f.materialsUsed || null;
      if ("timeSpentMinutes" in f) data.timeSpentMinutes = f.timeSpentMinutes ? Number(f.timeSpentMinutes) : null;
      if (f.status) {
        data.status = f.status;
        if (f.status === "IN_PROGRESS" && !ticket.startedAt) data.startedAt = new Date();
        if (f.status === "CLOSED" && !ticket.closedAt) data.closedAt = new Date();
        if (f.status !== "CLOSED") data.closedAt = null;
      }
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data,
        include: { house: true, reportedBy: true, assignedWorker: true },
      });
      await logAudit(req, "ticket", params.id, "update",
        f.status ? "Edited ticket ({fields}) · status {from} → {to}" : "Edited ticket ({fields})",
        { fields: changedFields(f), ...(f.status ? { from: ticket.status, to: f.status } : {}) });
      return NextResponse.json(updated);
    }
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}

// DELETE /api/tickets/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "tickets.delete");
  if (g.error) return g.error;
  try {
    await db.maintenanceTicket.delete({ where: { id: params.id } });
    await logAudit(req, "ticket", params.id, "delete", "Deleted ticket");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }
}
