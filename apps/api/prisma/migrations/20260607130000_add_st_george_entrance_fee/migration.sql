-- Phase J.1: data-only. The D3 "St. George Church / Mosaic Map Entrance"
-- ticketing service (a88471e6) has no EntranceFee, so PackageTemplate apply
-- skips it ("needs a linked entrance or ticket rate service record").
-- EntranceFee is 1:1 with a service (entrance_fees.serviceId is UNIQUE), so the
-- fee must be created for that service. Fee = 3 JOD to match the service
-- baseCost and the sibling Mount Nebo entry. No schema change, no pricing-formula
-- change; the existing ticket pricing path reads foreignerFeeJod.

INSERT INTO "entrance_fees"
  ("id","siteName","category","foreignerFeeJod","includedInJordanPass","notes","source","serviceId","createdAt","updatedAt")
VALUES
  (gen_random_uuid(),'St. George Church / Mosaic Map','RELIGIOUS_SITE_ENTRY',3,false,
   'Entrance fee set to match existing service baseCost (3 JOD).',NULL,
   'a88471e6-6336-4e4e-ba4b-eef0c8addb8f',now(),now());
