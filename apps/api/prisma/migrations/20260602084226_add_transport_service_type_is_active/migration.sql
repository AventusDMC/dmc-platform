-- Add soft-delete flag to transport service types (default active).
ALTER TABLE "transport_service_types" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
