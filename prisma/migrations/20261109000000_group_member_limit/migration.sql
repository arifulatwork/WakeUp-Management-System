-- Coordinator sets how many students may be in a group. Additive only: NULL = no limit (existing groups keep working).
ALTER TABLE "Group" ADD COLUMN "memberLimit" INTEGER;
