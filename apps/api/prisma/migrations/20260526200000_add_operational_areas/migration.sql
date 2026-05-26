-- Operational Areas Catalog v1 — DB-backed dictionary of movement endpoints
-- used by the Route Builder, Canonical Builder, Touring Routes, Dispatch,
-- Transfers, and Excursion composition. Codes (AMM, QAIA, PET, ...) drive
-- the FROM_TO canonical route-code generator.

CREATE TABLE "operational_areas" (
  "id"                          UUID NOT NULL,
  "code"                        TEXT NOT NULL,
  "name"                        TEXT NOT NULL,
  "type"                        TEXT NOT NULL,
  "city"                        TEXT NOT NULL,
  "region"                      TEXT,
  "country"                     TEXT NOT NULL DEFAULT 'Jordan',
  "isActive"                    BOOLEAN NOT NULL DEFAULT true,
  "airportRouteFlagDefault"     BOOLEAN NOT NULL DEFAULT false,
  "borderCrossingFlagDefault"   BOOLEAN NOT NULL DEFAULT false,
  "mountainRoadFlagDefault"     BOOLEAN NOT NULL DEFAULT false,
  "overnightRiskDefault"        BOOLEAN NOT NULL DEFAULT false,
  "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_areas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_areas_code_key" ON "operational_areas"("code");
CREATE INDEX "operational_areas_isActive_code_idx" ON "operational_areas"("isActive", "code");
CREATE INDEX "operational_areas_city_idx" ON "operational_areas"("city");
CREATE INDEX "operational_areas_type_idx" ON "operational_areas"("type");

-- Jordan operational-area seed. Mirrors the hardcoded dictionary that
-- shipped in apps/api/src/route-standards/operational-areas.ts so the
-- Route Builder behaves identically after the migration. Note: the
-- previous static array had Aqaba City + King Hussein International
-- Airport (Aqaba) both keyed under code='AQJ' — the unique constraint
-- above blocks that, so we keep Aqaba City and drop the airport dup
-- (operationally identical for transfer-code purposes).
INSERT INTO "operational_areas"
  ("id", "code", "name", "type", "city", "region", "country", "airportRouteFlagDefault", "borderCrossingFlagDefault", "mountainRoadFlagDefault", "overnightRiskDefault")
VALUES
  (gen_random_uuid(), 'AMM',     'Amman City',                            'CITY',         'Amman',     'Central',   'Jordan', false, false, false, false),
  (gen_random_uuid(), 'QAIA',    'Queen Alia International Airport',      'AIRPORT',      'Amman',     'Central',   'Jordan', true,  false, false, false),
  (gen_random_uuid(), 'PET',     'Petra Visitor Center',                  'TOURISM_SITE', 'Petra',     'South',     'Jordan', false, false, false, false),
  (gen_random_uuid(), 'WR',      'Wadi Rum Camp Area',                    'CAMP_AREA',    'Wadi Rum',  'South',     'Jordan', false, false, false, false),
  (gen_random_uuid(), 'AQJ',     'Aqaba City',                            'CITY',         'Aqaba',     'South',     'Jordan', false, false, false, false),
  (gen_random_uuid(), 'DS',      'Dead Sea Resort Area',                  'RESORT_AREA',  'Dead Sea',  'Central',   'Jordan', false, false, false, false),
  (gen_random_uuid(), 'JER',     'Jerash Archaeological Site',            'TOURISM_SITE', 'Jerash',    'North',     'Jordan', false, false, false, false),
  (gen_random_uuid(), 'AJL',     'Ajloun Castle',                         'TOURISM_SITE', 'Ajloun',    'North',     'Jordan', false, false, false, false),
  (gen_random_uuid(), 'MAD',     'Madaba',                                'CITY',         'Madaba',    'Central',   'Jordan', false, false, false, false),
  (gen_random_uuid(), 'NEB',     'Mount Nebo',                            'TOURISM_SITE', 'Madaba',    'Central',   'Jordan', false, false, false, false),
  (gen_random_uuid(), 'KRK',     'Karak Castle',                          'TOURISM_SITE', 'Karak',     'South',     'Jordan', false, false, true,  false),
  (gen_random_uuid(), 'IRB',     'Irbid',                                 'CITY',         'Irbid',     'North',     'Jordan', false, false, false, false),
  (gen_random_uuid(), 'ALLENBY', 'Allenby / King Hussein Bridge',         'BORDER',       'Dead Sea',  'Central',   'Jordan', false, true,  false, false),
  (gen_random_uuid(), 'SHB',     'Sheikh Hussein Border',                 'BORDER',       'Irbid',     'North',     'Jordan', false, true,  false, false),
  (gen_random_uuid(), 'WAB',     'Wadi Araba Border (Aqaba)',             'BORDER',       'Aqaba',     'South',     'Jordan', false, true,  false, false);
