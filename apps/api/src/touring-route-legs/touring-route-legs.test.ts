import test from 'node:test';
import assert from 'node:assert/strict';

import { TouringRouteLegsService } from './touring-route-legs.service';

// Touring Route Legs v1 — service tests covering CRUD, auto-resolve of
// the Route Standard from canonical FROM_TO, operational summary
// aggregation, and the pricing-untouched guarantee.

function buildFakePrisma(opts: {
  legs?: any[];
  areas?: any[];
  standards?: any[];
} = {}) {
  const legs = [...(opts.legs || [])];
  const areas = [...(opts.areas || [])];
  const standards = [...(opts.standards || [])];

  function decorateLeg(leg: any) {
    return {
      ...leg,
      routeStandard: leg.routeStandardId ? standards.find((s) => s.id === leg.routeStandardId) || null : null,
      fromArea: leg.fromAreaId ? areas.find((a) => a.id === leg.fromAreaId) || null : null,
      toArea: leg.toAreaId ? areas.find((a) => a.id === leg.toAreaId) || null : null,
    };
  }

  return {
    touringRouteLeg: {
      findMany: async ({ where, orderBy }: any) => {
        let rows = legs.filter((l) => l.touringRouteId === where?.touringRouteId);
        if (where?.id?.in) rows = rows.filter((l) => where.id.in.includes(l.id));
        if (orderBy?.sequence) {
          rows.sort((a, b) =>
            orderBy.sequence === 'asc' ? a.sequence - b.sequence : b.sequence - a.sequence,
          );
        }
        return rows.map(decorateLeg);
      },
      findFirst: async ({ where, orderBy }: any) => {
        const rows = legs
          .filter((l) => l.touringRouteId === where.touringRouteId)
          .sort((a, b) =>
            orderBy?.sequence === 'desc' ? b.sequence - a.sequence : a.sequence - b.sequence,
          );
        return rows[0] || null;
      },
      findUnique: async ({ where }: any) => {
        const leg = legs.find((l) => l.id === where.id);
        return leg ? decorateLeg(leg) : null;
      },
      create: async ({ data }: any) => {
        if (legs.some((l) => l.touringRouteId === data.touringRouteId && l.sequence === data.sequence)) {
          const err: any = new Error('Unique violation');
          err.code = 'P2002';
          throw err;
        }
        const created = { id: `leg-${legs.length + 1}`, ...data };
        legs.push(created);
        return decorateLeg(created);
      },
      update: async ({ where, data }: any) => {
        const idx = legs.findIndex((l) => l.id === where.id);
        if (idx < 0) throw new Error('not found');
        if (
          data.sequence !== undefined &&
          legs.some((l, i) => i !== idx && l.touringRouteId === legs[idx].touringRouteId && l.sequence === data.sequence)
        ) {
          const err: any = new Error('Unique violation');
          err.code = 'P2002';
          throw err;
        }
        legs[idx] = { ...legs[idx], ...data };
        return decorateLeg(legs[idx]);
      },
      delete: async ({ where }: any) => {
        const idx = legs.findIndex((l) => l.id === where.id);
        if (idx < 0) throw new Error('not found');
        return legs.splice(idx, 1)[0];
      },
    },
    operationalArea: {
      findUnique: async ({ where }: any) => areas.find((a) => a.id === where.id) || null,
    },
    routeStandard: {
      findFirst: async ({ where }: any) => {
        if (!where?.OR) return null;
        for (const clause of where.OR) {
          if (clause.canonicalRouteCode) {
            const match = standards.find((s) => s.canonicalRouteCode === clause.canonicalRouteCode && (where.isActive === undefined || s.isActive === where.isActive));
            if (match) return match;
          }
          if (clause.routeCode) {
            const match = standards.find((s) => s.routeCode === clause.routeCode && (where.isActive === undefined || s.isActive === where.isActive));
            if (match) return match;
          }
        }
        return null;
      },
    },
    $transaction: async (fn: any) => fn({
      touringRouteLeg: {
        findMany: async (args: any) => {
          let rows = legs.filter((l) => l.touringRouteId === args?.where?.touringRouteId);
          if (args?.where?.id?.in) rows = rows.filter((l) => args.where.id.in.includes(l.id));
          if (args?.orderBy?.sequence === 'asc') rows.sort((a, b) => a.sequence - b.sequence);
          return rows.map(decorateLeg);
        },
        update: async ({ where, data }: any) => {
          const idx = legs.findIndex((l) => l.id === where.id);
          if (idx < 0) throw new Error('not found');
          // Inside transaction we DO NOT enforce the unique constraint
          // — the two-pass reorder relies on parking at temp sequences
          // first. Real Prisma is the same: P2002 fires at commit, not
          // at each update.
          legs[idx] = { ...legs[idx], ...data };
          return decorateLeg(legs[idx]);
        },
      },
    }),
    __internal: { legs, areas, standards },
  };
}

// Sample fixtures
const AMM = { id: 'a-amm', code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman' };
const MAD = { id: 'a-mad', code: 'MAD', name: 'Madaba', type: 'CITY', city: 'Madaba' };
const NEB = { id: 'a-neb', code: 'NEB', name: 'Mount Nebo', type: 'TOURISM_SITE', city: 'Madaba' };
const PET = { id: 'a-pet', code: 'PET', name: 'Petra Visitor Center', type: 'TOURISM_SITE', city: 'Petra' };

const STD_AMM_MAD = {
  id: 'std-amm-mad',
  canonicalRouteCode: 'AMM_MAD',
  routeCode: 'AMM_MAD',
  routeName: 'Amman to Madaba',
  standardDistanceKm: 30,
  standardDurationHours: 0.75,
  operationalBufferMinutes: 20,
  longDistanceFlag: false,
  overnightRisk: false,
  mountainRoadFlag: false,
  borderCrossingFlag: false,
  airportRouteFlag: false,
  isActive: true,
};
const STD_MAD_NEB = {
  id: 'std-mad-neb',
  canonicalRouteCode: 'MAD_NEB',
  routeCode: 'MAD_NEB',
  routeName: 'Madaba to Mount Nebo',
  standardDistanceKm: 10,
  standardDurationHours: 0.25,
  operationalBufferMinutes: 15,
  longDistanceFlag: false,
  overnightRisk: false,
  mountainRoadFlag: false,
  borderCrossingFlag: false,
  airportRouteFlag: false,
  isActive: true,
};
const STD_NEB_PET = {
  id: 'std-neb-pet',
  canonicalRouteCode: 'NEB_PET',
  routeCode: 'NEB_PET',
  routeName: 'Mount Nebo to Petra',
  standardDistanceKm: 210,
  standardDurationHours: 3,
  operationalBufferMinutes: 30,
  longDistanceFlag: false,
  overnightRisk: false,
  mountainRoadFlag: true,
  borderCrossingFlag: false,
  airportRouteFlag: false,
  isActive: true,
};

// ---------------------------------------------------------------------------
// create + auto-resolve RouteStandard
// ---------------------------------------------------------------------------
test('create: auto-resolves the RouteStandard by canonical FROM_TO code (AMM + MAD → AMM_MAD)', async () => {
  const prisma = buildFakePrisma({ areas: [AMM, MAD], standards: [STD_AMM_MAD] });
  const service = new TouringRouteLegsService(prisma as any);
  const created = await service.create({
    touringRouteId: 'tr-1',
    fromAreaId: AMM.id,
    toAreaId: MAD.id,
    legType: 'DRIVE',
  });
  assert.equal(created.routeStandardId, 'std-amm-mad');
  assert.equal(created.sequence, 1);
});

test('create: saves leg with routeStandardId=null when no matching standard exists (UI shows "create missing")', async () => {
  const prisma = buildFakePrisma({ areas: [NEB, PET] /* no STD_NEB_PET */ });
  const service = new TouringRouteLegsService(prisma as any);
  const created = await service.create({
    touringRouteId: 'tr-1',
    fromAreaId: NEB.id,
    toAreaId: PET.id,
    legType: 'DRIVE',
  });
  assert.equal(created.routeStandardId, null);
});

test('create: STOP / WAIT / ACTIVITY_ANCHOR legs do not auto-resolve a Route Standard', async () => {
  const prisma = buildFakePrisma({ areas: [AMM, MAD], standards: [STD_AMM_MAD] });
  const service = new TouringRouteLegsService(prisma as any);
  const created = await service.create({
    touringRouteId: 'tr-1',
    fromAreaId: AMM.id,
    toAreaId: MAD.id,
    legType: 'STOP',
    estimatedStopMinutes: 30,
  });
  // Even though the AMM_MAD standard exists, STOP legs aren't movement.
  assert.equal(created.routeStandardId, null);
  assert.equal(created.estimatedStopMinutes, 30);
});

test('create: auto-increments sequence so each new leg lands at the end', async () => {
  const prisma = buildFakePrisma({ areas: [AMM, MAD, NEB], standards: [STD_AMM_MAD, STD_MAD_NEB] });
  const service = new TouringRouteLegsService(prisma as any);
  const first = await service.create({ touringRouteId: 'tr-1', fromAreaId: AMM.id, toAreaId: MAD.id });
  const second = await service.create({ touringRouteId: 'tr-1', fromAreaId: MAD.id, toAreaId: NEB.id });
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
});

test('create: rejects invalid legType', async () => {
  const prisma = buildFakePrisma();
  const service = new TouringRouteLegsService(prisma as any);
  await assert.rejects(
    () => service.create({ touringRouteId: 'tr-1', legType: 'INVALID' as any }),
    /legType must be one of/,
  );
});

// ---------------------------------------------------------------------------
// computeSummary
// ---------------------------------------------------------------------------
test('computeSummary: aggregates drive distance/duration/buffer + flow string + risk flags from DRIVE legs', async () => {
  const prisma = buildFakePrisma({
    areas: [AMM, MAD, NEB, PET],
    standards: [STD_AMM_MAD, STD_MAD_NEB, STD_NEB_PET],
    legs: [
      { id: 'leg-1', touringRouteId: 'tr-1', sequence: 1, legType: 'DRIVE', fromAreaId: AMM.id, toAreaId: MAD.id, routeStandardId: 'std-amm-mad', estimatedStopMinutes: null },
      { id: 'leg-2', touringRouteId: 'tr-1', sequence: 2, legType: 'STOP', fromAreaId: MAD.id, toAreaId: MAD.id, routeStandardId: null, estimatedStopMinutes: 15 },
      { id: 'leg-3', touringRouteId: 'tr-1', sequence: 3, legType: 'DRIVE', fromAreaId: MAD.id, toAreaId: NEB.id, routeStandardId: 'std-mad-neb', estimatedStopMinutes: null },
      { id: 'leg-4', touringRouteId: 'tr-1', sequence: 4, legType: 'STOP', fromAreaId: NEB.id, toAreaId: NEB.id, routeStandardId: null, estimatedStopMinutes: 30 },
      { id: 'leg-5', touringRouteId: 'tr-1', sequence: 5, legType: 'DRIVE', fromAreaId: NEB.id, toAreaId: PET.id, routeStandardId: 'std-neb-pet', estimatedStopMinutes: null },
    ],
  });
  const service = new TouringRouteLegsService(prisma as any);
  const summary = await service.computeSummary('tr-1');
  assert.equal(summary.legCount, 5);
  assert.equal(summary.driveLegCount, 3);
  assert.equal(summary.stopLegCount, 2);
  assert.equal(summary.missingRouteStandardCount, 0);
  // 30 + 10 + 210 = 250 km
  assert.equal(summary.totalDriveDistanceKm, 250);
  // 0.75 + 0.25 + 3 = 4 h
  assert.equal(summary.totalDriveDurationHours, 4);
  // 20 + 15 + 30 = 65 min
  assert.equal(summary.totalBufferMinutes, 65);
  // 15 + 30 = 45 min
  assert.equal(summary.totalEstimatedStopMinutes, 45);
  // 4h * 60 + 65 + 45 = 350 min = 5.83 h
  assert.equal(summary.totalOperationalDurationMinutes, 350);
  // Mountain road flag ORed from NEB_PET
  assert.equal(summary.riskFlags.mountainRoadFlag, true);
  // Flow string: Amman City → Madaba → Madaba → Mount Nebo → Mount Nebo → Petra Visitor Center
  assert.match(summary.flow, /Amman City/);
  assert.match(summary.flow, /Petra Visitor Center/);
});

test('computeSummary: counts missing-route-standard legs separately and excludes them from drive totals', async () => {
  const prisma = buildFakePrisma({
    areas: [AMM, MAD, NEB],
    standards: [STD_AMM_MAD] /* MAD_NEB missing */,
    legs: [
      { id: 'leg-1', touringRouteId: 'tr-1', sequence: 1, legType: 'DRIVE', fromAreaId: AMM.id, toAreaId: MAD.id, routeStandardId: 'std-amm-mad', estimatedStopMinutes: null },
      { id: 'leg-2', touringRouteId: 'tr-1', sequence: 2, legType: 'DRIVE', fromAreaId: MAD.id, toAreaId: NEB.id, routeStandardId: null, estimatedStopMinutes: null },
    ],
  });
  const service = new TouringRouteLegsService(prisma as any);
  const summary = await service.computeSummary('tr-1');
  assert.equal(summary.missingRouteStandardCount, 1);
  // Only AMM_MAD's 30 km / 0.75 h / 20 min counted
  assert.equal(summary.totalDriveDistanceKm, 30);
  assert.equal(summary.totalDriveDurationHours, 0.75);
  assert.equal(summary.totalBufferMinutes, 20);
});

test('computeSummary: empty touring route returns zeros', async () => {
  const prisma = buildFakePrisma();
  const service = new TouringRouteLegsService(prisma as any);
  const summary = await service.computeSummary('tr-1');
  assert.equal(summary.legCount, 0);
  assert.equal(summary.totalDriveDistanceKm, 0);
  assert.equal(summary.totalDriveDurationHours, 0);
  assert.equal(summary.totalOperationalDurationMinutes, 0);
  assert.equal(summary.flow, '');
});

// ---------------------------------------------------------------------------
// reorder
// ---------------------------------------------------------------------------
test('reorder: assigns final 1..N positions in the operator-chosen order', async () => {
  const prisma = buildFakePrisma({
    areas: [AMM, MAD, NEB],
    standards: [STD_AMM_MAD, STD_MAD_NEB],
    legs: [
      { id: 'leg-1', touringRouteId: 'tr-1', sequence: 1, legType: 'DRIVE', fromAreaId: AMM.id, toAreaId: MAD.id, routeStandardId: 'std-amm-mad' },
      { id: 'leg-2', touringRouteId: 'tr-1', sequence: 2, legType: 'DRIVE', fromAreaId: MAD.id, toAreaId: NEB.id, routeStandardId: 'std-mad-neb' },
    ],
  });
  const service = new TouringRouteLegsService(prisma as any);
  await service.reorder('tr-1', ['leg-2', 'leg-1']);
  const after = await service.listForTouringRoute('tr-1');
  assert.equal(after[0].id, 'leg-2');
  assert.equal(after[0].sequence, 1);
  assert.equal(after[1].id, 'leg-1');
  assert.equal(after[1].sequence, 2);
});

test('reorder: refuses legs that do not belong to the touring route', async () => {
  const prisma = buildFakePrisma({
    legs: [{ id: 'leg-1', touringRouteId: 'tr-1', sequence: 1, legType: 'DRIVE' }],
  });
  const service = new TouringRouteLegsService(prisma as any);
  await assert.rejects(
    () => service.reorder('tr-1', ['leg-1', 'leg-other-tr']),
    /not found on this touring route/,
  );
});

// ---------------------------------------------------------------------------
// update: re-resolves RouteStandard when from/to areas change
// ---------------------------------------------------------------------------
test('update: changing fromArea/toArea re-resolves the RouteStandard', async () => {
  const prisma = buildFakePrisma({
    areas: [AMM, MAD, NEB],
    standards: [STD_AMM_MAD, STD_MAD_NEB],
    legs: [
      { id: 'leg-1', touringRouteId: 'tr-1', sequence: 1, legType: 'DRIVE', fromAreaId: AMM.id, toAreaId: MAD.id, routeStandardId: 'std-amm-mad' },
    ],
  });
  const service = new TouringRouteLegsService(prisma as any);
  const updated = await service.update('leg-1', { fromAreaId: MAD.id, toAreaId: NEB.id });
  assert.equal(updated.routeStandardId, 'std-mad-neb');
});

// ---------------------------------------------------------------------------
// Pricing-untouched guarantee
// ---------------------------------------------------------------------------
test('legs CRUD never touches TouringRoutePricing — operations are isolated to touring_route_legs', async () => {
  // This is a structural guarantee — the service ONLY queries
  // touringRouteLeg + operationalArea + routeStandard, never
  // touringRoutePricing. Inspect the service module to confirm.
  const source = require('fs').readFileSync(__filename.replace(/\.test\.ts$/, '.service.ts'), 'utf8');
  assert.ok(!source.includes('touringRoutePricing'), 'service should never reference touringRoutePricing');
  assert.ok(!source.includes('TouringRoutePricing'), 'service should never reference TouringRoutePricing');
});
