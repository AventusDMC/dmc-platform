import test from 'node:test';
import assert from 'node:assert/strict';

import { HotelContractHealthService } from './hotel-contract-health.service';

// Correction Workspace v1 — service-level tests for the new
// getCorrectionWorkspace + repairSupplement endpoints. Focus areas:
//   - Workspace returns bounded data (capped interpretation list)
//   - VERIFIED gating threads through to the response
//   - Health score is exposed
//   - Supplement repair is narrow (only the supplement row mutates)
//   - Historical refs (quote items / booking snapshots) are not read
//     or mutated by repair operations

function buildFakePrisma(opts: {
  contract?: any;
  supplement?: any;
} = {}) {
  const supplementStore = new Map<string, any>(opts.supplement ? [[opts.supplement.id, opts.supplement]] : []);
  const mutationLog: Array<{ model: string; method: string; args: any }> = [];
  return {
    __mutations: mutationLog,
    __supplementStore: supplementStore,
    hotelContract: {
      findUnique: async ({ where }: any) => (where.id === opts.contract?.id ? opts.contract : null),
    },
    hotelContractSupplement: {
      findUnique: async ({ where }: any) => supplementStore.get(where.id) || null,
      update: async ({ where, data }: any) => {
        mutationLog.push({ model: 'hotelContractSupplement', method: 'update', args: { where, data } });
        const current = supplementStore.get(where.id);
        if (!current) throw new Error('not found');
        const next = { ...current, ...data };
        supplementStore.set(where.id, next);
        return next;
      },
    },
    // Critical guard: if repair operations ever touch quote items or
    // booking snapshots, these mocks will fail the test loudly. They
    // catch any future regression that would invalidate historical
    // pricing data.
    quoteItem: {
      count: async () => 0,
      update: async () => {
        throw new Error('Repair must NEVER mutate quoteItem rows — historical pricing references frozen rate rows.');
      },
      delete: async () => {
        throw new Error('Repair must NEVER delete quoteItem rows.');
      },
    },
    booking: {
      count: async () => 0,
      update: async () => {
        throw new Error('Repair must NEVER mutate booking rows — booking snapshots are frozen.');
      },
    },
    hotelRate: {
      update: async () => {
        throw new Error('Supplement repair must NEVER mutate hotel rate rows.');
      },
      delete: async () => {
        throw new Error('Supplement repair must NEVER delete hotel rate rows.');
      },
    },
  };
}

const CONTRACT_ID = 'c1';
const HOTEL_ID = 'h1';

function buildContract(overrides: any = {}) {
  return {
    id: CONTRACT_ID,
    hotelId: HOTEL_ID,
    name: 'Summer 2026',
    confidence: 'IMPORTED_UNVERIFIED',
    lastVerifiedAt: null,
    verifiedBy: null,
    verificationNotes: null,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
    currency: 'USD',
    hotel: {
      id: HOTEL_ID,
      name: 'Test Hotel',
      city: 'Amman',
      roomCategories: [
        { id: 'rc1', name: 'Classic Mountain View', code: 'CMV', isActive: true },
        { id: 'rc2', name: 'Junior Suite', code: 'JR_STE', isActive: true },
      ],
    },
    rates: [
      { id: 'r1', roomCategoryId: 'rc1', occupancyType: 'DBL', mealPlan: 'BB', seasonName: 'Standard', seasonFrom: '2026-01-01', seasonTo: '2026-12-31', cost: 100, currency: 'USD', pricingBasis: 'PER_ROOM' },
    ],
    supplements: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getCorrectionWorkspace — happy path
// ---------------------------------------------------------------------------

test('getCorrectionWorkspace: returns summary + sections + impact + gating in one call', async () => {
  const prisma = buildFakePrisma({ contract: buildContract() });
  const service = new HotelContractHealthService(prisma as any);
  const workspace = await service.getCorrectionWorkspace(CONTRACT_ID);
  assert.equal(workspace.summary.contractId, CONTRACT_ID);
  assert.equal(workspace.summary.hotelName, 'Test Hotel');
  assert.equal(workspace.summary.confidence, 'IMPORTED_UNVERIFIED');
  assert.ok(workspace.sections);
  assert.ok(workspace.sections.roomMappings.length > 0);
  assert.ok(workspace.operationalImpact);
  assert.ok(workspace.verificationGate);
});

test('getCorrectionWorkspace: room mapping suggestions are populated per category', async () => {
  const prisma = buildFakePrisma({ contract: buildContract() });
  const service = new HotelContractHealthService(prisma as any);
  const workspace = await service.getCorrectionWorkspace(CONTRACT_ID);
  const suite = workspace.sections.roomMappings.find((m: { name: string }) => m.name === 'Junior Suite');
  assert.ok(suite);
  assert.deepEqual(suite!.suggestion.suggestedCategories, ['SUITE']);
  assert.equal(suite!.suggestion.confidence, 'high');
});

test('getCorrectionWorkspace: interpretation list is capped at 50 entries', async () => {
  const manyRates = Array.from({ length: 80 }, (_, i) => ({
    id: `r-${i}`,
    roomCategoryId: 'rc1',
    occupancyType: 'DBL',
    mealPlan: 'BB',
    seasonName: 'Standard',
    seasonFrom: '2026-01-01',
    seasonTo: '2026-12-31',
    cost: 100 + i,
    currency: 'USD',
    pricingBasis: 'PER_ROOM',
  }));
  const prisma = buildFakePrisma({ contract: buildContract({ rates: manyRates }) });
  const service = new HotelContractHealthService(prisma as any);
  const workspace = await service.getCorrectionWorkspace(CONTRACT_ID);
  assert.ok(workspace.interpretation.length <= 50);
});

test('getCorrectionWorkspace: VERIFIED gating reflects high-severity findings', async () => {
  // Two duplicate EXTRA_BREAKFAST supplements → high-severity finding.
  const contract = buildContract({
    supplements: [
      { id: 's1', type: 'EXTRA_BREAKFAST', roomCategoryId: 'rc1', chargeBasis: 'PER_PERSON', amount: 10, isMandatory: false, isActive: true, notes: null },
      { id: 's2', type: 'EXTRA_BREAKFAST', roomCategoryId: 'rc1', chargeBasis: 'PER_PERSON', amount: 12, isMandatory: false, isActive: true, notes: null },
    ],
  });
  const prisma = buildFakePrisma({ contract });
  const service = new HotelContractHealthService(prisma as any);
  const workspace = await service.getCorrectionWorkspace(CONTRACT_ID);
  assert.equal(workspace.verificationGate.allowed, false);
  assert.ok(workspace.verificationGate.blockers.some((b) => b.toLowerCase().includes('supplement')));
});

test('getCorrectionWorkspace: health score is exposed on the summary', async () => {
  const prisma = buildFakePrisma({ contract: buildContract() });
  const service = new HotelContractHealthService(prisma as any);
  const workspace = await service.getCorrectionWorkspace(CONTRACT_ID);
  assert.ok(typeof workspace.summary.healthScore === 'number');
  assert.ok(workspace.summary.healthScore >= 0 && workspace.summary.healthScore <= 100);
});

test('getCorrectionWorkspace: throws NotFoundException when contract does not exist', async () => {
  const prisma = buildFakePrisma();
  const service = new HotelContractHealthService(prisma as any);
  await assert.rejects(() => service.getCorrectionWorkspace('missing-id'));
});

// ---------------------------------------------------------------------------
// repairSupplement — safe correction semantics
// ---------------------------------------------------------------------------

test('repairSupplement DEACTIVATE: sets isActive=false and never touches rates / quotes', async () => {
  const supplement = { id: 'sup-1', type: 'EXTRA_BED', roomCategoryId: null, chargeBasis: 'PER_NIGHT', amount: 20, isMandatory: false, isActive: true, notes: null };
  const prisma = buildFakePrisma({ supplement });
  const service = new HotelContractHealthService(prisma as any);
  const result = await service.repairSupplement('sup-1', { action: 'DEACTIVATE' });
  assert.equal(result.isActive, false);
  // Only the supplement row was mutated.
  const mutations = (prisma as any).__mutations as Array<{ model: string }>;
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].model, 'hotelContractSupplement');
});

test('repairSupplement SET_CHARGE_BASIS: persists new basis without touching amount', async () => {
  const supplement = { id: 'sup-1', type: 'EXTRA_BED', roomCategoryId: null, chargeBasis: null, amount: 20, isMandatory: false, isActive: true, notes: null };
  const prisma = buildFakePrisma({ supplement });
  const service = new HotelContractHealthService(prisma as any);
  const result = await service.repairSupplement('sup-1', { action: 'SET_CHARGE_BASIS', chargeBasis: 'PER_PERSON' });
  assert.equal(result.chargeBasis, 'PER_PERSON');
  assert.equal(result.amount, 20);
});

test('repairSupplement SET_CHARGE_BASIS: rejects request without basis', async () => {
  const supplement = { id: 'sup-1', type: 'EXTRA_BED', roomCategoryId: null, chargeBasis: null, amount: 20, isMandatory: false, isActive: true, notes: null };
  const prisma = buildFakePrisma({ supplement });
  const service = new HotelContractHealthService(prisma as any);
  await assert.rejects(() => service.repairSupplement('sup-1', { action: 'SET_CHARGE_BASIS' } as any));
});

test('repairSupplement SET_AMOUNT: rejects negative amount', async () => {
  const supplement = { id: 'sup-1', type: 'EXTRA_BED', roomCategoryId: null, chargeBasis: 'PER_NIGHT', amount: 20, isMandatory: false, isActive: true, notes: null };
  const prisma = buildFakePrisma({ supplement });
  const service = new HotelContractHealthService(prisma as any);
  await assert.rejects(() => service.repairSupplement('sup-1', { action: 'SET_AMOUNT', amount: -5 }));
});

test('repairSupplement MARK_INTENTIONAL: appends marker to notes', async () => {
  const supplement = { id: 'sup-1', type: 'EXTRA_BED', roomCategoryId: null, chargeBasis: 'PER_NIGHT', amount: 20, isMandatory: false, isActive: true, notes: 'kept duplicate' };
  const prisma = buildFakePrisma({ supplement });
  const service = new HotelContractHealthService(prisma as any);
  const result = await service.repairSupplement('sup-1', { action: 'MARK_INTENTIONAL' });
  assert.ok(result.notes.includes('intentional duplicate'));
  assert.ok(result.notes.includes('kept duplicate'));
});

test('repairSupplement: throws NotFoundException when supplement does not exist', async () => {
  const prisma = buildFakePrisma();
  const service = new HotelContractHealthService(prisma as any);
  await assert.rejects(() => service.repairSupplement('missing', { action: 'DEACTIVATE' }));
});

// ---------------------------------------------------------------------------
// Critical safety guarantee — no historical mutation.
// ---------------------------------------------------------------------------

test('Correction Workspace + supplement repair NEVER mutate quote items / bookings / rates', async () => {
  // This test relies on the fake prisma's quoteItem.update / booking.update
  // / hotelRate.update mocks throwing if they're called. If any code
  // path tries to invalidate historical data, the test fails loud.
  const supplement = { id: 'sup-1', type: 'EXTRA_BED', roomCategoryId: null, chargeBasis: 'PER_NIGHT', amount: 20, isMandatory: false, isActive: true, notes: null };
  const prisma = buildFakePrisma({ contract: buildContract({ supplements: [supplement] }), supplement });
  const service = new HotelContractHealthService(prisma as any);

  // Exercise both paths — workspace load + supplement repair.
  await service.getCorrectionWorkspace(CONTRACT_ID);
  await service.repairSupplement('sup-1', { action: 'DEACTIVATE' });
  await service.repairSupplement('sup-1', { action: 'SET_CHARGE_BASIS', chargeBasis: 'PER_PERSON' });
  await service.repairSupplement('sup-1', { action: 'SET_AMOUNT', amount: 30 });
  await service.repairSupplement('sup-1', { action: 'MARK_INTENTIONAL' });

  // Confirm all mutations were against the supplement row only.
  const mutations = (prisma as any).__mutations as Array<{ model: string }>;
  for (const mutation of mutations) {
    assert.equal(
      mutation.model,
      'hotelContractSupplement',
      `Unexpected mutation against ${mutation.model} — historical pricing must remain frozen.`,
    );
  }
});
