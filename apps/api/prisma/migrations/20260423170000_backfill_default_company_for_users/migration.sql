-- Create a stable default tenant for existing single-tenant data.
DO $$
DECLARE
  default_company_id uuid;
BEGIN
  SELECT id
  INTO default_company_id
  FROM "companies"
  WHERE "name" = 'Default Company'
  ORDER BY "createdAt" ASC
  LIMIT 1;

  IF default_company_id IS NULL THEN
    INSERT INTO "companies" ("id", "name", "type", "country", "city", "createdAt", "updatedAt")
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'Default Company',
      'internal',
      'Jordan',
      'Amman',
      NOW(),
      NOW()
    )
    RETURNING "id" INTO default_company_id;
  END IF;

  UPDATE "users"
  SET "companyId" = default_company_id
  WHERE "companyId" IS NULL;

  UPDATE "leads"
  SET "companyId" = default_company_id
  WHERE "companyId" IS NULL;
END $$;

ALTER TABLE "users"
ALTER COLUMN "companyId" SET NOT NULL;
