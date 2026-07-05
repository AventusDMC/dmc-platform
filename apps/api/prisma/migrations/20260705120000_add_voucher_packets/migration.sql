-- Supplier Voucher Packet V2 — Slice S1.
-- ADDITIVE and INERT: creates the packet grouping layer (voucher_packets +
-- voucher_packet_items) ALONGSIDE the existing 1:1 `vouchers` table. No existing
-- table or column is altered; no data is changed; no behaviour, API, UI, PDF, or
-- send is wired. The two tables are created but unused until later slices.
-- Fully reversible:
--   DROP TABLE "voucher_packet_items";
--   DROP TABLE "voucher_packets";

-- CreateTable
CREATE TABLE "voucher_packets" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "supplierId" UUID,
    "groupingType" TEXT NOT NULL,
    "groupingKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "contentHash" TEXT,
    "snapshotJson" JSONB,
    "generatedAt" TIMESTAMP(3),
    "generatedBy" UUID,
    "sentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_packets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_packet_items" (
    "id" UUID NOT NULL,
    "packetId" UUID NOT NULL,
    "bookingServiceId" UUID NOT NULL,
    "includedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_packet_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voucher_packets_bookingId_status_idx" ON "voucher_packets"("bookingId", "status");

-- CreateIndex
CREATE INDEX "voucher_packets_supplierId_idx" ON "voucher_packets"("supplierId");

-- CreateIndex
CREATE INDEX "voucher_packets_generatedAt_idx" ON "voucher_packets"("generatedAt");

-- CreateIndex
CREATE INDEX "voucher_packet_items_bookingServiceId_idx" ON "voucher_packet_items"("bookingServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_packet_items_packetId_bookingServiceId_key" ON "voucher_packet_items"("packetId", "bookingServiceId");

-- AddForeignKey
ALTER TABLE "voucher_packets" ADD CONSTRAINT "voucher_packets_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_packets" ADD CONSTRAINT "voucher_packets_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_packet_items" ADD CONSTRAINT "voucher_packet_items_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "voucher_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_packet_items" ADD CONSTRAINT "voucher_packet_items_bookingServiceId_fkey" FOREIGN KEY ("bookingServiceId") REFERENCES "booking_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
