import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { auditPlacesMaster } from '../../prisma/seeds/audit-places-master';
import { applyPlaceMasterSelectorCanonicalization, getCanonicalPlaceAliasKey } from './place-master-canonicalization';

const packageSource = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
const scriptSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'seeds', 'audit-places-master.ts'), 'utf8');

function createPrismaMock(places: any[]) {
  let mutationCalls = 0;
  const onMutation = () => {
    mutationCalls += 1;
    throw new Error('Place master audit must not mutate data');
  };

  return {
    getMutationCalls: () => mutationCalls,
    prisma: {
      place: {
        findMany: async () => places,
        create: onMutation,
        update: onMutation,
        updateMany: onMutation,
        delete: onMutation,
        deleteMany: onMutation,
      },
    },
  };
}

test('place master audit script is registered and read-only', () => {
  assert.match(packageSource, /"audit:places-master": "ts-node prisma\/seeds\/audit-places-master\.ts"/);
  assert.doesNotMatch(scriptSource, /\.create\(/);
  assert.doesNotMatch(scriptSource, /\.update\(/);
  assert.doesNotMatch(scriptSource, /\.updateMany\(/);
  assert.doesNotMatch(scriptSource, /\.delete\(/);
  assert.doesNotMatch(scriptSource, /\.deleteMany\(/);
  assert.match(scriptSource, /Place \| Type \| City \| References \| Problem \| Suggested Action/);
  assert.match(scriptSource, /canonicalMappingsApplied/);
  assert.match(scriptSource, /selectorHiddenRows/);
  assert.match(scriptSource, /preservedHistoricalRows/);
});

test('place master audit detects polluted rows aliases and reference-aware actions without mutating', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma, getMutationCalls } = createPrismaMock([
    {
      id: 'petra',
      name: 'Petra',
      type: 'Site',
      city: 'Petra',
      isActive: true,
      _count: { fromRoutes: 1, toRoutes: 0, fromVehicleRates: 0, toVehicleRates: 0 },
    },
    {
      id: 'petra-1d',
      name: 'Petra 1D',
      type: 'Program',
      city: 'Petra',
      isActive: true,
      _count: { fromRoutes: 0, toRoutes: 0, fromVehicleRates: 0, toVehicleRates: 0 },
    },
    {
      id: 'petra-2d',
      name: 'Petra 2D',
      type: 'Package',
      city: 'Petra',
      isActive: true,
      _count: { fromRoutes: 0, toRoutes: 1, fromVehicleRates: 0, toVehicleRates: 1 },
    },
    {
      id: 'qaia',
      name: 'QAIA Airport',
      type: 'Airport',
      city: 'Amman',
      isActive: true,
      _count: { fromRoutes: 2, toRoutes: 0, fromVehicleRates: 0, toVehicleRates: 0 },
    },
    {
      id: 'queen-alia',
      name: 'Queen Alia International Airport',
      type: 'Airport',
      city: 'Amman',
      isActive: true,
      _count: { fromRoutes: 0, toRoutes: 1, fromVehicleRates: 0, toVehicleRates: 0 },
    },
    {
      id: 'aqj',
      name: 'AQJ Airport',
      type: 'Airport',
      city: 'Aqaba',
      isActive: true,
      _count: { fromRoutes: 0, toRoutes: 0, fromVehicleRates: 0, toVehicleRates: 0 },
    },
    {
      id: 'king-hussein',
      name: 'King Hussein International Airport',
      type: 'Airport',
      city: 'Aqaba',
      isActive: true,
      _count: { fromRoutes: 0, toRoutes: 0, fromVehicleRates: 1, toVehicleRates: 0 },
    },
    {
      id: 'aqaba-city',
      name: 'Aqaba City',
      type: 'City',
      city: 'Aqaba',
      isActive: true,
      _count: { fromRoutes: 0, toRoutes: 0, fromVehicleRates: 0, toVehicleRates: 0 },
    },
    {
      id: 'aqaba-center',
      name: 'Aqaba City Center',
      type: 'City Center',
      city: 'Aqaba',
      isActive: true,
      _count: { fromRoutes: 0, toRoutes: 0, fromVehicleRates: 0, toVehicleRates: 0 },
    },
    {
      id: 'deduct-transfer',
      name: 'Deduct Transfer Not Part Of Program',
      type: 'Service',
      city: null,
      isActive: true,
      _count: { fromRoutes: 0, toRoutes: 0, fromVehicleRates: 0, toVehicleRates: 0 },
    },
    {
      id: 'alpha-bus',
      name: 'Alpha Bus Full Day 200km',
      type: 'Supplier Rate',
      city: null,
      isActive: true,
      _count: { fromRoutes: 0, toRoutes: 0, fromVehicleRates: 1, toVehicleRates: 0 },
    },
  ]);

  const result = await auditPlacesMaster(prisma, { logger });
  const output = logs.join('\n');

  assert.equal(getMutationCalls(), 0);
  assert.ok(result.summary.placesChecked >= 11);
  assert.ok(result.summary.pollutedRows >= 4);
  assert.ok(result.summary.duplicateAliasRows >= 5);
  assert.ok(result.summary.canonicalMappingsApplied >= 5);
  assert.ok(result.summary.selectorHiddenRows >= 6);
  assert.ok(result.summary.preservedHistoricalRows >= 4);
  assert.match(output, /Place \| Type \| City \| References \| Problem \| Suggested Action/);
  assert.match(output, /Deduct Transfer Not Part Of Program \| Service \| - \| 0 \|/);
  assert.match(output, /Petra 1D \| Program \| Petra \| 0 \|/);
  assert.match(output, /Petra 2D \| Package \| Petra \| routes:1, vehicleRates:1 \|/);
  assert.match(output, /Queen Alia International Airport \| Airport \| Amman \| routes:1 \| Duplicate\/alias of QAIA Airport/);
  assert.match(output, /King Hussein International Airport \| Airport \| Aqaba \| vehicleRates:1 \| Duplicate\/alias of AQJ Airport/);
  assert.match(output, /Aqaba City Center \| City Center \| Aqaba \| 0 \| Duplicate\/alias of Aqaba City/);
  assert.match(output, /Preserve referenced row; later mark inactive\/hidden/);
  assert.match(output, /Unreferenced cleanup candidate; later hide\/inactivate after review\. Do not delete/);
});

test('place master audit reports no findings for clean canonical places', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma, getMutationCalls } = createPrismaMock([
    { id: 'petra', name: 'Petra', type: 'Site', city: 'Petra', isActive: true, _count: {} },
    { id: 'qaia', name: 'QAIA Airport', type: 'Airport', city: 'Amman', isActive: true, _count: {} },
    { id: 'aqaba-city', name: 'Aqaba City', type: 'City', city: 'Aqaba', isActive: true, _count: {} },
  ]);

  const result = await auditPlacesMaster(prisma, { logger });

  assert.equal(getMutationCalls(), 0);
  assert.equal(result.summary.findings, 0);
  assert.match(logs.join('\n'), /No place master boundary findings/);
});

test('place master audit canonical alias keys match required examples', () => {
  assert.equal(getCanonicalPlaceAliasKey({ name: 'Petra 1D', type: 'Program', city: 'Petra' }), 'petra');
  assert.equal(getCanonicalPlaceAliasKey({ name: 'Queen Alia International Airport', type: 'Airport', city: 'Amman' }), 'qaiaairport');
  assert.equal(getCanonicalPlaceAliasKey({ name: 'King Hussein International Airport', type: 'Airport', city: 'Aqaba' }), 'aqjairport');
  assert.equal(getCanonicalPlaceAliasKey({ name: 'Aqaba City Center', type: 'City Center', city: 'Aqaba' }), 'aqabacity');
  assert.equal(getCanonicalPlaceAliasKey({ name: 'Petra Dead Sea', type: 'Destination', city: 'Petra Dead Sea' }), 'petradeadsea');
  assert.equal(getCanonicalPlaceAliasKey({ name: 'AQJ Airport-Port-South Border 11H', type: 'Destination', city: 'Aqaba' }), 'aqjairportportsouthborder11h');
});

test('place master selector canonicalization hides polluted rows and preserves requested historical rows', () => {
  const places = [
    { id: 'petra', name: 'Petra', type: 'Site', city: 'Petra', country: 'Jordan', isActive: true },
    { id: 'petra-1d', name: 'Petra 1D', type: 'Destination', city: 'Petra', country: 'Jordan', isActive: true },
    { id: 'petra-2d', name: 'Petra 2D', type: 'Destination', city: 'Petra', country: 'Jordan', isActive: true },
    { id: 'qaia', name: 'QAIA Airport', type: 'Airport', city: 'Amman', country: 'Jordan', isActive: true },
    { id: 'queen-alia', name: 'Queen Alia International Airport', type: 'Airport', city: 'Amman', country: 'Jordan', isActive: true },
    { id: 'aqj', name: 'AQJ Airport', type: 'Airport', city: 'Aqaba', country: 'Jordan', isActive: true },
    { id: 'king-hussein', name: 'King Hussein International Airport', type: 'Airport', city: 'Aqaba', country: 'Jordan', isActive: true },
    { id: 'aqaba-city', name: 'Aqaba City', type: 'City', city: 'Aqaba', country: 'Jordan', isActive: true },
    { id: 'aqaba-center', name: 'Aqaba City Center', type: 'City Center', city: 'Aqaba', country: 'Jordan', isActive: true },
    { id: 'alpha-full-day', name: 'Alpha Bus Full Day 200km', type: 'Destination', city: 'Amman', country: 'Jordan', isActive: true },
    { id: 'alpha-extra-km', name: 'Alpha Bus Extra KM', type: 'Location', city: 'Amman', country: 'Jordan', isActive: true },
    { id: 'alpha-extra-hour', name: 'Alpha Limo Extra Hour', type: 'Location', city: 'Amman', country: 'Jordan', isActive: true },
    { id: 'alpha-driver', name: 'Alpha Driver Overnight', type: 'Location', city: 'Amman', country: 'Jordan', isActive: true },
    { id: 'stationary', name: 'Stationary', type: 'Destination', city: 'Amman', country: 'Jordan', isActive: true },
    { id: 'disposal', name: 'Dead Sea Disposal', type: 'Destination', city: 'Dead Sea', country: 'Jordan', isActive: true },
    { id: 'transfer-deduction', name: 'Alpha Bus Transfer Deduction', type: 'Destination', city: 'Amman', country: 'Jordan', isActive: true },
    { id: 'route-label', name: 'Amman - madaba', type: 'Destination', city: 'Amman', country: 'Jordan', isActive: true },
  ];

  const selectorResult = applyPlaceMasterSelectorCanonicalization(places);
  assert.deepEqual(selectorResult.places.map((place) => place.id), ['petra', 'qaia', 'aqj', 'aqaba-city']);
  assert.equal(selectorResult.summary.canonicalMappingsApplied, 5);
  assert.equal(selectorResult.summary.selectorHiddenRows, 13);
  assert.equal(selectorResult.summary.preservedHistoricalRows, 0);

  const historicalResult = applyPlaceMasterSelectorCanonicalization(places, { includeIds: ['petra-1d', 'queen-alia', 'route-label'] });
  assert.deepEqual(historicalResult.places.map((place) => place.id), ['petra', 'petra-1d', 'qaia', 'queen-alia', 'aqj', 'aqaba-city', 'route-label']);
  assert.equal((historicalResult.places.find((place: any) => place.id === 'petra-1d') as any).canonicalPlaceId, 'petra');
  assert.equal((historicalResult.places.find((place: any) => place.id === 'petra-1d') as any).selectorHidden, true);
  assert.equal((historicalResult.places.find((place: any) => place.id === 'queen-alia') as any).canonicalPlaceId, 'qaia');
  assert.equal((historicalResult.places.find((place: any) => place.id === 'route-label') as any).selectorHidden, true);
  assert.equal(historicalResult.summary.preservedHistoricalRows, 3);
});
