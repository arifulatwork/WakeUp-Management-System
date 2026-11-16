-- Food ordering spec fixes. Additive only: nothing existing is changed or removed.
-- Product.perStudent: false = the standard quantity is one group quantity (a pack); true = per student (fruit).
ALTER TABLE "Product" ADD COLUMN "perStudent" BOOLEAN NOT NULL DEFAULT false;
-- OrderLine: record the standard quantity and the reason when a coordinator orders a different quantity.
ALTER TABLE "OrderLine" ADD COLUMN "standardQty" INTEGER;
ALTER TABLE "OrderLine" ADD COLUMN "exceptionReason" TEXT;
-- Order: the group confirms it received the order.
ALTER TABLE "Order" ADD COLUMN "receivedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "receivedById" TEXT;
