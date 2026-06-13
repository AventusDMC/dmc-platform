import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  evaluatePackageEligibility,
  evaluatePackageEligibilityForDays,
  type PackageContractCandidate,
} from './package-eligibility';
import { classifyItinerary, type ItineraryDayInput } from '../common/transport-day-classification';

// PR4 — package eligibility (pure / shadow). No live pricing; classify-and-decide only.

const CONTRACT_MIN3: PackageContractCandidate = { minimumFullDays: 3 };
const CONTRACT_MIN3_CHARGEMIN: PackageContractCandidate = { minimumFullDays: 3, minimumDayPolicy: 'CHARGE_MINIMUM_DAYS' };

function days(...d: ItineraryDayInput[]) {
  return d;
}

test('no PACKAGE contract → eligible:false, reason no-package-contract', () => {
  const r = evaluatePackageEligibilityForDays(
    days({ operationalType: 'TOURING_ROUTE' }, { operationalType: 'TOURING_ROUTE' }, { operationalType: 'TOURING_ROUTE' }),
    null,
  );
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'no-package-contract');
  assert.equal(r.minimumFullDays, null);
});

test('below minimum (2 counted) + default policy → ineligible (below-minimum)', () => {
  const r = evaluatePackageEligibilityForDays(
    days({ operationalType: 'TOURING_ROUTE' }, { operationalType: 'TOURING_ROUTE' }),
    CONTRACT_MIN3,
  );
  assert.equal(r.countedFullPackageDays, 2);
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'below-minimum');
  assert.equal(r.billedAtMinimum, false);
});

test('3 counted full days (touring) → eligible', () => {
  const r = evaluatePackageEligibilityForDays(
    days({ operationalType: 'TOURING_ROUTE' }, { operationalType: 'FULL_DAY_SERVICE' }, { operationalType: 'TOURING_ROUTE' }),
    CONTRACT_MIN3,
  );
  assert.equal(r.countedFullPackageDays, 3);
  assert.equal(r.eligible, true);
  assert.equal(r.reason, null);
  assert.equal(r.billedDays, 3);
});

test('3 retained P2P days → eligible', () => {
  const r = evaluatePackageEligibilityForDays(
    days(
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', retained: true },
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', retained: true },
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', retained: true },
    ),
    CONTRACT_MIN3,
  );
  assert.equal(r.countedFullPackageDays, 3);
  assert.equal(r.eligible, true);
});

test('released P2P days count 0 → ineligible', () => {
  const r = evaluatePackageEligibilityForDays(
    days(
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', vehicleReleased: true },
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', vehicleReleased: true },
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', vehicleReleased: true },
    ),
    CONTRACT_MIN3,
  );
  assert.equal(r.countedFullPackageDays, 0);
  assert.equal(r.eligible, false);
});

test('airport-only days do not count by default → ineligible', () => {
  const r = evaluatePackageEligibilityForDays(
    days({ operationalType: 'AIRPORT_TRANSFER' }, { operationalType: 'AIRPORT_TRANSFER' }, { operationalType: 'AIRPORT_TRANSFER' }),
    CONTRACT_MIN3,
  );
  assert.equal(r.countedFullPackageDays, 0);
  assert.equal(r.eligible, false);
});

test('airport + sightseeing reclassified as TOURING/FULL_DAY counts', () => {
  const r = evaluatePackageEligibilityForDays(
    days({ operationalType: 'TOURING_ROUTE' }, { operationalType: 'FULL_DAY_SERVICE' }, { operationalType: 'TOURING_ROUTE' }),
    CONTRACT_MIN3,
  );
  assert.equal(r.eligible, true);
});

test('half-day does not count by default', () => {
  const r = evaluatePackageEligibilityForDays(
    days({ operationalType: 'HALF_DAY_SERVICE' }, { operationalType: 'HALF_DAY_SERVICE' }, { operationalType: 'HALF_DAY_SERVICE' }),
    CONTRACT_MIN3,
  );
  assert.equal(r.countedFullPackageDays, 0);
  assert.equal(r.eligible, false);
});

test('half-day counts 0.5 only when contract allows', () => {
  const contract: PackageContractCandidate = { minimumFullDays: 3, halfDayCountsTowardMin: true };
  const r = evaluatePackageEligibilityForDays(
    days(
      { operationalType: 'HALF_DAY_SERVICE' },
      { operationalType: 'HALF_DAY_SERVICE' },
      { operationalType: 'HALF_DAY_SERVICE' },
      { operationalType: 'HALF_DAY_SERVICE' },
    ),
    contract,
  );
  assert.equal(r.countedFullPackageDays, 2); // 4 × 0.5
  assert.equal(r.eligible, false); // 2 < 3
});

test('stationary counts only when contract allows', () => {
  const base = days({ operationalType: 'STATIONARY_FULL_DAY' }, { operationalType: 'STATIONARY_FULL_DAY' }, { operationalType: 'STATIONARY_FULL_DAY' });
  const off = evaluatePackageEligibilityForDays(base, { minimumFullDays: 3 });
  assert.equal(off.countedFullPackageDays, 0);
  assert.equal(off.eligible, false);
  const on = evaluatePackageEligibilityForDays(base, { minimumFullDays: 3, stationaryCountsTowardMinDays: true });
  assert.equal(on.countedFullPackageDays, 3);
  assert.equal(on.eligible, true);
});

test('manual-required / retention-candidate days do NOT silently count', () => {
  // same supplier+vehicle adjacency, no release/block signal → candidates, weight 0.
  const r = evaluatePackageEligibilityForDays(
    days(
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1' },
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1' },
      { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1' },
    ),
    CONTRACT_MIN3,
  );
  assert.equal(r.countedFullPackageDays, 0);
  assert.equal(r.eligible, false);
  assert.equal(r.manualRequiredDays, 3);
});

test('CHARGE_MINIMUM_DAYS reports billable minimum only when explicitly set', () => {
  const twoDays = days({ operationalType: 'TOURING_ROUTE' }, { operationalType: 'TOURING_ROUTE' });
  // default policy → ineligible, not billed
  const def = evaluatePackageEligibilityForDays(twoDays, CONTRACT_MIN3);
  assert.equal(def.eligible, false);
  assert.equal(def.billedAtMinimum, false);
  assert.equal(def.billedDays, null);
  // CHARGE_MINIMUM_DAYS → eligible, billed at the 3-day floor
  const chg = evaluatePackageEligibilityForDays(twoDays, CONTRACT_MIN3_CHARGEMIN);
  assert.equal(chg.eligible, true);
  assert.equal(chg.billedAtMinimum, true);
  assert.equal(chg.billedDays, 3);
  assert.equal(chg.countedFullPackageDays, 2);
});

test('core evaluator accepts pre-classified days', () => {
  const classified = classifyItinerary(
    days({ operationalType: 'TOURING_ROUTE' }, { operationalType: 'TOURING_ROUTE' }, { operationalType: 'TOURING_ROUTE' }),
  );
  const r = evaluatePackageEligibility(classified, CONTRACT_MIN3);
  assert.equal(r.eligible, true);
  assert.equal(r.countedFullPackageDays, 3);
});
