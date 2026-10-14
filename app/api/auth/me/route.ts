import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/guard";

// Who am I? Role is read from the database, so a demotion shows up immediately.
export async function GET(req: NextRequest) {
  const session = await currentSession(req);
  if (!session) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  return NextResponse.json({
    workerId: session.workerId, name: session.name, role: session.role,
    area: session.area, language: session.language,
  });
}
