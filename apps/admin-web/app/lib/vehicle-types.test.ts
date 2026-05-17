import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getJordanVehicleCapacityMatches, getJordanVehicleCapacityRange, JORDAN_VEHICLE_CAPACITY_RANGES } from './vehicle-types';

describe('Jordan vehicle capacity standards', () => {
  it('keeps the standard overlapping operational ranges', () => {
    assert.deepEqual(
      JORDAN_VEHICLE_CAPACITY_RANGES.map((range) => [range.label, range.minPax, range.maxPax]),
      [
        ['Sedan', 1, 2],
        ['Mini Van', 3, 6],
        ['Van', 6, 9],
        ['Mini Bus / Toyota Coaster', 9, 17],
        ['Medium Bus', 14, 29],
        ['Large Bus', 30, 48],
        ['Large Bus X', 30, 51],
      ],
    );
  });

  it('returns all matching ranges when capacity bands overlap', () => {
    assert.deepEqual(
      getJordanVehicleCapacityMatches(9).map((range) => range.label),
      ['Van', 'Mini Bus / Toyota Coaster'],
    );
    assert.deepEqual(
      getJordanVehicleCapacityMatches(30).map((range) => range.label),
      ['Large Bus', 'Large Bus X'],
    );
  });

  it('maps common Jordan vehicle labels to the standard capacity range', () => {
    assert.equal(getJordanVehicleCapacityRange('Toyota Coaster')?.label, 'Mini Bus / Toyota Coaster');
    assert.equal(getJordanVehicleCapacityRange('Large Bus X')?.label, 'Large Bus X');
    assert.equal(getJordanVehicleCapacityRange('Medium 30')?.label, 'Medium Bus');
  });
});
