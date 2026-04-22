CREATE TYPE "ClientInvoiceStatus" AS ENUM ('unbilled', 'invoiced', 'paid');

CREATE TYPE "SupplierPaymentStatus" AS ENUM ('unpaid', 'scheduled', 'paid');

ALTER TABLE "bookings"
ADD COLUMN "clientInvoiceStatus" "ClientInvoiceStatus" NOT NULL DEFAULT 'unbilled',
ADD COLUMN "supplierPaymentStatus" "SupplierPaymentStatus" NOT NULL DEFAULT 'unpaid';

CREATE INDEX "bookings_clientInvoiceStatus_idx" ON "bookings"("clientInvoiceStatus");
CREATE INDEX "bookings_supplierPaymentStatus_idx" ON "bookings"("supplierPaymentStatus");
