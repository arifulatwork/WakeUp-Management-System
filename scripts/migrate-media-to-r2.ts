// MOVE OLD PHOTOS / VIDEOS FROM THE DATABASE TO CLOUDFLARE R2  (one-time script)
//
// Before this script, photos were saved inside the database as very long text ("data:image/jpeg;base64,…").
// This script uploads each one to your R2 bucket and replaces it, in the same place, with the short
// reference the app uses today ("r2:photos/2026-11/ab12….webp"). The app already understands both,
// so nothing changes for the people using it.
//
// SAFETY
//   - Default is a DRY RUN: it only counts what it would do. Nothing is uploaded or changed.
//   - A value is replaced in the database ONLY AFTER the file was uploaded and R2 confirmed its size.
//     If an upload fails, that photo stays exactly as it was.
//   - It only touches values that start with "data:". Anything already moved is skipped, so you can
//     run it again at any time (it continues where it stopped).
//   - It never deletes anything from R2.
//
// USAGE (from the project folder; needs the same .env as the app: DATABASE_URL/DIRECT_URL + R2_*)
//   npx tsx scripts/migrate-media-to-r2.ts                    dry run: shows what would be moved
//   npx tsx scripts/migrate-media-to-r2.ts --apply --limit 3  really move just 3 rows, then check the app
//   npx tsx scripts/migrate-media-to-r2.ts --apply            move everything
//
// PNG photos are converted to WebP (needs:  npm i -D sharp).  iPhone .mov videos are left untouched
// (they keep working from the database) and are listed at the end.

import { randomBytes, createHash } from "crypto";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------- what to look at
type Target = { model: string; table: string; cols: string[]; json: string[]; updatedAt: boolean };
export const TARGETS: Target[] = [
  { model: "houseMedia", table: "HouseMedia", cols: ["photo", "video"], json: [], updatedAt: true },
  { model: "houseRoomPhoto", table: "HouseRoomPhoto", cols: ["photo"], json: [], updatedAt: false },
  { model: "maintenanceTicket", table: "MaintenanceTicket", cols: ["photoUrl", "afterPhotoUrl"], json: ["mediaData"], updatedAt: false },
  { model: "cleaningTask", table: "CleaningTask", cols: [], json: ["checklistData"], updatedAt: true },
];

// ---------------------------------------------------------------- small adapters (so the logic can be tested)
export type Row = Record<string, any>;
export interface MediaDb {
  ids(t: Target): Promise<string[]>;          // ids of rows that still contain "data:" values
  get(t: Target, id: string): Promise<Row | null>;
  set(t: Target, id: string, patch: Row): Promise<void>;
}
// put() must upload AND verify (size check). It throws if anything is wrong.
export type Put = (key: string, body: Buffer, contentType: string) => Promise<void>;

export type Stats = { rows: number; moved: number; bytes: number; skipped: Record<string, number>; failed: number; errors: string[] };
export const newStats = (): Stats => ({ rows: 0, moved: 0, bytes: 0, skipped: {}, failed: 0, errors: [] });

// ---------------------------------------------------------------- converting one value
const DATA_URL = /^data:(image|video)\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;
const EXT: Record<string, { ext: string; type: string }> = {
  "image/webp": { ext: "webp", type: "image/webp" },
  "image/jpeg": { ext: "jpg", type: "image/jpeg" },
  "video/webm": { ext: "webm", type: "video/webm" },
  "video/mp4": { ext: "mp4", type: "video/mp4" },
};

function newKey(kind: "photos" | "videos", ext: string) {
  return `${kind}/${new Date().toISOString().slice(0, 7)}/${randomBytes(12).toString("hex")}.${ext}`;
}

async function pngToWebp(buf: Buffer): Promise<Buffer | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require("sharp");
    return await sharp(buf).webp({ quality: 82 }).toBuffer();
  } catch {
    return null; // sharp not installed
  }
}

export type Ctx = { apply: boolean; put: Put; cache: Map<string, string>; stats: Stats };

// Returns the new "r2:…" reference, or the original value when it must stay as it is.
export async function convertValue(value: string, ctx: Ctx): Promise<string> {
  const m = DATA_URL.exec(value);
  if (!m) { bump(ctx.stats, "not a recognised data URL"); return value; }
  const mime = `${m[1].toLowerCase()}/${m[2].toLowerCase()}`;
  let body: Buffer = Buffer.from(m[3].replace(/\s/g, ""), "base64");
  let spec = EXT[mime];

  if (mime === "image/png") {
    if (!ctx.apply) { ctx.stats.moved++; ctx.stats.bytes += body.length; return value; } // would be converted
    const webp = await pngToWebp(body);
    if (!webp) { bump(ctx.stats, "PNG (install sharp: npm i -D sharp)"); return value; }
    body = webp; spec = EXT["image/webp"];
  }
  if (!spec) { bump(ctx.stats, `${mime} (left in the database)`); return value; }
  if (!body.length) { bump(ctx.stats, "empty file"); return value; }

  const hash = createHash("sha256").update(body).digest("hex");
  const cached = ctx.cache.get(hash); // the same picture used twice is uploaded once
  if (cached) { ctx.stats.moved++; return cached; }

  const kind = m[1].toLowerCase() === "video" ? "videos" : "photos";
  const key = newKey(kind, spec.ext);
  const ref = `r2:${key}`;
  if (ctx.apply) {
    try { await ctx.put(key, body, spec.type); }
    catch (e: any) {
      ctx.stats.failed++;
      ctx.stats.errors.push(`${key}: ${e?.message ?? e}`);
      return value; // keep the original, nothing lost
    }
    ctx.cache.set(hash, ref);
  }
  ctx.stats.moved++;
  ctx.stats.bytes += body.length;
  return ctx.apply ? ref : value;
}

const bump = (s: Stats, why: string) => { s.skipped[why] = (s.skipped[why] ?? 0) + 1; };

// Walks any JSON and converts every string that starts with "data:".
async function convertJson(v: any, ctx: Ctx): Promise<any> {
  if (typeof v === "string") return v.startsWith("data:") ? convertValue(v, ctx) : v;
  if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await convertJson(x, ctx)); return out; }
  if (v && typeof v === "object") { const out: Row = {}; for (const [k, x] of Object.entries(v)) out[k] = await convertJson(x, ctx); return out; }
  return v;
}

// ---------------------------------------------------------------- one table
export async function migrateTarget(db: MediaDb, t: Target, ctx: Ctx, limit: number): Promise<number> {
  const ids = await db.ids(t);
  let done = 0;
  for (const id of ids) {
    if (done >= limit) break;
    const row = await db.get(t, id);
    if (!row) continue;
    const patch: Row = {};
    for (const c of t.cols) if (typeof row[c] === "string" && row[c].startsWith("data:")) {
      const nv = await convertValue(row[c], ctx);
      if (nv !== row[c]) patch[c] = nv;
    }
    for (const c of t.json) if (row[c] != null) {
      const before = JSON.stringify(row[c]);
      const nv = await convertJson(row[c], ctx);
      if (JSON.stringify(nv) !== before) patch[c] = nv;
    }
    ctx.stats.rows++;
    done++;
    if (ctx.apply && Object.keys(patch).length) {
      if (t.updatedAt) patch.updatedAt = row.updatedAt; // keep the old "last changed" time
      await db.set(t, id, patch);
    }
    if (done % 10 === 0) console.log(`  … ${t.table}: ${done}/${ids.length} rows`);
  }
  return done;
}

// ---------------------------------------------------------------- real database + R2
function loadEnv() {
  const f = path.join(process.cwd(), ".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const li = args.indexOf("--limit");
  const limit = li >= 0 ? Math.max(1, Number(args[li + 1]) || 1) : Infinity;

  // R2_ACCOUNT_ID must be just the id; accept a pasted endpoint URL too.
  const idRaw = process.env.R2_ACCOUNT_ID ?? "";
  const accountId = (/([a-f0-9]{32})/i.exec(idRaw) ?? [])[1] ?? idRaw;
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!accountId || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    console.error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be set in .env"); process.exit(1);
  }
  const dbUrl = process.env.MIGRATE_DB_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!dbUrl) { console.error("DATABASE_URL / DIRECT_URL missing in .env"); process.exit(1); }

  const { PrismaClient } = await import("@prisma/client");
  const { S3Client, PutObjectCommand, HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const prisma: any = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const s3 = new S3Client({
    region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  const put: Put = async (key, body, contentType) => {
    await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
    const head = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); // confirm it is really there
    if (Number(head.ContentLength) !== body.length) throw new Error(`size mismatch (${head.ContentLength} vs ${body.length})`);
  };

  const db: MediaDb = {
    async ids(t) {
      const cond = [
        ...t.cols.map((c) => `"${c}" LIKE 'data:%'`),
        ...t.json.map((c) => `"${c}"::text LIKE '%"data:%'`),
      ].join(" OR ");
      const rows: { id: string }[] = await prisma.$queryRawUnsafe(`SELECT "id" FROM "${t.table}" WHERE ${cond} ORDER BY "id"`);
      return rows.map((r) => r.id);
    },
    async get(t, id) {
      const select: Row = { id: true };
      [...t.cols, ...t.json].forEach((c) => (select[c] = true));
      if (t.updatedAt) select.updatedAt = true;
      return prisma[t.model].findUnique({ where: { id }, select });
    },
    async set(t, id, patch) { await prisma[t.model].update({ where: { id }, data: patch }); },
  };

  console.log(apply ? "== APPLY: uploading to R2 and updating the database ==" : "== DRY RUN: nothing will be changed (add --apply to do it) ==");
  const ctx: Ctx = { apply, put, cache: new Map(), stats: newStats() };
  let left = limit;
  for (const t of TARGETS) {
    if (left <= 0) break;
    const ids = await db.ids(t);
    console.log(`${t.table}: ${ids.length} row(s) with old data`);
    left -= await migrateTarget(db, t, ctx, left);
  }

  const s = ctx.stats;
  const mb = (s.bytes / 1024 / 1024).toFixed(1);
  console.log("\n--- Summary ---");
  console.log(`rows looked at : ${s.rows}`);
  console.log(`${apply ? "files moved    " : "files to move  "}: ${s.moved}  (${mb} MB)`);
  for (const [why, n] of Object.entries(s.skipped)) console.log(`left as they are: ${n} × ${why}`);
  if (s.failed) { console.log(`FAILED uploads : ${s.failed} (originals kept)`); s.errors.slice(0, 10).forEach((e) => console.log("  - " + e)); }
  if (apply) console.log("\nNext: check the app, then free the space: see VACUUM FULL in ORDERING.md / the instructions.");
  await prisma.$disconnect();
  if (s.failed) process.exit(2);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
