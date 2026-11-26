import { db } from "@/lib/db";
import { pushAsync } from "@/lib/push";

// Phone notifications for the ordering flow. Never blocks or fails the action that caused them.

// An order was sent -> every supplier.
export function notifyOrderSent(order: { id: string }, groupName: string) {
  pushAsync({ roles: ["supplier"] }, "order_new", { group: groupName }, `order-${order.id}`);
}

// The supplier dispatched an order -> the students of that group and the group's coordinator.
export async function notifyOrderDispatched(order: { id: string; groupId: string }, groupName: string) {
  try {
    const [students, group] = await Promise.all([
      db.worker.findMany({ where: { groupId: order.groupId, role: "student" }, select: { id: true } }),
      db.group.findUnique({ where: { id: order.groupId }, select: { coordinatorId: true } }),
    ]);
    const ids = [...students.map((s: any) => s.id), ...(group?.coordinatorId ? [group.coordinatorId] : [])];
    if (ids.length) pushAsync({ workerIds: ids }, "order_dispatched", { group: groupName }, `order-${order.id}`);
  } catch (e) {
    console.error("[push] order dispatched", e);
  }
}
