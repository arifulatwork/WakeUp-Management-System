-- Products: names in other languages, a catalogue photo, and the country they are sold in.
-- Groups: the country they order in. Additive only: existing products/groups keep working
-- (NULL country on a product = available in every country).
ALTER TABLE "Product" ADD COLUMN "names" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Product" ADD COLUMN "photo" TEXT;
ALTER TABLE "Product" ADD COLUMN "country" TEXT;
ALTER TABLE "Group" ADD COLUMN "country" TEXT;
