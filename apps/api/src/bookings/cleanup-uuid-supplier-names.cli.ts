import 'reflect-metadata';
import { PrismaService } from '../prisma/prisma.service';

// One-shot cleanup for booking_services rows where supplierName ended up holding
// a UUID instead of a real supplier name. Root cause is fixed in supplier-resolver.ts
// (the `|| normalizedSupplierId` fallback that wrote the id into the name column
// when it failed to resolve). This script nulls out those bad values for rows
// already in the DB. Operators can re-assign suppliers from the UI afterwards.
//
// Usage (from apps/api):
//   dry-run: npm run cleanup:booking-services:uuid-supplier-names:dry-run
//   apply:   npm run cleanup:booking-services:uuid-supplier-names:apply -- --confirm=CLEANUP_UUID_SUPPLIER_NAMES
// Or invoke ts-node directly via npx if you skip the npm script wrapper.

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const APPLY_CONFIRM_TOKEN = 'CLEANUP_UUID_SUPPLIER_NAMES';

function parseArgs(argv: string[]) {
  const [mode, ...rest] = argv;
  const args = new Map<string, string>();
  for (const entry of rest) {
    if (!entry.startsWith('--')) continue;
    const [key, ...valueParts] = entry.slice(2).split('=');
    args.set(key, valueParts.join('='));
  }
  return { mode, args };
}

function printJson(payload: unknown) {
  console.log(JSON.stringify(payload, null, 2));
}

async function findBadRows(prisma: PrismaService) {
  // Postgres regex: `~` is case-sensitive, `~*` is case-insensitive. UUIDs from
  // the JS uuid lib are lowercase, but be defensive.
  const rows = await prisma.bookingService.findMany({
    where: {
      supplierId: null,
      supplierName: { not: null },
    },
    select: {
      id: true,
      bookingId: true,
      supplierName: true,
      serviceType: true,
      description: true,
    },
  });
  return rows.filter((row) => row.supplierName && UUID_PATTERN.test(row.supplierName.trim()));
}

async function main() {
  const { mode, args } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const badRows = await findBadRows(prisma);
    const sample = badRows.slice(0, 20).map((row) => ({
      bookingServiceId: row.id,
      bookingId: row.bookingId,
      serviceType: row.serviceType,
      description: row.description,
      currentSupplierName: row.supplierName,
    }));
    const distinctBookings = new Set(badRows.map((row) => row.bookingId)).size;

    if (mode === 'dry-run') {
      printJson({
        mode: 'dry-run',
        mutatesData: false,
        totalBadRows: badRows.length,
        distinctBookingsAffected: distinctBookings,
        sample,
      });
      return;
    }

    if (mode === 'apply') {
      if (args.get('confirm') !== APPLY_CONFIRM_TOKEN) {
        printJson({
          success: false,
          error: `Refusing to apply: pass --confirm=${APPLY_CONFIRM_TOKEN} to acknowledge this will mutate data.`,
          totalBadRows: badRows.length,
          distinctBookingsAffected: distinctBookings,
        });
        process.exitCode = 1;
        return;
      }

      const ids = badRows.map((row) => row.id);
      if (ids.length === 0) {
        printJson({ mode: 'apply', mutatesData: true, cleared: 0, message: 'No rows matched the UUID pattern.' });
        return;
      }

      // Single transactional batch: null out supplierName and record one audit log
      // entry per row so the historical value is preserved.
      const cleared = await prisma.$transaction(async (tx) => {
        const update = await tx.bookingService.updateMany({
          where: { id: { in: ids } },
          data: { supplierName: null },
        });

        await tx.bookingAuditLog.createMany({
          data: badRows.map((row) => ({
            bookingId: row.bookingId,
            bookingServiceId: row.id,
            entityType: 'booking_service' as const,
            entityId: row.id,
            action: 'service_supplier_name_uuid_cleared',
            oldValue: row.supplierName,
            newValue: null,
            actor: 'cleanup-uuid-supplier-names.cli',
          })),
        });

        return update.count;
      });

      printJson({
        mode: 'apply',
        mutatesData: true,
        cleared,
        distinctBookingsAffected: distinctBookings,
        sample,
      });
      return;
    }

    throw new Error(
      `Usage: ts-node src/bookings/cleanup-uuid-supplier-names.cli.ts <dry-run|apply> [--confirm=${APPLY_CONFIRM_TOKEN}]`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  printJson({ success: false, error: message });
  process.exitCode = 1;
});
