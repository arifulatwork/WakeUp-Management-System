import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/guard";
import { MEDIA_ENABLED } from "@/lib/features";
import { R2_ENABLED, readUrl } from "@/lib/storage";
import { isR2Ref } from "@/lib/mediaRef";

// GET /api/files/photos/2026-10/<id>.webp   (or videos/…)
// Checks the login, then redirects to the real file in R2. <img> and <video> follow the
// redirect by themselves, and video seeking (Range requests) goes straight to R2.
//
//   • R2_PUBLIC_BASE_URL set  -> redirect to https://media.yourdomain.com/<key>. Keys are random
//     and never reused, so the browser may cache this for a year.
//   • not set                 -> redirect to a signed link valid for 1 hour (bucket stays private).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { key: string[] } }) {
  if (!MEDIA_ENABLED || !R2_ENABLED) return new NextResponse("Not found", { status: 404 });
  const s = await currentSession(req);
  if (!s) return new NextResponse("sign in required", { status: 401 });

  const key = (params.key ?? []).map(decodeURIComponent).join("/");
  if (!isR2Ref("r2:" + key)) return new NextResponse("Not found", { status: 404 }); // also blocks "../" tricks

  const { url, permanent } = await readUrl(key);
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": permanent ? "private, max-age=31536000, immutable" : "private, max-age=1800" },
  });
}
