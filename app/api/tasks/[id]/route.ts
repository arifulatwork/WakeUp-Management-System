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
import type { Perm } from "@/lib/permissions";

// PATCH /api/tasks/:id — the one endpoint the cleaner app calls repeatedly:
//   { action: "start" }                       -> status IN_PROGRESS, startedAt now
//   { action: "toggleCheck", index: 2 }        -> flips a checklist item
//   { action: "complete", workerId }           -> status COMPLETED/TO_BE_VERIFIED
//   { action: "approve" }                      -> Cristina approves -> APPROVED
//   { action: "unapprove" }                    -> APPROVED taken back -> TO_BE_VERIFIED
//   { action: "markIssue" }                    -> status WITH_ISSUE
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  body.workerId = await actingWorkerId(req, body.workerId);

  // Field actions (start / toggleCheck / complete / markIssue / undoReady) are open to the
  // cleaner's own login. Everything that manages jobs needs a signed-in role.
  const NEED: Record<string, Perm> = { approve: "tasks.review", unapprove: "tasks.review", reopen: "tasks.review", update: "tasks.write" };
  if (NEED[body.action]) {
    const g = await requirePerm(req, NEED[body.action]);
    if (g.error) return g.error;
  }

  const task = await db.cleaningTask.findUnique({ where: { id: params.id } });
  if (!task) {
    return json({ error: "task not found" }, { status: 404 });
  }

  // A cleaner / maintenance worker may only touch a job that is assigned to THEM.
  // (Office roles keep full access, including "open the app as this worker".)
  const FIELD_ACTIONS = ["start", "toggleCheck", "setCheck", "complete", "markIssue", "undoReady", "addPhoto", "removePhoto", "addVideo", "removeVideo"];
  if (FIELD_ACTIONS.includes(body.action)) {
    const who = await currentSession(req);
    if (who?.role === "worker" && task.assignedWorkerId !== who.workerId) {
      return json({ error: "this job is not assigned to you" }, { status: 403 });
    }
  }

  // Audit the actions that matter (checklist ticks and photos are too noisy to log).
  const AUDITED: Record<string, string> = {
    start: "Started cleaning", complete: "Marked ready for check-in", undoReady: "Took back ready for check-in",
    approve: "Confirmed ready for check-in", unapprove: "Took back approval", reopen: "Sent back to the cleaner", markIssue: "Flagged with issue",
  };
  const audit = (template: string, p: Record<string, string | number> = {}) =>
    logAudit(req, "task", params.id, body.action, template, p, body.workerId ?? task.assignedWorkerId);
  const houseName = async () => (await db.house.findUnique({ where: { id: task.houseId } }))?.name ?? "";
  const refused =
    (body.action === "undoReady" && !["TO_BE_VERIFIED", "COMPLETED"].includes(task.status)) ||
    (body.action === "unapprove" && task.status !== "APPROVED") ||
    (body.action === "complete" && task.status === "APPROVED");
  if (AUDITED[body.action] && !refused) await audit(AUDITED[body.action]);

  // A job has to be started before it can be ticked off or marked ready.
  const NOT_STARTED = ["ASSIGNED", "SCHEDULED"];
  if ((body.action === "complete" || body.action === "toggleCheck" || body.action === "setCheck") && NOT_STARTED.includes(task.status)) {
    return json({ error: "start the job first" }, { status: 409 });
  }

  switch (body.action) {
    case "start": {
      // Starting again must not reopen a job that is already finished or waiting for review.
      if (!NOT_STARTED.includes(task.status) && task.status !== "ON_HOLD") {
        return json(task);
      }
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      return json(updated);
    }

    case "toggleCheck": {
      const data = (task.checklistData as any) ?? { checklist: [], photos: [] };
      const checklist = [...(data.checklist ?? [])];
      if (typeof body.index === "number" && checklist[body.index]) {
        checklist[body.index] = {
          ...checklist[body.index],
          done: !checklist[body.index].done,
        };
      }
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { checklistData: { ...data, checklist } },
      });
      return json(updated);
    }

    // Sets one checklist item to an exact value (safe to repeat; unlike toggleCheck it can't flip back).
    case "setCheck": {
      const data = (task.checklistData as any) ?? { checklist: [], photos: [] };
      const checklist = [...(data.checklist ?? [])];
      if (typeof body.index === "number" && checklist[body.index] && typeof body.done === "boolean") {
        checklist[body.index] = { ...checklist[body.index], done: body.done };
      }
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { checklistData: { ...data, checklist } },
      });
      return json(updated);
    }

    // Before/after photos from the cleaner's phone (and removal, by them or a reviewer).
    case "addPhoto": {
      if (!MEDIA_ENABLED) return json({ error: "photos are switched off" }, { status: 403 });
      if (!isValidPhoto(body.photo)) {
        return json({ error: "invalid or too large photo" }, { status: 400 });
      }
      const data = (task.checklistData as any) ?? { checklist: [], photos: [] };
      const photos: string[] = [...(data.photos ?? [])];
      if (photos.length >= MAX_PHOTOS_PER_TASK) {
        return json({ error: "too many photos" }, { status: 409 });
      }
      photos.push(body.photo);
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { checklistData: { ...data, photos } },
      });
      return json(updated);
    }

    case "removePhoto": {
      if (!MEDIA_ENABLED) return json({ error: "photos are switched off" }, { status: 403 });
      const data = (task.checklistData as any) ?? { checklist: [], photos: [] };
      const photos: string[] = [...(data.photos ?? [])];
      if (typeof body.index === "number" && photos[body.index] !== undefined) photos.splice(body.index, 1);
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { checklistData: { ...data, photos } },
      });
      return json(updated);
    }

    // Before/after videos from the cleaner's phone. Same rules as photos; stored next to them in checklistData.videos.
    case "addVideo": {
      if (!MEDIA_ENABLED) return json({ error: "videos are switched off" }, { status: 403 });
      if (!isValidVideo(body.video)) {
        return json({ error: "invalid or too large video" }, { status: 400 });
      }
      const data = (task.checklistData as any) ?? { checklist: [], photos: [] };
      const videos: string[] = [...(data.videos ?? [])];
      if (videos.length >= MAX_VIDEOS_PER_TASK) {
        return json({ error: "too many videos" }, { status: 409 });
      }
      videos.push(body.video);
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { checklistData: { ...data, videos } },
      });
      return json(updated);
    }

    case "removeVideo": {
      if (!MEDIA_ENABLED) return json({ error: "videos are switched off" }, { status: 403 });
      const data = (task.checklistData as any) ?? { checklist: [], photos: [] };
      const videos: string[] = [...(data.videos ?? [])];
      if (typeof body.index === "number" && videos[body.index] !== undefined) videos.splice(body.index, 1);
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { checklistData: { ...data, videos } },
      });
      return json(updated);
    }

    case "complete": {
      // A stale screen or a replayed offline tap must never undo an approval.
      if (task.status === "APPROVED") return json(task);
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: {
          status: "TO_BE_VERIFIED",
          completedAt: new Date(),
          completedByWorkerId: body.workerId ?? null,
        },
      });
      // Tell the coordinators / managers a house is waiting for them.
      pushAsync({ roles: STAFF_ROLES }, "task_review", { house: await houseName() }, `review-${params.id}`);
      return json(updated);
    }

    case "approve": {
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { status: "APPROVED" },
      });
      return json(updated);
    }

    // Approved by mistake (or changed your mind)? Back to "To be verified" so it can be reviewed
    // again, approved properly or sent back to the cleaner. Only for office roles (tasks.review).
    case "unapprove": {
      if (task.status !== "APPROVED") {
        return json({ error: "task is not approved" }, { status: 409 });
      }
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { status: "TO_BE_VERIFIED" },
      });
      return json(updated);
    }

    case "markIssue": {
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { status: "WITH_ISSUE" },
      });
      return json(updated);
    }

    // The cleaner took back "ready for check-in" before anyone verified it.
    case "undoReady": {
      if (!["TO_BE_VERIFIED", "COMPLETED"].includes(task.status)) {
        return json({ error: "task is not waiting for verification" }, { status: 409 });
      }
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: { status: "IN_PROGRESS", completedAt: null, completedByWorkerId: null },
      });
      return json(updated);
    }

    // Manager/coordinator rejects a finished job -> back to the cleaner.
    case "reopen": {
      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data: {
          status: task.startedAt ? "IN_PROGRESS" : "ASSIGNED",
          completedAt: null,
          completedByWorkerId: null,
        },
      });
      if (task.assignedWorkerId) {
        pushAsync({ workerIds: [task.assignedWorkerId] }, "task_back", { house: await houseName() }, `back-${params.id}`);
      }
      return json(updated);
    }

    // Full edit from the Manager / Coordinator / Admin screens.
    // Body: { action: "update", fields: { houseId, scheduledDate, scheduledTime,
    //   cleaningTypes, assignedWorkerId, estimatedMinutes, priority, notes,
    //   materialsNeeded, status, checklist: [{label, done}] } }
    case "update": {
      const f = body.fields ?? {};
      const data: Record<string, unknown> = {};
      if (f.houseId) data.houseId = f.houseId;
      if (f.scheduledDate) data.scheduledDate = new Date(f.scheduledDate);
      if (f.scheduledTime) data.scheduledTime = f.scheduledTime;
      if (Array.isArray(f.cleaningTypes) && f.cleaningTypes.length) data.cleaningTypes = f.cleaningTypes;
      if ("assignedWorkerId" in f) data.assignedWorkerId = f.assignedWorkerId || null;
      if ("estimatedMinutes" in f) data.estimatedMinutes = f.estimatedMinutes ? Number(f.estimatedMinutes) : null;
      if (f.priority) data.priority = f.priority;
      if ("notes" in f) data.notes = f.notes || null;
      if ("materialsNeeded" in f) data.materialsNeeded = f.materialsNeeded || null;
      if ("nextCheckIn" in f) data.nextCheckIn = f.nextCheckIn ? new Date(f.nextCheckIn) : null;

      if (f.status) {
        data.status = f.status;
      } else if ("assignedWorkerId" in data) {
        // Keep SCHEDULED <-> ASSIGNED in step with whether someone is assigned.
        if (!task.assignedWorkerId && data.assignedWorkerId && task.status === "SCHEDULED") data.status = "ASSIGNED";
        if (task.assignedWorkerId && !data.assignedWorkerId && task.status === "ASSIGNED") data.status = "SCHEDULED";
      }
      if (data.status === "IN_PROGRESS" && !task.startedAt) data.startedAt = new Date();
      if (["TO_BE_VERIFIED", "COMPLETED", "APPROVED"].includes(data.status as string) && !task.completedAt) {
        data.completedAt = new Date();
      }

      if (Array.isArray(f.checklist)) {
        const prev = (task.checklistData as any) ?? {};
        data.checklistData = {
          ...prev,
          photos: prev.photos ?? [],
          checklist: f.checklist
            .filter((i: any) => i && String(i.label).trim())
            .map((i: any) => ({ label: String(i.label).trim(), done: !!i.done })),
        };
      }

      const updated = await db.cleaningTask.update({
        where: { id: params.id },
        data,
        include: { house: true, assignedWorker: true },
      });
      await audit(
        f.status ? "Edited task ({fields}) · status {from} → {to}" : "Edited task ({fields})",
        { fields: changedFields(f), ...(f.status ? { from: task.status, to: f.status } : {}) }
      );
      // Newly assigned to somebody? Tell them.
      const newWorker = data.assignedWorkerId as string | undefined;
      if (newWorker && newWorker !== task.assignedWorkerId) {
        pushAsync({ workerIds: [newWorker] }, "task_new",
          { house: updated.house?.name ?? "", time: updated.scheduledTime ?? task.scheduledTime }, `job-${params.id}`);
      }
      return json(updated);
    }

    default:
      return json({ error: "unknown action" }, { status: 400 });
  }
}

// DELETE /api/tasks/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "tasks.delete");
  if (g.error) return g.error;
  try {
    await db.cleaningTask.delete({ where: { id: params.id } });
    await logAudit(req, "task", params.id, "delete", "Deleted task");
    return json({ ok: true });
  } catch {
    return json({ error: "task not found" }, { status: 404 });
  }
}
