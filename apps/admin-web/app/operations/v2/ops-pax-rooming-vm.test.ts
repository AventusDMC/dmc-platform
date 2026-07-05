import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPaxRoomingVM,
  computeRoomValidity,
  getRoomOccupancyCapacity,
} from './ops-pax-rooming-vm';
import {
  COST_LEAK_VALUE,
  EMPTY_DETAIL,
  NO_TRAVEL_DETAIL,
  READY_DETAIL,
  SAMPLE_DETAIL,
  WARN_DETAIL,
} from './ops-pax-rooming.fixtures';

describe('ops-pax-rooming-vm — passengers', () => {
  const vm = buildPaxRoomingVM(SAMPLE_DETAIL);

  it('maps the lead passenger flag', () => {
    const lead = vm.passengers.find((p) => p.id === 'p-lead');
    assert.ok(lead);
    assert.equal(lead!.isLead, true);
    assert.equal(lead!.name, 'Mr James Anderson');
    assert.equal(vm.passengers.filter((p) => p.isLead).length, 1);
  });

  it('maps dietary + rooming notes', () => {
    const sarah = vm.passengers.find((p) => p.id === 'p-sarah')!;
    assert.equal(sarah.dietaryNotes, 'Vegetarian');
    const lead = vm.passengers.find((p) => p.id === 'p-lead')!;
    assert.equal(lead.roomingNotes, 'Prefers high floor');
  });

  it('renders missing passenger fields safely (null, not crash)', () => {
    const mia = vm.passengers.find((p) => p.id === 'p-mia')!;
    assert.equal(mia.passportMasked, null);
    assert.equal(mia.nationality, null);
    assert.equal(mia.arrivalFlight, null);
    assert.equal(mia.name, 'Ms Mia Anderson');
  });

  it('uses the API-masked passport value only', () => {
    const lead = vm.passengers.find((p) => p.id === 'p-lead')!;
    assert.equal(lead.passportMasked, '55•••••1');
  });

  it('maps a fully-redacted passenger safely (restricted-role PR-3a payload)', () => {
    // Mirrors the backend redaction for a restricted role: identity kept, every
    // sensitive manifest field nulled. The VM must map it without throwing.
    const redactedVm = buildPaxRoomingVM({
      startDate: '2026-10-01',
      endDate: '2026-10-05',
      passengers: [
        {
          id: 'p-redacted',
          firstName: 'Lina',
          lastName: 'Haddad',
          title: 'Ms',
          isLead: true,
          nationality: null,
          passportNumberMasked: null,
          passportExpiryDate: null,
          arrivalFlight: null,
          departureFlight: null,
          dietaryNotes: null,
          roomingNotes: null,
        },
      ],
    });
    const p = redactedVm.passengers.find((x) => x.id === 'p-redacted')!;
    assert.equal(p.name, 'Ms Lina Haddad');
    assert.equal(p.isLead, true);
    assert.equal(p.passportMasked, null);
    assert.equal(p.missingPassport, true);
    assert.equal(p.passportExpiring, false);
    assert.equal(p.nationality, null);
    assert.equal(p.arrivalFlight, null);
    assert.equal(p.dietaryNotes, null);
  });

  it('NEVER carries financial fields through the allowlist', () => {
    const serialized = JSON.stringify(vm);
    assert.ok(!serialized.includes(COST_LEAK_VALUE), `pax view model leaked value ${COST_LEAK_VALUE}`);
    assert.ok(!/unitSell|unitCost|totalSell|payable|margin|invoice/i.test(serialized), 'pax VM leaked a financial key');
  });
});

describe('ops-pax-rooming-vm — rooming validity (pinned to Classic)', () => {
  const vm = buildPaxRoomingVM(SAMPLE_DETAIL);
  const byId = Object.fromEntries(vm.rooms.map((r) => [r.id, r]));

  it('Valid: capacity == assigned', () => {
    assert.equal(byId['r-valid'].validity, 'Valid');
    assert.equal(byId['r-valid'].capacity, 2);
    assert.deepEqual(byId['r-valid'].assignedNames, ['Mr James Anderson', 'Mrs Sarah Anderson']);
  });

  it('assignedPassengers carries ids + names (PR-2c-2, for unassign/assign)', () => {
    assert.deepEqual(byId['r-valid'].assignedPassengers, [
      { id: 'p-lead', name: 'Mr James Anderson' },
      { id: 'p-sarah', name: 'Mrs Sarah Anderson' },
    ]);
    assert.deepEqual(byId['r-needs'].assignedPassengers, []);
  });

  it('Mismatch: capacity != assigned', () => {
    assert.equal(byId['r-mismatch'].validity, 'Mismatch');
  });

  it('Needs occupancy: unknown capacity + no assignments', () => {
    assert.equal(byId['r-needs'].validity, 'Needs occupancy');
    assert.equal(byId['r-needs'].capacity, null);
  });

  it('Assigned: unknown capacity + has assignments', () => {
    assert.equal(byId['r-assigned'].validity, 'Assigned');
  });

  it('capacity helper matches Classic mapping', () => {
    assert.equal(getRoomOccupancyCapacity('single', null), 1);
    assert.equal(getRoomOccupancyCapacity('double', null), 2);
    assert.equal(getRoomOccupancyCapacity('triple', null), 3);
    assert.equal(getRoomOccupancyCapacity('quad', null), 4);
    assert.equal(getRoomOccupancyCapacity('unknown', null), null);
    assert.equal(getRoomOccupancyCapacity('unknown', 'TWN'), 2);
    assert.equal(getRoomOccupancyCapacity('unknown', 'CWB'), 1);
  });

  it('computeRoomValidity edge cases', () => {
    assert.equal(computeRoomValidity(2, 2), 'Valid');
    assert.equal(computeRoomValidity(2, 1), 'Mismatch');
    assert.equal(computeRoomValidity(null, 0), 'Needs occupancy');
    assert.equal(computeRoomValidity(null, 1), 'Assigned');
  });

  it('rooms are sorted by sortOrder', () => {
    assert.deepEqual(vm.rooms.map((r) => r.id), ['r-valid', 'r-mismatch', 'r-needs', 'r-assigned']);
  });
});

describe('ops-pax-rooming-vm — advisory readiness (PR-1)', () => {
  const codesOf = (detail: Parameters<typeof buildPaxRoomingVM>[0]) =>
    buildPaxRoomingVM(detail).readiness.warnings.map((w) => w.code);

  it('WARN fixture raises all six advisory warnings, isReady false', () => {
    const vm = buildPaxRoomingVM(WARN_DETAIL);
    const codes = vm.readiness.warnings.map((w) => w.code).sort();
    assert.deepEqual(codes, [
      'empty-rooms',
      'missing-passport',
      'passport-expiry',
      'room-count-vs-pax',
      'rooms-vs-roomCount',
      'unassigned-passengers',
    ]);
    assert.equal(vm.readiness.isReady, false);
    // every warning is advisory only
    assert.ok(vm.readiness.warnings.every((w) => w.level === 'warning'));
  });

  it('WARN fixture reports meaningful counts', () => {
    const byCode = Object.fromEntries(
      buildPaxRoomingVM(WARN_DETAIL).readiness.warnings.map((w) => [w.code, w.count]),
    );
    assert.equal(byCode['unassigned-passengers'], 2); // w2, w3
    assert.equal(byCode['empty-rooms'], 1); // wr-b
    assert.equal(byCode['missing-passport'], 1); // w2
    assert.equal(byCode['passport-expiry'], 1); // w1
    assert.equal(byCode['rooms-vs-roomCount'], 1); // 2 vs 3
    assert.equal(byCode['room-count-vs-pax'], 1); // capacity 2 vs 3 pax
  });

  it('READY fixture is clean — zero warnings, isReady true', () => {
    const vm = buildPaxRoomingVM(READY_DETAIL);
    assert.deepEqual(vm.readiness.warnings, []);
    assert.equal(vm.readiness.isReady, true);
  });

  it('each warning is absent when its condition is not met (READY has none of them)', () => {
    const codes = codesOf(READY_DETAIL);
    for (const c of [
      'room-count-vs-pax',
      'rooms-vs-roomCount',
      'unassigned-passengers',
      'empty-rooms',
      'missing-passport',
      'passport-expiry',
    ]) {
      assert.ok(!codes.includes(c as never), `unexpected warning ${c} in clean booking`);
    }
  });

  it('passport EXPIRING inside 6 months of travel warns + sets the per-row flag', () => {
    const vm = buildPaxRoomingVM(WARN_DETAIL);
    const w1 = vm.passengers.find((p) => p.id === 'w1')!;
    assert.equal(w1.passportExpiring, true);
    assert.ok(codesOf(WARN_DETAIL).includes('passport-expiry'));
  });

  it('passport valid OUTSIDE 6 months does not warn', () => {
    const vm = buildPaxRoomingVM(READY_DETAIL);
    assert.ok(vm.passengers.every((p) => p.passportExpiring === false));
    assert.ok(!codesOf(READY_DETAIL).includes('passport-expiry'));
  });

  it('missing travel dates SKIP the expiry warning (no false positive)', () => {
    const vm = buildPaxRoomingVM(NO_TRAVEL_DETAIL);
    const n1 = vm.passengers.find((p) => p.id === 'n1')!;
    assert.equal(n1.passportExpiring, false);
    assert.equal(n1.passportExpiryDaysToTravel, null);
    assert.ok(!vm.readiness.warnings.some((w) => w.code === 'passport-expiry'));
    assert.equal(vm.readiness.isReady, true);
  });

  it('per-row missingPassport flag is set only for passengers without a passport', () => {
    const vm = buildPaxRoomingVM(WARN_DETAIL);
    assert.equal(vm.passengers.find((p) => p.id === 'w2')!.missingPassport, true);
    assert.equal(vm.passengers.find((p) => p.id === 'w1')!.missingPassport, false);
  });

  it('readiness carries no finance/cost/sell/margin fields', () => {
    const serialized = JSON.stringify(buildPaxRoomingVM(WARN_DETAIL).readiness);
    assert.ok(!/unitSell|unitCost|totalSell|payable|margin|invoice|cost/i.test(serialized), 'readiness leaked a financial key');
  });
});

describe('ops-pax-rooming-vm — empty', () => {
  it('reports no passengers / no rooms', () => {
    const vm = buildPaxRoomingVM(EMPTY_DETAIL);
    assert.equal(vm.hasPassengers, false);
    assert.equal(vm.hasRooms, false);
    assert.deepEqual(vm.passengers, []);
    assert.deepEqual(vm.rooms, []);
  });

  it('handles null/undefined detail without throwing', () => {
    const vm = buildPaxRoomingVM(null);
    assert.equal(vm.hasPassengers, false);
    assert.equal(vm.hasRooms, false);
  });
});
