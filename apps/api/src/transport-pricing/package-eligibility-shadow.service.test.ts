import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  PackageEligibilityShadowService,
  inferOperationalType,
  mapShadowDays,
  resolveDayInput,
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
