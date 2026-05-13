import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ContractImportStatus, ContractImportType } from '@prisma/client';
import { ContractImportsService } from './contract-imports.service';

function createService(prisma: Record<string, any> = {}) {
  return new ContractImportsService({
    hotelContract: {
      findFirst: async () => null,
      ...(prisma.hotelContract || {}),
    },
    contractImport: {
      findUnique: async () => null,
      update: async ({ data }: any) => ({ id: 'import-1', ...data }),
      ...(prisma.contractImport || {}),
    },
    contractImportAuditLog: {
      create: async ({ data }: any) => ({ id: 'audit-1', ...data }),
      ...(prisma.contractImportAuditLog || {}),
    },
    ...prisma,
  } as any);
}

function baseApprovedData(overrides: Record<string, any> = {}) {
  return {
    contractType: 'HOTEL',
    supplier: { name: 'Grand Petra Supplier', isNew: false },
    contract: {
      name: 'Grand Petra 2026',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      currency: 'JOD',
      ...(overrides.contract || {}),
    },
    hotel: { name: 'Grand Petra', city: 'Amman', category: '5', ...(overrides.hotel || {}) },
    roomCategories: overrides.roomCategories || [{ name: 'Deluxe', code: 'DLX' }],
    seasons: overrides.seasons || [],
    rates: [
      {
        roomType: 'Deluxe',
        occupancyType: 'DBL',
        mealPlan: 'BB',
        seasonName: 'Imported',
        seasonFrom: '2026-01-01',
        seasonTo: '2026-12-31',
        cost: 100,
        currency: 'JOD',
        pricingBasis: 'PER_PERSON',
        ...(overrides.rate || {}),
      },
      ...(overrides.extraRates || []),
    ],
    mealPlans: [],
    taxes: [],
    supplements: overrides.supplements || [],
    policies: [],
    ratePolicies: overrides.ratePolicies || [],
    cancellationPolicy: overrides.cancellationPolicy ?? null,
    childPolicy: overrides.childPolicy ?? null,
    missingFields: [],
    uncertainFields: [],
    warnings: [],
  };
}

const approvalActor = {
  id: 'user-1',
  email: 'ops@example.com',
  role: 'admin' as const,
  firstName: 'Ops',
  lastName: 'User',
  name: 'Ops User',
  auditLabel: 'Ops User',
};

function createHotelApprovalHarness(options: {
  extractedJson: Record<string, any>;
  existingContract?: { id: string; name?: string; hotelId?: string };
  failRateCreate?: boolean;
}): { service: ContractImportsService; state: Record<string, any> } {
  const state = {
    contractCreates: [] as any[],
    contractUpdates: [] as any[],
    rateCreates: [] as any[],
    supplementCreates: [] as any[],
    cancellationPolicyUpserts: [] as any[],
    rateDeletes: [] as any[],
    supplementDeletes: [] as any[],
    mealPlanDeletes: [] as any[],
    importUpdates: [] as any[],
    supplierUpdates: [] as any[],
    transactionRollbacks: 0,
    importStatus: ContractImportStatus.ANALYZED,
  };
  let contractCreateCount = 0;
  let roomCategoryCreateCount = 0;

  const cloneState = () => JSON.parse(JSON.stringify(state));
  const restoreState = (snapshot: Record<string, any>) => {
    for (const key of Object.keys(state) as Array<keyof typeof state>) {
      (state as any)[key] = snapshot[key];
    }
  };

  const prisma: Record<string, any> = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const snapshot = cloneState();
      try {
        return await callback(prisma);
      } catch (error) {
        restoreState(snapshot);
        state.transactionRollbacks += 1;
        throw error;
      }
    },
    contractImport: {
      findUnique: async () => ({
        id: 'import-1',
        status: state.importStatus,
        supplierId: 'supplier-1',
        sourceFileName: 'contract.xlsx',
        sourceFilePath: 'contract.xlsx',
        extractedJson: options.extractedJson,
        auditLogs: [],
      }),
      updateMany: async ({ where, data }: any) => {
        if (where.id === 'import-1' && where.status === state.importStatus) {
          state.importStatus = data.status;
          state.importUpdates.push(data);
          return { count: 1 };
        }
        return { count: 0 };
      },
      update: async ({ data }: any) => {
        if (data.status) {
          state.importStatus = data.status;
        }
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
      update: async ({ data }: any) => {
        state.supplierUpdates.push(data);
        return { id: 'supplier-1', name: 'Grand Petra Supplier', ...data };
      },
    },
    hotel: {
      findFirst: async () => ({ id: 'hotel-1', name: 'Grand Petra', supplierId: 'supplier-1' }),
      update: async ({ data }: any) => ({ id: 'hotel-1', ...data }),
      create: async ({ data }: any) => ({ id: 'hotel-1', ...data }),
    },
    hotelContract: {
      findFirst: async ({ where, select }: any = {}) => {
        if (select?.id || !where?.hotelId) {
          return null;
        }
        return options.existingContract
          ? {
              id: options.existingContract.id,
              name: options.existingContract.name || 'Grand Petra 2026',
              hotelId: options.existingContract.hotelId || 'hotel-1',
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
              validTo: new Date('2026-12-31T00:00:00.000Z'),
              createdAt: new Date('2025-01-01T00:00:00.000Z'),
            }
          : null;
      },
      create: async ({ data }: any) => {
        contractCreateCount += 1;
        const contract = { id: `contract-version-${contractCreateCount}`, createdAt: new Date(), ...data };
        state.contractCreates.push(contract);
        return contract;
      },
      update: async ({ where, data }: any) => {
        const contract = { id: where.id, createdAt: new Date(), ...data };
        state.contractUpdates.push(contract);
        return contract;
      },
    },
    hotelRoomCategory: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        roomCategoryCreateCount += 1;
        return { id: `room-category-${roomCategoryCreateCount}`, isActive: true, ...data };
      },
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    season: {
      upsert: async ({ create, update }: any) => ({ id: `season-${create.name}`, ...create, ...update }),
    },
    hotelRate: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        if (options.failRateCreate) {
          throw new Error('rate create failed for row 1');
        }
        state.rateCreates.push(data);
        return { id: `rate-${state.rateCreates.length}`, ...data };
      },
      update: async ({ data }: any) => ({ id: 'rate-updated', ...data }),
      deleteMany: async ({ where }: any) => {
        state.rateDeletes.push(where);
        return { count: 1 };
      },
    },
    hotelContractSupplement: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        state.supplementCreates.push(data);
        return { id: `supplement-${state.supplementCreates.length}`, ...data };
      },
      update: async ({ data }: any) => ({ id: 'supplement-updated', ...data }),
      deleteMany: async ({ where }: any) => {
        state.supplementDeletes.push(where);
        return { count: 1 };
      },
    },
    hotelContractMealPlan: {
      upsert: async ({ create }: any) => ({ id: 'meal-plan-1', ...create }),
      deleteMany: async ({ where }: any) => {
        state.mealPlanDeletes.push(where);
        return { count: 1 };
      },
    },
    hotelContractCancellationPolicy: {
      findUnique: async () => null,
      delete: async () => ({ id: 'old-cancellation-policy' }),
      upsert: async ({ create, update }: any) => {
        state.cancellationPolicyUpserts.push({ create, update });
        return { id: 'cancellation-policy-1', ...create };
      },
    },
    hotelContractCancellationRule: {
      deleteMany: async () => ({ count: 1 }),
    },
    hotelContractChildPolicy: {
      findUnique: async () => null,
      delete: async () => ({ id: 'old-child-policy' }),
      upsert: async ({ create }: any) => ({ id: 'child-policy-1', ...create }),
    },
    hotelContractChildPolicyBand: {
      deleteMany: async () => ({ count: 1 }),
    },
  };

  return { service: createService(prisma), state };
}

function normalizeApproved(service: ContractImportsService, data: Record<string, any>) {
  return (service as any).normalizeApprovedPreview(data);
}

function buildWarnings(service: ContractImportsService, preview: Record<string, any>) {
  return (service as any).buildWarnings(preview) as Array<{ severity: string; field: string; message: string }>;
}

test('contract import validation flags malformed contract and rate dates with field context', () => {
  const service = createService();
  const preview = normalizeApproved(
    service,
    baseApprovedData({
      contract: { validFrom: 'not-a-date' },
      rate: { seasonFrom: 'bad-season-date' },
    }),
  );

  const warnings = buildWarnings(service, preview);

  assert.ok(warnings.some((warning) => warning.field === 'contract.validFrom' && /Invalid contract valid from date/.test(warning.message)));
  assert.ok(warnings.some((warning) => warning.field === 'rates.1.seasonFrom' && /Invalid rate 1 season from date/.test(warning.message)));
});

test('contract import validation accepts valid ISO and Excel-style date strings', () => {
  const service = createService();
  const preview = normalizeApproved(
    service,
    baseApprovedData({
      contract: { validFrom: '01/01/2026', validTo: '31/12/2026' },
      rate: { seasonFrom: '01/01/2026', seasonTo: '31/12/2026' },
    }),
  );

  const warnings = buildWarnings(service, preview);

  assert.equal(warnings.some((warning) => /date/i.test(warning.message)), false);
});

test('contract import approval normalizes imported date-times to date-only season bounds', async () => {
  const { service, state } = createHotelApprovalHarness({
    extractedJson: baseApprovedData({
      contract: {
        validFrom: '2026-01-01T23:00:00-05:00',
        validTo: '2026-12-31T01:00:00+09:00',
      },
      rate: {
        seasonFrom: '2026-06-01T23:30:00-05:00',
        seasonTo: '2026-06-30T01:00:00+09:00',
      },
    }),
  });

  await service.approve('import-1', undefined, approvalActor);

  assert.equal(state.contractCreates[0].validFrom.toISOString().slice(0, 10), '2026-01-01');
  assert.equal(state.contractCreates[0].validTo.toISOString().slice(0, 10), '2026-12-31');
  assert.equal(state.rateCreates[0].seasonFrom.toISOString().slice(0, 10), '2026-06-01');
  assert.equal(state.rateCreates[0].seasonTo.toISOString().slice(0, 10), '2026-06-30');
});

test('contract import validation keeps empty numeric fields undefined/null and flags required prices', () => {
  const service = createService();
  const preview = normalizeApproved(
    service,
    baseApprovedData({
      rate: { cost: '', salesTaxPercent: '', serviceChargePercent: '' },
      supplements: [{ name: 'Extra bed', type: 'EXTRA_BED', chargeBasis: 'PER_NIGHT', amount: '' }],
      ratePolicies: [{ policyType: 'CHILD_EXTRA_BED', amount: '', percent: '', pricingBasis: 'PER_ROOM' }],
    }),
  );

  assert.equal(preview.rates[0].cost, undefined);
  assert.equal(preview.rates[0].salesTaxPercent, undefined);
  assert.equal(preview.rates[0].serviceChargePercent, undefined);
  assert.equal(preview.supplements[0].amount, null);
  assert.equal(preview.ratePolicies[0].amount, null);
  assert.equal(preview.ratePolicies[0].percent, null);

  const warnings = buildWarnings(service, preview);

  assert.ok(warnings.some((warning) => warning.field === 'rates.1.cost' && /cost is required/.test(warning.message)));
  assert.ok(warnings.some((warning) => warning.field === 'supplements.1.amount' && /amount is required/.test(warning.message)));
});

test('hotel pre-import validation blocks critical pricing and date overlap risks', () => {
  const service = createService();
  const preview = normalizeApproved(
    service,
    baseApprovedData({
      roomCategories: [
        { name: 'Deluxe', code: 'DLX' },
        { name: 'deluxe', code: 'DLX2' },
      ],
      seasons: [
        { name: 'Low Season', validFrom: '2026-01-01', validTo: '2026-03-31' },
        { name: 'Shoulder Season', validFrom: '2026-03-15', validTo: '2026-05-31' },
      ],
      rate: { roomType: 'Deluxe', occupancyType: 'SGL', mealPlan: 'BB', seasonName: 'Low Season', seasonFrom: '2026-01-01', seasonTo: '2026-03-31', cost: 100 },
      extraRates: [
        { roomType: 'Deluxe', occupancyType: 'DBL', mealPlan: 'BB', seasonName: 'Low Season', seasonFrom: '2026-01-01', seasonTo: '2026-03-31', cost: 90, currency: 'USD' },
        { roomType: 'Deluxe', occupancyType: 'PENTA', mealPlan: 'BB', seasonName: 'Low Season', seasonFrom: '2026-01-01', seasonTo: '2026-03-31', cost: 120, currency: 'JOD' },
        { roomType: 'Deluxe', occupancyType: 'TPL', mealPlan: 'BB', seasonName: 'Low Season', seasonFrom: '2026-01-15', seasonTo: '2026-02-15', cost: 0, currency: 'JOD' },
      ],
    }),
  );

  const warnings = buildWarnings(service, preview);

  assert.ok(warnings.some((warning) => warning.severity === 'blocker' && /zero, negative, or missing price/.test(warning.message)));
  assert.ok(warnings.some((warning) => warning.severity === 'blocker' && /unsupported occupancy/.test(warning.message)));
  assert.ok(warnings.some((warning) => warning.severity === 'blocker' && /Overlapping season dates/.test(warning.message)));
  assert.ok(warnings.some((warning) => warning.severity === 'warning' && /Duplicate room category/.test(warning.message)));
  assert.ok(warnings.some((warning) => warning.severity === 'warning' && /currency USD differs/.test(warning.message)));
  assert.ok(warnings.some((warning) => warning.severity === 'warning' && /DBL is cheaper than SGL/.test(warning.message)));
});

test('hotel pre-import validation flags meal-plan double-count and missing base risks', () => {
  const service = createService();
  const preview = normalizeApproved(
    service,
    baseApprovedData({
      rate: { roomType: 'Superior', occupancyType: 'DBL', mealPlan: 'HB', cost: 130 },
      extraRates: [{ roomType: 'Superior', occupancyType: 'DBL', mealPlan: 'FB', seasonName: 'Imported', cost: 160, currency: 'JOD', pricingBasis: 'PER_ROOM' }],
      supplements: [{ name: 'HB supplement', type: 'OPTIONAL_SUPPLEMENT', chargeBasis: 'PER_PERSON', amount: 20, currency: 'JOD' }],
    }),
  );

  const warnings = buildWarnings(service, preview);

  assert.ok(warnings.some((warning) => /HB supplement exists but no BB base/.test(warning.message)));
  assert.ok(warnings.some((warning) => /Direct HB rates and an HB supplement/.test(warning.message)));
  assert.ok(warnings.some((warning) => /FB rates exist without BB\/HB base meal plans/.test(warning.message)) === false);
});

test('contract import validation normalizes pricingBasis aliases and falls back for invalid pricingBasis', () => {
  const service = createService();
  const preview = normalizeApproved(
    service,
    baseApprovedData({
      rate: { pricingBasis: 'per person' },
      extraRates: [
        { roomType: 'Deluxe', occupancyType: 'SGL', mealPlan: 'BB', seasonName: 'Imported', cost: 90, pricingBasis: 'room' },
        { roomType: 'Deluxe', occupancyType: 'TPL', mealPlan: 'BB', seasonName: 'Imported', cost: 120, pricingBasis: 'weekly' },
      ],
    }),
  );

  assert.equal(preview.rates[0].pricingBasis, 'PER_PERSON');
  assert.equal(preview.rates[1].pricingBasis, 'PER_ROOM');
  assert.equal(preview.rates[2].pricingBasis, undefined);
  assert.equal(buildWarnings(service, preview).some((warning) => warning.field.includes('pricingBasis')), false);
});

test('contract import validation flags invalid meal, supplement, and child policy enums', () => {
  const service = createService();
  const preview = normalizeApproved(
    service,
    baseApprovedData({
      rate: { mealPlan: 'BRUNCH' },
      supplements: [{ name: 'Mystery fee', type: 'MYSTERY', chargeBasis: 'PER_WEEK', amount: 10 }],
      childPolicy: {
        infantMaxAge: 5,
        childMaxAge: 11,
        bands: [{ label: 'Invalid band', minAge: 0, maxAge: 5, chargeBasis: 'MAGIC', chargeValue: 0 }],
      },
    }),
  );

  const warnings = buildWarnings(service, preview);

  assert.ok(warnings.some((warning) => warning.field === 'rates.1.mealPlan'));
  assert.ok(warnings.some((warning) => warning.field === 'supplements.1.type'));
  assert.ok(warnings.some((warning) => warning.field === 'supplements.1.chargeBasis'));
  assert.ok(warnings.some((warning) => warning.field === 'childPolicy.bands.1.chargeBasis'));
});

test('hotel Excel template extracts ChildPolicy sheet into preview childPolicy', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const xlsx = require('xlsx');
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { Key: 'Hotel Name', Value: 'Petra Moon Hotel' },
      { Key: 'Supplier Name', Value: 'Petra Moon Hotel' },
      { Key: 'Contract Name', Value: 'Petra Moon 2026' },
      { Key: 'Currency', Value: 'JOD' },
    ]),
    'Meta',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { 'Room Type': 'Standard Room', Occupancy: 'DBL', 'Meal Plan': 'BB', Cost: 100, Currency: 'JOD' },
    ]),
    'Rates',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { Name: 'Child Policy', Value: 'Children under 6 stay free. Ages 6-11 pay 50% meals.' },
    ]),
    'Policies',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { Label: 'Child Below 6', 'Min Age': 0, 'Max Age': 5, 'Charge Basis': 'FREE', Notes: 'Stays free' },
      { Label: 'Child 6-11 Meals', 'Min Age': 6, 'Max Age': 11, 'Charge Basis': 'PERCENT_OF_ADULT', 'Charge Value': 50, Notes: 'Meals at 50%' },
    ]),
    'ChildPolicy',
  );
  const filePath = join(tmpdir(), `petra-child-policy-${Date.now()}.xlsx`);
  xlsx.writeFile(workbook, filePath);

  const preview = (createService() as any).extractHotelExcelTemplatePreview({
    contractType: ContractImportType.HOTEL,
    supplierName: 'Petra Moon Hotel',
    contractYear: 2026,
    validFrom: null,
    validTo: null,
    filePath,
    fileName: 'petra-child-policy.xlsx',
  });

  assert.equal(preview.childPolicy.infantMaxAge, 5);
  assert.equal(preview.childPolicy.childMaxAge, 12);
  assert.equal(preview.childPolicy.bands.length, 2);
  assert.equal(preview.childPolicy.bands[0].chargeBasis, 'FREE');
  assert.equal(preview.childPolicy.bands[1].chargeBasis, 'PERCENT_OF_ADULT');
  assert.equal(preview.childPolicy.bands[1].chargeValue, 50);
  assert.match(preview.childPolicy.notes, /Child Policy/);
});

test('contract import approval normalizes supplement enum aliases without merging gala dinner into extra dinner', async () => {
  const { service, state } = createHotelApprovalHarness({
    extractedJson: baseApprovedData({
      supplements: [
        { name: 'New Year Gala', type: 'GALA_DINNER', chargeBasis: 'PER_PERSON', amount: 50, currency: 'JOD' },
        { name: 'Dinner supplement', type: 'EXTRA_DINNER', chargeBasis: 'PER_PERSON', amount: 20, currency: 'JOD' },
        { name: 'Breakfast add-on', type: 'breakfast', chargeBasis: 'per person', amount: 8, currency: 'JOD' },
        { name: 'Lunch add-on', type: 'lunch', chargeBasis: 'per room', amount: 12, currency: 'JOD' },
        { name: 'Rollaway bed', type: 'extra bed', chargeBasis: 'per stay', amount: 30, currency: 'JOD' },
      ],
    }),
  });

  await service.approve('import-1', undefined, approvalActor);

  assert.deepEqual(
    state.supplementCreates.map((supplement: any) => supplement.type),
    ['GALA_DINNER', 'EXTRA_DINNER', 'EXTRA_BREAKFAST', 'EXTRA_LUNCH', 'EXTRA_BED'],
  );
  assert.deepEqual(
    state.supplementCreates.map((supplement: any) => supplement.chargeBasis),
    ['PER_PERSON', 'PER_PERSON', 'PER_PERSON', 'PER_ROOM', 'PER_STAY'],
  );
});

test('contract import approval preserves mixed supplement labels in notes for display', async () => {
  const { service, state } = createHotelApprovalHarness({
    extractedJson: baseApprovedData({
      supplements: [
        { name: 'HB Supplement', chargeBasis: 'PER_PERSON', amount: 10, currency: 'JOD' },
        { name: 'Extra Bed', chargeBasis: 'PER_NIGHT', amount: 35, currency: 'JOD' },
        { name: 'Junior Suite Supplement', chargeBasis: 'PER_NIGHT', amount: 30, currency: 'JOD' },
        { name: 'Executive Suite Supplement', chargeBasis: 'PER_NIGHT', amount: 50, currency: 'JOD' },
        { name: 'Family Room Supplement', chargeBasis: 'PER_NIGHT', amount: 110, currency: 'JOD' },
        { name: 'Single Supplement', chargeBasis: 'PER_NIGHT', amount: 100, currency: 'JOD' },
      ],
    }),
  });

  await service.approve('import-1', undefined, approvalActor);

  assert.deepEqual(
    state.supplementCreates.map((supplement: any) => supplement.type),
    ['EXTRA_DINNER', 'EXTRA_BED', 'EXTRA_BED', 'EXTRA_BED', 'EXTRA_BED', 'EXTRA_BED'],
  );
  assert.deepEqual(
    state.supplementCreates.map((supplement: any) => supplement.notes),
    ['HB Supplement', 'Extra Bed', 'Junior Suite Supplement', 'Executive Suite Supplement', 'Family Room Supplement', 'Single Supplement'],
  );
});

test('contract import approval inherits missing rate and supplement currency from contract and preserves explicit currencies', async () => {
  const { service, state } = createHotelApprovalHarness({
    extractedJson: baseApprovedData({
      contract: { currency: 'EUR' },
      rate: { currency: undefined },
      extraRates: [{ roomType: 'Deluxe', occupancyType: 'SGL', mealPlan: 'BB', seasonName: 'Imported', cost: 90, currency: 'USD' }],
      supplements: [
        { name: 'Gala dinner', type: 'GALA_DINNER', chargeBasis: 'PER_PERSON', amount: 50, currency: undefined },
        { name: 'Extra dinner', type: 'EXTRA_DINNER', chargeBasis: 'PER_ROOM', amount: 20, currency: 'JOD' },
      ],
    }),
  });

  await service.approve('import-1', undefined, approvalActor);

  assert.equal(state.rateCreates[0].currency, 'EUR');
  assert.equal(state.rateCreates[0].costCurrency, 'EUR');
  assert.equal(state.rateCreates[1].currency, 'USD');
  assert.equal(state.rateCreates[1].costCurrency, 'USD');
  assert.equal(state.supplementCreates[0].currency, 'EUR');
  assert.equal(state.supplementCreates[1].currency, 'JOD');
});

test('contract import currency validation falls back safely when missing and flags invalid currency codes', () => {
  const service = createService();
  const fallbackPreview = normalizeApproved(service, baseApprovedData({ contract: { currency: undefined }, rate: { currency: undefined } }));
  const invalidPreview = normalizeApproved(
    service,
    baseApprovedData({
      contract: { currency: 'GBP' },
      rate: { currency: 'AED' },
      supplements: [{ name: 'Extra bed', type: 'EXTRA_BED', chargeBasis: 'PER_STAY', amount: 25, currency: 'GBP' }],
    }),
  );
  const warnings = buildWarnings(service, invalidPreview);

  assert.equal(fallbackPreview.contract.currency, 'JOD');
  assert.equal(fallbackPreview.rates[0].currency, 'JOD');
  assert.ok(warnings.some((warning) => warning.field === 'contract.currency'));
  assert.ok(warnings.some((warning) => warning.field === 'rates.1.currency'));
  assert.ok(warnings.some((warning) => warning.field === 'supplements.1.currency'));
});

test('contract import treats percent supplement currency markers as metadata instead of currency codes', async () => {
  const { service, state } = createHotelApprovalHarness({
    extractedJson: baseApprovedData({
      contract: { currency: 'JOD' },
      supplements: [
        { name: 'HB supplement', type: 'EXTRA_DINNER', chargeBasis: 'PER_PERSON', amount: 18, currency: 'JOD' },
        { name: 'Extra bed supplement', type: 'EXTRA_BED', chargeBasis: 'PER_NIGHT', amount: 25, currency: 'USD' },
        { name: 'Suite upgrade', type: 'EXTRA_BED', chargeBasis: 'PER_NIGHT', amount: 30, currency: 'PERCENT' },
        { name: 'Club room upgrade', type: 'EXTRA_BED', chargeBasis: 'PER_NIGHT', amount: 15, currency: '%' },
        { name: 'Supplement', type: null, chargeBasis: 'PER_NIGHT', amount: 100, currency: 'PERCENT' },
      ],
      ratePolicies: [{ policyType: 'CHILD_EXTRA_BED', amount: null, percent: 50, currency: 'PERCENT', pricingBasis: 'PER_ROOM' }],
    }),
  });
  const preview = normalizeApproved(service, baseApprovedData({
    contract: { currency: 'JOD' },
    supplements: [
      { name: 'Suite upgrade', type: 'EXTRA_BED', chargeBasis: 'PER_NIGHT', amount: 30, currency: 'PERCENT' },
      { name: 'Club room upgrade', type: 'EXTRA_BED', chargeBasis: 'PER_NIGHT', amount: 15, currency: '%' },
    ],
    ratePolicies: [{ policyType: 'CHILD_EXTRA_BED', amount: null, percent: 50, currency: 'PERCENT', pricingBasis: 'PER_ROOM' }],
  }));
  const warnings = buildWarnings(service, preview);

  assert.equal(warnings.some((warning) => warning.field.includes('.currency')), false);
  assert.equal(preview.supplements[0].currency, 'JOD');
  assert.equal(preview.supplements[1].currency, 'JOD');
  assert.equal(preview.ratePolicies[0].currency, 'JOD');

  await service.approve('import-1', undefined, approvalActor);

  assert.deepEqual(
    state.supplementCreates.map((supplement: any) => supplement.currency),
    ['JOD', 'USD', 'JOD', 'JOD'],
  );
  assert.equal(state.supplementCreates.some((supplement: any) => supplement.amount === 100), false);
});

test('hotel Excel template keeps percent supplement currency cells out of currency validation', () => {
  const xlsx = require('xlsx');
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { Key: 'hotelName', Value: 'Petra Contract Hotel' },
      { Key: 'currency', Value: 'EUR' },
    ]),
    'Meta',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([{ 'Room Type': 'Deluxe', Occupancy: 'DBL', 'Meal Plan': 'BB', Cost: 100, Currency: 'EUR' }]),
    'Rates',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { Name: 'HB supplement', Type: 'EXTRA_DINNER', 'Charge Basis': 'PER_PERSON', Amount: 18, Currency: 'JOD' },
      { Name: 'Extra bed supplement', Type: 'EXTRA_BED', 'Charge Basis': 'PER_NIGHT', Amount: 25, Currency: 'USD' },
      { Name: 'Room upgrade percentage', Type: 'EXTRA_BED', 'Charge Basis': 'PER_NIGHT', Amount: 10, Currency: 'PERCENT' },
      { Name: 'Club upgrade percentage', Type: 'EXTRA_BED', 'Charge Basis': 'PER_NIGHT', Amount: 5, Currency: '%' },
      { Name: 'Supplement', Type: '', 'Charge Basis': 'PER_NIGHT', Amount: 100, Currency: 'PERCENT' },
    ]),
    'Supplements',
  );
  const filePath = join(tmpdir(), `petra-percent-supplements-${Date.now()}.xlsx`);
  xlsx.writeFile(workbook, filePath);

  const service = createService();
  const preview = (service as any).extractHotelExcelTemplatePreview({
    contractType: ContractImportType.HOTEL,
    supplierName: 'Petra Contract Hotel',
    filePath,
    fileName: 'petra-percent-supplements.xlsx',
  });
  const warnings = buildWarnings(service, preview);

  assert.deepEqual(
    preview.supplements.map((supplement: any) => supplement.currency),
    ['JOD', 'USD', 'EUR', 'EUR'],
  );
  assert.deepEqual(
    preview.supplements.map((supplement: any) => supplement.name),
    ['HB supplement', 'Extra bed supplement', 'Room upgrade percentage', 'Club upgrade percentage'],
  );
  assert.equal(warnings.some((warning) => /Unsupported supplement currency/.test(warning.message)), false);
});

test('hotel Excel template splits multi-property contracts into preview-only normalized hotel workbooks', () => {
  const xlsx = require('xlsx');
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { Key: 'Supplier Name', Value: 'Jordan Hotel Group' },
      { Key: 'Contract Name', Value: 'Jordan Hotel Group 2026' },
      { Key: 'Currency', Value: 'JOD' },
      { Key: 'Valid From', Value: '2026-01-01' },
      { Key: 'Valid To', Value: '2026-12-31' },
    ]),
    'Meta',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      {
        Hotel: 'Amman City Hotel',
        'Room Type': 'Deluxe Room',
        Occupancy: 'DBL',
        'Meal Plan': 'BB',
        'Season From': '2026-01-01',
        'Season To': '2026-03-31',
        Cost: 120,
        Currency: 'JOD',
        'Pricing Basis': 'per room',
      },
      {
        Hotel: 'Petra Valley Hotel',
        'Room Type': 'Standard Room',
        Occupancy: 'DBL',
        'Meal Plan': '',
        'Season From': '2026-02-01',
        'Season To': '2026-04-30',
        Cost: 95,
        Currency: 'JOD',
        'Pricing Basis': 'per person',
      },
      {
        Hotel: 'Petra Valley Hotel',
        'Room Type': 'Standard Room',
        Occupancy: 'DBL',
        'Meal Plan': '',
        'Season From': '2026-03-01',
        'Season To': '2026-05-31',
        Cost: 105,
        Currency: 'JOD',
        'Pricing Basis': 'per person',
      },
    ]),
    'Rates',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { Hotel: 'Amman City Hotel', Name: 'Single Supplement', Type: 'SINGLE_SUPPLEMENT', 'Charge Basis': 'PER_NIGHT', Amount: 35, Currency: 'JOD', 'Pricing Basis': 'per room' },
      { Hotel: 'Petra Valley Hotel', Name: 'Junior Suite Upgrade', Type: 'EXTRA_BED', 'Charge Basis': 'PER_NIGHT', Amount: 45, Currency: 'JOD', 'Pricing Basis': 'per room' },
    ]),
    'Supplements',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { Hotel: 'Amman City Hotel', Label: 'Children under 6', 'Min Age': 0, 'Max Age': 5, 'Charge Basis': 'FREE' },
      { Hotel: 'Petra Valley Hotel', Label: 'Children 6-11', 'Min Age': 6, 'Max Age': 11, 'Charge Basis': 'PERCENT_OF_ADULT', 'Charge Value': 50 },
    ]),
    'ChildPolicy',
  );
  const filePath = join(tmpdir(), `multi-property-contract-${Date.now()}.xlsx`);
  xlsx.writeFile(workbook, filePath);

  const service = createService();
  const preview = (service as any).extractHotelExcelTemplatePreview({
    contractType: ContractImportType.HOTEL,
    supplierName: 'Jordan Hotel Group',
    contractYear: 2026,
    validFrom: null,
    validTo: null,
    filePath,
    fileName: 'multi-property-contract.xlsx',
  });
  const warnings = buildWarnings(service, preview);

  assert.equal(preview.multiProperty.detected, true);
  assert.equal(preview.multiProperty.hotels.length, 2);
  assert.deepEqual(preview.multiProperty.hotels.map((hotel: any) => hotel.hotel.name), ['Amman City Hotel', 'Petra Valley Hotel']);
  assert.equal(preview.multiProperty.hotels[0].rates[0].normalizedPricingBasis, 'PER_ROOM_NIGHT');
  assert.equal(preview.multiProperty.hotels[1].rates[0].normalizedPricingBasis, 'PER_PERSON_NIGHT');
  assert.match(preview.multiProperty.hotels[0].supplements[0].notes, /Single supplement/);
  assert.match(preview.multiProperty.hotels[1].supplements[0].notes, /Room-category supplement/);
  assert.ok(warnings.some((warning) => warning.field === 'multiProperty' && warning.severity === 'blocker'));
  assert.ok(warnings.some((warning) => /Missing meal plan/.test(warning.message)));
  assert.ok(warnings.some((warning) => /Overlapping rates/.test(warning.message)));
  assert.deepEqual(
    preview.multiProperty.normalizedWorkbooks.map((entry: any) => entry.fileName),
    ['amman-city-hotel-2026-extracted-contract.xlsx', 'petra-valley-hotel-2026-extracted-contract.xlsx'],
  );
});

test('normalized hotel workbook imports one structured hotel contract preview', () => {
  const xlsx = require('xlsx');
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      {
        HotelName: 'Movenpick Petra',
        SupplierName: 'Movenpick Hotels',
        ContractName: 'Movenpick Petra 2026 FIT Contract',
        ContractYear: 2026,
        Currency: 'USD',
        City: 'Petra',
        Country: 'Jordan',
        Category: '5 Star',
        ValidFrom: '2026-01-01',
        ValidTo: '2026-12-31',
        ContractStatus: 'Draft',
        SourceReference: 'PDF Ref',
      },
    ]),
    'CONTRACT',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([{ SeasonCode: 'LOW', SeasonName: 'Low Season', StartDate: '2026-01-01', EndDate: '2026-03-31', SeasonType: 'LOW', Notes: 'Standard FIT season' }]),
    'SEASONS',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([{ RoomCode: 'DLX', RoomName: 'Deluxe Room', RoomType: 'STANDARD', Bedding: 'KING/TWIN', MaxAdults: 2, MaxChildren: 1, Notes: '' }]),
    'ROOM_CATEGORIES',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([{ SeasonCode: 'LOW', RoomCode: 'DLX', Occupancy: 'DBL', MealPlan: 'BB', PricingBasis: 'PER_ROOM_NIGHT', Cost: 120, Currency: 'USD', MinStay: '', Notes: '' }]),
    'RATES',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([{ SupplementType: 'NEW_YEAR_DINNER', SeasonCode: 'LOW', RoomCode: 'DLX', MealPlan: 'BB', Basis: 'PER_PERSON', Amount: 75, Currency: 'USD', Mandatory: 'Yes', Notes: 'Festive dinner' }]),
    'SUPPLEMENTS',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([{ PolicyName: 'Standard', DaysBeforeArrival: 7, PenaltyType: 'PERCENT', PenaltyValue: 100, Notes: 'Late cancellation' }]),
    'CANCELLATION_POLICY',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([{ ChildAgeFrom: 0, ChildAgeTo: 5, SharingBasis: 'Sharing parents room', RateType: 'FREE', RateValue: 0, Notes: 'Free stay' }]),
    'CHILD_POLICY',
  );
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([{ Notes: 'Operational note only' }]), 'NOTES');
  const filePath = join(tmpdir(), `normalized-hotel-contract-${Date.now()}.xlsx`);
  xlsx.writeFile(workbook, filePath);

  const service = createService();
  const preview = (service as any).extractHotelExcelTemplatePreview({
    contractType: ContractImportType.HOTEL,
    supplierName: '',
    contractYear: null,
    validFrom: null,
    validTo: null,
    filePath,
    fileName: 'normalized-hotel-contract.xlsx',
  });
  const warnings = buildWarnings(service, preview);

  assert.equal(preview.meta.extractionMode, 'NORMALIZED_EXCEL_WORKBOOK');
  assert.equal(preview.hotel.name, 'Movenpick Petra');
  assert.equal(preview.roomCategories[0].code, 'DLX');
  assert.equal(preview.seasons[0].name, 'Low Season');
  assert.equal(preview.rates[0].roomType, 'Deluxe Room');
  assert.equal(preview.rates[0].normalizedPricingBasis, 'PER_ROOM_NIGHT');
  assert.equal(preview.supplements[0].name, 'NEW_YEAR_DINNER');
  assert.equal(preview.supplements[0].type, 'GALA_DINNER');
  assert.equal(preview.cancellationPolicy.rules[0].penaltyType, 'PERCENT');
  assert.equal(preview.childPolicy.bands[0].chargeBasis, 'FREE');
  assert.equal(warnings.some((warning) => warning.severity === 'blocker'), false);
});

test('normalized hotel workbook blocks unsafe spreadsheet rows before import', () => {
  const xlsx = require('xlsx');
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { HotelName: 'Unsafe Hotel', SupplierName: 'Unsafe Supplier', ContractName: 'Unsafe 2026', ContractYear: 2026, Currency: 'USD', City: 'Petra', Country: 'Jordan', Category: '5 Star', ValidFrom: '2026-01-01', ValidTo: '2026-12-31', ContractStatus: 'Draft', SourceReference: 'PDF Ref' },
    ]),
    'CONTRACT',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([{ SeasonCode: 'LOW', SeasonName: 'Low', StartDate: '2026-01-01', EndDate: '2026-03-31', SeasonType: 'LOW', Notes: '' }]),
    'SEASONS',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([{ RoomCode: 'DLX', RoomName: 'Deluxe Room', RoomType: 'STANDARD', Bedding: '', MaxAdults: 2, MaxChildren: 1, Notes: '' }]),
    'ROOM_CATEGORIES',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { SeasonCode: 'LOW', RoomCode: 'DLX', Occupancy: 'DBL', MealPlan: 'BB', PricingBasis: 'PER_ROOM_NIGHT', Cost: 120, Currency: 'USD', MinStay: '', Notes: '' },
      { SeasonCode: 'LOW', RoomCode: 'DLX', Occupancy: 'DBL', MealPlan: 'BB', PricingBasis: 'PER_ROOM_NIGHT', Cost: 125, Currency: 'USD', MinStay: '', Notes: 'Duplicate key' },
      { SeasonCode: 'HIGH', RoomCode: 'UNK', Occupancy: 'DBL', MealPlan: 'XX', PricingBasis: 'MATRIX', Cost: -5, Currency: 'GBP', MinStay: '', Notes: 'Invalid row' },
    ]),
    'RATES',
  );
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([], { header: ['SupplementType', 'SeasonCode', 'RoomCode', 'MealPlan', 'Basis', 'Amount', 'Currency', 'Mandatory', 'Notes'] }), 'SUPPLEMENTS');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([], { header: ['PolicyName', 'DaysBeforeArrival', 'PenaltyType', 'PenaltyValue', 'Notes'] }), 'CANCELLATION_POLICY');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([], { header: ['ChildAgeFrom', 'ChildAgeTo', 'SharingBasis', 'RateType', 'RateValue', 'Notes'] }), 'CHILD_POLICY');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([{ Notes: 'Reference only' }]), 'NOTES');
  const filePath = join(tmpdir(), `unsafe-normalized-hotel-contract-${Date.now()}.xlsx`);
  xlsx.writeFile(workbook, filePath);

  const service = createService();
  const preview = (service as any).extractHotelExcelTemplatePreview({
    contractType: ContractImportType.HOTEL,
    supplierName: '',
    contractYear: null,
    validFrom: null,
    validTo: null,
    filePath,
    fileName: 'unsafe-normalized-hotel-contract.xlsx',
  });
  const warnings = buildWarnings(service, preview);

  assert.ok(warnings.some((warning) => warning.field === 'RATES.2' && /Duplicate rate row/.test(warning.message)));
  assert.ok(warnings.some((warning) => warning.field === 'RATES.3.SeasonCode'));
  assert.ok(warnings.some((warning) => warning.field === 'RATES.3.RoomCode'));
  assert.ok(warnings.some((warning) => warning.field === 'RATES.3.MealPlan'));
  assert.ok(warnings.some((warning) => warning.field === 'RATES.3.PricingBasis'));
  assert.ok(warnings.some((warning) => warning.field === 'RATES.3.Cost'));
  assert.ok(warnings.some((warning) => warning.field === 'RATES.3.Currency'));
});

test('normalized multi-hotel workbook requires one hotel selection and filters all tabs per hotel', () => {
  const xlsx = require('xlsx');
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { HotelCode: 'MVP', HotelName: 'Movenpick Petra', SupplierName: 'Movenpick Hotels', ContractName: 'Movenpick Petra 2026', ContractYear: 2026, Currency: 'USD', City: 'Petra', Country: 'Jordan', Category: '5 Star', ValidFrom: '2026-01-01', ValidTo: '2026-12-31', ContractStatus: 'Draft', SourceReference: 'PDF Ref' },
      { HotelCode: 'MVD', HotelName: 'Movenpick Dead Sea', SupplierName: 'Movenpick Hotels', ContractName: 'Movenpick Dead Sea 2026', ContractYear: 2026, Currency: 'USD', City: 'Dead Sea', Country: 'Jordan', Category: '5 Star', ValidFrom: '2026-01-01', ValidTo: '2026-12-31', ContractStatus: 'Draft', SourceReference: 'PDF Ref' },
    ]),
    'CONTRACTS',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { HotelCode: 'MVP', SeasonCode: 'LOW', SeasonName: 'Petra Low', StartDate: '2026-01-01', EndDate: '2026-03-31', SeasonType: 'LOW', Notes: '' },
      { HotelCode: 'MVD', SeasonCode: 'LOW', SeasonName: 'Dead Sea Low', StartDate: '2026-01-01', EndDate: '2026-02-28', SeasonType: 'LOW', Notes: '' },
    ]),
    'SEASONS',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { HotelCode: 'MVP', RoomCode: 'DLX', RoomName: 'Petra Deluxe', RoomType: 'STANDARD', Bedding: 'KING', MaxAdults: 2, MaxChildren: 1, Notes: '' },
      { HotelCode: 'MVD', RoomCode: 'SUP', RoomName: 'Dead Sea Superior', RoomType: 'STANDARD', Bedding: 'TWIN', MaxAdults: 2, MaxChildren: 1, Notes: '' },
    ]),
    'ROOM_CATEGORIES',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { HotelCode: 'MVP', SeasonCode: 'LOW', RoomCode: 'DLX', Occupancy: 'DBL', MealPlan: 'BB', PricingBasis: 'PER_ROOM_NIGHT', Cost: 120, Currency: 'USD', MinStay: '', Notes: '' },
      { HotelCode: 'MVD', SeasonCode: 'LOW', RoomCode: 'SUP', Occupancy: 'DBL', MealPlan: 'BB', PricingBasis: 'PER_PERSON_NIGHT', Cost: 90, Currency: 'USD', MinStay: '', Notes: '' },
      { HotelCode: 'MVD', SeasonCode: 'LOW', RoomCode: 'SUP', Occupancy: 'SGL', MealPlan: 'BB', PricingBasis: 'PER_PERSON_NIGHT', Cost: 110, Currency: 'USD', MinStay: '', Notes: '' },
    ]),
    'RATES',
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet([
      { HotelCode: 'MVP', SupplementType: 'GALA_DINNER', SeasonCode: 'LOW', RoomCode: 'DLX', MealPlan: 'BB', Basis: 'PER_PERSON', Amount: 75, Currency: 'USD', Mandatory: 'Yes', Notes: '' },
      { HotelCode: 'MVD', SupplementType: 'EXTRA_BED', SeasonCode: 'LOW', RoomCode: 'SUP', MealPlan: 'BB', Basis: 'PER_NIGHT', Amount: 40, Currency: 'USD', Mandatory: 'No', Notes: '' },
    ]),
    'SUPPLEMENTS',
  );
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([{ HotelCode: 'MVP', PolicyName: 'Petra cancel', DaysBeforeArrival: 7, PenaltyType: 'PERCENT', PenaltyValue: 100, Notes: '' }]), 'CANCELLATION_POLICY');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([{ HotelCode: 'MVD', ChildAgeFrom: 0, ChildAgeTo: 5, SharingBasis: 'Sharing', RateType: 'FREE', RateValue: 0, Notes: '' }]), 'CHILD_POLICY');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([{ HotelCode: 'MVP', Notes: 'Petra note' }, { HotelCode: 'MVD', Notes: 'Dead Sea note' }]), 'NOTES');
  const filePath = join(tmpdir(), `multi-normalized-hotel-contract-${Date.now()}.xlsx`);
  xlsx.writeFile(workbook, filePath);

  const service = createService();
  const preview = (service as any).extractHotelExcelTemplatePreview({
    contractType: ContractImportType.HOTEL,
    supplierName: '',
    contractYear: null,
    validFrom: null,
    validTo: null,
    filePath,
    fileName: 'multi-normalized-hotel-contract.xlsx',
  });
  const warnings = buildWarnings(service, preview);

  assert.equal(preview.multiProperty.detected, true);
  assert.deepEqual(preview.multiProperty.normalizedWorkbooks.map((hotel: any) => hotel.hotelName), ['Movenpick Petra', 'Movenpick Dead Sea']);
  assert.deepEqual(
    preview.multiProperty.normalizedWorkbooks.map((hotel: any) => ({
      rooms: hotel.roomCount,
      rates: hotel.rateCount,
      supplements: hotel.supplementCount,
      seasons: hotel.seasonCount,
    })),
    [
      { rooms: 1, rates: 1, supplements: 1, seasons: 1 },
      { rooms: 1, rates: 2, supplements: 1, seasons: 1 },
    ],
  );
  assert.ok(warnings.some((warning) => warning.field === 'multiProperty' && warning.severity === 'blocker'));

  const petra = preview.multiProperty.hotels[0];
  assert.equal(petra.hotel.name, 'Movenpick Petra');
  assert.deepEqual(petra.roomCategories.map((room: any) => room.name), ['Petra Deluxe']);
  assert.deepEqual(petra.rates.map((rate: any) => rate.roomType), ['Petra Deluxe']);
  assert.deepEqual(petra.supplements.map((supplement: any) => supplement.name), ['GALA_DINNER']);
  assert.deepEqual(petra.seasons.map((season: any) => season.name), ['Petra Low']);
  assert.match(petra.policies.map((policy: any) => policy.value).join(' | '), /Petra note/);
});

test('multi-property hotel export returns a zip containing one normalized workbook per hotel', () => {
  const service = createService();
  const preview = normalizeApproved(service, {
    ...baseApprovedData({
      contract: { name: 'Group Contract 2026', currency: 'JOD', validFrom: '2026-01-01', validTo: '2026-12-31' },
    }),
    multiProperty: {
      detected: true,
      propertyCount: 2,
      normalizedWorkbooks: [],
      hotels: [
        baseApprovedData({
          contract: { name: 'Amman City Hotel 2026', currency: 'JOD', validFrom: '2026-01-01', validTo: '2026-12-31' },
          hotel: { name: 'Amman City Hotel' },
          rate: { normalizedPricingBasis: 'PER_ROOM_NIGHT' },
        }),
        baseApprovedData({
          contract: { name: 'Petra Valley Hotel 2026', currency: 'JOD', validFrom: '2026-01-01', validTo: '2026-12-31' },
          hotel: { name: 'Petra Valley Hotel' },
          rate: { normalizedPricingBasis: 'PER_PERSON_NIGHT' },
        }),
      ],
    },
  });

  const exported = (service as any).generateExcel(preview, 'group-contract.xlsx');

  assert.equal(exported.contentType, 'application/zip');
  assert.match(exported.fileName, /group-contract-2026-normalized-hotel-workbooks\.zip/);
  assert.equal(exported.buffer.readUInt32LE(0), 0x04034b50);
  assert.match(exported.buffer.toString('latin1'), /amman-city-hotel-2026-extracted-contract\.xlsx/);
  assert.match(exported.buffer.toString('latin1'), /petra-valley-hotel-2026-extracted-contract\.xlsx/);
});

test('PDF-like Movenpick enterprise text detects hotels tables skipped sections and stays preview-only', () => {
  const service = createService();
  const text = [
    'Mövenpick Hotels & Resorts Jordan Enterprise Contract 2026',
    'Arabic terms الشروط والاحكام',
    'Mövenpick Resort & Spa Dead Sea',
    'Low Season 01/01/2026 - 31/03/2026',
    'Room Type Single Double Triple',
    'Superior Room 120 140 180',
    'Deluxe Room 150 170 210',
    'Supplements Extra Bed JOD 35 per night',
    'Children below 6 stay free',
    'Movenpick Resort Petra',
    'High Season 01/04/2026 - 31/10/2026',
    'Room Type SGL DBL TPL',
    'Classic Room 110 130 160',
    'Junior Suite 190 210 260',
    'General Conditions signature and bank details',
  ].join('\n');

  const preview = (service as any).extractHotelContractPreview({
    contractType: ContractImportType.HOTEL,
    supplierName: '',
    contractYear: 2026,
    validFrom: null,
    validTo: null,
    filePath: 'movenpick.pdf',
    fileName: 'movenpick-jordan-2026.pdf',
    text,
    workbookRows: [],
  });
  const warnings = buildWarnings(service, preview);

  assert.equal(preview.multiProperty.detected, true);
  assert.deepEqual(preview.parserDiagnostics.detectedHotels, ['Mövenpick Resort & Spa Dead Sea', 'Mövenpick Resort Petra']);
  assert.ok(preview.parserDiagnostics.detectedTables.length >= 2);
  assert.ok(preview.parserDiagnostics.skippedSections.some((section: any) => /Arabic/.test(section.reason)));
  assert.ok(preview.parserDiagnostics.skippedSections.some((section: any) => /administrative/.test(section.reason)));
  assert.ok(preview.parserDiagnostics.confidence > 0.5);
  assert.equal(preview.multiProperty.hotels.length, 2);
  assert.ok(preview.multiProperty.hotels[0].rates.some((rate: any) => rate.seasonName === 'Low Season'));
  assert.ok(preview.multiProperty.hotels[1].rates.some((rate: any) => rate.seasonName === 'High Season'));
  assert.ok(warnings.some((warning) => warning.field === 'multiProperty' && warning.severity === 'blocker'));
});

test('PDF hotel contract preview exposes assisted extraction blocks and blocks direct import', () => {
  const service = createService();
  const text = [
    'Movenpick Resort & Spa Dead Sea',
    'Low Season 01/01/2026 - 31/03/2026',
    'Room Type Single Double Triple',
    'Superior Room 120 140 180',
    'Half Board supplement JOD 18 per person',
    'Children below 6 stay free and children 6-12 pay 50%',
    'Cancellation within 7 days is charged 100%',
    'Taxes and service charge included',
  ].join('\n');

  const preview = (service as any).extractHotelContractPreview({
    contractType: ContractImportType.HOTEL,
    supplierName: '',
    contractYear: 2026,
    validFrom: null,
    validTo: null,
    filePath: 'movenpick-dead-sea.pdf',
    fileName: 'movenpick-dead-sea-2026.pdf',
    text,
    workbookRows: [],
  });
  const warnings = buildWarnings(service, preview);

  assert.equal(preview.assistedExtraction.mode, 'PDF_ASSISTED_REVIEW');
  assert.equal(preview.assistedExtraction.importDisabled, true);
  assert.ok(preview.assistedExtraction.blocks.some((block: any) => block.kind === 'DETECTED_TABLE' && block.suggestedTag === 'ROOM_RATE_TABLE'));
  assert.ok(preview.assistedExtraction.blocks.some((block: any) => block.suggestedTag === 'CHILD_POLICY'));
  assert.ok(preview.assistedExtraction.blocks.some((block: any) => block.suggestedTag === 'CANCELLATION_POLICY'));
  assert.ok(warnings.some((warning) => warning.field === 'assistedExtraction' && warning.severity === 'blocker'));
  assert.ok(warnings.some((warning) => /Room category/.test(warning.message)));
});

test('assisted extraction export includes block mapping and QC sheets', () => {
  const service = createService();
  const preview: any = baseApprovedData({
    rates: [],
    roomCategories: [{ name: 'Superior Room', code: null, description: 'Approved from PDF room candidate lines 3, 4.', uncertain: false }],
  });
  preview.assistedExtraction = {
    mode: 'PDF_ASSISTED_REVIEW',
    importDisabled: true,
    oneHotelAtATimeRequired: true,
    requiredColumnRoles: ['ROOM_CATEGORY', 'SEASON', 'DATE_RANGE', 'MEAL_PLAN', 'PRICING_BASIS', 'RATE'],
    blocks: [
      {
        id: 'table-1',
        kind: 'DETECTED_TABLE',
        label: 'Room Type Single Double',
        suggestedTag: 'ROOM_RATE_TABLE',
        tag: 'ROOM_RATE_TABLE',
        text: 'Room Type Single Double\nSuperior Room 120 140',
        columns: ['Room Type', 'Single', 'Double'],
        mappings: {
          ROOM_CATEGORY: 'Room Type',
          RATE: 'Double',
        },
        approved: true,
      },
    ],
    qcWarnings: [],
  };

  const exported = (service as any).generateExcel(preview, 'assisted.pdf');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const xlsx = require('xlsx');
  const workbook = xlsx.read(exported.buffer, { type: 'buffer' });

  assert.ok(workbook.SheetNames.includes('Assisted Blocks'));
  assert.ok(workbook.SheetNames.includes('Assisted Mappings'));
  assert.ok(workbook.SheetNames.includes('Assisted QC'));
  assert.ok(workbook.SheetNames.includes('CONTRACT'));
  assert.ok(workbook.SheetNames.includes('RATES'));
  assert.ok(workbook.SheetNames.includes('ROOM_CATEGORIES'));
  assert.ok(workbook.SheetNames.includes('Room Categories'));
  const roomRows = xlsx.utils.sheet_to_json(workbook.Sheets['Room Categories']);
  assert.equal(roomRows[0].Name, 'Superior Room');
});

test('hotel PDF parser creates review candidates for flattened uncertain MENA rate rows', () => {
  const service = createService();
  const text = [
    'Movenpick Resort Petra',
    'Low Season 1 Jan - 31 Mar',
    'Room Category   SGL   DBL   TPL   BB',
    'Superior        95    110   145',
    'Family Room 160 185 220 HB',
    'Villa',
    '250 275 320',
    'Single supplement 35',
    'Children below 6 stay free',
    'Cancellation within 7 days 100%',
    'Service charge and taxes included',
  ].join('\n');

  const preview = (service as any).extractHotelContractPreview({
    contractType: ContractImportType.HOTEL,
    supplierName: '',
    contractYear: 2026,
    validFrom: null,
    validTo: null,
    filePath: 'petra.pdf',
    fileName: 'petra-2026.pdf',
    text,
    workbookRows: [],
  });

  const candidates = preview.assistedExtraction.rateCandidates;
  assert.ok(candidates.length >= 2);
  assert.ok(candidates.some((candidate: any) => candidate.detectedRoom === 'Superior Room' && candidate.detectedNumericValues.includes(110)));
  assert.ok(candidates.some((candidate: any) => candidate.detectedRoom === 'Family Room' && candidate.detectedMealPlan === 'HB'));
  assert.ok(candidates.some((candidate: any) => candidate.detectedRoom === 'Villa' && candidate.sourceLines.includes(6) && candidate.sourceLines.includes(7)));
  assert.ok(candidates.every((candidate: any) => candidate.detectedHotel === 'Mövenpick Resort Petra'));
  assert.ok(preview.assistedExtraction.rejectedRateCandidates.some((candidate: any) => /without occupancy|no price values|no room category/i.test(candidate.rejectionReason)));
  assert.ok(preview.parserDiagnostics.rateCandidateRejections.length >= preview.assistedExtraction.rejectedRateCandidates.length);
  assert.ok(preview.assistedExtraction.lineClassifications.some((line: any) => line.type === 'RATE_ROW'));
  assert.ok(preview.assistedExtraction.blocks.some((block: any) => block.id.startsWith('rate-candidate-') && block.suggestedTag === 'ROOM_RATE_TABLE'));
});

test('PDF-like multi-property extraction does not duplicate hotel sections from repeated page headings', () => {
  const service = createService();
  const repeatedDeadSeaPages = Array.from({ length: 20 }, (_, page) =>
    [
      'Movenpick Resort & Spa Dead Sea',
      `Low Season page ${page + 1}`,
      'Room Type Single Double Triple',
      `Superior Room ${120 + page} ${140 + page} ${180 + page}`,
    ].join('\n'),
  );
  const repeatedPetraPages = Array.from({ length: 20 }, (_, page) =>
    [
      'Movenpick Resort Petra',
      `High Season page ${page + 1}`,
      'Room Type SGL DBL TPL',
      `Classic Room ${110 + page} ${130 + page} ${160 + page}`,
    ].join('\n'),
  );
  const text = ['Movenpick Hotels Jordan Enterprise Contract 2026', ...repeatedDeadSeaPages, ...repeatedPetraPages].join('\n');

  const sections = (service as any).detectHotelSections(text, 'movenpick-jordan-2026.pdf');
  const preview = (service as any).extractHotelContractPreview({
    contractType: ContractImportType.HOTEL,
    supplierName: '',
    contractYear: 2026,
    validFrom: null,
    validTo: null,
    filePath: 'movenpick.pdf',
    fileName: 'movenpick-jordan-2026.pdf',
    text,
    workbookRows: [],
  });

  assert.deepEqual(
    sections.map((section: any) => section.hotelName),
    ['Mövenpick Resort & Spa Dead Sea', 'Mövenpick Resort Petra'],
  );
  assert.equal(preview.multiProperty.detected, true);
  assert.equal(preview.multiProperty.hotels.length, 2);
});

test('contract import approval blocks invalid rows before persistence and returns row field context', async () => {
  let hotelRateCreateCount = 0;
  const service = createService({
    contractImport: {
      findUnique: async () => ({
        id: 'import-1',
        status: ContractImportStatus.ANALYZED,
        sourceFileName: 'contract.xlsx',
        sourceFilePath: 'contract.xlsx',
        extractedJson: baseApprovedData({ rate: { cost: '' } }),
        auditLogs: [],
      }),
      update: async ({ data }: any) => ({ id: 'import-1', ...data }),
    },
    hotelRate: {
      create: async () => {
        hotelRateCreateCount += 1;
        return { id: 'rate-1' };
      },
    },
  });

  await assert.rejects(
    () =>
      service.approve(
        'import-1',
        undefined,
        {
          id: 'user-1',
          email: 'ops@example.com',
          role: 'admin',
          firstName: 'Ops',
          lastName: 'User',
          name: 'Ops User',
          auditLabel: 'Ops User',
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match((error as Error).message, /rates\.1\.cost/);
      return true;
    },
  );
  assert.equal(hotelRateCreateCount, 0);
});

test('contract import replacement replaces old commercial rows and preserves hotel identity', async () => {
  const { service, state } = createHotelApprovalHarness({
    existingContract: { id: 'contract-existing', hotelId: 'hotel-1' },
    extractedJson: baseApprovedData({
      rate: { cost: 175, pricingBasis: 'per person' },
      supplements: [{ name: 'Gala dinner', type: 'GALA_DINNER', chargeBasis: 'PER_PERSON', amount: 35, currency: 'JOD' }],
    }),
  });

  const result = await service.approve('import-1', undefined, approvalActor, 'replace');

  assert.equal(result.importedEntityId, 'contract-existing');
  assert.deepEqual(state.rateDeletes, [{ contractId: 'contract-existing' }]);
  assert.deepEqual(state.supplementDeletes, [{ hotelContractId: 'contract-existing' }]);
  assert.equal(state.contractUpdates.length, 1);
  assert.equal(state.contractUpdates[0].id, 'contract-existing');
  assert.equal(state.contractUpdates[0].hotelId, 'hotel-1');
  assert.equal(state.rateCreates.length, 1);
  assert.equal(state.rateCreates[0].contractId, 'contract-existing');
  assert.equal(state.rateCreates[0].pricingBasis, 'PER_PERSON');
  assert.equal(state.rateCreates[0].pricingMode, 'PER_PERSON_PER_NIGHT');
  assert.equal(state.supplementCreates.length, 1);
  assert.equal(state.supplementCreates[0].type, 'GALA_DINNER');
});

test('contract import approval is idempotent and does not duplicate rows on second approval', async () => {
  const { service, state } = createHotelApprovalHarness({
    extractedJson: baseApprovedData({
      supplements: [{ name: 'Gala dinner', type: 'GALA_DINNER', chargeBasis: 'PER_PERSON', amount: 35, currency: 'JOD' }],
    }),
  });

  await service.approve('import-1', undefined, approvalActor);
  await assert.rejects(
    () => service.approve('import-1', undefined, approvalActor),
    /Only analyzed imports can be approved/,
  );

  assert.equal(state.rateCreates.length, 1);
  assert.equal(state.supplementCreates.length, 1);
  assert.equal(state.importStatus, ContractImportStatus.IMPORTED);
});

test('contract import concurrent approval allows only one writer and creates no duplicate rows', async () => {
  const { service, state } = createHotelApprovalHarness({
    extractedJson: baseApprovedData({
      supplements: [{ name: 'Gala dinner', type: 'GALA_DINNER', chargeBasis: 'PER_PERSON', amount: 35, currency: 'JOD' }],
    }),
  });

  const results = await Promise.allSettled([
    service.approve('import-1', undefined, approvalActor),
    service.approve('import-1', undefined, approvalActor),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(state.rateCreates.length, 1);
  assert.equal(state.supplementCreates.length, 1);
  assert.equal(state.importStatus, ContractImportStatus.IMPORTED);
});

test('contract import version approval creates a separate contract with its own imported rows', async () => {
  const { service, state } = createHotelApprovalHarness({
    existingContract: { id: 'contract-existing', hotelId: 'hotel-1' },
    extractedJson: baseApprovedData({
      rate: { cost: 210, pricingBasis: 'PER_ROOM' },
      supplements: [{ name: 'Extra bed', type: 'EXTRA_BED', chargeBasis: 'PER_NIGHT', amount: 30, currency: 'JOD' }],
      ratePolicies: [{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 5 }],
      cancellationPolicy: {
        summary: 'Imported cancellation',
        noShowPenaltyType: 'PERCENT',
        noShowPenaltyValue: 100,
        rules: [{ daysBefore: 7, penaltyPercent: 0, notes: 'Free cancellation' }],
      },
    }),
  });

  const result = await service.approve('import-1', undefined, approvalActor, 'version');

  assert.equal(result.importedEntityId, 'contract-version-1');
  assert.equal(state.contractUpdates.length, 0);
  assert.equal(state.rateDeletes.length, 0);
  assert.equal(state.supplementDeletes.length, 0);
  assert.equal(state.contractCreates.length, 1);
  assert.equal(state.contractCreates[0].hotelId, 'hotel-1');
  assert.equal(state.contractCreates[0].ratePolicies[0].policyType, 'CHILD_FREE');
  assert.equal(state.contractCreates[0].ratePolicies[0].ageFrom, 0);
  assert.equal(state.contractCreates[0].ratePolicies[0].ageTo, 5);
  assert.equal(state.rateCreates[0].contractId, 'contract-version-1');
  assert.equal(state.supplementCreates[0].hotelContractId, 'contract-version-1');
  assert.equal(state.cancellationPolicyUpserts[0].create.hotelContractId, 'contract-version-1');
  assert.equal(state.cancellationPolicyUpserts[0].create.rules.create[0].windowFromValue, 7);
  assert.equal(state.cancellationPolicyUpserts[0].create.rules.create[0].penaltyValue, 0);
});

test('contract import concurrent replacement leaves a single consistent replaced contract state', async () => {
  const { service, state } = createHotelApprovalHarness({
    existingContract: { id: 'contract-existing', hotelId: 'hotel-1' },
    extractedJson: baseApprovedData({
      rate: { cost: 175, pricingBasis: 'PER_PERSON' },
      supplements: [{ name: 'Gala dinner', type: 'GALA_DINNER', chargeBasis: 'PER_PERSON', amount: 35, currency: 'JOD' }],
    }),
  });

  const results = await Promise.allSettled([
    service.approve('import-1', undefined, approvalActor, 'replace'),
    service.approve('import-1', undefined, approvalActor, 'replace'),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.deepEqual(state.rateDeletes, [{ contractId: 'contract-existing' }]);
  assert.deepEqual(state.supplementDeletes, [{ hotelContractId: 'contract-existing' }]);
  assert.equal(state.contractUpdates.length, 1);
  assert.equal(state.rateCreates.length, 1);
  assert.equal(state.rateCreates[0].contractId, 'contract-existing');
  assert.equal(state.supplementCreates.length, 1);
  assert.equal(state.supplementCreates[0].hotelContractId, 'contract-existing');
});

test('contract import concurrent version creation creates one non-conflicting version only', async () => {
  const { service, state } = createHotelApprovalHarness({
    existingContract: { id: 'contract-existing', hotelId: 'hotel-1' },
    extractedJson: baseApprovedData({
      rate: { cost: 210, pricingBasis: 'PER_ROOM' },
      supplements: [{ name: 'Extra bed', type: 'EXTRA_BED', chargeBasis: 'PER_NIGHT', amount: 30, currency: 'JOD' }],
    }),
  });

  const results = await Promise.allSettled([
    service.approve('import-1', undefined, approvalActor, 'version'),
    service.approve('import-1', undefined, approvalActor, 'version'),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(state.contractCreates.length, 1);
  assert.equal(state.contractCreates[0].id, 'contract-version-1');
  assert.equal(state.rateCreates.length, 1);
  assert.equal(state.rateCreates[0].contractId, 'contract-version-1');
  assert.equal(state.supplementCreates.length, 1);
  assert.equal(state.supplementCreates[0].hotelContractId, 'contract-version-1');
  assert.equal(state.rateCreates.some((rate: any) => rate.contractId === 'contract-existing'), false);
});

test('contract import version rates are persisted to the intended new version only', async () => {
  const { service, state } = createHotelApprovalHarness({
    existingContract: { id: 'contract-existing', hotelId: 'hotel-1' },
    extractedJson: baseApprovedData({
      rate: { cost: 260, pricingBasis: 'PER_PERSON' },
      extraRates: [{ roomType: 'Deluxe', occupancyType: 'SGL', mealPlan: 'BB', seasonName: 'Imported', cost: 150, pricingBasis: 'PER_ROOM' }],
    }),
  });

  await service.approve('import-1', undefined, approvalActor, 'version');

  assert.ok(state.rateCreates.length >= 2);
  assert.equal(state.rateCreates.every((rate: any) => rate.contractId === 'contract-version-1'), true);
  assert.equal(state.rateCreates.some((rate: any) => rate.contractId === 'contract-existing'), false);
});

test('contract import replacement rolls back old contract data when replacement persistence fails', async () => {
  const { service, state } = createHotelApprovalHarness({
    existingContract: { id: 'contract-existing', hotelId: 'hotel-1' },
    failRateCreate: true,
    extractedJson: baseApprovedData({ rate: { cost: 175, pricingBasis: 'PER_PERSON' } }),
  });

  await assert.rejects(() => service.approve('import-1', undefined, approvalActor, 'replace'), (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    assert.match((error as Error).message, /rate create failed for row 1/);
    return true;
  });

  assert.equal(state.transactionRollbacks, 1);
  assert.deepEqual(state.rateDeletes, []);
  assert.deepEqual(state.supplementDeletes, []);
  assert.equal(state.contractUpdates.length, 0);
  assert.equal(state.rateCreates.length, 0);
});

test('contract import approval failure leaves contract data unchanged through transaction rollback', async () => {
  const { service, state } = createHotelApprovalHarness({
    failRateCreate: true,
    extractedJson: baseApprovedData({
      supplements: [{ name: 'Gala dinner', type: 'GALA_DINNER', chargeBasis: 'PER_PERSON', amount: 35, currency: 'JOD' }],
    }),
  });

  await assert.rejects(() => service.approve('import-1', undefined, approvalActor), /rate create failed for row 1/);

  assert.equal(state.transactionRollbacks, 1);
  assert.equal(state.contractCreates.length, 0);
  assert.equal(state.contractUpdates.length, 0);
  assert.equal(state.rateCreates.length, 0);
  assert.equal(state.supplementCreates.length, 0);
  assert.equal(state.importStatus, ContractImportStatus.FAILED);
});

test('contract import replacement rejects invalid uploads before deleting valid existing data', async () => {
  const { service, state } = createHotelApprovalHarness({
    existingContract: { id: 'contract-existing', hotelId: 'hotel-1' },
    extractedJson: baseApprovedData({ rate: { cost: '' } }),
  });

  await assert.rejects(() => service.approve('import-1', undefined, approvalActor, 'replace'), (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    assert.match((error as Error).message, /rates\.1\.cost/);
    return true;
  });

  assert.deepEqual(state.rateDeletes, []);
  assert.deepEqual(state.supplementDeletes, []);
  assert.equal(state.contractUpdates.length, 0);
  assert.equal(state.rateCreates.length, 0);
  assert.ok(state.importUpdates.some((update: any) => update.status === ContractImportStatus.FAILED));
  assert.match(JSON.stringify(state.importUpdates), /rates\.1\.cost/);
});
