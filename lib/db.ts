// Single switch between the DEMO in-memory database and the REAL
// Postgres/Prisma backend.
//
//   NEXT_PUBLIC_DEMO_MODE=true   (default)  -> lib/mockDb.ts, no database needed
//   NEXT_PUBLIC_DEMO_MODE=false             -> lib/db.prisma.ts, real PostgreSQL
//
// Every API route imports `db` from here and is identical in both modes,
// so going live later is just: set the env var to false, set DATABASE_URL,
// run the migrations. No route or page changes.

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

// A clear message instead of a cryptic Prisma error when .env still has the placeholders.
function realDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url || url.includes("[PASSWORD]") || url.includes("[PROJECT-REF]") || url.includes("[REGION]")) {
    throw new Error(
      "Supabase is not configured yet: open the .env file and paste your DATABASE_URL and DIRECT_URL " +
      "(Supabase -> Connect). See SETUP-SUPABASE.md, step 2. Then restart `npm run dev`."
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("./db.prisma").db;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Only the chosen backend is loaded, so in real mode the demo simulator can never start.
export const db: any = DEMO_MODE
  ? // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("./mockDb").mockDb
  : realDb();
