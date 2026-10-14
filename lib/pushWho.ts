import { NextRequest } from "next/server";
import { currentSession } from "@/lib/guard";

// Who is this phone? Everyone is signed in now, so it is simply the person in the session.
// (The second argument is kept so existing callers still compile; it is ignored.)
export async function whoIsCalling(req: NextRequest, _ignored?: unknown): Promise<string | null> {
  const session = await currentSession(req);
  return session ? session.workerId : null;
}
