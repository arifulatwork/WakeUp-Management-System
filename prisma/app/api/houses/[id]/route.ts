import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { pushAsync, STAFF_ROLES } from "@/lib/push";
import { normMode, nameKey, isUniqueViolation, MAX_CHECKIN_TEXT } from "@/lib/houseMode";
import { parseMedia, writeMedia } from "@/lib/houseMedia";

const KEY_STATES = ["AT_OFFICE", "WITH_CLEANER", "WITH_GUEST", "MISSING"];
const toDate = (v: unknown): Date | null | undefined => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? undefined : d;
};

// GET /api/houses/:id
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const house = await db.house.findUnique({ where: { id: params.id } });
  if (!house) return NextResponse.json({ error: "house not found" }, { status: 404 });
  return NextResponse.json(house);
}

// PATCH /api/houses/:id
// Changing ONLY the key status needs "houses.key" (coordinator and up);
// changing anything else (name, address, mode, dates, media…) needs "houses.edit" (manager and up).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const keyOnly = Object.keys(body).every((k) => k === "keyStatus");
  const g = await requirePerm(req, keyOnly ? "houses.key" : "houses.edit");
  if (g.error) return g.error;

  const house = await db.house.findUnique({ where: { id: params.id } });
  if (!house) return NextResponse.json({ error: "house not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    data.name = name;
    data.nameKey = nameKey(name);
  }
  if (body.address !== undefined) data.address = String(body.address).trim();
  if (body.mode !== undefined) data.mode = normMode(body.mode);
  if (body.checkInText !== undefined) data.checkInText = body.checkInText ? String(body.checkInText).slice(0, MAX_CHECKIN_TEXT) : null;
  if (body.keyStatus !== undefined) {
    if (!KEY_STATES.includes(body.keyStatus)) return NextResponse.json({ error: "invalid key status" }, { status: 400 });
    if (body.keyStatus !== house.keyStatus) { data.keyStatus = body.keyStatus; data.keyUpdatedAt = new Date(); }
  }
  if ("validFrom" in body) {
    const d = toDate(body.validFrom);
    if (d === undefined) return NextResponse.json({ error: "invalid date" }, { status: 400 });
    data.validFrom = d;
  }
  if ("validUntil" in body) {
    const d = toDate(body.validUntil);
    if (d === undefined) return NextResponse.json({ error: "invalid date" }, { status: 400 });
    data.validUntil = d;
  }
  const media = parseMedia(body);
  if (media.error) return NextResponse.json({ error: media.error }, { status: 400 });

  try {
    if (media.change) Object.assign(data, await writeMedia(params.id, media.change));
    const updated = Object.keys(data).length
      ? await db.house.update({ where: { id: params.id }, data })
      : house;

    const fields = Object.keys(body).filter((k) => k !== "photo" && k !== "video").join(",") || "—";
    if (data.keyStatus) {
      await logAudit(req, "house", params.id, "key", "Key of {name}: {from} → {to}",
        { name: updated.name, from: house.keyStatus, to: String(data.keyStatus) });
      if (data.keyStatus === "MISSING") pushAsync({ roles: STAFF_ROLES, excludeWorkerId: g.session.workerId }, "key_missing", { house: updated.name }, `key-${params.id}`);
    }
    if (Object.keys(data).some((k) => k !== "keyStatus" && k !== "keyUpdatedAt")) {
      await logAudit(req, "house", params.id, "update", "Edited house {name} ({fields})", { name: updated.name, fields });
    }
    return NextResponse.json(updated);
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: "house already exists" }, { status: 409 });
    throw e;
  }
}

// DELETE /api/houses/:id — Super Admin only. Refused while the house still has jobs / issues /
// material requests on record (they must keep pointing at a real house).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "houses.delete");
  if (g.error) return g.error;
  const house = await db.house.findUnique({ where: { id: params.id } });
  if (!house) return NextResponse.json({ error: "house not found" }, { status: 404 });
  const history =
    (await db.cleaningTask.count({ where: { houseId: params.id } })) +
    (await db.maintenanceTicket.count({ where: { houseId: params.id } })) +
    (await db.materialRequest.count({ where: { houseId: params.id } }));
  if (history > 0) return NextResponse.json({ error: "has history" }, { status: 409 });
  await db.houseRoomPhoto.deleteMany({ where: { houseId: params.id } });
  await db.houseMedia.deleteMany({ where: { houseId: params.id } });
  await db.house.delete({ where: { id: params.id } });
  await logAudit(req, "house", params.id, "delete", "Deleted house {name}", { name: house.name });
  return NextResponse.json({ ok: true });
}
