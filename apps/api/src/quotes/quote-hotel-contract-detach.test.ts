import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuoteStatus } from '@prisma/client';
import { HotelContractsService } from '../hotel-contracts/hotel-contracts.service';
import { QuotesService } from './quotes.service';

const actor = { companyId: 'company-1' };

function createQuoteServiceHarness(overrides: Record<string, any> = {}) {
  const state = {
    recalculateCalls: [] as string[],
    updatedData: null as any,
    item: {
      id: 'item-1',
      quoteId: 'quote-1',
      contractId: 'contract-1',
      hotelId: 'hotel-1',
      seasonName: 'Spring 2026',
      roomCategoryId: 'room-1',
      occupancyType: 'DBL',
      mealPlan: 'BB',
      quote: {
        id: 'quote-1',
        status: QuoteStatus.DRAFT,
        acceptedVersionId: null,
        clientCompanyId: 'client-company-1',
        brandCompanyId: 'company-1',
        invoice: null,
        bookings: [],
      },
      ...overrides.item,
    },
    bookingService: overrides.bookingService ?? null,
  };

  const prisma = {
    quoteItem: {
      findFirst: async () => state.item,
      update: async ({ data }: any) => {
        state.updatedData = data;
        state.item = { ...state.item, ...data, contract: null, roomCategory: null };
        return state.item;
      },
    },
    bookingService: {
      findFirst: async () => state.bookingService,
    },
  };

  const service = new QuotesService(prisma as any, {} as any, {} as any, {} as any, {} as any);
  (service as any).recalculateQuoteTotals = async (quoteId: string) => {
    state.recalculateCalls.push(quoteId);
  };
  (service as any).hydrateOneOffExternalPackageItem = (item: any) => item;

  return { service, state };
}

function createHotelContractsHarness(quoteItemCount: number) {
  const state = {
    deleted: false,
    quoteItemCount,
  };
  const contract = {
    id: 'contract-1',
    hotelId: 'hotel-1',
    name: 'Contract 2026',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: new Date('2026-12-31T00:00:00.000Z'),
    currency: 'USD',
    allotments: [],
    rates: [],
    supplements: [],
    promotions: [],
    mealPlans: [],
    occupancyRules: [],
    occupancyAuditLogs: [],
    childPolicy: null,
    childPolicyAuditLogs: [],
    cancellationPolicy: null,
    cancellationPolicyAuditLogs: [],
    mealPlanAuditLogs: [],
    supplementAuditLogs: [],
    hotel: { id: 'hotel-1', name: 'Hotel', roomCategories: [] },
    _count: { rates: 0, quoteItems: quoteItemCount, allotments: 0 },
  };
  const prisma = {
    hotelContract: {
      findUnique: async () => ({ ...contract, _count: { ...contract._count, quoteItems: state.quoteItemCount } }),
      delete: async () => {
        state.deleted = true;
        return { id: 'contract-1' };
      },
    },
    booking: {
      findMany: async () => [],
    },
    hotelContractOccupancyRule: { findMany: async () => [] },
    hotelContractChildPolicy: { findMany: async () => [] },
    hotelContractMealPlan: { findMany: async () => [] },
    hotelContractSupplement: { findMany: async () => [] },
    hotelContractCancellationPolicy: { findMany: async () => [] },
  };

  return { service: new HotelContractsService(prisma as any), state };
}

test('hotel contract linked to one draft quote item blocks delete', async () => {
  const { service, state } = createHotelContractsHarness(1);

  await assert.rejects(() => service.remove('contract-1'), /Cannot delete hotel contract because 1 linked quote items exists/);
  assert.equal(state.deleted, false);
});

test('detach quote item hotel contract clears contract reference fields and recalculates totals', async () => {
  const { service, state } = createQuoteServiceHarness();

  const result = await service.detachItemHotelContract('quote-1', 'item-1', actor);

  assert.equal(result.contractId, null);
  assert.deepEqual(state.updatedData, {
    contractId: null,
    seasonName: null,
    roomCategoryId: null,
    occupancyType: null,
    mealPlan: null,
  });
  assert.deepEqual(state.recalculateCalls, ['quote-1']);
});

test('hotel contract delete is allowed once linked quote item count is zero', async () => {
  const { service, state } = createHotelContractsHarness(0);

  await service.remove('contract-1');

  assert.equal(state.deleted, true);
});

test('locked quote item cannot detach hotel contract', async () => {
  const { service } = createQuoteServiceHarness({
    item: {
      quote: {
        id: 'quote-1',
        status: QuoteStatus.ACCEPTED,
        acceptedVersionId: 'version-1',
        clientCompanyId: 'client-company-1',
        brandCompanyId: 'company-1',
        invoice: null,
        bookings: [],
      },
    },
  });

  await assert.rejects(() => service.detachItemHotelContract('quote-1', 'item-1', actor), /Only draft quote items can detach hotel contracts/);
});

test('booked or invoiced quote item cannot detach hotel contract', async () => {
  const booked = createQuoteServiceHarness({
    item: {
      quote: {
        id: 'quote-1',
        status: QuoteStatus.DRAFT,
        acceptedVersionId: null,
        clientCompanyId: 'client-company-1',
        brandCompanyId: 'company-1',
        invoice: null,
        bookings: [{ id: 'booking-1' }],
      },
    },
  });
  await assert.rejects(() => booked.service.detachItemHotelContract('quote-1', 'item-1', actor), /Booked or invoiced quote items cannot detach hotel contracts/);

  const invoiced = createQuoteServiceHarness({
    item: {
      quote: {
        id: 'quote-1',
        status: QuoteStatus.DRAFT,
        acceptedVersionId: null,
        clientCompanyId: 'client-company-1',
        brandCompanyId: 'company-1',
        invoice: { id: 'invoice-1' },
        bookings: [],
      },
    },
  });
  await assert.rejects(() => invoiced.service.detachItemHotelContract('quote-1', 'item-1', actor), /Booked or invoiced quote items cannot detach hotel contracts/);

  const sourceBooked = createQuoteServiceHarness({ bookingService: { id: 'booking-service-1' } });
  await assert.rejects(() => sourceBooked.service.detachItemHotelContract('quote-1', 'item-1', actor), /Booked quote items cannot detach hotel contracts/);
});
