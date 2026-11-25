-- Archive a house instead of deleting it. Additive only: NULL = active (existing houses keep working).
ALTER TABLE "House" ADD COLUMN "archivedAt" TIMESTAMP(3);
