-- Group start / end date. Additive only: NULL = no dates (existing groups stay current, never archived).
ALTER TABLE "Group" ADD COLUMN "startDate" TEXT;
ALTER TABLE "Group" ADD COLUMN "endDate" TEXT;
