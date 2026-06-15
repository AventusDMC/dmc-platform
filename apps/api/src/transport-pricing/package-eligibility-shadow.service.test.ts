import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  PackageEligibilityShadowService,
  inferOperationalType,
  mapShadowDays,
  resolveDayInput,
  computePackageAllowlistDecision,
  PACKAGE_VEHICLE_ALLOWLIST,
} from './package-eligibility-shadow.service';
import { evaluatePackageEligibilityForDays } from './package-eligibility';

const FLAG = 'TRANSPORT_PACKAGE_ELIGIBILITY_SHADOW';
function setFlag(on: boolean) {
  if (on) process.env[FLAG] = 'true';
  else delete process.env[FLAG];
}

// Read-only fake Prisma — exposes ONLY read methods. Any write would be `undefined` and throw.
function fakePrisma(opts: { days?: any[]; contract?: any } = {}) {
  return {
    quoteItineraryDay: { findMany: async () => opts.days ?? [] },
    transportContract: { findFirst: async () => opts.contract ?? null },
  } as any;
}

function carrier(extra: Record<string, any> = {}) {
  return {
    transportServiceTypeId: extra.code ? 'st1' : null,
    touringRouteId: extra.touring ? 'tr1' : null,
    vehicleId: extra.vehicleId ?? 'V1',
    appliedVehicleRate: {
      supplierId: extra.supplierId ?? 'S1',
      vehicle: { vehicleClass: extra.vehicleClass ?? 'Sedan', resolvedSupplierId: extra.supplierId ?? 'S1' },
      serviceType: extra.code ? { code: extra.code, classification: extra.classification ?? null } : null,
    },
    touringRoutePricing: null,
  };
}
function day(dayNumber: number, item?: any, meta: any = {}) {
  return {
    dayNumber,
    transportDayType: meta.transportDayType ?? null,
    vehicleRetained: meta.vehicleRetained ?? null,
    vehicleReleased: meta.vehicleReleased ?? null,
    inRetainedBlock: meta.inRetainedBlock ?? null,
    dayItems: item ? [{ quoteService: item }] : [],
  };
}
function p2pItem() {
  return carrier({ code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER', supplierId: 'S1', vehicleClass: 'Sedan' });
}

const PKG_CONTRACT = {
  supplierId: 'S1', vehicleClass: 'Sedan', currency: 'JOD', regime: 'PACKAGE_MIN_FULL_DAY', active: true,
  minimumFullDays: 3, minimumDayPolicy: 'INELIGIBLE_UNDER_MIN',
  halfDayCountsTowardMin: false, halfDayChargedAsFullDay: false, stationaryCountsTowardMinDays: false, airportTransferIncluded: false,
};

// ---- pure mapper ----
test('inferOperationalType: touring / airport / full-day / free / generic', () => {
  assert.equal(inferOperationalType([{ touringRouteId: 'x' }]), 'TOURING_ROUTE');
  assert.equal(inferOperationalType([{ transportServiceTypeId: 's', serviceTypeCode: 'AIRPORT_TRANSFER' }]), 'AIRPORT_TRANSFER');
  assert.equal(inferOperationalType([{ transportServiceTypeId: 's', serviceTypeClassification: 'FULL_DAY' }]), 'FULL_DAY_SERVICE');
  assert.equal(inferOperationalType([]), 'FREE_DAY_NO_VEHICLE');
  assert.equal(inferOperationalType([{ vehicleId: 'v' }]), 'POINT_TO_POINT');
});

test('mapShadowDays picks the primary supplier+vehicleClass from first transport day', () => {
  const { inputs, primary } = mapShadowDays([
    { dayNumber: 1, items: [{ touringRouteId: 't', supplierId: 'S1', vehicleClass: 'Sedan' }] },
    { dayNumber: 2, items: [] },
  ]);
  assert.equal(inputs.length, 2);
  assert.deepEqual(primary, { supplierId: 'S1', vehicleClass: 'Sedan' });
  assert.equal(inputs[1].operationalType, 'FREE_DAY_NO_VEHICLE');
});

// ---- service (flag + diagnostics, read-only) ----
test('flag OFF → shadow service returns null (disabled)', async () => {
  setFlag(false);
  const svc = new PackageEligibilityShadowService(fakePrisma({ days: [day(1, carrier({ touring: true }))] }));
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.equal(r, null);
});

test('flag ON, 3 touring days + PACKAGE contract → eligible (diagnostic only)', async () => {
  setFlag(true);
  const svc = new PackageEligibilityShadowService(
    fakePrisma({ days: [day(1, carrier({ touring: true })), day(2, carrier({ touring: true })), day(3, carrier({ touring: true }))], contract: PKG_CONTRACT }),
  );
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.ok(r);
  assert.equal(r!.contract.found, true);
  assert.equal(r!.eligibility.countedFullPackageDays, 3);
  assert.equal(r!.eligibility.eligible, true);
  assert.equal(r!.dayPlan.length, 3);
  setFlag(false);
});

test('flag ON, 2 touring days + PACKAGE contract (min 3) → below-minimum, ineligible', async () => {
  setFlag(true);
  const svc = new PackageEligibilityShadowService(
    fakePrisma({ days: [day(1, carrier({ touring: true })), day(2, carrier({ touring: true }))], contract: PKG_CONTRACT }),
  );
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.equal(r!.eligibility.eligible, false);
  assert.equal(r!.eligibility.reason, 'below-minimum');
  setFlag(false);
});

test('flag ON, carrier days but NO PACKAGE contract → no-package-contract', async () => {
  setFlag(true);
  const svc = new PackageEligibilityShadowService(
    fakePrisma({ days: [day(1, carrier({ touring: true })), day(2, carrier({ touring: true })), day(3, carrier({ touring: true }))], contract: null }),
  );
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.equal(r!.contract.found, false);
  assert.equal(r!.eligibility.reason, 'no-package-contract');
  assert.equal(r!.eligibility.eligible, false);
  setFlag(false);
});

test('flag ON, 3 same supplier+vehicle P2P (no retention signal) → manual-required, NOT auto-counted', async () => {
  setFlag(true);
  const p2p = () => carrier({ code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER', supplierId: 'S1', vehicleClass: 'Sedan' });
  const svc = new PackageEligibilityShadowService(
    fakePrisma({ days: [day(1, p2p()), day(2, p2p()), day(3, p2p())], contract: PKG_CONTRACT }),
  );
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.equal(r!.eligibility.countedFullPackageDays, 0);
  assert.equal(r!.eligibility.manualRequiredDays, 3);
  assert.equal(r!.eligibility.eligible, false);
  setFlag(false);
});

// ---- PR6: per-day retention metadata ----
test('resolveDayInput: contradiction (retained && released) → metadataInvalid, no signals', () => {
  const r = resolveDayInput({ dayNumber: 1, items: [p2pItem()], metadata: { vehicleRetained: true, vehicleReleased: true } } as any);
  assert.equal(r.metadataInvalid, true);
  assert.equal(r.input.retained, undefined);
  assert.equal(r.input.vehicleReleased, undefined);
});

test('resolveDayInput: explicit transportDayType overrides inference; invalid value → infer', () => {
  const over = resolveDayInput({ dayNumber: 1, items: [p2pItem()], metadata: { transportDayType: 'TOURING_ROUTE' } } as any);
  assert.equal(over.input.operationalType, 'TOURING_ROUTE');
  const bad = resolveDayInput({ dayNumber: 1, items: [p2pItem()], metadata: { transportDayType: 'NONSENSE' } } as any);
  assert.equal(bad.input.operationalType, 'POINT_TO_POINT');
});

test('NULL metadata → inference unchanged (3 touring items eligible)', async () => {
  setFlag(true);
  const svc = new PackageEligibilityShadowService(fakePrisma({ days: [day(1, carrier({ touring: true })), day(2, carrier({ touring: true })), day(3, carrier({ touring: true }))], contract: PKG_CONTRACT }));
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.equal(r!.eligibility.countedFullPackageDays, 3);
  assert.equal(r!.eligibility.eligible, true);
  setFlag(false);
});

test('metadata transportDayType=TOURING_ROUTE on P2P items → counts (eligible)', async () => {
  setFlag(true);
  const meta = { transportDayType: 'TOURING_ROUTE' };
  const svc = new PackageEligibilityShadowService(fakePrisma({ days: [day(1, p2pItem(), meta), day(2, p2pItem(), meta), day(3, p2pItem(), meta)], contract: PKG_CONTRACT }));
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.equal(r!.eligibility.countedFullPackageDays, 3);
  assert.equal(r!.eligibility.eligible, true);
  setFlag(false);
});

test('metadata vehicleReleased=true → weight 0 (ineligible)', async () => {
  setFlag(true);
  const meta = { vehicleReleased: true };
  const svc = new PackageEligibilityShadowService(fakePrisma({ days: [day(1, p2pItem(), meta), day(2, p2pItem(), meta), day(3, p2pItem(), meta)], contract: PKG_CONTRACT }));
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.equal(r!.eligibility.countedFullPackageDays, 0);
  assert.equal(r!.eligibility.eligible, false);
  setFlag(false);
});

test('metadata vehicleRetained=true on P2P → counts (eligible)', async () => {
  setFlag(true);
  const meta = { vehicleRetained: true };
  const svc = new PackageEligibilityShadowService(fakePrisma({ days: [day(1, p2pItem(), meta), day(2, p2pItem(), meta), day(3, p2pItem(), meta)], contract: PKG_CONTRACT }));
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.equal(r!.eligibility.countedFullPackageDays, 3);
  assert.equal(r!.eligibility.eligible, true);
  setFlag(false);
});

test('metadata inRetainedBlock=true on P2P → counts (eligible)', async () => {
  setFlag(true);
  const meta = { inRetainedBlock: true };
  const svc = new PackageEligibilityShadowService(fakePrisma({ days: [day(1, p2pItem(), meta), day(2, p2pItem(), meta), day(3, p2pItem(), meta)], contract: PKG_CONTRACT }));
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.equal(r!.eligibility.countedFullPackageDays, 3);
  assert.equal(r!.eligibility.eligible, true);
  setFlag(false);
});

test('contradiction retained && released → manual-required, NOT counted', async () => {
  setFlag(true);
  const meta = { vehicleRetained: true, vehicleReleased: true };
  const svc = new PackageEligibilityShadowService(fakePrisma({ days: [day(1, p2pItem(), meta), day(2, p2pItem(), meta), day(3, p2pItem(), meta)], contract: PKG_CONTRACT }));
  const r = await svc.evaluateQuotePackageEligibilityShadow('q1');
  assert.equal(r!.eligibility.countedFullPackageDays, 0);
  assert.equal(r!.eligibility.manualRequiredDays, 3);
  assert.equal(r!.eligibility.eligible, false);
  assert.ok(r!.dayPlan.every((d) => d.metadataInvalid === true && d.billedAs === 'manual-required'));
  setFlag(false);
});

// ---- PR9: pricing shadow-compare ----
const PRICE_FLAG = 'TRANSPORT_PACKAGE_PRICING_SHADOW_COMPARE';
function setPriceFlag(on: boolean) { if (on) process.env[PRICE_FLAG] = 'true'; else delete process.env[PRICE_FLAG]; }
const ALPHA = 'alpha-supplier-id';
const PILOT = { id: 'pilot-1', supplierId: ALPHA, vehicleClass: 'Large Bus', currency: 'USD', regime: 'PACKAGE_MIN_FULL_DAY', active: true, minimumFullDays: 3, minimumDayPolicy: 'INELIGIBLE_UNDER_MIN', fullDayRate: 656, halfDayRate: 370, halfDayCountsTowardMin: false, halfDayChargedAsFullDay: false, stationaryCountsTowardMinDays: false, airportTransferIncluded: false };

function pricingFake(opts: { days: any[]; contract?: any; discount?: number }) {
  return {
    quoteItineraryDay: { findMany: async () => opts.days },
    transportContract: { findFirst: async () => opts.contract ?? null },
    supplier: { findUnique: async () => ({ transportDiscountPercent: opts.discount ?? 25 }) },
  } as any;
}
function costItem(cost: number, meta: any = {}) {
  return {
    transportServiceTypeId: meta.touring ? null : 'st1',
    touringRouteId: meta.touring ? 'tr1' : null,
    vehicleId: 'V1',
    finalCost: cost, totalCost: cost, overrideCost: null, useOverride: false,
    appliedVehicleRate: { supplierId: ALPHA, vehicle: { vehicleClass: 'Large Bus', resolvedSupplierId: ALPHA }, serviceType: meta.code ? { code: meta.code, classification: meta.classification ?? null } : null },
    touringRoutePricing: null,
  };
}
function costDay(dayNumber: number, cost: number | null, meta: any = {}) {
  return {
    dayNumber,
    transportDayType: meta.transportDayType ?? null,
    vehicleRetained: meta.vehicleRetained ?? null,
    vehicleReleased: meta.vehicleReleased ?? null,
    inRetainedBlock: meta.inRetainedBlock ?? null,
    dayItems: cost == null ? [] : [{ quoteService: costItem(cost, meta) }],
  };
}

test('PR9 flag OFF → pricing shadow returns null', async () => {
  setPriceFlag(false);
  const svc = new PackageEligibilityShadowService(pricingFake({ days: [costDay(1, 700, { touring: true })], contract: PILOT }));
  assert.equal(await svc.evaluateQuotePackagePricingShadow('q1'), null);
});

test('PR9: 3 full days eligible → net package candidate with supplier discount applied', async () => {
  setPriceFlag(true);
  const days = [costDay(1, 700, { touring: true }), costDay(2, 700, { touring: true }), costDay(3, 700, { touring: true })];
  const svc = new PackageEligibilityShadowService(pricingFake({ days, contract: PILOT, discount: 25 }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.packageEligible, true);
  assert.equal(r.currentTransportTotal, 2100); // persisted baseline (read-only)
  assert.equal(r.packageGrossTotal, 1968); // 3 × 656
  assert.equal(r.supplierDiscountPercent, 25);
  assert.equal(r.supplierDiscountAmount, 492);
  assert.equal(r.packageNetTotal, 1476); // 1968 × 0.75
  assert.equal(r.packageCandidateTotal, 1476);
  assert.equal(r.difference, -624); // 1476 - 2100
  assert.equal(r.notApplied, true);
  assert.ok(r.warnings.includes('standard-large-bus-49-rate-only-not-vip-31-33'));
  setPriceFlag(false);
});

test('PR9: 2 days below minimum → no package candidate; baseline still computed', async () => {
  setPriceFlag(true);
  const days = [costDay(1, 700, { touring: true }), costDay(2, 700, { touring: true })];
  const svc = new PackageEligibilityShadowService(pricingFake({ days, contract: PILOT }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.packageEligible, false);
  assert.equal(r.reason, 'below-minimum');
  assert.equal(r.packageCandidateTotal, null);
  assert.equal(r.currentTransportTotal, 1400);
  setPriceFlag(false);
});

test('PR9: manual-required candidate days do not count (in excludedDays, no candidate total)', async () => {
  setPriceFlag(true);
  const p2p = (n: number) => costDay(n, 700, { code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER' });
  const svc = new PackageEligibilityShadowService(pricingFake({ days: [p2p(1), p2p(2), p2p(3)], contract: PILOT }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.packageEligible, false);
  assert.equal(r.manualRequiredDays, 3);
  assert.equal(r.packageCandidateTotal, null);
  assert.ok(r.excludedDays.every((d: any) => d.reason === 'manual-required'));
  setPriceFlag(false);
});

test('PR9: airport-only days do not count by default', async () => {
  setPriceFlag(true);
  const air = (n: number) => costDay(n, 200, { code: 'AIRPORT_TRANSFER', classification: 'ROUTE_TRANSFER' });
  const svc = new PackageEligibilityShadowService(pricingFake({ days: [air(1), air(2), air(3)], contract: PILOT }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.packageEligible, false);
  assert.ok(r.excludedDays.every((d: any) => d.reason === 'airport'));
  setPriceFlag(false);
});

test('PR9: stationary day excluded + warned, not priced', async () => {
  setPriceFlag(true);
  const days = [costDay(1, 300, { transportDayType: 'STATIONARY_FULL_DAY' }), costDay(2, 700, { touring: true }), costDay(3, 700, { touring: true }), costDay(4, 700, { touring: true })];
  const svc = new PackageEligibilityShadowService(pricingFake({ days, contract: PILOT }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.ok(r.warnings.includes('stationary-not-priced-in-pr9'));
  assert.ok(r.excludedDays.some((d: any) => d.reason === 'stationary' && d.dayNumber === 1));
  assert.equal(r.packageEligible, true); // 3 touring days still qualify
  setPriceFlag(false);
});

test('PR9: no PACKAGE contract → no-package-contract; baseline computed', async () => {
  setPriceFlag(true);
  const days = [costDay(1, 700, { touring: true }), costDay(2, 700, { touring: true }), costDay(3, 700, { touring: true })];
  const svc = new PackageEligibilityShadowService(pricingFake({ days, contract: null }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.reason, 'no-package-contract');
  assert.equal(r.packageCandidateTotal, null);
  assert.equal(r.currentTransportTotal, 2100);
  setPriceFlag(false);
});

// ---- PR10B-1: save/clear manual selection (metadata only) ----
import { TransportPricingController } from './transport-pricing.controller';

const PILOT_CONTRACT = { ...PKG_CONTRACT, id: 'pilot-x' };
function selectionFake(opts: { quoteExists?: boolean; days?: any[]; contract?: any }) {
  const updates: any[] = [];
  const prisma = {
    quote: {
      findUnique: async () => (opts.quoteExists === false ? null : { id: 'q1' }),
      update: async ({ data }: any) => { updates.push(data); return { id: 'q1', ...data }; },
    },
    quoteItineraryDay: { findMany: async () => opts.days ?? [] },
    transportContract: { findFirst: async () => opts.contract ?? null },
  } as any;
  return { svc: new PackageEligibilityShadowService(prisma), updates };
}
const SELECTION_KEYS = new Set(['selectedTransportPricingOption', 'selectedTransportContractId', 'transportSelectionIsManual', 'transportSelectionAt', 'transportSelectionByUserId']);

test('PR10B-1: save ROUTE_TRANSFER persists only selection metadata', async () => {
  const { svc, updates } = selectionFake({});
  const r: any = await svc.saveQuotePackageSelection('q1', { option: 'ROUTE_TRANSFER' }, 'user-1');
  assert.equal(r.selectedTransportPricingOption, 'ROUTE_TRANSFER');
  assert.equal(r.selectedTransportContractId, null);
  assert.equal(r.transportSelectionByUserId, 'user-1');
  assert.ok(r.transportSelectionAt);
  // write payload contains ONLY the 5 selection columns (no totals/items)
  for (const k of Object.keys(updates[0])) assert.ok(SELECTION_KEYS.has(k), `unexpected write key: ${k}`);
});

test('PR10B-1: save eligible PACKAGE persists option + contractId', async () => {
  const days = [day(1, carrier({ touring: true })), day(2, carrier({ touring: true })), day(3, carrier({ touring: true }))];
  const { svc, updates } = selectionFake({ days, contract: PILOT_CONTRACT });
  const r: any = await svc.saveQuotePackageSelection('q1', { option: 'PACKAGE_MIN_FULL_DAY' }, 'user-1');
  assert.equal(r.selectedTransportPricingOption, 'PACKAGE_MIN_FULL_DAY');
  assert.equal(r.selectedTransportContractId, 'pilot-x');
  for (const k of Object.keys(updates[0])) assert.ok(SELECTION_KEYS.has(k), `unexpected write key: ${k}`);
});

test('PR10B-1: clear selection sets all selection fields null', async () => {
  const { svc, updates } = selectionFake({});
  const r: any = await svc.saveQuotePackageSelection('q1', { option: null }, 'user-1');
  assert.equal(r.selectedTransportPricingOption, null);
  assert.equal(r.selectedTransportContractId, null);
  assert.equal(r.transportSelectionAt, null);
  assert.equal(r.transportSelectionByUserId, null);
  for (const k of Object.keys(updates[0])) assert.ok(SELECTION_KEYS.has(k));
});

test('PR10B-1: PACKAGE with no contract is rejected', async () => {
  const days = [day(1, carrier({ touring: true }))];
  const { svc } = selectionFake({ days, contract: null });
  await assert.rejects(() => svc.saveQuotePackageSelection('q1', { option: 'PACKAGE_MIN_FULL_DAY' }, null), /no-package-contract/);
});

test('PR10B-1: below-minimum PACKAGE is rejected', async () => {
  const days = [day(1, carrier({ touring: true })), day(2, carrier({ touring: true }))];
  const { svc } = selectionFake({ days, contract: PILOT_CONTRACT });
  await assert.rejects(() => svc.saveQuotePackageSelection('q1', { option: 'PACKAGE_MIN_FULL_DAY' }, null), /below-minimum/);
});

test('PR10B-1: PACKAGE with manual-required days is rejected (even though manualOverride ignored)', async () => {
  const p2p = (n: number) => day(n, carrier({ code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER', supplierId: 'S1', vehicleClass: 'Sedan' }));
  const { svc } = selectionFake({ days: [p2p(1), p2p(2), p2p(3)], contract: PILOT_CONTRACT });
  await assert.rejects(() => svc.saveQuotePackageSelection('q1', { option: 'PACKAGE_MIN_FULL_DAY', manualOverride: true }, null), /manual-required/);
});

test('PR10B-1: invalid option is rejected; unknown quote is rejected', async () => {
  const { svc } = selectionFake({});
  await assert.rejects(() => svc.saveQuotePackageSelection('q1', { option: 'NONSENSE' as any }, null), /Invalid transport pricing option/);
  const { svc: svc2 } = selectionFake({ quoteExists: false });
  await assert.rejects(() => svc2.saveQuotePackageSelection('q1', { option: 'ROUTE_TRANSFER' }, null), /not found/i);
});

const SEL_FLAG = 'TRANSPORT_PACKAGE_OPTION_SELECTION';
test('PR10B-1 controller: flag OFF rejects save/clear (service not called)', async () => {
  delete process.env[SEL_FLAG];
  let called = false;
  const fakeShadow: any = { saveQuotePackageSelection: async () => { called = true; return {}; } };
  const controller = new TransportPricingController({} as any, fakeShadow);
  await assert.rejects(() => controller.savePackageSelection('q1', { option: 'ROUTE_TRANSFER' }, null), /Disabled/);
  assert.equal(called, false);
});

test('PR10B-1 controller: flag ON calls the service with option + actor id', async () => {
  process.env[SEL_FLAG] = 'true';
  let receivedArgs: any = null;
  const fakeShadow: any = { saveQuotePackageSelection: async (id: string, input: any, by: string | null) => { receivedArgs = { id, input, by }; return { ok: true }; } };
  const controller = new TransportPricingController({} as any, fakeShadow);
  const r: any = await controller.savePackageSelection('q1', { option: 'PACKAGE_MIN_FULL_DAY', manualOverride: true }, { id: 'user-9' } as any);
  assert.deepEqual(receivedArgs, { id: 'q1', input: { option: 'PACKAGE_MIN_FULL_DAY', manualOverride: true }, by: 'user-9' });
  assert.equal(r.ok, true);
  delete process.env[SEL_FLAG];
});

// ---- PR10B-2: read-only savedSelection + selectionStale on the pricing-shadow response ----
function pricingSelectionFake(opts: { days: any[]; contract?: any; discount?: number; selection?: any }) {
  const writes: any[] = [];
  const prisma = {
    quoteItineraryDay: { findMany: async () => opts.days },
    transportContract: { findFirst: async () => opts.contract ?? null },
    supplier: { findUnique: async () => ({ transportDiscountPercent: opts.discount ?? 25 }) },
    quote: {
      findUnique: async () => opts.selection ?? null,
      update: async ({ data }: any) => { writes.push(data); return { id: 'q1', ...data }; },
    },
  } as any;
  return { svc: new PackageEligibilityShadowService(prisma), writes };
}
const sel = (option: string | null, contractId: string | null = null) => ({
  selectedTransportPricingOption: option,
  selectedTransportContractId: contractId,
  transportSelectionIsManual: false,
  transportSelectionAt: new Date('2026-06-14T00:00:00Z'),
  transportSelectionByUserId: 'user-1',
});
const threeTouring = () => [costDay(1, 700, { touring: true }), costDay(2, 700, { touring: true }), costDay(3, 700, { touring: true })];

test('PR10B-2: savedSelection absent when selection flag OFF (read-only, no write)', async () => {
  setPriceFlag(true);
  delete process.env[SEL_FLAG];
  const { svc, writes } = pricingSelectionFake({ days: threeTouring(), contract: PILOT, selection: sel('PACKAGE_MIN_FULL_DAY', 'pilot-1') });
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.savedSelection, null);
  assert.equal(r.selectionStale, false);
  assert.equal(writes.length, 0); // read path never writes
  setPriceFlag(false);
});

test('PR10B-2: savedSelection surfaced when selection flag ON; valid PACKAGE not stale; no write', async () => {
  setPriceFlag(true);
  process.env[SEL_FLAG] = 'true';
  const { svc, writes } = pricingSelectionFake({ days: threeTouring(), contract: PILOT, selection: sel('PACKAGE_MIN_FULL_DAY', 'pilot-1') });
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.savedSelection.option, 'PACKAGE_MIN_FULL_DAY');
  assert.equal(r.savedSelection.contractId, 'pilot-1');
  assert.equal(r.savedSelection.byUserId, 'user-1');
  assert.equal(r.selectionStale, false);
  assert.equal(writes.length, 0);
  delete process.env[SEL_FLAG];
  setPriceFlag(false);
});

test('PR10B-2: ROUTE selection is never stale', async () => {
  setPriceFlag(true);
  process.env[SEL_FLAG] = 'true';
  const { svc } = pricingSelectionFake({ days: threeTouring(), contract: PILOT, selection: sel('ROUTE_TRANSFER') });
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.savedSelection.option, 'ROUTE_TRANSFER');
  assert.equal(r.selectionStale, false);
  delete process.env[SEL_FLAG];
  setPriceFlag(false);
});

test('PR10B-2: PACKAGE stale when stored contract id no longer matches the active contract', async () => {
  setPriceFlag(true);
  process.env[SEL_FLAG] = 'true';
  const { svc } = pricingSelectionFake({ days: threeTouring(), contract: PILOT, selection: sel('PACKAGE_MIN_FULL_DAY', 'old-deactivated-contract') });
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.selectionStale, true);
  delete process.env[SEL_FLAG];
  setPriceFlag(false);
});

test('PR10B-2: PACKAGE stale when the active package contract is now missing', async () => {
  setPriceFlag(true);
  process.env[SEL_FLAG] = 'true';
  const { svc } = pricingSelectionFake({ days: threeTouring(), contract: null, selection: sel('PACKAGE_MIN_FULL_DAY', 'pilot-1') });
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.selectionStale, true);
  delete process.env[SEL_FLAG];
  setPriceFlag(false);
});

test('PR10B-2: PACKAGE stale when no longer eligible (below minimum)', async () => {
  setPriceFlag(true);
  process.env[SEL_FLAG] = 'true';
  const days = [costDay(1, 700, { touring: true }), costDay(2, 700, { touring: true })];
  const { svc } = pricingSelectionFake({ days, contract: PILOT, selection: sel('PACKAGE_MIN_FULL_DAY', 'pilot-1') });
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.packageEligible, false);
  assert.equal(r.selectionStale, true);
  delete process.env[SEL_FLAG];
  setPriceFlag(false);
});

// ---- PR11A: live-apply decision + delta math (computeQuotePackageLiveApply) ----
const LIVE_PILOT_ID = '66f5de06-28df-426c-90b8-ffaa01ed5c5f';
const LIVE_CONTRACT = {
  id: LIVE_PILOT_ID, supplierId: ALPHA, vehicleClass: 'Large Bus', currency: 'USD',
  regime: 'PACKAGE_MIN_FULL_DAY', active: true, minimumFullDays: 3, minimumDayPolicy: 'INELIGIBLE_UNDER_MIN',
  fullDayRate: 656, halfDayRate: 370, halfDayCountsTowardMin: false, halfDayChargedAsFullDay: false,
  stationaryCountsTowardMinDays: false, airportTransferIncluded: false,
};
function liveQS(o: { id: string; cost: number; sell: number; touring?: boolean; code?: string | null; classification?: string | null; vehicleClass?: string; optionId?: string | null; vehicleDbId?: string | null; vehicleName?: string | null }) {
  const touring = o.touring ?? true;
  // Default to the allow-listed Alpha "Large 49" so PR11A apply fixtures pass the PR11B-2B vehicle
  // gate; override vehicleDbId/vehicleName/vehicleClass for VIP/mixed/missing cases.
  const vehDbId = o.vehicleDbId === undefined ? '6d575442-05fd-4cf6-bd22-5e8a0ee12303' : o.vehicleDbId;
  const vehName = o.vehicleName === undefined ? 'Large 49' : o.vehicleName;
  return {
    id: o.id, optionId: o.optionId ?? null,
    transportServiceTypeId: touring ? null : 'st1', touringRouteId: touring ? 'tr1' : null, vehicleId: vehDbId,
    finalCost: o.cost, totalCost: o.cost, totalSell: o.sell, overrideCost: null, useOverride: false,
    appliedVehicleRate: { supplierId: ALPHA, vehicle: { id: vehDbId, name: vehName, vehicleClass: o.vehicleClass ?? 'Large Bus', resolvedSupplierId: ALPHA }, serviceType: (o.code || o.classification) ? { code: o.code ?? null, classification: o.classification ?? null } : null },
    touringRoutePricing: null,
  };
}
function liveDayOf(dayNumber: number, items: any[], meta: any = {}) {
  return {
    dayNumber,
    transportDayType: meta.transportDayType ?? null, vehicleRetained: meta.vehicleRetained ?? null,
    vehicleReleased: meta.vehicleReleased ?? null, inRetainedBlock: meta.inRetainedBlock ?? null,
    dayItems: items.map((qs) => ({ quoteService: qs })),
  };
}
const tDay = (n: number, cost = 700, sell = 840) => liveDayOf(n, [liveQS({ id: `t${n}`, cost, sell })]);
const threeTouringSell = () => [tDay(1), tDay(2), tDay(3)]; // cost 2100, sell 2520 (markup 20%)
function liveFake(opts: { selection?: { option: string | null; contractId: string | null }; quoteCurrency?: string; excursionPackageRate?: boolean; days?: any[]; contract?: any; discount?: number; quoteExists?: boolean }) {
  const writes: any[] = [];
  const prisma = {
    quote: {
      findUnique: async () => opts.quoteExists === false ? null : {
        quoteCurrency: opts.quoteCurrency ?? 'USD',
        excursionPackageRate: opts.excursionPackageRate ?? false,
        selectedTransportPricingOption: opts.selection?.option ?? null,
        selectedTransportContractId: opts.selection?.contractId ?? null,
      },
      update: async ({ data }: any) => { writes.push(data); return { id: 'q1', ...data }; },
    },
    transportContract: { findFirst: async () => opts.contract ?? null },
    quoteItineraryDay: { findMany: async () => opts.days ?? [] },
    supplier: { findUnique: async () => ({ transportDiscountPercent: opts.discount ?? 25 }) },
  } as any;
  return { svc: new PackageEligibilityShadowService(prisma), writes };
}
const PKG_SEL = { option: 'PACKAGE_MIN_FULL_DAY', contractId: LIVE_PILOT_ID };

test('PR11A: no saved selection → no apply', async () => {
  const { svc } = liveFake({ selection: { option: null, contractId: null }, days: threeTouringSell(), contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'no-selection'); assert.equal(r.costDelta, 0); assert.equal(r.sellDelta, 0);
});

test('PR11A: ROUTE_TRANSFER selection → no apply (existing pricing)', async () => {
  const { svc } = liveFake({ selection: { option: 'ROUTE_TRANSFER', contractId: null }, days: threeTouringSell(), contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'route-selected');
});

test('PR11A: valid pilot PACKAGE → apply with cost/sell deltas, discount once, weighted markup', async () => {
  const { svc, writes } = liveFake({ selection: PKG_SEL, days: threeTouringSell(), contract: LIVE_CONTRACT, discount: 25 });
  const r = await svc.computeQuotePackageLiveApply('q1', { recalcItemIds: new Set(['t1', 't2', 't3']) });
  assert.equal(r.apply, true);
  assert.equal(r.contractId, LIVE_PILOT_ID);
  assert.equal(r.countedCost, 2100);
  assert.equal(r.countedSell, 2520);
  assert.equal(r.supplierDiscountPercent, 25);
  assert.equal(r.packageNet, 1476);          // 3×656=1968, ×0.75
  assert.equal(r.weightedMarkupPercent, 20); // 2520/2100 = 1.20
  assert.equal(r.costDelta, -624);           // 1476 − 2100
  assert.equal(r.sellDelta, -748.8);         // 1476×1.2 − 2520
  assert.equal(writes.length, 0);            // decision/math only — NO writes
});

test('PR11A: selected contract not the pilot id → no apply', async () => {
  const { svc } = liveFake({ selection: { option: 'PACKAGE_MIN_FULL_DAY', contractId: 'some-other-contract' }, days: threeTouringSell(), contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'not-pilot-contract');
});

test('PR11A: stale/deactivated pilot contract → no apply', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, days: threeTouringSell(), contract: { ...LIVE_CONTRACT, active: false } });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'contract-inactive-or-missing');
});

test('PR11A: ineligible / below minimum (2 days) → no apply', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, days: [tDay(1), tDay(2)], contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'below-minimum');
});

test('PR11A: manual-required days (3 unretained P2P) → no apply', async () => {
  const p2p = (n: number) => liveDayOf(n, [liveQS({ id: `p${n}`, cost: 700, sell: 840, touring: false, code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER' })]);
  const { svc } = liveFake({ selection: PKG_SEL, days: [p2p(1), p2p(2), p2p(3)], contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'manual-required-days');
});

test('PR11A: stationary day present (eligible otherwise) → no apply', async () => {
  const stat = liveDayOf(4, [liveQS({ id: 's4', cost: 300, sell: 360, touring: false })], { transportDayType: 'STATIONARY_FULL_DAY' });
  const { svc } = liveFake({ selection: PKG_SEL, days: [tDay(1), tDay(2), tDay(3), stat], contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'stationary-standby-present');
});

test('PR11A: driver-overnight ADD_ON line → no apply', async () => {
  const dayWithAddOn = liveDayOf(1, [
    liveQS({ id: 't1', cost: 700, sell: 840 }),
    liveQS({ id: 'ov1', cost: 50, sell: 60, touring: false, code: 'DRIVER_OVERNIGHT', classification: 'ADD_ON' }),
  ]);
  const { svc } = liveFake({ selection: PKG_SEL, days: [dayWithAddOn, tDay(2), tDay(3)], contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'addon-overnight-present');
});

test('PR11A: cross-currency quote (JOD) → no apply', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, quoteCurrency: 'JOD', days: threeTouringSell(), contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'cross-currency');
});

test('PR11A: Alpha VIP / different vehicle class → no apply (no borrowing Large Bus 49 rate)', async () => {
  const vip = (n: number) => liveDayOf(n, [liveQS({ id: `v${n}`, cost: 900, sell: 1080, vehicleClass: 'VIP' })]);
  const { svc } = liveFake({ selection: PKG_SEL, days: [vip(1), vip(2), vip(3)], contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'supplier-class-mismatch');
});

test('PR11A: non-pilot supplier (primary supplier mismatch) → no apply', async () => {
  const other = (n: number) => liveDayOf(n, [{ ...liveQS({ id: `o${n}`, cost: 700, sell: 840 }), appliedVehicleRate: { supplierId: 'almushtari', vehicle: { vehicleClass: 'Large Bus', resolvedSupplierId: 'almushtari' }, serviceType: null } }]);
  const { svc } = liveFake({ selection: PKG_SEL, days: [other(1), other(2), other(3)], contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'supplier-class-mismatch');
});

test('PR11A: excursionPackageRate overlap → no apply (no double-charge)', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, excursionPackageRate: true, days: threeTouringSell(), contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'overlap-excursion-package-rate');
});

test('PR11A: SLAB pricing → no apply (sell decoupled)', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, days: threeTouringSell(), contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1', { pricingIsSlab: true });
  assert.equal(r.apply, false); assert.equal(r.reason, 'slab-mode-not-supported');
});

test('PR11A: day-membership mismatch (counted line absent from recalc set) → no apply', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, days: threeTouringSell(), contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1', { recalcItemIds: new Set() });
  assert.equal(r.apply, false); assert.equal(r.reason, 'day-membership-mismatch');
});

test('PR11A: excluded transfer day (airport) retained — not part of the counted base/delta', async () => {
  const air = liveDayOf(4, [liveQS({ id: 'air4', cost: 200, sell: 240, touring: false, code: 'AIRPORT_TRANSFER', classification: 'ROUTE_TRANSFER' })]);
  const { svc } = liveFake({ selection: PKG_SEL, days: [tDay(1), tDay(2), tDay(3), air], contract: LIVE_CONTRACT });
  const r = await svc.computeQuotePackageLiveApply('q1', { recalcItemIds: new Set(['t1', 't2', 't3', 'air4']) });
  assert.equal(r.apply, true);
  assert.equal(r.countedCost, 2100);          // airport 200 excluded from counted base
  assert.equal(r.previousTransportTotal, 2100);
  assert.equal(r.costDelta, -624);            // unchanged by the retained airport day
});

// ---- PR11B-2B: vehicle-aware allowlist ENFORCEMENT inside computeQuotePackageLiveApply ----
const ENF_LARGE49 = '6d575442-05fd-4cf6-bd22-5e8a0ee12303';
const ENF_VIP = '49c5fd5d-6abe-4633-a859-53cb35a04a07';
const ENF_GRANDSTAR = '94c1a79b-7039-41d2-8ce9-d8248b5ce880';
const lbDay = (n: number, vehicleDbId: string | null, vehicleName: string | null) => liveDayOf(n, [liveQS({ id: `e${n}`, cost: 700, sell: 840, vehicleDbId, vehicleName })]);

test('PR11B-2B: allowed Large 49 still applies (parity, with allowlisted vehicle id)', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, days: [lbDay(1, ENF_LARGE49, 'Large 49'), lbDay(2, ENF_LARGE49, 'Large 49'), lbDay(3, ENF_LARGE49, 'Large 49')], contract: LIVE_CONTRACT, discount: 25 });
  const r: any = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, true); assert.equal(r.costDelta, -624);
});

test('PR11B-2B: VIP 31-33 (same Large Bus class) → blocked vehicle-not-allowlisted', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, days: [lbDay(1, ENF_VIP, 'Large VIP 31-33'), lbDay(2, ENF_VIP, 'Large VIP 31-33'), lbDay(3, ENF_VIP, 'Large VIP 31-33')], contract: LIVE_CONTRACT });
  const r: any = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'vehicle-not-allowlisted'); assert.equal(r.costDelta, 0); assert.equal(r.sellDelta, 0);
});

test('PR11B-2B: Grand Star → blocked vehicle-not-allowlisted', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, days: [lbDay(1, ENF_GRANDSTAR, 'Mercedes Grand Star 49 Pax'), lbDay(2, ENF_GRANDSTAR, 'Mercedes Grand Star 49 Pax'), lbDay(3, ENF_GRANDSTAR, 'Mercedes Grand Star 49 Pax')], contract: LIVE_CONTRACT });
  const r: any = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'vehicle-not-allowlisted');
});

test('PR11B-2B: mixed vehicles (Large 49 + VIP) → blocked mixed-vehicles', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, days: [lbDay(1, ENF_LARGE49, 'Large 49'), lbDay(2, ENF_VIP, 'Large VIP 31-33'), lbDay(3, ENF_LARGE49, 'Large 49')], contract: LIVE_CONTRACT });
  const r: any = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'mixed-vehicles');
});

test('PR11B-2B: missing vehicle id → blocked missing-vehicle-id', async () => {
  const { svc } = liveFake({ selection: PKG_SEL, days: [lbDay(1, null, null), lbDay(2, null, null), lbDay(3, null, null)], contract: LIVE_CONTRACT });
  const r: any = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'missing-vehicle-id');
});

test('PR11B-2B: mixed suppliers (same vehicle id, different supplier) → blocked mixed-suppliers', async () => {
  const otherSupItem = { id: 'os2', optionId: null, transportServiceTypeId: null, touringRouteId: 'tr1', vehicleId: ENF_LARGE49, finalCost: 700, totalCost: 700, totalSell: 840, overrideCost: null, useOverride: false,
    appliedVehicleRate: { supplierId: 'other-supplier', vehicle: { id: ENF_LARGE49, name: 'Large 49', vehicleClass: 'Large Bus', resolvedSupplierId: 'other-supplier' }, serviceType: null }, touringRoutePricing: null };
  const { svc } = liveFake({ selection: PKG_SEL, days: [lbDay(1, ENF_LARGE49, 'Large 49'), liveDayOf(2, [otherSupItem]), lbDay(3, ENF_LARGE49, 'Large 49')], contract: LIVE_CONTRACT });
  const r: any = await svc.computeQuotePackageLiveApply('q1');
  assert.equal(r.apply, false); assert.equal(r.reason, 'mixed-suppliers');
});

// ---- PR11B-2A: vehicle-aware allowlist DIAGNOSTIC (read-only; does NOT enforce live apply) ----
const REAL_PILOT = '66f5de06-28df-426c-90b8-ffaa01ed5c5f';
const LARGE49_ID = '6d575442-05fd-4cf6-bd22-5e8a0ee12303';
const VIP_ID = '49c5fd5d-6abe-4633-a859-53cb35a04a07';
const GRANDSTAR_ID = '94c1a79b-7039-41d2-8ce9-d8248b5ce880';
const cv = (vehicleId: string | null, vehicleName: string | null, supplierId: string | null = ALPHA) => ({ vehicleId, vehicleName, supplierId });

test('PR11B-2A allowlist: constant pins pilot contract to Large 49 only', () => {
  assert.deepEqual(PACKAGE_VEHICLE_ALLOWLIST[REAL_PILOT], [LARGE49_ID]);
});

test('PR11B-2A allowlist: pilot + Large 49 → allowed', () => {
  const d = computePackageAllowlistDecision({ contractId: REAL_PILOT, contractCurrency: 'USD', quoteCurrency: 'USD', countedVehicles: [cv(LARGE49_ID, 'Large 49'), cv(LARGE49_ID, 'Large 49'), cv(LARGE49_ID, 'Large 49')] });
  assert.equal(d.allowed, true); assert.equal(d.reason, 'allowed'); assert.deepEqual(d.blockers, []);
  assert.deepEqual(d.resolvedVehicleIds, [LARGE49_ID]); assert.deepEqual(d.allowedVehicleIds, [LARGE49_ID]);
});

test('PR11B-2A allowlist: pilot + VIP 31-33 → vehicle-not-allowlisted + vip-or-grand-star', () => {
  const d = computePackageAllowlistDecision({ contractId: REAL_PILOT, contractCurrency: 'USD', quoteCurrency: 'USD', countedVehicles: [cv(VIP_ID, 'Large VIP 31-33'), cv(VIP_ID, 'Large VIP 31-33'), cv(VIP_ID, 'Large VIP 31-33')] });
  assert.equal(d.allowed, false); assert.equal(d.reason, 'vehicle-not-allowlisted');
  assert.ok(d.blockers.includes('vehicle-not-allowlisted')); assert.ok(d.blockers.includes('vip-or-grand-star-not-allowed'));
});

test('PR11B-2A allowlist: pilot + Grand Star → vehicle-not-allowlisted + vip-or-grand-star', () => {
  const d = computePackageAllowlistDecision({ contractId: REAL_PILOT, contractCurrency: 'USD', quoteCurrency: 'USD', countedVehicles: [cv(GRANDSTAR_ID, 'Mercedes Grand Star 49 Pax'), cv(GRANDSTAR_ID, 'Mercedes Grand Star 49 Pax'), cv(GRANDSTAR_ID, 'Mercedes Grand Star 49 Pax')] });
  assert.equal(d.allowed, false); assert.ok(d.blockers.includes('vehicle-not-allowlisted')); assert.ok(d.blockers.includes('vip-or-grand-star-not-allowed'));
});

test('PR11B-2A allowlist: non-allowlisted contract → not-allowlisted-contract', () => {
  const d = computePackageAllowlistDecision({ contractId: 'some-other-contract', contractCurrency: 'USD', quoteCurrency: 'USD', countedVehicles: [cv(LARGE49_ID, 'Large 49')] });
  assert.equal(d.allowed, false); assert.equal(d.reason, 'not-allowlisted-contract'); assert.deepEqual(d.allowedVehicleIds, []);
});

test('PR11B-2A allowlist: missing vehicle id → missing-vehicle-id', () => {
  const d = computePackageAllowlistDecision({ contractId: REAL_PILOT, contractCurrency: 'USD', quoteCurrency: 'USD', countedVehicles: [cv(LARGE49_ID, 'Large 49'), cv(null, null)] });
  assert.equal(d.allowed, false); assert.ok(d.blockers.includes('missing-vehicle-id'));
});

test('PR11B-2A allowlist: mixed vehicles → mixed-vehicles', () => {
  const d = computePackageAllowlistDecision({ contractId: REAL_PILOT, contractCurrency: 'USD', quoteCurrency: 'USD', countedVehicles: [cv(LARGE49_ID, 'Large 49'), cv(VIP_ID, 'Large VIP 31-33')] });
  assert.equal(d.allowed, false); assert.ok(d.blockers.includes('mixed-vehicles'));
});

test('PR11B-2A allowlist: mixed suppliers → mixed-suppliers', () => {
  const d = computePackageAllowlistDecision({ contractId: REAL_PILOT, contractCurrency: 'USD', quoteCurrency: 'USD', countedVehicles: [cv(LARGE49_ID, 'Large 49', 'alpha'), cv(LARGE49_ID, 'Large 49', 'other-supplier')] });
  assert.equal(d.allowed, false); assert.ok(d.blockers.includes('mixed-suppliers'));
});

test('PR11B-2A allowlist: cross-currency → cross-currency', () => {
  const d = computePackageAllowlistDecision({ contractId: REAL_PILOT, contractCurrency: 'USD', quoteCurrency: 'JOD', countedVehicles: [cv(LARGE49_ID, 'Large 49')] });
  assert.equal(d.allowed, false); assert.ok(d.blockers.includes('cross-currency'));
});

// integration: shadow response carries the allowlist decision
const REAL_PILOT_CONTRACT = { ...PILOT, id: REAL_PILOT };
function vehDay(n: number, vehId: string, vehName: string) {
  const qs = { transportServiceTypeId: null, touringRouteId: 'tr1', vehicleId: vehId, finalCost: 700, totalCost: 700, overrideCost: null, useOverride: false,
    appliedVehicleRate: { supplierId: ALPHA, vehicle: { id: vehId, name: vehName, vehicleClass: 'Large Bus', resolvedSupplierId: ALPHA }, serviceType: { code: 'TOURING_ROUTE', classification: null } }, touringRoutePricing: null };
  return { dayNumber: n, transportDayType: null, vehicleRetained: null, vehicleReleased: null, inRetainedBlock: null, dayItems: [{ quoteService: qs }] };
}
function allowlistShadowFake(days: any[], contract: any, quoteCurrency = 'USD') {
  return { quoteItineraryDay: { findMany: async () => days }, transportContract: { findFirst: async () => contract }, supplier: { findUnique: async () => ({ transportDiscountPercent: 25 }) }, quote: { findUnique: async () => ({ quoteCurrency }) } } as any;
}

test('PR11B-2A shadow: includes allowlist block — Large 49 → allowed', async () => {
  setPriceFlag(true); delete process.env[SEL_FLAG];
  const svc = new PackageEligibilityShadowService(allowlistShadowFake([vehDay(1, LARGE49_ID, 'Large 49'), vehDay(2, LARGE49_ID, 'Large 49'), vehDay(3, LARGE49_ID, 'Large 49')], REAL_PILOT_CONTRACT));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.packageEligible, true); // shadow numbers unaffected (live behavior parity)
  assert.equal(r.notApplied, true);
  assert.ok(r.allowlist);
  assert.equal(r.allowlist.allowed, true);
  assert.equal(r.allowlist.reason, 'allowed');
  assert.equal(r.allowlist.contractId, REAL_PILOT);
  assert.deepEqual(r.allowlist.resolvedVehicleIds, [LARGE49_ID]);
  assert.deepEqual(r.allowlist.allowedVehicleIds, [LARGE49_ID]);
  assert.ok(r.allowlist.vehicleNames.includes('Large 49'));
  assert.deepEqual(r.allowlist.blockers, []);
  setPriceFlag(false);
});

test('PR11B-2A shadow: includes allowlist block — VIP 31-33 → blocked (conflation surfaced)', async () => {
  setPriceFlag(true); delete process.env[SEL_FLAG];
  const svc = new PackageEligibilityShadowService(allowlistShadowFake([vehDay(1, VIP_ID, 'Large VIP 31-33'), vehDay(2, VIP_ID, 'Large VIP 31-33'), vehDay(3, VIP_ID, 'Large VIP 31-33')], REAL_PILOT_CONTRACT));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  assert.equal(r.packageEligible, true); // eligibility unchanged; only the allowlist diagnostic flags it
  assert.equal(r.allowlist.allowed, false);
  assert.ok(r.allowlist.blockers.includes('vehicle-not-allowlisted'));
  assert.ok(r.allowlist.blockers.includes('vip-or-grand-star-not-allowed'));
  assert.deepEqual(r.allowlist.resolvedVehicleIds, [VIP_ID]);
  setPriceFlag(false);
});

// ---- diagnostic-level: explicit retained 3-day block is eligible (pure path) ----
test('retained 3-day block is eligible diagnostically (explicit retained)', () => {
  const r = evaluatePackageEligibilityForDays(
    [
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'Sedan', retained: true },
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'Sedan', retained: true },
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'Sedan', retained: true },
    ],
    { minimumFullDays: 3 },
  );
  assert.equal(r.eligible, true);
  assert.equal(r.countedFullPackageDays, 3);
});
