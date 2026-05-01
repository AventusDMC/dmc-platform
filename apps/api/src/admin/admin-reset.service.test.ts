import test = require('node:test');
import assert = require('node:assert/strict');
import { AdminResetService, RESET_TEST_DATA_CONFIRMATION } from './admin-reset.service';

function createDeleteManyMock(counts: Record<string, number>, calls: string[], name: string) {
  return {
    deleteMany: async () => {
      calls.push(`${name}.deleteMany`);
      return { count: counts[name] ?? 0 };
    },
  };
}

function createPrismaMock(counts: Record<string, number> = {}) {
  const calls: string[] = [];
  const tx = {
    bookingRoomingAssignment: createDeleteManyMock(counts, calls, 'bookingRoomingAssignment'),
    bookingRoomingEntry: createDeleteManyMock(counts, calls, 'bookingRoomingEntry'),
    bookingPassenger: createDeleteManyMock(counts, calls, 'bookingPassenger'),
    bookingAuditLog: createDeleteManyMock(counts, calls, 'bookingAuditLog'),
    voucher: createDeleteManyMock(counts, calls, 'voucher'),
    bookingService: createDeleteManyMock(counts, calls, 'bookingService'),
    bookingDay: createDeleteManyMock(counts, calls, 'bookingDay'),
    payment: createDeleteManyMock(counts, calls, 'payment'),
    booking: createDeleteManyMock(counts, calls, 'booking'),
    invoiceAuditLog: createDeleteManyMock(counts, calls, 'invoiceAuditLog'),
    invoice: createDeleteManyMock(counts, calls, 'invoice'),
    quote: {
      updateMany: async () => {
        calls.push('quote.updateMany');
        return { count: counts.quoteUpdate ?? 0 };
      },
      deleteMany: async () => {
        calls.push('quote.deleteMany');
        return { count: counts.quote ?? 0 };
      },
    },
    quoteItineraryDayItem: createDeleteManyMock(counts, calls, 'quoteItineraryDayItem'),
    quoteItineraryAuditLog: createDeleteManyMock(counts, calls, 'quoteItineraryAuditLog'),
    quoteItineraryDay: createDeleteManyMock(counts, calls, 'quoteItineraryDay'),
    quoteItem: createDeleteManyMock(counts, calls, 'quoteItem'),
    quoteScenario: createDeleteManyMock(counts, calls, 'quoteScenario'),
    quotePricingSlab: createDeleteManyMock(counts, calls, 'quotePricingSlab'),
    quoteOption: createDeleteManyMock(counts, calls, 'quoteOption'),
    itineraryImage: createDeleteManyMock(counts, calls, 'itineraryImage'),
    itinerary: createDeleteManyMock(counts, calls, 'itinerary'),
    quoteVersion: createDeleteManyMock(counts, calls, 'quoteVersion'),
    transportPricingRule: createDeleteManyMock(counts, calls, 'transportPricingRule'),
    vehicleRate: createDeleteManyMock(counts, calls, 'vehicleRate'),
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };

  return { prisma, calls };
}

test('reset test data requires exact confirmation text', async () => {
  const { prisma } = createPrismaMock();
  const service = new AdminResetService(prisma as any);

  await assert.rejects(
    () => service.resetTestData('wrong'),
    /This will delete all test quotes and transport data\. Continue\?/,
  );
});

test('reset test data is blocked in production unless explicitly enabled', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowReset = process.env.ALLOW_TEST_DATA_RESET;
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_TEST_DATA_RESET;

  try {
    const { prisma } = createPrismaMock();
    const service = new AdminResetService(prisma as any);
    await assert.rejects(() => service.resetTestData(RESET_TEST_DATA_CONFIRMATION), /disabled in production/);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousAllowReset === undefined) {
      delete process.env.ALLOW_TEST_DATA_RESET;
    } else {
      process.env.ALLOW_TEST_DATA_RESET = previousAllowReset;
    }
  }
});

test('reset test data deletes dependent quote booking and transport rows while preserving setup data', async () => {
  const { prisma, calls } = createPrismaMock({
    quote: 2,
    quoteItem: 4,
    booking: 1,
    bookingService: 3,
    vehicleRate: 5,
    transportPricingRule: 6,
  });
  const service = new AdminResetService(prisma as any);

  const result = await service.resetTestData(RESET_TEST_DATA_CONFIRMATION);

  assert.equal(result.deleted.quotes, 2);
  assert.equal(result.deleted.quoteItems, 4);
  assert.equal(result.deleted.bookings, 1);
  assert.equal(result.deleted.bookingItems, 3);
  assert.equal(result.deleted.vehicleRates, 5);
  assert.equal(result.deleted.transportPricingRules, 6);
  assert.deepEqual(result.kept, ['users', 'suppliers', 'vehicles', 'service types']);
  assert.ok(calls.indexOf('bookingService.deleteMany') < calls.indexOf('booking.deleteMany'));
  assert.ok(calls.indexOf('quote.updateMany') < calls.indexOf('quoteVersion.deleteMany'));
  assert.ok(calls.indexOf('quoteItem.deleteMany') < calls.indexOf('vehicleRate.deleteMany'));
});
