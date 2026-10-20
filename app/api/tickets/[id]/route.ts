import { NextRequest, NextResponse } from "next/server";
import { slimAny } from "@/lib/mediaSlim";

// Every answer goes through slimAny: photos / videos are returned as short URLs, not megabytes of base64.
const json = (v: any, init?: ResponseInit) => NextResponse.json(slimAny(v), init);
import { db } from "@/lib/db";
import { requirePerm, actingWorkerId, currentSession } from "@/lib/guard";
import { logAudit, changedFields } from "@/lib/audit";
import { pushAsync, STAFF_ROLES } from "@/lib/push";
import { isValidPhoto, isValidVideo, MAX_PHOTOS_PER_TASK, MAX_VIDEOS_PER_TASK } from "@/lib/photoValidation";
import { MEDIA_ENABLED } from "@/lib/features";

// PATCH /api/tickets/:id
//   { action: "accept", workerId }                        -> ACCEPTED, assigned
//   { action: "reject" }                                   -> REJECTED
//   { action: "start" }                                     -> IN_PROGRESS, startedAt now
//   { action: "close", materialsUsed, timeSpentMinutes }    -> TO_BE_VERIFIED (handed in), closedAt now;
//     the coordinators / managers are notified to review it
//   { action: "confirm" }                                   -> office confirms the fix -> CLOSED (reporter notified)
//   { action: "sendBack" }                                  -> office sends it back -> IN_PROGRESS (worker notified)
//     (closed tickets are kept 6 months, then removed — see lib/retention.ts)
//   { action: "addPhoto", photo } / { action: "removePhoto", index }   -> photos while working
//   { action: "addVideo", video } / { action: "removeVideo", index }   -> videos while working
//     (kept in mediaData; refused while NEXT_PUBLIC_MEDIA_ENABLED is not "true")
//   { action: "undoClose" }                                 -> handed in by mistake -> IN_PROGRESS (the worker,
//     only until the office has confirmed it)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  body.workerId = await actingWorkerId(req, body.workerId);
  // Photos switched off (lib/features.ts): closing still works, the photo is just ignored.
  if (!MEDIA_ENABLED) delete body.afterPhotoUrl;

  // accept / reject / start / close = the maintenance team's own app (signed in as themselves).
  // reopen / update / confirm / sendBack = management (the review of finished work).
  if (["reopen", "update", "confirm", "sendBack"].includes(body.action)) {
    const g = await requirePerm(req, "tickets.write");
    if (g.error) return g.error;
  }

  const ticket = await db.maintenanceTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return json({ error: "ticket not found" }, { status: 404 });

  const LABELS: Record<string, string> = {
    accept: "Accepted ticket", reject: "Rejected ticket", start: "Started intervention",
    close: "Closed ticket", reopen: "Reopened ticket", undoClose: "Took back closed ticket",
    confirm: "Confirmed ticket fixed", sendBack: "Sent ticket back to maintenance",
  };
  // Review of finished work. Checked BEFORE the audit entry so refusals aren't logged.
  if ((body.action === "confirm" || body.action === "sendBack") && ticket.status !== "TO_BE_VERIFIED") {
    return json({ error: "ticket is not waiting for review" }, { status: 409 });
  }
  // Handed in by mistake: only the worker who did the job can take it back, and only until
  // the office has confirmed it (after that the office sends it back with "sendBack").
  if (body.action === "undoClose") {
    if (ticket.status !== "TO_BE_VERIFIED") {
      return json({ error: "ticket is not waiting for review" }, { status: 409 });
    }
    const who = await currentSession(req);
    if (who?.role === "worker" && ticket.assignedWorkerId !== who.workerId) {
      return json({ error: "this ticket is not yours" }, { status: 403 });
    }
  }
  // Photos / videos while working: only the assigned worker (or the office), never on a closed ticket.
  const MEDIA_ACTIONS = ["addPhoto", "removePhoto", "addVideo", "removeVideo"];
  if (MEDIA_ACTIONS.includes(body.action)) {
    if (!MEDIA_ENABLED) return json({ error: "photos and videos are switched off" }, { status: 403 });
    const who = await currentSession(req);
    if (who?.role === "worker" && ticket.assignedWorkerId !== who.workerId) {
      return json({ error: "this ticket is not yours" }, { status: 403 });
    }
    if (ticket.status === "CLOSED" || ticket.status === "TO_BE_VERIFIED") {
      return json({ error: "ticket is already handed in" }, { status: 409 });
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
      return json(updated);
    }
    case "reject": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: "REJECTED" },
      });
      return json(updated);
    }
    case "start": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      return json(updated);
    }
    case "close": {
      if (body.afterPhotoUrl && !isValidPhoto(body.afterPhotoUrl)) {
        return json({ error: "invalid or too large photo" }, { status: 400 });
      }
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: {
          status: "TO_BE_VERIFIED",
          closedAt: new Date(),
          materialsUsed: body.materialsUsed ?? null,
          timeSpentMinutes: body.timeSpentMinutes ?? null,
          ...(body.afterPhotoUrl ? { afterPhotoUrl: body.afterPhotoUrl } : {}),
        },
      });
      // Tell the coordinators / managers the work is done and waiting for their check.
      const house = await db.house.findUnique({ where: { id: ticket.houseId } });
      pushAsync({ roles: STAFF_ROLES }, "ticket_review", { house: house?.name ?? "" }, `ticket-review-${params.id}`);
      return json(updated);
    }
    // The office checked the work: the ticket is really closed now. Only now is the reporter told.
    case "confirm": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: "CLOSED", closedAt: ticket.closedAt ?? new Date() },
      });
      if (ticket.reportedById && ticket.reportedById !== body.workerId) {
        const house = await db.house.findUnique({ where: { id: ticket.houseId } });
        pushAsync({ workerIds: [ticket.reportedById] }, "ticket_closed", { house: house?.name ?? "" }, `closed-${params.id}`);
      }
      return json(updated);
    }
    // The fix isn't good enough: back to the same worker (or the open queue if nobody is assigned).
    // Materials, time and photos/videos stay so nothing has to be typed again.
    case "sendBack": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: ticket.assignedWorkerId ? "IN_PROGRESS" : "OPEN", closedAt: null },
      });
      if (ticket.assignedWorkerId) {
        const house = await db.house.findUnique({ where: { id: ticket.houseId } });
        pushAsync({ workerIds: [ticket.assignedWorkerId] }, "ticket_back", { house: house?.name ?? "" }, `ticket-back-${params.id}`);
      }
      return json(updated);
    }
    // Back into the queue (e.g. closed by mistake, or the fix didn't hold).
    case "reopen": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: "OPEN", closedAt: null, assignedWorkerId: null },
      });
      return json(updated);
    }
    case "addPhoto":
    case "removePhoto":
    case "addVideo":
    case "removeVideo": {
      const isPhoto = body.action.endsWith("Photo");
      const key = isPhoto ? "photos" : "videos";
      const data = (ticket.mediaData as any) ?? { photos: [], videos: [] };
      const list: string[] = [...(data[key] ?? [])];
      if (body.action.startsWith("add")) {
        const item = isPhoto ? body.photo : body.video;
        if (!(isPhoto ? isValidPhoto(item) : isValidVideo(item))) {
          return json({ error: `invalid or too large ${isPhoto ? "photo" : "video"}` }, { status: 400 });
        }
        if (list.length >= (isPhoto ? MAX_PHOTOS_PER_TASK : MAX_VIDEOS_PER_TASK)) {
          return json({ error: `too many ${key}` }, { status: 409 });
        }
        list.push(item);
      } else if (typeof body.index === "number" && list[body.index] !== undefined) {
        list.splice(body.index, 1);
      }
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { mediaData: { ...data, [key]: list } },
      });
      return json(updated);
    }
    // Closed by mistake -> back to "In progress" with the same worker, so they can carry on and
    // close it again properly. The closing details (materials, time) and photos/videos are kept, so the time never jumps.
    case "undoClose": {
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data: { status: "IN_PROGRESS", closedAt: null }, // keep materialsUsed + timeSpentMinutes
        include: { house: true, reportedBy: true },
      });
      return json(updated);
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
        if (["CLOSED", "TO_BE_VERIFIED"].includes(f.status) && !ticket.closedAt) data.closedAt = new Date();
        if (!["CLOSED", "TO_BE_VERIFIED"].includes(f.status)) data.closedAt = null;
      }
      const updated = await db.maintenanceTicket.update({
        where: { id: params.id },
        data,
        include: { house: true, reportedBy: true, assignedWorker: true },
      });
      await logAudit(req, "ticket", params.id, "update",
        f.status ? "Edited ticket ({fields}) · status {from} → {to}" : "Edited ticket ({fields})",
        { fields: changedFields(f), ...(f.status ? { from: ticket.status, to: f.status } : {}) });
      return json(updated);
    }
    default:
      return json({ error: "unknown action" }, { status: 400 });
  }
}

// DELETE /api/tickets/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "tickets.delete");
  if (g.error) return g.error;
  try {
    await db.maintenanceTicket.delete({ where: { id: params.id } });
    await logAudit(req, "ticket", params.id, "delete", "Deleted ticket");
    return json({ ok: true });
  } catch {
    return json({ error: "ticket not found" }, { status: 404 });
  }
}
