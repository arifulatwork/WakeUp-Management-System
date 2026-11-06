-- AlterTable
ALTER TABLE "House" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'SCHOOL',
ADD COLUMN "checkInText" TEXT;

-- CreateTable
CREATE TABLE "HouseRoomPhoto" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "photo" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseRoomPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HouseRoomPhoto_houseId_idx" ON "HouseRoomPhoto"("houseId");

-- AddForeignKey
ALTER TABLE "HouseRoomPhoto" ADD CONSTRAINT "HouseRoomPhoto_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;
