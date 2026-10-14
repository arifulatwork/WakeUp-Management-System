import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePerm } from "@/lib/guard";
import { logAudit } from "@/lib/audit";
import { parseMedia, writeMedia } from "@/lib/houseMedia";

// GET /api/houses — house list (cleaner's "My Houses" screen,
// Cristina's task-assignment dropdown).
export async function GET() {
  const houses = await db.house.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(houses);
}

// POST /api/houses — admin adds a house. validFrom/validUntil are
// optional and used for temporary Airbnb/Booking listings.
export async function POST(req: NextRequest) {
  const g = await requirePerm(req, "houses.create");
  if (g.error) return g.error;
  const body = await req.json();
  const { name, address, validFrom, validUntil, keyStatus } = body;

  if (!name || !address) {
    return NextResponse.json(
      { error: "name and address are required" },
      { status: 400 }
    );
  }

  const media = parseMedia(body);
  if (media.error) return NextResponse.json({ error: media.error }, { status: 400 });

  let house = await db.house.create({
    data: {
      name,
      address,
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: validUntil ? new Date(validUntil) : null,
      ...(keyStatus ? { keyStatus } : {}),
    },
  });

  if (media.change) {
    const flags = await writeMedia(house.id, media.change);
    house = await db.house.update({ where: { id: house.id }, data: flags });
  }

  await logAudit(req, "house", house.id, "create", "Added house {name}", { name: house.name });
  return NextResponse.json(house, { status: 201 });
}
