// CHECK-IN READINESS — an automatic CHECK that helps the coordinator decide.
// It never approves anything by itself: a person still taps "Confirm ready".
//
// A job passes when: the whole checklist is ticked, there is at least one photo,
// the house has no open maintenance problem, and its key is not missing.

import { MEDIA_ENABLED } from "@/lib/features";

export type ReadinessReason = "checklist" | "photos" | "issues" | "key";

type TaskLike = { checklistData?: { checklist?: { done: boolean }[]; photos?: string[] } | null };
type HouseLike = { keyStatus?: string };

export function checkReadiness(task: TaskLike, house: HouseLike | undefined, openTicketsInHouse: number) {
  const reasons: ReadinessReason[] = [];
  const list = task.checklistData?.checklist ?? [];
  if (list.length > 0 && !list.every((i) => i.done)) reasons.push("checklist");
  // Only ask for a photo when photos are switched on (lib/features.ts).
  if (MEDIA_ENABLED && (task.checklistData?.photos ?? []).length === 0) reasons.push("photos");
  if (openTicketsInHouse > 0) reasons.push("issues");
  if (house?.keyStatus === "MISSING") reasons.push("key");
  return { ok: reasons.length === 0, reasons };
}

export const REASON_TEXT: Record<ReadinessReason, string> = {
  checklist: "Checklist not fully ticked",
  photos: "No photo added",
  issues: "Open maintenance problem",
  key: "Key is missing",
};
