import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { auditFleetTaxonomyPhase1 } from '../../prisma/seeds/audit-fleet-taxonomy-phase1';

const packageSource = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
const scriptSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'seeds', 'audit-fleet-taxonomy-phase1.ts'), 'utf8');

function createPrismaMock(vehicles: any[]) {
  let destructiveCalls = 0;
  return {
    getDestructiveCalls: () => destructiveCalls,
    prisma: {
      vehicle: {
        findMany: async () => vehicles,
        update: async () => {
          throw new Error('Fleet audit must not mutate vehicles');
        },
        create: async () => {
          throw new Error('Fleet audit must not create vehicles');
        },
        delete: () => {
          destructiveCalls += 1;
          throw new Error('Fleet audit must not delete vehicles');
        },
        deleteMany: () => {
          destructiveCalls += 1;
          throw new Error('Fleet audit must not delete vehicles');
        },
      },
    },
  };
}

const canonicalVehicles = [
  { id: 'sedan', name: 'Sedan 2', vehicleType: 'Sedan', maxPax: 2 },
  { id: 'mini-van', name: 'Mini Van 6', vehicleType: 'Mini Van', maxPax: 6 },
  { id: 'van', name: 'Van 9', vehicleType: 'Van', maxPax: 9 },
  { id: 'coaster', name: 'Toyota Coaster / Mini Bus 17', vehicleType: 'Mini Bus', maxPax: 17 },
  { id: 'medium', name: 'Medium Bus 30', vehicleType: 'Medium Bus', maxPax: 30 },
  { id: 'large', name: 'Large Coach 49', vehicleType: 'Large Bus', maxPax: 49 },
];

test('fleet taxonomy audit is exposed as a dry-run non-destructive script', () => {
  assert.match(packageSource, /"audit:fleet-taxonomy": "ts-node prisma\/seeds\/audit-fleet-taxonomy-phase1\.ts"/);
  assert.match(scriptSource, /No records will be changed or deleted/);
  assert.doesNotMatch(scriptSource, /\.update\(/);
  assert.doesNotMatch(scriptSource, /\.create\(/);
  assert.doesNotMatch(scriptSource, /\.deleteMany\(/);
  assert.doesNotMatch(scriptSource, /\.delete\(/);
});

test('fleet taxonomy audit passes canonical operational fleet without findings', async () => {
  const { prisma, getDestructiveCalls } = createPrismaMock(canonicalVehicles);
  const summary = await auditFleetTaxonomyPhase1(prisma, { logger: { log: () => undefined, warn: () => undefined } });

  assert.equal(summary.vehiclesChecked, 6);
  assert.equal(summary.findings, 0);
  assert.equal(getDestructiveCalls(), 0);
});

test('fleet taxonomy audit detects incorrect labels and overlapping categories', async () => {
  const logs: string[] = [];
  const logger = { log: (message: unknown) => logs.push(String(message)), warn: (message: unknown) => logs.push(String(message)) };
  const { prisma } = createPrismaMock([
    { id: 'bad-minivan', name: 'Mini Van 5', vehicleType: 'Mini Van', maxPax: 9 },
    { id: 'bad-coaster', name: 'Toyota Coaster Mini Coach', vehicleType: 'Mini Bus', maxPax: 49 },
    { id: 'bad-vvip', name: 'Large VVIP 29', vehicleType: 'Large Bus', maxPax: 17 },
    { id: 'bad-capacity', name: 'Mystery Vehicle', vehicleType: 'Mystery', maxPax: 0 },
  ]);

  const summary = await auditFleetTaxonomyPhase1(prisma, { logger });
  const output = logs.join('\n');

  assert.equal(summary.overlappingCanonicalCategories, 3);
  assert.equal(summary.invalidCapacityRanges, 1);
  assert.match(output, /Vehicle \| Current Capacity \| Suggested Canonical Category \| Action/);
  assert.match(output, /Mini Van 5 \| 1-9 \| Van/);
  assert.match(output, /Toyota Coaster Mini Coach \| 1-49 \| Large Coach \/ Large Bus/);
  assert.match(output, /Large VVIP 29 \| 1-17 \| Toyota Coaster \/ Mini Bus/);
  assert.match(output, /Mystery Vehicle \| missing \| Manual review/);
});

test('fleet taxonomy audit reports duplicate capacities and missing canonical rows', async () => {
  const { prisma } = createPrismaMock([
    { id: 'sedan-1', name: 'Sedan 2 A', vehicleType: 'Sedan', maxPax: 2 },
    { id: 'sedan-2', name: 'Sedan 2 B', vehicleType: 'Sedan', maxPax: 2 },
    { id: 'large', name: 'Large Coach 49', vehicleType: 'Large Bus', maxPax: 49 },
  ]);

  const summary = await auditFleetTaxonomyPhase1(prisma, { logger: { log: () => undefined, warn: () => undefined } });

  assert.equal(summary.duplicateOperationalCapacities, 1);
  assert.equal(summary.missingCanonicalRows, 4);
});
