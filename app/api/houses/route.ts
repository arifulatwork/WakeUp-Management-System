import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { parseMedia, writeMedia } from "@/lib/houseMedia";
import { cachedJson } from "@/lib/serverCache";
import { findDuplicate, normMode, nameKey, isUniqueViolation, MAX_CHECKIN_TEXT } from "@/lib/houseMode";

// GET /api/houses — house list (cleaner's "My Houses" screen,
// Cristina's task-assignment dropdown).
// These GETs never read the request, so a production build could freeze them; always read live data.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return cachedJson(req, "houses", ["house"], () => db.house.findMany({ orderBy: { name: "asc" } }));
}

// POST /api/houses — admin adds a house. validFrom/validUntil are
// optional and used for temporary Airbnb/Booking listings.
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "houses.create");
  if (g.error) return g.error;
  const body = await req.json();
  const { validFrom, validUntil, keyStatus } = body;
  const name = String(body.name ?? "").trim();
  const address = String(body.address ?? "").trim();
  const mode = normMode(body.mode);
  const checkInText = body.checkInText ? String(body.checkInText).slice(0, MAX_CHECKIN_TEXT) : null;

  if (!name || !address) {
    return NextResponse.json(
      { error: "name and address are required" },
      { status: 400 }
    );
  }

  // The same name is allowed once per mode (School + Tourism), never twice in the same mode.
  // This check gives the friendly answer; the UNIQUE (nameKey, mode) index in the database is the
  // real guard when two people save at the same moment (see the catch below).
  const dup = findDuplicate(await db.house.findMany({}), name, mode);
  if (dup) {
    return NextResponse.json(
      { error: "duplicate house", code: "DUPLICATE_HOUSE", existingId: dup.id, mode },
      { status: 409 }
    );
  }

  const media = parseMedia(body);
  if (media.error) return NextResponse.json({ error: media.error }, { status: 400 });

  let house;
  try {
    house = await db.house.create({
      data: {
        name,
        nameKey: nameKey(name),
        address,
        mode,
        checkInText,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        ...(keyStatus ? { keyStatus } : {}),
      },
    });
  } catch (e) {
    // Someone else saved the same name + mode a moment ago.
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "duplicate house", code: "DUPLICATE_HOUSE", mode }, { status: 409 });
    }
    throw e;
  }

  if (media.change) {
    const flags = await writeMedia(house.id, media.change);
    house = await db.house.update({ where: { id: house.id }, data: flags });
  }

  await logAudit(req, "house", house.id, "create", "Added house {name}", { name: house.name });
  return NextResponse.json(house, { status: 201 });
}
