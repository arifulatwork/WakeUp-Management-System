import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { parseMedia, writeMedia } from "@/lib/houseMedia";
import { pushAsync, STAFF_ROLES } from "@/lib/push";

const KEY_STATES = ["AT_OFFICE", "WITH_CLEANER", "WITH_GUEST", "MISSING"];

// PATCH /api/houses/:id — any of { name, address, keyStatus, validFrom, validUntil }.
// validFrom/validUntil = null (or "") makes it a permanent house again.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  // Changing only the key status is open to coordinators; anything else (name,
  // address, listing dates) is management.
  const keyOnly = Object.keys(body).every((k) => k === "keyStatus");
  const g = await requirePerm(req, keyOnly ? "houses.key" : "houses.edit");
  if (g.error) return g.error;

  const data: Record<string, unknown> = {};

  if ("keyStatus" in body) {
    if (!KEY_STATES.includes(body.keyStatus)) {
      return NextResponse.json({ error: "invalid keyStatus" }, { status: 400 });
    }
    data.keyStatus = body.keyStatus;
    data.keyUpdatedAt = new Date();
  }
  if (body.name !== undefined) {
    if (!String(body.name).trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    data.name = String(body.name).trim();
  }
  if (body.address !== undefined) {
    if (!String(body.address).trim()) return NextResponse.json({ error: "address required" }, { status: 400 });
    data.address = String(body.address).trim();
  }
  if ("validFrom" in body) data.validFrom = body.validFrom ? new Date(body.validFrom) : null;
  if ("validUntil" in body) data.validUntil = body.validUntil ? new Date(body.validUntil) : null;

  const media = parseMedia(body);
  if (media.error) return NextResponse.json({ error: media.error }, { status: 400 });

  try {
    const before = await db.house.findUnique({ where: { id: params.id } });
    if (!before) return NextResponse.json({ error: "house not found" }, { status: 404 });
    if (media.change) Object.assign(data, await writeMedia(params.id, media.change));
    const house = await db.house.update({ where: { id: params.id }, data });
    if (keyOnly) {
      await logAudit(req, "house", params.id, "key", "Key status of {name} → {state}", { name: house.name, state: String(body.keyStatus) });
    } else {
      await logAudit(req, "house", params.id, "update", "Edited house {name} ({fields})", { name: house.name, fields: Object.keys(body).join(",") });
    }
    // A key that has just gone missing is urgent news for the office.
    if (data.keyStatus === "MISSING" && before?.keyStatus !== "MISSING") {
      pushAsync({ roles: STAFF_ROLES }, "key_missing", { house: house.name }, `key-${params.id}`);
    }
    return NextResponse.json(house);
  } catch {
    return NextResponse.json({ error: "house not found" }, { status: 404 });
  }
}

// DELETE /api/houses/:id — removes the house and everything attached to it
// (tasks, tickets, material requests) so nothing is left pointing at it.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePerm(req, "houses.delete");
  if (g.error) return g.error;
  try {
    const doomed = await db.house.findUnique({ where: { id: params.id } });
    await db.cleaningTask.deleteMany({ where: { houseId: params.id } });
    await db.maintenanceTicket.deleteMany({ where: { houseId: params.id } });
    await db.materialRequest.deleteMany({ where: { houseId: params.id } });
    await db.houseMedia.deleteMany({ where: { houseId: params.id } });
    await db.house.delete({ where: { id: params.id } });
    await logAudit(req, "house", params.id, "delete", "Deleted house {name} and its tasks, tickets and requests", { name: doomed?.name ?? params.id });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "house not found" }, { status: 404 });
  }
}
