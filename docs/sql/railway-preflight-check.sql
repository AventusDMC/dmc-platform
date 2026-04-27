-- Railway production preflight check before migration recovery.
--
-- READ ONLY by design:
-- - SELECT only
-- - no CREATE / ALTER / UPDATE / DELETE / DROP
-- - no Prisma migration resolve commands
--
-- Run this before docs/sql/railway-operations-core-recovery.sql.

WITH required_tables(table_name) AS (
  VALUES
    ('bookings'),
    ('booking_services'),
    ('quotes'),
    ('booking_days'),
    ('booking_passengers')
)
SELECT
  'required_table' AS check_group,
  table_name AS check_name,
  CASE WHEN to_regclass(format('public.%I', table_name)) IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS result,
  COALESCE(to_regclass(format('public.%I', table_name))::text, 'missing') AS details
FROM required_tables
ORDER BY table_name;

SELECT
  'row_count' AS check_group,
  target_tables.table_name AS check_name,
  CASE WHEN pg_stat_user_tables.relname IS NULL THEN 'FAIL' ELSE 'INFO' END AS result,
  COALESCE(pg_stat_user_tables.n_live_tup::text, 'missing') AS details
FROM (
  VALUES
    ('bookings'),
    ('booking_services'),
    ('quotes'),
    ('booking_passengers')
) AS target_tables(table_name)
LEFT JOIN pg_stat_user_tables
  ON pg_stat_user_tables.schemaname = 'public'
 AND pg_stat_user_tables.relname = target_tables.table_name
ORDER BY target_tables.table_name;

WITH target_migrations(migration_name) AS (
  VALUES
    ('20260427113000_add_operations_core'),
    ('20260427121000_add_booking_service_assignment_layer'),
    ('20260427133000_add_booking_service_vouchers')
)
SELECT
  'prisma_migration' AS check_group,
  target_migrations.migration_name AS check_name,
  CASE
    WHEN prisma_migrations.migration_name IS NULL THEN 'FAIL'
    WHEN prisma_migrations.rolled_back_at IS NOT NULL THEN 'FAIL'
    WHEN prisma_migrations.finished_at IS NULL THEN 'FAIL'
    ELSE 'PASS'
  END AS result,
  CASE
    WHEN prisma_migrations.migration_name IS NULL THEN 'missing from _prisma_migrations'
    WHEN prisma_migrations.rolled_back_at IS NOT NULL THEN 'rolled back at ' || prisma_migrations.rolled_back_at::text
    WHEN prisma_migrations.finished_at IS NULL THEN 'started but not finished; logs=' || COALESCE(prisma_migrations.logs, '')
    ELSE 'finished at ' || prisma_migrations.finished_at::text
  END AS details
FROM target_migrations
LEFT JOIN "_prisma_migrations" prisma_migrations
  ON prisma_migrations.migration_name = target_migrations.migration_name
ORDER BY target_migrations.migration_name;

WITH required_enums(enum_name) AS (
  VALUES
    ('BookingDayStatus'),
    ('BookingOperationServiceType'),
    ('BookingOperationServiceStatus')
)
SELECT
  'required_enum' AS check_group,
  enum_name AS check_name,
  CASE WHEN pg_type.typname IS NULL THEN 'FAIL' ELSE 'PASS' END AS result,
  COALESCE(string_agg(pg_enum.enumlabel, ', ' ORDER BY pg_enum.enumsortorder), 'missing') AS details
FROM required_enums
LEFT JOIN pg_type
  ON pg_type.typname = required_enums.enum_name
LEFT JOIN pg_enum
  ON pg_enum.enumtypid = pg_type.oid
GROUP BY enum_name, pg_type.typname
ORDER BY enum_name;

WITH required_columns(table_name, column_name) AS (
  VALUES
    ('bookings', 'clientCompanyId'),
    ('bookings', 'pax'),
    ('bookings', 'startDate'),
    ('bookings', 'endDate'),
    ('booking_days', 'id'),
    ('booking_days', 'bookingId'),
    ('booking_days', 'dayNumber'),
    ('booking_days', 'date'),
    ('booking_days', 'title'),
    ('booking_days', 'notes'),
    ('booking_days', 'status'),
    ('booking_days', 'createdAt'),
    ('booking_days', 'updatedAt'),
    ('booking_passengers', 'fullName'),
    ('booking_passengers', 'gender'),
    ('booking_passengers', 'dateOfBirth'),
    ('booking_passengers', 'nationality'),
    ('booking_passengers', 'passportNumber'),
    ('booking_passengers', 'passportIssueDate'),
    ('booking_passengers', 'passportExpiryDate'),
    ('booking_passengers', 'arrivalFlight'),
    ('booking_passengers', 'departureFlight'),
    ('booking_passengers', 'entryPoint'),
    ('booking_passengers', 'visaStatus'),
    ('booking_passengers', 'roomingNotes'),
    ('booking_services', 'bookingDayId'),
    ('booking_services', 'operationType'),
    ('booking_services', 'operationStatus'),
    ('booking_services', 'referenceId'),
    ('booking_services', 'assignedTo'),
    ('booking_services', 'guidePhone'),
    ('booking_services', 'vehicleId')
)
SELECT
  'required_column' AS check_group,
  required_columns.table_name || '.' || required_columns.column_name AS check_name,
  CASE WHEN information_schema.columns.column_name IS NULL THEN 'FAIL' ELSE 'PASS' END AS result,
  COALESCE(
    information_schema.columns.data_type ||
      CASE
        WHEN information_schema.columns.udt_name IS NULL THEN ''
        ELSE ' / ' || information_schema.columns.udt_name
      END ||
      CASE
        WHEN information_schema.columns.is_nullable = 'NO' THEN ' not null'
        ELSE ' nullable'
      END,
    'missing'
  ) AS details
FROM required_columns
LEFT JOIN information_schema.columns
  ON information_schema.columns.table_schema = 'public'
 AND information_schema.columns.table_name = required_columns.table_name
 AND information_schema.columns.column_name = required_columns.column_name
ORDER BY required_columns.table_name, required_columns.column_name;
