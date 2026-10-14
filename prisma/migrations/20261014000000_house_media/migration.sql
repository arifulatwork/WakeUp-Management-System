-- AlterTable
ALTER TABLE "House" ADD COLUMN "hasPhoto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hasVideo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mediaUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HouseMedia" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "photo" TEXT,
    "video" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HouseMedia_houseId_key" ON "HouseMedia"("houseId");

-- AddForeignKey
ALTER TABLE "HouseMedia" ADD CONSTRAINT "HouseMedia_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;
