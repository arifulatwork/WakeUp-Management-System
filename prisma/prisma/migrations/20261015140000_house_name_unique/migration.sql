-- Two houses may not share a name in the same mode (capitals, extra spaces and accents ignored).

-- AlterTable: nullable first, so existing rows can be filled in.
ALTER TABLE "House" ADD COLUMN IF NOT EXISTS "nameKey" TEXT;

-- Backfill: same rule as normName() in lib/houseMode.ts (lowercase, accents removed, spaces collapsed).
UPDATE "House"
SET "nameKey" = btrim(regexp_replace(
  translate(lower("name"),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
    'aaaaaaceeeeiiiinooooouuuuyy'),
  '\s+', ' ', 'g'));

-- Stop with a readable message if the data already contains duplicates.
DO $$
DECLARE dup TEXT;
BEGIN
  SELECT string_agg('"' || d.n || '" (' || d.m || ', ' || d.c || ' houses)', '; ')
    INTO dup
  FROM (
    SELECT min("name") AS n, "mode" AS m, count(*) AS c
    FROM "House"
    GROUP BY "nameKey", "mode"
    HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate houses must be renamed or deleted before this migration: %', dup;
  END IF;
END $$;

ALTER TABLE "House" ALTER COLUMN "nameKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "House_nameKey_mode_key" ON "House"("nameKey", "mode");
