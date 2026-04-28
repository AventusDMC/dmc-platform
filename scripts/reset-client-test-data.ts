import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RESET_CONFIRM_ENV = 'CONFIRM_RESET_CLIENT_TEST_DATA';
const DATABASE_URL_MUST_INCLUDE_ENV = 'RESET_CLIENT_TEST_DATA_DATABASE_URL_MUST_INCLUDE';

const resetAuditWhere = {
  OR: [
    { entity: { in: ['quote', 'quotes', 'booking', 'bookings', 'invoice', 'invoices', 'voucher', 'vouchers', 'payment', 'payments'] } },
    { action: { contains: 'quote', mode: 'insensitive' as const } },
    { action: { contains: 'booking', mode: 'insensitive' as const } },
    { action: { contains: 'invoice', mode: 'insensitive' as const } },
    { action: { contains: 'voucher', mode: 'insensitive' as const } },
    { action: { contains: 'payment', mode: 'insensitive' as const } },
    { action: { contains: 'reminder', mode: 'insensitive' as const } },
  ],
};

type CountRow = {
  label: string;
  count: number;
};

function redactDatabaseUrl(value: string | undefined) {
  if (!value) {
    return '(not set)';
  }

  return value.replace(/:\/\/([^:/?#]+):([^@/?#]+)@/, '://$1:***@');
}

function assertResetIsConfirmed() {
  if (process.env[RESET_CONFIRM_ENV] !== 'true') {
    throw new Error(`Refusing to reset data. Set ${RESET_CONFIRM_ENV}=true to run this script.`);
  }

  const expectedDatabaseMarker = process.env[DATABASE_URL_MUST_INCLUDE_ENV]?.trim();
  const databaseUrl = process.env.DATABASE_URL || '';

  if (expectedDatabaseMarker && !databaseUrl.includes(expectedDatabaseMarker)) {
    throw new Error(
      `Refusing to reset data. DATABASE_URL does not include ${DATABASE_URL_MUST_INCLUDE_ENV}=${expectedDatabaseMarker}.`,
    );
  }
}

async function getDatabaseIdentity() {
  const rows = await prisma.$queryRaw<Array<{ database: string; user: string; server_addr: string | null }>>`
    select current_database() as database, current_user as user, inet_server_addr()::text as server_addr
  `;

  return rows[0] || { database: '(unknown)', user: '(unknown)', server_addr: null };
}

async function collectCounts(): Promise<CountRow[]> {
  const [
    quotes,
    quoteVersions,
    quoteItems,
    quoteOptions,
    quotePricingSlabs,
    quoteScenarios,
    quoteItineraryDays,
    quoteItineraryDayItems,
    quoteItineraryAuditLogs,
    legacyItineraries,
    legacyItineraryImages,
    bookings,
    bookingDays,
    bookingServices,
    bookingPassengers,
    bookingRoomingEntries,
    bookingRoomingAssignments,
    bookingAuditLogs,
    vouchers,
    invoices,
    invoiceAuditLogs,
    payments,
    relatedAuditLogs,
  ] = await Promise.all([
    prisma.quote.count(),
    prisma.quoteVersion.count(),
    prisma.quoteItem.count(),
    prisma.quoteOption.count(),
    prisma.quotePricingSlab.count(),
    prisma.quoteScenario.count(),
    prisma.quoteItineraryDay.count(),
    prisma.quoteItineraryDayItem.count(),
    prisma.quoteItineraryAuditLog.count(),
    prisma.itinerary.count(),
    prisma.itineraryImage.count(),
    prisma.booking.count(),
    prisma.bookingDay.count(),
    prisma.bookingService.count(),
    prisma.bookingPassenger.count(),
    prisma.bookingRoomingEntry.count(),
    prisma.bookingRoomingAssignment.count(),
    prisma.bookingAuditLog.count(),
    prisma.voucher.count(),
    prisma.invoice.count(),
    prisma.invoiceAuditLog.count(),
    prisma.payment.count(),
    prisma.auditLog.count({ where: resetAuditWhere }),
  ]);

  return [
    { label: 'quotes', count: quotes },
    { label: 'quote_versions', count: quoteVersions },
    { label: 'quote_items', count: quoteItems },
    { label: 'quote_options', count: quoteOptions },
    { label: 'quote_pricing_slabs', count: quotePricingSlabs },
    { label: 'quote_scenarios', count: quoteScenarios },
    { label: 'quote_itinerary_days', count: quoteItineraryDays },
    { label: 'quote_itinerary_day_items', count: quoteItineraryDayItems },
    { label: 'quote_itinerary_audit_logs', count: quoteItineraryAuditLogs },
    { label: 'itineraries', count: legacyItineraries },
    { label: 'itinerary_images', count: legacyItineraryImages },
    { label: 'bookings', count: bookings },
    { label: 'booking_days', count: bookingDays },
    { label: 'booking_services', count: bookingServices },
    { label: 'booking_passengers', count: bookingPassengers },
    { label: 'booking_rooming_entries', count: bookingRoomingEntries },
    { label: 'booking_rooming_assignments', count: bookingRoomingAssignments },
    { label: 'booking_audit_logs', count: bookingAuditLogs },
    { label: 'vouchers', count: vouchers },
    { label: 'invoices', count: invoices },
    { label: 'invoice_audit_logs', count: invoiceAuditLogs },
    { label: 'payments', count: payments },
    { label: 'related_audit_logs', count: relatedAuditLogs },
  ];
}

function printCounts(title: string, rows: CountRow[]) {
  console.log(`\n${title}`);
  console.table(rows);
}

async function resetTransactionalData() {
  await prisma.$transaction(
    async (tx) => {
      await tx.bookingRoomingAssignment.deleteMany();
      await tx.bookingRoomingEntry.deleteMany();
      await tx.bookingPassenger.deleteMany();
      await tx.voucher.deleteMany();
      await tx.bookingAuditLog.deleteMany();
      await tx.payment.deleteMany();
      await tx.bookingService.deleteMany();
      await tx.bookingDay.deleteMany();
      await tx.booking.deleteMany();

      await tx.invoiceAuditLog.deleteMany();
      await tx.invoice.deleteMany();

      await tx.quoteItineraryAuditLog.deleteMany();
      await tx.quoteItineraryDayItem.deleteMany();
      await tx.itineraryImage.deleteMany();
      await tx.itinerary.deleteMany();
      await tx.quoteItem.deleteMany();
      await tx.quoteOption.deleteMany();
      await tx.quotePricingSlab.deleteMany();
      await tx.quoteScenario.deleteMany();
      await tx.quote.updateMany({
        data: {
          acceptedVersionId: null,
          revisedFromId: null,
        },
      });
      await tx.quoteVersion.deleteMany();
      await tx.quote.deleteMany();

      await tx.auditLog.deleteMany({
        where: resetAuditWhere,
      });
    },
    {
      maxWait: 30000,
      timeout: 120000,
    },
  );
}

async function main() {
  assertResetIsConfirmed();

  const identity = await getDatabaseIdentity();
  console.log('Client test data reset target');
  console.log({
    database: identity.database,
    user: identity.user,
    serverAddr: identity.server_addr,
    databaseUrl: redactDatabaseUrl(process.env.DATABASE_URL),
  });

  printCounts('Counts before reset', await collectCounts());
  await resetTransactionalData();
  printCounts('Counts after reset', await collectCounts());

  console.log('\nReset complete. Users, companies, contacts, and product catalog data were not deleted by this script.');
}

main()
  .catch((error) => {
    console.error('\nReset failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
