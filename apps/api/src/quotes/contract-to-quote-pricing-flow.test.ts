import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ContractImportStatus } from '@prisma/client';
import { ContractImportsService } from '../contract-imports/contract-imports.service';
import { HotelRatesService } from '../hotel-rates/hotel-rates.service';
import { calculateMultiCurrencyQuoteItemPricing } from './multi-currency-pricing';
import { QuotePricingService } from './quote-pricing.service';
import { QuotesService } from './quotes.service';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

const approvalActor = {
  id: 'user-1',
  email: 'ops@example.com',
  role: 'admin' as const,
  firstName: 'Ops',
  lastName: 'User',
  name: 'Ops User',
  auditLabel: 'Ops User',
};

function createImportedContractPreview(overrides: Record<string, any> = {}) {
  return {
    contractType: 'HOTEL',
    supplier: { name: 'Grand Petra Supplier', isNew: false },
    contract: {
      name: 'Grand Petra 2026',
      validFrom: '2026-06-01',
      validTo: '2026-06-30',
      currency: 'USD',
    },
    hotel: { name: 'Grand Petra Hotel', city: 'Amman', category: '5' },
    roomCategories: [{ name: 'Deluxe', code: 'DLX' }],
    seasons: [],
    rates: [
      {
        roomType: 'Deluxe',
        occupancyType: 'DBL',
        mealPlan: 'BB',
        seasonName: 'Imported',
        seasonFrom: '2026-06-01',
        seasonTo: '2026-06-30',
        cost: 100,
        currency: 'USD',
        pricingBasis: 'PER_PERSON',
      },
    ],
    mealPlans: [],
    taxes: [],
    supplements: overrides.supplements || [
      {
        name: 'Gala Dinner',
        type: 'GALA_DINNER',
        chargeBasis: 'PER_PERSON',
        amount: 30,
        currency: 'USD',
        isMandatory: true,
      },
    ],
    policies: [],
    ratePolicies: [
      {
        policyType: 'CHILD_DISCOUNT',
        ageFrom: 6,
        ageTo: 11,
        percent: 50,
        pricingBasis: 'PER_PERSON',
      },
    ],
    cancellationPolicy: {
      summary: 'Imported cancellation',
      noShowPenaltyType: 'PERCENT',
      noShowPenaltyValue: 100,
      rules: [{ daysBefore: 7, penaltyPercent: 50, notes: 'Seven-day penalty' }],
    },
    childPolicy: null,
    missingFields: [],
    uncertainFields: [],
    warnings: [],
    ...overrides,
  };
}

function createApprovalHarness(extractedJson: Record<string, any>) {
  const state = {
    contract: null as any,
    rate: null as any,
    supplements: [] as any[],
    cancellationPolicy: null as any,
    importUpdates: [] as any[],
  };

  const prisma: Record<string, any> = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(prisma),
    contractImport: {
      findUnique: async () => ({
        id: 'import-1',
        status: ContractImportStatus.ANALYZED,
        supplierId: 'supplier-1',
        sourceFileName: 'contract.xlsx',
        sourceFilePath: 'contract.xlsx',
        extractedJson,
        auditLogs: [],
      }),
      update: async ({ data }: any) => {
        state.importUpdates.push(data);
        return { id: 'import-1', ...data };
      },
    },
    contractImportAuditLog: {
      create: async ({ data }: any) => ({ id: 'audit-1', ...data }),
    },
    supplier: {
      findUnique: async () => ({ id: 'supplier-1', name: 'Grand Petra Supplier', notes: null }),
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 'supplier-1', ...data }),
      update: async ({ data }: any) => ({ id: 'supplier-1', ...data }),
    },
    hotel: {
      findFirst: async () => ({ id: 'hotel-1', name: 'Grand Petra Hotel', supplierId: 'supplier-1' }),
      update: async ({ data }: any) => ({ id: 'hotel-1', ...data }),
      create: async ({ data }: any) => ({ id: 'hotel-1', ...data }),
    },
    hotelContract: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        state.contract = { id: 'contract-1', createdAt: new Date('2026-01-01T00:00:00.000Z'), ...data };
        return state.contract;
      },
      update: async ({ where, data }: any) => {
        state.contract = { id: where.id, ...state.contract, ...data };
        return state.contract;
      },
    },
    hotelRoomCategory: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: 'room-category-1', isActive: true, ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    season: {
      upsert: async ({ create, update }: any) => ({ id: `season-${create.name}`, ...create, ...update }),
    },
    hotelRate: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        state.rate = { id: 'rate-1', createdAt: new Date('2026-01-01T00:00:00.000Z'), ...data };
        return state.rate;
      },
      update: async ({ data }: any) => {
        state.rate = { id: 'rate-1', ...state.rate, ...data };
        return state.rate;
      },
    },
    hotelContractSupplement: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const supplement = { id: `supplement-${state.supplements.length + 1}`, ...data };
        state.supplements.push(supplement);
        return supplement;
      },
      update: async ({ data }: any) => ({ id: 'supplement-1', ...data }),
      deleteMany: async () => ({ count: 0 }),
    },
    hotelContractMealPlan: {
      upsert: async ({ create }: any) => ({ id: 'meal-plan-1', ...create }),
      deleteMany: async () => ({ count: 0 }),
    },
    hotelContractCancellationPolicy: {
      findUnique: async () => null,
      upsert: async ({ create }: any) => {
        state.cancellationPolicy = { id: 'cancellation-policy-1', ...create };
        return state.cancellationPolicy;
      },
      delete: async () => ({ id: 'old-cancellation-policy' }),
    },
    hotelContractCancellationRule: {
      deleteMany: async () => ({ count: 0 }),
    },
    hotelContractChildPolicy: {
      findUnique: async () => null,
      upsert: async ({ create }: any) => ({ id: 'child-policy-1', ...create }),
      delete: async () => ({ id: 'old-child-policy' }),
    },
    hotelContractChildPolicyBand: {
      deleteMany: async () => ({ count: 0 }),
    },
  };

  return { service: new ContractImportsService(prisma as any), state };
}

function createHotelRatesService(state: ReturnType<typeof createApprovalHarness>['state']) {
  return new HotelRatesService({
    hotelRate: {
      findMany: async () => [
        {
          ...state.rate,
          contract: {
            ...state.contract,
            hotel: { id: 'hotel-1', name: 'Grand Petra Hotel' },
            supplements: state.supplements,
          },
          roomCategory: { id: 'room-category-1', name: 'Deluxe', code: 'DLX', isActive: true },
        },
      ],
    },
  } as any);
}

function createHotelRatesServiceWithRates(rates: any[]) {
  return new HotelRatesService({
    hotelRate: {
      findMany: async ({ where }: any = {}) =>
        rates.filter((rate) => {
          return (
            (!where?.hotelId || rate.hotelId === where.hotelId) &&
            (!where?.contractId || rate.contractId === where.contractId)
          );
        }),
    },
  } as any);
}

function createQuotesService() {
  return new QuotesService(
    { quote: { findFirst: async () => null } } as any,
    {} as any,
    { findMatchingRate: async () => null } as any,
    { evaluate: async () => null } as any,
    new QuotePricingService(),
  );
}

function selectedSupplements(supplements: any[], selectedIds: string[] = []) {
  const selected = new Set(selectedIds);
  return supplements.filter((supplement) => supplement.isMandatory || selected.has(supplement.id));
}

function createProposalForHotelLine(values: {
  supplements: any[];
  totalCost: number;
  totalSell?: number;
  ratePolicies?: any[];
  pricingBasis?: string;
}) {
  return mapQuoteToProposalV3({
    id: 'quote-1',
    quoteNumber: 'Q-2026-0001',
    quoteCurrency: 'USD',
    title: 'Jordan Family Journey',
    createdAt: new Date('2026-04-27T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-10T00:00:00.000Z'),
    nightCount: 1,
    adults: 2,
    children: 1,
    totalCost: values.totalCost,
    totalSell: values.totalSell ?? values.totalCost,
    pricePerPax: Number(((values.totalSell ?? values.totalCost) / 3).toFixed(2)),
    quoteOptions: [],
    itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Day 1: Amman', description: 'Arrival.' }],
    quoteItems: [
      {
        id: 'item-1',
        itineraryId: 'day-1',
        serviceDate: new Date('2026-06-10T00:00:00.000Z'),
        service: { name: 'Grand Petra Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
        hotel: { name: 'Grand Petra Hotel', city: 'Amman' },
        contract: { name: 'Grand Petra 2026' },
        roomCategory: { name: 'Deluxe' },
        occupancyType: 'DBL',
        mealPlan: 'BB',
        pricingBasis: values.pricingBasis || 'PER_PERSON',
        ratePolicies: values.ratePolicies || [],
        supplements: values.supplements,
        totalCost: values.totalCost,
        totalSell: values.totalSell ?? values.totalCost,
      },
    ],
  });
}

function createContractRate(overrides: Record<string, any> = {}) {
  const contractId = overrides.contractId || 'contract-a';
  return {
    id: overrides.id || `${contractId}-rate`,
    contractId,
    hotelId: 'hotel-1',
    seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
    seasonTo: new Date('2026-06-30T00:00:00.000Z'),
    roomCategoryId: 'room-category-1',
    occupancyType: 'DBL',
    mealPlan: 'BB',
    pricingBasis: overrides.pricingBasis || 'PER_PERSON',
    cost: overrides.cost ?? 100,
    createdAt: overrides.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    contract: {
      id: contractId,
      name: overrides.contractName || contractId,
      ratePolicies: overrides.ratePolicies || [],
      hotel: { id: 'hotel-1', name: 'Grand Petra Hotel' },
      supplements: overrides.supplements || [],
    },
    roomCategory: { id: 'room-category-1', name: 'Deluxe', code: 'DLX', isActive: true },
  };
}

async function calculateQuoteHotelSnapshot(
  rates: any[],
  values: {
    contractId: string;
    selectedSupplementIds?: string[];
    markupPercent?: number;
  },
) {
  const hotelCost = await createHotelRatesServiceWithRates(rates).calculateHotelCost({
    hotelId: 'hotel-1',
    contractId: values.contractId,
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-11',
    occupancy: 'DBL' as any,
    mealPlan: 'BB' as any,
    pax: 3,
    adults: 2,
    childrenAges: [8],
    roomCategoryId: 'room-category-1',
    selectedSupplementIds: values.selectedSupplementIds,
  });
  const pricing = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: { costBaseAmount: hotelCost.totalCost, costCurrency: 'USD' },
    pricingUnits: { pricingUnits: 1, roomCount: 1, nightCount: 1, paxCount: 3 },
    quoteCurrency: 'USD',
    markupPercent: 0,
  });
  const selling = (createQuotesService() as any).applyQuoteItemSellingLayer({
    pricing,
    cost: hotelCost.totalCost,
    markupPercent: values.markupPercent ?? 20,
    markupAmount: null,
    sellPriceOverride: null,
  });
  const selectedRate = rates.find((rate) => rate.contractId === values.contractId);

  return {
    contractId: values.contractId,
    pricingBasis: selectedRate.pricingBasis,
    ratePolicies: selectedRate.contract.ratePolicies,
    supplements: selectedSupplements(selectedRate.contract.supplements, values.selectedSupplementIds),
    totalCost: selling.totalCost,
    totalSell: selling.totalSell,
    hotelCost,
  };
}

test('regression: imported contract approval drives quote pricing and proposal export consistently', async () => {
  const preview = createImportedContractPreview();
  const { service: importService, state } = createApprovalHarness(preview);

  await importService.approve('import-1', undefined, approvalActor);

  assert.equal(state.rate.pricingBasis, 'PER_PERSON');
  assert.equal(state.contract.ratePolicies[0].policyType, 'CHILD_DISCOUNT');
  assert.equal(state.supplements[0].type, 'GALA_DINNER');
  assert.equal(state.cancellationPolicy.rules.create[0].windowFromValue, 7);
  assert.equal(state.cancellationPolicy.rules.create[0].penaltyValue, 50);

  const hotelRates = createHotelRatesService(state);
  const hotelCost = await hotelRates.calculateHotelCost({
    hotelId: 'hotel-1',
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-11',
    occupancy: 'DBL' as any,
    mealPlan: 'BB' as any,
    pax: 3,
    adults: 2,
    childrenAges: [8],
    roomCategoryId: 'room-category-1',
  });

  assert.equal(hotelCost.adultsCost, 200);
  assert.equal(hotelCost.childrenCost, 50);
  assert.equal(hotelCost.supplementsCost, 60);
  assert.equal(hotelCost.totalCost, 310);

  const basePricing = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: { costBaseAmount: hotelCost.totalCost, costCurrency: 'USD' },
    pricingUnits: { pricingUnits: 1, roomCount: 1, nightCount: 1, paxCount: 3 },
    quoteCurrency: 'USD',
    markupPercent: 0,
  });
  const selling = (createQuotesService() as any).applyQuoteItemSellingLayer({
    pricing: basePricing,
    cost: hotelCost.totalCost,
    markupPercent: 20,
    markupAmount: null,
    sellPriceOverride: null,
  });
  const marginAmount = Number((selling.totalSell - selling.totalCost).toFixed(2));
  const marginPercent = Number(((marginAmount / selling.totalSell) * 100).toFixed(2));

  assert.equal(selling.totalCost, 310);
  assert.equal(selling.totalSell, 372);
  assert.equal(marginAmount, 62);
  assert.equal(marginPercent, 16.67);

  const proposal = mapQuoteToProposalV3({
    id: 'quote-1',
    quoteNumber: 'Q-2026-0001',
    quoteCurrency: 'USD',
    title: 'Jordan Family Journey',
    createdAt: new Date('2026-04-27T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-10T00:00:00.000Z'),
    nightCount: 1,
    adults: 2,
    children: 1,
    totalCost: selling.totalCost,
    totalSell: selling.totalSell,
    pricePerPax: 124,
    quoteOptions: [],
    itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Day 1: Amman', description: 'Arrival.' }],
    quoteItems: [
      {
        id: 'item-1',
        itineraryId: 'day-1',
        serviceDate: new Date('2026-06-10T00:00:00.000Z'),
        service: { name: 'Grand Petra Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
        hotel: { name: 'Grand Petra Hotel', city: 'Amman' },
        contract: { name: state.contract.name },
        roomCategory: { name: 'Deluxe' },
        occupancyType: 'DBL',
        mealPlan: 'BB',
        pricingBasis: state.rate.pricingBasis,
        ratePolicies: state.contract.ratePolicies,
        supplements: state.supplements,
        markupPercent: 20,
        totalCost: selling.totalCost,
        totalSell: selling.totalSell,
      },
    ],
  });

  assert.ok(proposal.investment.noteLines.includes('Grand Petra Hotel rate basis: per person/night'));
  assert.ok(proposal.investment.noteLines.includes('Child policy: Children 6-11 pay 50%'));
  assert.match(proposal.investment.noteLines.find((line) => line.startsWith('Supplements:')) || '', /Gala Dinner \$30\.00 per person/);
  assert.ok(proposal.investment.noteLines.includes('PDF sell total: $372.00'));
});

test('mandatory supplements are included automatically in quote cost and proposal source context', async () => {
  const { service: importService, state } = createApprovalHarness(createImportedContractPreview());

  await importService.approve('import-1', undefined, approvalActor);

  const hotelCost = await createHotelRatesService(state).calculateHotelCost({
    hotelId: 'hotel-1',
    contractId: state.contract.id,
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-11',
    occupancy: 'DBL' as any,
    mealPlan: 'BB' as any,
    pax: 3,
    adults: 2,
    childrenAges: [8],
    roomCategoryId: 'room-category-1',
  });
  const proposal = createProposalForHotelLine({
    supplements: selectedSupplements(state.supplements),
    totalCost: hotelCost.totalCost,
    ratePolicies: state.contract.ratePolicies,
  });
  const supplementsLine = proposal.investment.noteLines.find((line) => line.startsWith('Supplements:')) || '';

  assert.equal(hotelCost.supplementsCost, 60);
  assert.match(supplementsLine, /Gala Dinner \$30\.00 per person/);
  assert.ok(proposal.investment.noteLines.includes('PDF sell total: $310.00'));
});

test('optional supplements are excluded by default and included only when selected', async () => {
  const { service: importService, state } = createApprovalHarness(
    createImportedContractPreview({
      supplements: [
        {
          name: 'Extra bed',
          type: 'EXTRA_BED',
          chargeBasis: 'PER_STAY',
          amount: 25,
          currency: 'USD',
          isMandatory: false,
        },
      ],
    }),
  );

  await importService.approve('import-1', undefined, approvalActor);

  const defaultCost = await createHotelRatesService(state).calculateHotelCost({
    hotelId: 'hotel-1',
    contractId: state.contract.id,
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-11',
    occupancy: 'DBL' as any,
    mealPlan: 'BB' as any,
    pax: 3,
    adults: 2,
    childrenAges: [8],
    roomCategoryId: 'room-category-1',
  });
  const selectedCost = await createHotelRatesService(state).calculateHotelCost({
    hotelId: 'hotel-1',
    contractId: state.contract.id,
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-11',
    occupancy: 'DBL' as any,
    mealPlan: 'BB' as any,
    pax: 3,
    adults: 2,
    childrenAges: [8],
    roomCategoryId: 'room-category-1',
    selectedSupplementIds: [state.supplements[0].id],
  });
  const defaultProposal = createProposalForHotelLine({
    supplements: selectedSupplements(state.supplements),
    totalCost: defaultCost.totalCost,
    ratePolicies: state.contract.ratePolicies,
  });
  const selectedProposal = createProposalForHotelLine({
    supplements: selectedSupplements(state.supplements, [state.supplements[0].id]),
    totalCost: selectedCost.totalCost,
    ratePolicies: state.contract.ratePolicies,
  });

  assert.equal(defaultCost.supplementsCost, 0);
  assert.equal(selectedCost.supplementsCost, 25);
  assert.equal(defaultProposal.investment.noteLines.some((line) => /Extra Bed/.test(line)), false);
  assert.match(selectedProposal.investment.noteLines.find((line) => line.startsWith('Supplements:')) || '', /Extra Bed \$25\.00 one-time/);
  assert.ok(selectedProposal.investment.noteLines.includes('PDF sell total: $275.00'));
});

test('mixed mandatory gala dinner and selected optional extra bed calculate and export distinctly', async () => {
  const { service: importService, state } = createApprovalHarness(
    createImportedContractPreview({
      supplements: [
        { name: 'Gala Dinner', type: 'GALA_DINNER', chargeBasis: 'PER_PERSON', amount: 30, currency: 'USD', isMandatory: true },
        { name: 'Extra bed', type: 'EXTRA_BED', chargeBasis: 'PER_STAY', amount: 25, currency: 'USD', isMandatory: false },
        { name: 'Dinner supplement', type: 'EXTRA_DINNER', chargeBasis: 'PER_PERSON', amount: 15, currency: 'USD', isMandatory: false },
      ],
    }),
  );

  await importService.approve('import-1', undefined, approvalActor);

  const extraBed = state.supplements.find((supplement: any) => supplement.type === 'EXTRA_BED');
  const hotelCost = await createHotelRatesService(state).calculateHotelCost({
    hotelId: 'hotel-1',
    contractId: state.contract.id,
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-11',
    occupancy: 'DBL' as any,
    mealPlan: 'BB' as any,
    pax: 3,
    adults: 2,
    childrenAges: [8],
    roomCategoryId: 'room-category-1',
    selectedSupplementIds: [extraBed.id],
  });
  const proposal = createProposalForHotelLine({
    supplements: selectedSupplements(state.supplements, [extraBed.id]),
    totalCost: hotelCost.totalCost,
    ratePolicies: state.contract.ratePolicies,
  });
  const supplementsLine = proposal.investment.noteLines.find((line) => line.startsWith('Supplements:')) || '';

  assert.deepEqual(
    state.supplements.map((supplement: any) => supplement.type),
    ['GALA_DINNER', 'EXTRA_BED', 'EXTRA_DINNER'],
  );
  assert.equal(hotelCost.supplementsCost, 85);
  assert.match(supplementsLine, /Gala Dinner \$30\.00 per person/);
  assert.match(supplementsLine, /Extra Bed \$25\.00 one-time/);
  assert.doesNotMatch(supplementsLine, /Extra Dinner/);
  assert.ok(proposal.investment.noteLines.includes('PDF sell total: $335.00'));
});

test('quote supplement pricing is scoped to the selected contract version', async () => {
  const rates = [
    {
      id: 'old-rate',
      contractId: 'contract-old',
      hotelId: 'hotel-1',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
      roomCategoryId: 'room-category-1',
      occupancyType: 'DBL',
      mealPlan: 'BB',
      pricingBasis: 'PER_PERSON',
      cost: 100,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      contract: {
        id: 'contract-old',
        ratePolicies: [],
        hotel: { id: 'hotel-1', name: 'Grand Petra Hotel' },
        supplements: [{ id: 'old-dinner', type: 'EXTRA_DINNER', amount: 999, chargeBasis: 'PER_PERSON', isMandatory: true, isActive: true }],
      },
      roomCategory: { id: 'room-category-1', name: 'Deluxe', isActive: true },
    },
    {
      id: 'new-rate',
      contractId: 'contract-new',
      hotelId: 'hotel-1',
      seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
      seasonTo: new Date('2026-06-30T00:00:00.000Z'),
      roomCategoryId: 'room-category-1',
      occupancyType: 'DBL',
      mealPlan: 'BB',
      pricingBasis: 'PER_PERSON',
      cost: 100,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      contract: {
        id: 'contract-new',
        ratePolicies: [],
        hotel: { id: 'hotel-1', name: 'Grand Petra Hotel' },
        supplements: [{ id: 'new-gala', type: 'GALA_DINNER', amount: 30, chargeBasis: 'PER_PERSON', isMandatory: true, isActive: true }],
      },
      roomCategory: { id: 'room-category-1', name: 'Deluxe', isActive: true },
    },
  ];

  const hotelCost = await createHotelRatesServiceWithRates(rates).calculateHotelCost({
    hotelId: 'hotel-1',
    contractId: 'contract-new',
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-11',
    occupancy: 'DBL' as any,
    mealPlan: 'BB' as any,
    pax: 2,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-category-1',
  });

  assert.equal(hotelCost.supplementsCost, 60);
  assert.equal(hotelCost.totalCost, 260);
});

test('quote bound to contract version keeps using that version until explicitly switched', async () => {
  const contractA = createContractRate({
    contractId: 'contract-a',
    pricingBasis: 'PER_PERSON',
    cost: 100,
    ratePolicies: [{ policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 }],
    supplements: [{ id: 'a-gala', type: 'GALA_DINNER', amount: 30, chargeBasis: 'PER_PERSON', isMandatory: true, isActive: true }],
  });
  const contractB = createContractRate({
    contractId: 'contract-b',
    pricingBasis: 'PER_ROOM',
    cost: 180,
    ratePolicies: [{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 11 }],
    supplements: [{ id: 'b-dinner', type: 'EXTRA_DINNER', amount: 20, chargeBasis: 'PER_ROOM', isMandatory: true, isActive: true }],
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  });

  const originalQuote = await calculateQuoteHotelSnapshot([contractA], { contractId: 'contract-a' });
  const afterVersionCreated = await calculateQuoteHotelSnapshot([contractA, contractB], { contractId: originalQuote.contractId });
  const switchedQuote = await calculateQuoteHotelSnapshot([contractA, contractB], { contractId: 'contract-b' });

  assert.equal(originalQuote.totalCost, 310);
  assert.equal(afterVersionCreated.totalCost, 310);
  assert.equal(afterVersionCreated.pricingBasis, 'PER_PERSON');
  assert.equal(afterVersionCreated.supplements.map((supplement: any) => supplement.id).join(','), 'a-gala');
  assert.equal(switchedQuote.totalCost, 200);
  assert.equal(switchedQuote.pricingBasis, 'PER_ROOM');
  assert.equal(switchedQuote.supplements.map((supplement: any) => supplement.id).join(','), 'b-dinner');
});

test('contract replace affects new quotes but existing quote snapshot changes only after recalculation', async () => {
  const oldContract = createContractRate({
    contractId: 'contract-existing',
    pricingBasis: 'PER_PERSON',
    cost: 100,
    ratePolicies: [{ policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 }],
    supplements: [{ id: 'old-gala', type: 'GALA_DINNER', amount: 30, chargeBasis: 'PER_PERSON', isMandatory: true, isActive: true }],
  });
  const replacedContract = createContractRate({
    contractId: 'contract-existing',
    pricingBasis: 'PER_ROOM',
    cost: 180,
    ratePolicies: [{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 11 }],
    supplements: [{ id: 'new-dinner', type: 'EXTRA_DINNER', amount: 20, chargeBasis: 'PER_ROOM', isMandatory: true, isActive: true }],
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  });

  const existingQuoteSnapshot = await calculateQuoteHotelSnapshot([oldContract], { contractId: 'contract-existing' });
  const newQuoteAfterReplace = await calculateQuoteHotelSnapshot([replacedContract], { contractId: 'contract-existing' });

  assert.equal(existingQuoteSnapshot.totalCost, 310);
  assert.equal(existingQuoteSnapshot.pricingBasis, 'PER_PERSON');
  assert.equal(existingQuoteSnapshot.supplements.map((supplement: any) => supplement.id).join(','), 'old-gala');
  assert.equal(newQuoteAfterReplace.totalCost, 200);
  assert.equal(newQuoteAfterReplace.pricingBasis, 'PER_ROOM');
  assert.equal(newQuoteAfterReplace.supplements.map((supplement: any) => supplement.id).join(','), 'new-dinner');
  assert.equal(existingQuoteSnapshot.totalCost, 310);
});

test('explicit quote recalculation refreshes pricing basis supplements and child policies from latest contract data', async () => {
  const oldContract = createContractRate({
    contractId: 'contract-existing',
    pricingBasis: 'PER_PERSON',
    cost: 100,
    ratePolicies: [{ policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 }],
    supplements: [
      { id: 'old-gala', type: 'GALA_DINNER', amount: 30, chargeBasis: 'PER_PERSON', isMandatory: true, isActive: true },
      { id: 'removed-bed', type: 'EXTRA_BED', amount: 25, chargeBasis: 'PER_STAY', isMandatory: false, isActive: true },
    ],
  });
  const replacedContract = createContractRate({
    contractId: 'contract-existing',
    pricingBasis: 'PER_ROOM',
    cost: 180,
    ratePolicies: [{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 11 }],
    supplements: [
      { id: 'new-dinner', type: 'EXTRA_DINNER', amount: 20, chargeBasis: 'PER_ROOM', isMandatory: true, isActive: true },
      { id: 'new-gala', type: 'GALA_DINNER', amount: 40, chargeBasis: 'PER_PERSON', isMandatory: false, isActive: true },
    ],
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  });

  const staleQuoteSnapshot = await calculateQuoteHotelSnapshot([oldContract], {
    contractId: 'contract-existing',
    selectedSupplementIds: ['removed-bed'],
  });
  const recalculatedQuote = await calculateQuoteHotelSnapshot([replacedContract], {
    contractId: 'contract-existing',
    selectedSupplementIds: ['removed-bed', 'new-gala'],
  });
  const proposal = createProposalForHotelLine({
    pricingBasis: recalculatedQuote.pricingBasis,
    ratePolicies: recalculatedQuote.ratePolicies,
    supplements: recalculatedQuote.supplements,
    totalCost: recalculatedQuote.totalCost,
    totalSell: recalculatedQuote.totalSell,
  });
  const supplementsLine = proposal.investment.noteLines.find((line) => line.startsWith('Supplements:')) || '';

  assert.equal(staleQuoteSnapshot.totalCost, 335);
  assert.equal(staleQuoteSnapshot.supplements.some((supplement: any) => supplement.id === 'removed-bed'), true);
  assert.equal(recalculatedQuote.totalCost, 280);
  assert.equal(recalculatedQuote.totalSell, 336);
  assert.equal(recalculatedQuote.pricingBasis, 'PER_ROOM');
  assert.equal(recalculatedQuote.ratePolicies[0].policyType, 'CHILD_FREE');
  assert.equal(recalculatedQuote.supplements.some((supplement: any) => supplement.id === 'removed-bed'), false);
  assert.equal(recalculatedQuote.supplements.some((supplement: any) => supplement.id === 'new-gala'), true);
  assert.match(supplementsLine, /Extra Dinner \$20\.00 per room/);
  assert.match(supplementsLine, /Gala Dinner \$40\.00 per person/);
  assert.doesNotMatch(supplementsLine, /Extra Bed/);
  assert.ok(proposal.investment.noteLines.includes('Grand Petra Hotel rate basis: per room/night'));
  assert.ok(proposal.investment.noteLines.includes('Child policy: Children 0-11 free'));
  assert.ok(proposal.investment.noteLines.includes('PDF sell total: $336.00'));
});

test('recalculated quote contains no mixed old and new contract data in API summary or PDF', async () => {
  const oldContract = createContractRate({
    contractId: 'contract-existing',
    pricingBasis: 'PER_PERSON',
    cost: 100,
    ratePolicies: [{ policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 }],
    supplements: [{ id: 'old-gala', type: 'GALA_DINNER', amount: 30, chargeBasis: 'PER_PERSON', isMandatory: true, isActive: true }],
  });
  const replacedContract = createContractRate({
    contractId: 'contract-existing',
    pricingBasis: 'PER_ROOM',
    cost: 180,
    ratePolicies: [{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 11 }],
    supplements: [{ id: 'new-dinner', type: 'EXTRA_DINNER', amount: 20, chargeBasis: 'PER_ROOM', isMandatory: true, isActive: true }],
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  });

  const staleSnapshot = await calculateQuoteHotelSnapshot([oldContract], { contractId: 'contract-existing' });
  const recalculated = await calculateQuoteHotelSnapshot([replacedContract], { contractId: 'contract-existing' });
  const proposal = createProposalForHotelLine({
    pricingBasis: recalculated.pricingBasis,
    ratePolicies: recalculated.ratePolicies,
    supplements: recalculated.supplements,
    totalCost: recalculated.totalCost,
    totalSell: recalculated.totalSell,
  });
  const pdfLines = proposal.investment.noteLines.join('\n');

  assert.equal(staleSnapshot.totalCost, 310);
  assert.equal(recalculated.totalCost, 200);
  assert.equal(recalculated.pricingBasis, 'PER_ROOM');
  assert.equal(recalculated.supplements.map((supplement: any) => supplement.id).join(','), 'new-dinner');
  assert.match(pdfLines, /per room\/night/);
  assert.match(pdfLines, /Extra Dinner \$20\.00 per room/);
  assert.match(pdfLines, /PDF sell total: \$240\.00/);
  assert.doesNotMatch(pdfLines, /PDF total cost|PDF margin/);
  assert.doesNotMatch(pdfLines, /per person\/night/);
  assert.doesNotMatch(pdfLines, /Gala Dinner \$30\.00/);
  assert.doesNotMatch(pdfLines, /Children 6-11 pay 50%/);
});

test('replaced contract supplement pricing does not leak removed old supplements', async () => {
  const replacedRate = {
    id: 'rate-1',
    contractId: 'contract-existing',
    hotelId: 'hotel-1',
    seasonFrom: new Date('2026-06-01T00:00:00.000Z'),
    seasonTo: new Date('2026-06-30T00:00:00.000Z'),
    roomCategoryId: 'room-category-1',
    occupancyType: 'DBL',
    mealPlan: 'BB',
    pricingBasis: 'PER_PERSON',
    cost: 100,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    contract: {
      id: 'contract-existing',
      ratePolicies: [],
      hotel: { id: 'hotel-1', name: 'Grand Petra Hotel' },
      supplements: [{ id: 'new-gala', type: 'GALA_DINNER', amount: 30, chargeBasis: 'PER_PERSON', isMandatory: true, isActive: true }],
    },
    roomCategory: { id: 'room-category-1', name: 'Deluxe', isActive: true },
  };

  const hotelCost = await createHotelRatesServiceWithRates([replacedRate]).calculateHotelCost({
    hotelId: 'hotel-1',
    contractId: 'contract-existing',
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-11',
    occupancy: 'DBL' as any,
    mealPlan: 'BB' as any,
    pax: 2,
    adults: 2,
    childrenAges: [],
    roomCategoryId: 'room-category-1',
    selectedSupplementIds: ['removed-extra-bed'],
  });
  const proposal = createProposalForHotelLine({
    supplements: selectedSupplements(replacedRate.contract.supplements, ['removed-extra-bed']),
    totalCost: hotelCost.totalCost,
  });
  const supplementsLine = proposal.investment.noteLines.find((line) => line.startsWith('Supplements:')) || '';

  assert.equal(hotelCost.supplementsCost, 60);
  assert.match(supplementsLine, /Gala Dinner/);
  assert.doesNotMatch(supplementsLine, /Extra Bed/);
});
