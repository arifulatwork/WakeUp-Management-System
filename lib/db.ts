// The app always uses the real PostgreSQL (Supabase) database through Prisma.
// (The old in-memory demo mode has been removed, so a missing or wrong env variable
// can never switch the app to sample data.)

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
export const db: any = realDb();
