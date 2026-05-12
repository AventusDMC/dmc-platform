-- Allow package templates to reference operational supplier services
-- such as Meet & Assist, VIP Fast Track, Porter, SIM Card,
-- Wheelchair Assistance, and Airport Assistance.

ALTER TYPE "PackageTemplateComponentType" ADD VALUE 'SERVICE';
