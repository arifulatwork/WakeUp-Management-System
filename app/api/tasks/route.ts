import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm, actingWorkerId } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { pushAsync, STAFF_ROLES } from "@/lib/push";
import { cachedJson } from "@/lib/serverCache";
import { slimTask } from "@/lib/mediaSlim";

// GET /api/tasks
//   ?workerId=xxx   -> a cleaner's own assigned tasks (mobile app)
//   (no params)     -> every task (Cristina's dashboard)
export async function GET(req: NextRequest) {
  const asked = req.nextUrl.searchParams.get("workerId");
  // A cleaner only ever sees their own jobs, whatever id the URL asks for.
  const workerId = asked ? (await actingWorkerId(req, asked)) ?? null : null;

  // A cleaner may read their own jobs (their own login); the all-jobs list is management only.
  if (!workerId) {
    const g = await requirePerm(req, "data.read");
    if (g.error) return g.error;
  }

  // Built once per change (not once per screen per refresh); photos/videos are sent as short URLs.
  return cachedJson(
    req,
    `tasks:${workerId ?? "all"}`,
    workerId ? ["cleaningTask", "house", "worker", "maintenanceTicket"] : ["cleaningTask", "house", "worker"],
    async () => {
      const tasks = await db.cleaningTask.findMany({
        where: workerId ? { assignedWorkerId: workerId } : undefined,
        include: { house: true, assignedWorker: true },
        orderBy: [{ scheduledDate: "asc" }, { scheduledTime: "asc" }],
      });

      // The cleaner's app also shows the HOUSE's condition: attach each house's open maintenance
      // problems (not closed, not rejected). The key status already comes with the house.
      if (workerId) {
        const open = await db.maintenanceTicket.findMany({
          where: { status: { not: "CLOSED" } },
          orderBy: [{ reportedAt: "asc" }],
          select: { houseId: true, area: true, description: true, priority: true, status: true }, // no photos needed here
        });
        const byHouse = new Map<string, { area: string; description: string; priority: string; status: string }[]>();
        for (const t of open as any[]) {
          if (t.status === "REJECTED") continue;
          const list = byHouse.get(t.houseId) ?? [];
          list.push({ area: t.area, description: t.description, priority: t.priority, status: t.status });
          byHouse.set(t.houseId, list);
        }
        return tasks.map((t: any) => slimTask({ ...t, house: { ...t.house, openIssues: byHouse.get(t.houseId) ?? [] } }));
      }
      return tasks.map(slimTask);
    }
  );
}

// POST /api/tasks — Cristina creates a new cleaning task.
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "tasks.write");
  if (g.error) return g.error;
  const body = await req.json();
  const {
    houseId,
    scheduledDate,
    scheduledTime,
    cleaningTypes,
    assignedWorkerId,
    estimatedMinutes,
    priority,
    nextCheckIn,
    notes,
    materialsNeeded,
    checklist,
  } = body;

  if (!houseId || !scheduledDate || !scheduledTime || !cleaningTypes?.length) {
    return NextResponse.json(
      { error: "houseId, scheduledDate, scheduledTime and cleaningTypes are required" },
      { status: 400 }
    );
  }

  const task = await db.cleaningTask.create({
    data: {
      houseId,
      scheduledDate: new Date(scheduledDate),
      scheduledTime,
      cleaningTypes,
      assignedWorkerId: assignedWorkerId ?? null,
      estimatedMinutes: estimatedMinutes ?? null,
      priority: priority ?? "YELLOW",
      nextCheckIn: nextCheckIn ? new Date(nextCheckIn) : null,
      notes: notes ?? null,
      materialsNeeded: materialsNeeded ?? null,
      status: assignedWorkerId ? "ASSIGNED" : "SCHEDULED",
      checklistData: {
        checklist:
          Array.isArray(checklist) && checklist.length
            ? checklist.filter((i: any) => i && String(i.label).trim()).map((i: any) => ({ label: String(i.label).trim(), done: false }))
            : defaultChecklist(),
        photos: [],
      },
    },
    include: { house: true, assignedWorker: true },
  });

  await logAudit(req, "task", task.id, "create", "Created task for {house} at {time}",
    { house: task.house?.name ?? houseId, time: scheduledTime });
  if (assignedWorkerId) {
    pushAsync({ workerIds: [assignedWorkerId] }, "task_new", { house: task.house?.name ?? "", time: scheduledTime }, `job-${task.id}`);
  }
  return NextResponse.json(task, { status: 201 });
}

// Phase 1 default checklist — editable later via Super Admin's field
// builder without needing a schema change, since it's stored as JSON.
function defaultChecklist() {
  return [
    { label: "Linen & bed sheets changed", done: false },
    { label: "Bathroom & toilet disinfected", done: false },
    { label: "Kitchen & appliances cleaned", done: false },
    { label: "Trash emptied", done: false },
  ];
}
