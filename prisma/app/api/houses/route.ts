import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { normMode, nameKey, isUniqueViolation, MAX_CHECKIN_TEXT } from "@/lib/houseMode";
import { parseMedia, writeMedia } from "@/lib/houseMedia";

const KEY_STATES = ["AT_OFFICE", "WITH_CLEANER", "WITH_GUEST", "MISSING"];

// Date from the form, or null. Returns undefined when the value is not a valid date.
const toDate = (v: unknown): Date | null | undefined => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? undefined : d;
};

// GET /api/houses — every house (the big photo/video files are NOT included, only the flags).
export async function GET() {
  const houses = await db.house.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(houses);
}

// POST /api/houses — add a house / temporary listing.
// Body: { name, address, mode, checkInText, keyStatus, validFrom, validUntil, photo?, video? }
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "houses.create");
  if (g.error) return g.error;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const keyStatus = body.keyStatus ?? "AT_OFFICE";
  if (!KEY_STATES.includes(keyStatus)) return NextResponse.json({ error: "invalid key status" }, { status: 400 });
  const validFrom = toDate(body.validFrom);
  const validUntil = toDate(body.validUntil);
  if (validFrom === undefined || validUntil === undefined) return NextResponse.json({ error: "invalid date" }, { status: 400 });
  const checkInText = body.checkInText ? String(body.checkInText).slice(0, MAX_CHECKIN_TEXT) : null;
  const media = parseMedia(body);
  if (media.error) return NextResponse.json({ error: media.error }, { status: 400 });

  const mode = normMode(body.mode);
  try {
    const house = await db.house.create({
      data: {
        name, nameKey: nameKey(name), address: String(body.address ?? "").trim(), mode,
        checkInText, keyStatus, validFrom, validUntil,
      },
    });
    let saved = house;
    if (media.change) {
      saved = await db.house.update({ where: { id: house.id }, data: await writeMedia(house.id, media.change) });
    }
    await logAudit(req, "house", house.id, "create", "Added house {name}", { name });
    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: "house already exists" }, { status: 409 });
    throw e;
  }
}
