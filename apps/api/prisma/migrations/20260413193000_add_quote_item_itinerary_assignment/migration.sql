ALTER TABLE "quote_items"
ADD COLUMN "itineraryId" UUID;

ALTER TABLE "quote_items"
ADD CONSTRAINT "quote_items_itineraryId_fkey"
FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "quote_items_itineraryId_idx" ON "quote_items"("itineraryId");
