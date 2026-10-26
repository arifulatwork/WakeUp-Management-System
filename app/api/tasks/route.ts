import { NextRequest, NextResponse } from "next/server";
import { slimAny } from "@/lib/mediaSlim";
import { db } from "@/lib/db";
import { requirePerm, currentSession } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { pushAsync } from "@/lib/push";

const json = (v: any, init?: ResponseInit) => NextResponse.json(slimAny(v), init);
const PRIORITIES = ["YELLOW", "ORANGE", "RED"];

// GET /api/tasks[?workerId=…]
//   a cleaner gets only THEIR jobs (the id is taken from the login, whatever the browser sends);
//   office roles get every job, or one person's jobs with ?workerId=.
export async function GET(req: NextRequest) {
  const me = await currentSession(req);
  if (!me) return json({ error: "sign in required" }, { status: 401 });
  const asked = req.nextUrl.searchParams.get("workerId");
  let where: Record<string, unknown> | undefined;
  if (me.role === "worker") where = { assignedWorkerId: me.workerId };
  else if (!can(me.role, "data.read")) return json({ error: "forbidden" }, { status: 403 });
  else if (asked) where = { assignedWorkerId: asked };

  const tasks = await db.cleaningTask.findMany({
    where,
    include: { house: true, assignedWorker: true },
    orderBy: [{ scheduledDate: "asc" }, { scheduledTime: "asc" }],
  });
  return json(tasks);
}

// POST /api/tasks — create a cleaning job.
// Body: { houseId, scheduledDate, scheduledTime, cleaningTypes[], assignedWorkerId?, estimatedMinutes?,
//         priority?, notes?, nextCheckIn?, materialsNeeded?, checklist?: [{label, done}] }
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "tasks.write");
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));

  if (!b.houseId) return json({ error: "house required" }, { status: 400 });
  const house = await db.house.findUnique({ where: { id: b.houseId } });
  if (!house) return json({ error: "house not found" }, { status: 404 });
  const scheduledDate = new Date(b.scheduledDate);
  if (!b.scheduledDate || isNaN(scheduledDate.getTime())) return json({ error: "invalid date" }, { status: 400 });
  const scheduledTime = String(b.scheduledTime ?? "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(scheduledTime)) return json({ error: "invalid time" }, { status: 400 });
  const priority = b.priority ?? "YELLOW";
  if (!PRIORITIES.includes(priority)) return json({ error: "invalid priority" }, { status: 400 });
  const nextCheckIn = b.nextCheckIn ? new Date(b.nextCheckIn) : null;
  if (nextCheckIn && isNaN(nextCheckIn.getTime())) return json({ error: "invalid date" }, { status: 400 });

  const assignedWorkerId: string | null = b.assignedWorkerId || null;
  if (assignedWorkerId && !(await db.worker.findUnique({ where: { id: assignedWorkerId } }))) {
    return json({ error: "worker not found" }, { status: 404 });
  }
  const checklist = (Array.isArray(b.checklist) ? b.checklist : [])
    .filter((i: any) => i && String(i.label ?? "").trim())
    .map((i: any) => ({ label: String(i.label).trim(), done: false }));

  const task = await db.cleaningTask.create({
    data: {
      houseId: b.houseId,
      scheduledDate,
      scheduledTime,
      cleaningTypes: Array.isArray(b.cleaningTypes) && b.cleaningTypes.length ? b.cleaningTypes.map(String) : ["GENERAL"],
      assignedWorkerId,
      estimatedMinutes: b.estimatedMinutes ? Number(b.estimatedMinutes) : null,
      priority,
      nextCheckIn,
      notes: b.notes ? String(b.notes).trim() || null : null,
      materialsNeeded: b.materialsNeeded ? String(b.materialsNeeded).trim() || null : null,
      status: assignedWorkerId ? "ASSIGNED" : "SCHEDULED",
      checklistData: { checklist, photos: [] },
    },
    include: { house: true, assignedWorker: true },
  });
  await logAudit(req, "task", task.id, "create", "Created cleaning job at {house}", { house: house.name });
  if (assignedWorkerId) {
    pushAsync({ workerIds: [assignedWorkerId], excludeWorkerId: g.session.workerId }, "task_new",
      { house: house.name, time: scheduledTime }, `job-${task.id}`);
  }
  return json(task, { status: 201 });
}
