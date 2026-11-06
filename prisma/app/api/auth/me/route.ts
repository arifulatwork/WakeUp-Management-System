import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/guard";
import { db } from "@/lib/db";

// Who am I? Role is read from the database, so a demotion shows up immediately.
export async function GET(req: NextRequest) {
  const session = await currentSession(req);
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  // Students also learn their group and registered dietary requirements.
  let extra: Record<string, unknown> = {};
  if (session.role === "student") {
    const w = await db.worker.findUnique({ where: { id: session.workerId } });
    const g = session.groupId ? await db.group.findUnique({ where: { id: session.groupId } }) : null;
    extra = { groupId: session.groupId, groupName: g?.name ?? "", dietary: w?.dietary ?? [] };
  }
  return NextResponse.json({
    workerId: session.workerId, name: session.name, role: session.role,
    area: session.area, language: session.language, ...extra,
  });
}
