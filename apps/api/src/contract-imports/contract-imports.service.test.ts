import { test } from 'node:test';
import * as assert from 'node:assert/strict';
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
    roomCategories: [{ name: 'Deluxe', code: 'DLX' }],
    seasons: [],
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
