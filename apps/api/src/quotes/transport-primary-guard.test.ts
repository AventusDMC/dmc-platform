import test = require('node:test');
import assert = require('node:assert/strict');
import { isNicheTransportPrimaryService, isPrimaryTransportRequest } from './transport-primary-guard';

// Emergency defense-in-depth — createItem/updateItem reject a niche/add-on
// transport SupplierService as the PRIMARY transport container, while still
// allowing valid transfer / full-day / point-to-point services.

test('5/6. rejects niche/add-on transport services as primary', () => {
  for (const name of [
    'Petra Overnight',
    'Wadi Rum Overnight',
    'Dead Sea Overnight',
    'Aqaba Overnight',
    'Driver Overnight',
    'Stationary',
    'Stationary / Waiting',
    'Extra KM',
    'Extra Hour',
    'Border Transfer',
  ]) {
    assert.equal(isNicheTransportPrimaryService({ name, category: 'Transport' }), true, `should reject "${name}"`);
  }
});

test('7. allows valid primary transport services', () => {
  for (const name of [
    'Airport Transfer',
    'Point-to-Point',
    'Daily Full Day',
    'Full Day',
    'Half Day',
    'Private Transfer',
    'Private Transfer Service',
    'Jordan Private Transfer Service',
    'Imported Transport',
  ]) {
    assert.equal(isNicheTransportPrimaryService({ name, category: 'Transport' }), false, `should allow "${name}"`);
  }
});

test('isPrimaryTransportRequest detects a primary transport line', () => {
  assert.equal(isPrimaryTransportRequest({ transportServiceTypeId: 'x' }), true);
  assert.equal(isPrimaryTransportRequest({ routeId: 'x' }), true);
  assert.equal(isPrimaryTransportRequest({ vehicleRateId: 'x' }), true);
  assert.equal(isPrimaryTransportRequest({}), false);
  assert.equal(isPrimaryTransportRequest({ transportServiceTypeId: null, routeId: null, vehicleRateId: null }), false);
});

test('null/empty service is not flagged', () => {
  assert.equal(isNicheTransportPrimaryService(null), false);
  assert.equal(isNicheTransportPrimaryService({}), false);
});
