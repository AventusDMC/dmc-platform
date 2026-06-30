import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPaxRoomingVM,
  computeRoomValidity,
  getRoomOccupancyCapacity,
} from './ops-pax-rooming-vm';
import { COST_LEAK_VALUE, EMPTY_DETAIL, SAMPLE_DETAIL } from './ops-pax-rooming.fixtures';

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
