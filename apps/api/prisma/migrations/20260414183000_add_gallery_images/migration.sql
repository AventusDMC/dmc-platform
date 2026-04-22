CREATE TABLE "gallery_images" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "destination" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "itinerary_images" (
    "id" UUID NOT NULL,
    "itineraryId" UUID NOT NULL,
    "galleryImageId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "itinerary_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "itinerary_images_itineraryId_sortOrder_idx" ON "itinerary_images"("itineraryId", "sortOrder");
CREATE INDEX "itinerary_images_galleryImageId_idx" ON "itinerary_images"("galleryImageId");

ALTER TABLE "itinerary_images"
ADD CONSTRAINT "itinerary_images_itineraryId_fkey"
FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "itinerary_images"
ADD CONSTRAINT "itinerary_images_galleryImageId_fkey"
FOREIGN KEY ("galleryImageId") REFERENCES "gallery_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
