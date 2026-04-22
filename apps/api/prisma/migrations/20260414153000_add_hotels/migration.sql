-- CreateEnum
CREATE TYPE "HotelRoomType" AS ENUM ('SGL', 'DBL', 'TPL');

-- CreateEnum
CREATE TYPE "HotelMealPlan" AS ENUM ('BB', 'HB', 'FB');

-- CreateTable
CREATE TABLE "hotels" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contracts" (
    "id" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_rates" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "seasonName" TEXT NOT NULL,
    "roomType" "HotelRoomType" NOT NULL,
    "mealPlan" "HotelMealPlan" NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotel_contracts_hotelId_idx" ON "hotel_contracts"("hotelId");

-- CreateIndex
CREATE INDEX "hotel_rates_contractId_idx" ON "hotel_rates"("contractId");

-- AddForeignKey
ALTER TABLE "hotel_contracts" ADD CONSTRAINT "hotel_contracts_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_rates" ADD CONSTRAINT "hotel_rates_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
