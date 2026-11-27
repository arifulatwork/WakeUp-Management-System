-- Food categories as a real table. Additive: no product, order or request is changed or removed.
-- A product points to its category by NAME: renaming a category renames it on every product (ON UPDATE CASCADE),
-- and a category that still has products cannot be deleted (ON DELETE RESTRICT).

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- Tidy the existing values so every product matches a category row exactly.
UPDATE "Product" SET "category" = 'General' WHERE trim("category") = '';
UPDATE "Product" SET "category" = trim("category") WHERE "category" <> trim("category");

-- 1) "General" always exists (the fallback for a product without a category).
INSERT INTO "Category" ("id", "name") VALUES (gen_random_uuid()::text, 'General');

-- 2) Every category your products already use (so nothing is lost or hidden).
INSERT INTO "Category" ("id", "name")
SELECT gen_random_uuid()::text, s."category"
FROM (SELECT DISTINCT "category" FROM "Product") s
WHERE NOT EXISTS (SELECT 1 FROM "Category" c WHERE c."name" = s."category");

-- 3) The category list of the earlier version, which was kept in the settings table (if it was used).
INSERT INTO "Category" ("id", "name")
SELECT gen_random_uuid()::text, s.v
FROM (
  SELECT DISTINCT trim(t.x) AS v
  FROM "AppSetting" a, jsonb_array_elements_text(CASE WHEN jsonb_typeof(a."value") = 'array' THEN a."value" ELSE '[]'::jsonb END) AS t(x)
  WHERE a."key" = 'foodCategories'
) s
WHERE s.v <> '' AND NOT EXISTS (SELECT 1 FROM "Category" c WHERE c."name" = s.v);
DELETE FROM "AppSetting" WHERE "key" = 'foodCategories';

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_category_fkey" FOREIGN KEY ("category") REFERENCES "Category"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
