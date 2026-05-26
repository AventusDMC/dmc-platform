import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TouringRouteLegsService, matchStopToArea } from './touring-route-legs.service';

// Auto-Leg Builder from Stops v1 — service-level tests.

function buildFakePrisma(opts: {
  stops?: any[];
  legs?: any[];
  areas?: any[];
  standards?: any[];
} = {}) {
  const stops = [...(opts.stops || [])];
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

  const prisma = {
    touringRouteStop: {
      findMany: async ({ where, orderBy }: any) => {
        let rows = stops.filter((s) => s.touringRouteId === where.touringRouteId);
        if (orderBy?.order === 'asc') rows.sort((a, b) => a.order - b.order);
        return rows;
      },
    },
    touringRouteLeg: {
      findMany: async ({ where, orderBy, select }: any) => {
        let rows = legs.filter((l) => l.touringRouteId === where.touringRouteId);
        if (where?.id?.in) rows = rows.filter((l) => where.id.in.includes(l.id));
        if (orderBy?.sequence === 'asc') rows.sort((a, b) => a.sequence - b.sequence);
        if (orderBy?.sequence === 'desc') rows.sort((a, b) => b.sequence - a.sequence);
        if (select?.sequence) return rows.map((r) => ({ sequence: r.sequence }));
        return rows.map(decorateLeg);
      },
      findUnique: async ({ where }: any) => {
        const l = legs.find((row) => row.id === where.id);
        return l ? decorateLeg(l) : null;
      },
      findFirst: async ({ where, orderBy }: any) => {
        const rows = legs
          .filter((l) => l.touringRouteId === where.touringRouteId)
          .sort((a, b) =>
            orderBy?.sequence === 'desc' ? b.sequence - a.sequence : a.sequence - b.sequence,
          );
        return rows[0] || null;
      },
      create: async ({ data }: any) => {
        const created = { id: `leg-${legs.length + 1}`, ...data };
        legs.push(created);
        return decorateLeg(created);
      },
      deleteMany: async ({ where }: any) => {
        const before = legs.length;
        for (let i = legs.length - 1; i >= 0; i--) {
          if (legs[i].touringRouteId === where.touringRouteId) legs.splice(i, 1);
        }
        return { count: before - legs.length };
      },
      delete: async ({ where }: any) => {
        const idx = legs.findIndex((l) => l.id === where.id);
        if (idx >= 0) return legs.splice(idx, 1)[0];
      },
    },
    operationalArea: {
      findMany: async ({ where }: any) => {
        let rows = [...areas];
        if (where?.isActive !== undefined) rows = rows.filter((a) => a.isActive === where.isActive);
        return rows;
      },
      findUnique: async ({ where }: any) => areas.find((a) => a.id === where.id) || null,
    },
    routeStandard: {
      findFirst: async ({ where }: any) => {
        if (!where?.OR) return null;
        for (const clause of where.OR) {
          if (clause.canonicalRouteCode) {
            const m = standards.find((s) => s.canonicalRouteCode === clause.canonicalRouteCode && (where.isActive === undefined || s.isActive === where.isActive));
            if (m) return m;
          }
          if (clause.routeCode) {
            const m = standards.find((s) => s.routeCode === clause.routeCode && (where.isActive === undefined || s.isActive === where.isActive));
            if (m) return m;
          }
        }
        return null;
      },
    },
    $transaction: async (fn: any) => fn(prisma),
    __internal: { stops, legs, areas, standards },
  };
  return prisma;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const AMM = { id: 'a-amm', code: 'AMM', name: 'Amman City', type: 'CITY', city: 'Amman', isActive: true };
const MAD = { id: 'a-mad', code: 'MAD', name: 'Madaba', type: 'CITY', city: 'Madaba', isActive: true };
const NEB = { id: 'a-neb', code: 'NEB', name: 'Mount Nebo', type: 'TOURISM_SITE', city: 'Madaba', isActive: true };
const PET = { id: 'a-pet', code: 'PET', name: 'Petra Visitor Center', type: 'TOURISM_SITE', city: 'Petra', isActive: true };

const STD_AMM_MAD = { id: 'std-amm-mad', canonicalRouteCode: 'AMM_MAD', routeCode: 'AMM_MAD', isActive: true };
const STD_MAD_NEB = { id: 'std-mad-neb', canonicalRouteCode: 'MAD_NEB', routeCode: 'MAD_NEB', isActive: true };
const STD_NEB_PET = { id: 'std-neb-pet', canonicalRouteCode: 'NEB_PET', routeCode: 'NEB_PET', isActive: true };

// ---------------------------------------------------------------------------
// matchStopToArea — pure helper
// ---------------------------------------------------------------------------
test('matchStopToArea: exact location match wins over city anchor', () => {
  const match = matchStopToArea(
    { city: 'Madaba', location: 'Mount Nebo' },
    [MAD, NEB] as any,
  );
  assert.equal(match?.code, 'NEB');
});

test('matchStopToArea: exact city match when no location set', () => {
  const match = matchStopToArea({ city: 'Madaba', location: null }, [MAD, NEB] as any);
  assert.equal(match?.code, 'MAD');
});

test('matchStopToArea: case-insensitive match', () => {
  const match = matchStopToArea({ city: 'amman', location: '' }, [AMM] as any);
  assert.equal(match?.code, 'AMM');
});

test('matchStopToArea: falls back to city anchor with preferred type order (Amman → CITY beats AIRPORT)', () => {
  const QAIA = { id: 'a-qaia', code: 'QAIA', name: 'Queen Alia', type: 'AIRPORT', city: 'Amman', isActive: true };
  const match = matchStopToArea({ city: 'Amman', location: null }, [QAIA, AMM] as any);
  assert.equal(match?.code, 'AMM');
});

test('matchStopToArea: null when nothing matches', () => {
  assert.equal(matchStopToArea({ city: 'Atlantis', location: null }, [AMM] as any), null);
});

// ---------------------------------------------------------------------------
// generateLegsFromStops — preview mode
// ---------------------------------------------------------------------------
test('generateLegsFromStops preview: produces ordered N-1 legs from N stops with status=new', async () => {
  const prisma = buildFakePrisma({
    stops: [
      { id: 's1', touringRouteId: 'tr-1', order: 1, city: 'Amman', location: null },
      { id: 's2', touringRouteId: 'tr-1', order: 2, city: 'Madaba', location: null },
      { id: 's3', touringRouteId: 'tr-1', order: 3, city: 'Madaba', location: 'Mount Nebo' },
      { id: 's4', touringRouteId: 'tr-1', order: 4, city: 'Petra', location: null },
    ],
    areas: [AMM, MAD, NEB, PET],
    standards: [STD_AMM_MAD, STD_MAD_NEB, STD_NEB_PET],
  });
  const service = new TouringRouteLegsService(prisma as any);
  const preview = await service.generateLegsFromStops({ touringRouteId: 'tr-1', mode: 'preview' });
  assert.equal(preview.mode, 'preview');
  assert.equal(preview.applied, false);
  assert.equal(preview.legs.length, 3);
  const codes = preview.legs.map((l: any) => l.suggestedCode);
  assert.deepEqual(codes, ['AMM_MAD', 'MAD_NEB', 'NEB_PET']);
  assert.equal(preview.newCount, 3);
  assert.equal(preview.reusedCount, 0);
  assert.equal((prisma as any).__internal.legs.length, 0, 'preview must not write');
});

test('generateLegsFromStops preview: marks legs already-present as reused', async () => {
  const prisma = buildFakePrisma({
    stops: [
      { id: 's1', touringRouteId: 'tr-1', order: 1, city: 'Amman', location: null },
      { id: 's2', touringRouteId: 'tr-1', order: 2, city: 'Madaba', location: null },
      { id: 's3', touringRouteId: 'tr-1', order: 3, city: 'Petra', location: null },
    ],
    legs: [
      { id: 'existing-1', touringRouteId: 'tr-1', sequence: 1, legType: 'DRIVE', fromAreaId: AMM.id, toAreaId: MAD.id, routeStandardId: STD_AMM_MAD.id, estimatedStopMinutes: null },
    ],
    areas: [AMM, MAD, PET],
    standards: [STD_AMM_MAD],
  });
  const service = new TouringRouteLegsService(prisma as any);
  const preview = await service.generateLegsFromStops({ touringRouteId: 'tr-1', mode: 'preview' });
  const reused = preview.legs.filter((l: any) => l.status === 'reused');
  const created = preview.legs.filter((l: any) => l.status === 'new');
  assert.equal(reused.length, 1);
  assert.equal(reused[0].suggestedCode, 'AMM_MAD');
  assert.equal(created.length, 1);
  assert.equal(created[0].suggestedCode, 'MAD_PET');
});

test('generateLegsFromStops preview: skips stop pairs with unmatched areas (couldn\'t match warning)', async () => {
  const prisma = buildFakePrisma({
    stops: [
      { id: 's1', touringRouteId: 'tr-1', order: 1, city: 'Amman', location: null },
      { id: 's2', touringRouteId: 'tr-1', order: 2, city: 'Atlantis', location: null }, // unknown
      { id: 's3', touringRouteId: 'tr-1', order: 3, city: 'Petra', location: null },
    ],
    areas: [AMM, PET],
    standards: [],
  });
  const service = new TouringRouteLegsService(prisma as any);
  const preview = await service.generateLegsFromStops({ touringRouteId: 'tr-1', mode: 'preview' });
  // 2 pairs (s1→s2, s2→s3) — both involve Atlantis → both skipped
  const skipped = preview.legs.filter((l: any) => l.status === 'skipped_unmatched_area');
  assert.equal(skipped.length, 2);
  assert.equal(preview.skippedUnmatched, 2);
  assert.equal(preview.newCount, 0);
});

test('generateLegsFromStops preview: flags missing Route Standard but still produces the leg as new', async () => {
  const prisma = buildFakePrisma({
    stops: [
      { id: 's1', touringRouteId: 'tr-1', order: 1, city: 'Madaba', location: 'Mount Nebo' },
      { id: 's2', touringRouteId: 'tr-1', order: 2, city: 'Petra', location: null },
    ],
    areas: [NEB, PET],
    standards: [] /* no NEB_PET */,
  });
  const service = new TouringRouteLegsService(prisma as any);
  const preview = await service.generateLegsFromStops({ touringRouteId: 'tr-1', mode: 'preview' });
  assert.equal(preview.legs.length, 1);
  assert.equal(preview.legs[0].status, 'new');
  assert.equal(preview.legs[0].routeStandardId, null);
  assert.equal(preview.missingStandardCount, 1);
});

test('generateLegsFromStops preview: skips same-area stop pairs', async () => {
  const prisma = buildFakePrisma({
    stops: [
      { id: 's1', touringRouteId: 'tr-1', order: 1, city: 'Madaba', location: null },
      { id: 's2', touringRouteId: 'tr-1', order: 2, city: 'Madaba', location: 'Mount Nebo' },
      { id: 's3', touringRouteId: 'tr-1', order: 3, city: 'Madaba', location: null },
    ],
    areas: [MAD, NEB],
    standards: [],
  });
  const service = new TouringRouteLegsService(prisma as any);
  const preview = await service.generateLegsFromStops({ touringRouteId: 'tr-1', mode: 'preview' });
  // s1(Madaba=MAD) → s2(Mount Nebo=NEB) — different areas → 1 new leg
  // s2(NEB) → s3(Madaba=MAD) — different areas → 1 new leg
  // No same-area skips in this fixture; reconfigure for that.
  const prisma2 = buildFakePrisma({
    stops: [
      { id: 's1', touringRouteId: 'tr-1', order: 1, city: 'Madaba', location: null },
      { id: 's2', touringRouteId: 'tr-1', order: 2, city: 'Madaba', location: null },
    ],
    areas: [MAD],
    standards: [],
  });
  const preview2 = await new TouringRouteLegsService(prisma2 as any).generateLegsFromStops({
    touringRouteId: 'tr-1',
    mode: 'preview',
  });
  assert.equal(preview2.legs.length, 1);
  assert.equal(preview2.legs[0].status, 'skipped_same_area');
  assert.equal(preview2.skippedSameArea, 1);
  assert.equal(preview2.newCount, 0);
});

test('generateLegsFromStops preview: empty stops returns empty plan + helpful message', async () => {
  const prisma = buildFakePrisma({ stops: [], areas: [], standards: [] });
  const service = new TouringRouteLegsService(prisma as any);
  const preview = await service.generateLegsFromStops({ touringRouteId: 'tr-1', mode: 'preview' });
  assert.equal(preview.legs.length, 0);
  assert.match(preview.message, /No stops/);
});

// ---------------------------------------------------------------------------
// generateLegsFromStops — apply mode
// ---------------------------------------------------------------------------
test('generateLegsFromStops apply: writes only the NEW legs (existing legs left alone)', async () => {
  const prisma = buildFakePrisma({
    stops: [
      { id: 's1', touringRouteId: 'tr-1', order: 1, city: 'Amman', location: null },
      { id: 's2', touringRouteId: 'tr-1', order: 2, city: 'Madaba', location: null },
      { id: 's3', touringRouteId: 'tr-1', order: 3, city: 'Petra', location: null },
    ],
    legs: [
      { id: 'existing-1', touringRouteId: 'tr-1', sequence: 7, legType: 'DRIVE', fromAreaId: AMM.id, toAreaId: MAD.id, routeStandardId: STD_AMM_MAD.id, estimatedStopMinutes: null },
    ],
    areas: [AMM, MAD, PET],
    standards: [STD_AMM_MAD],
  });
  const service = new TouringRouteLegsService(prisma as any);
  const result = await service.generateLegsFromStops({ touringRouteId: 'tr-1', mode: 'apply' });
  assert.equal(result.applied, true);
  assert.equal(result.createdCount, 1); // only MAD_PET
  assert.equal(result.reusedCount, 1);
  assert.equal((prisma as any).__internal.legs.length, 2); // existing + new
  const codes = (prisma as any).__internal.legs.map(
    (l: any) => `${(AMM.id === l.fromAreaId ? 'AMM' : MAD.id === l.fromAreaId ? 'MAD' : 'PET')}_${(AMM.id === l.toAreaId ? 'AMM' : MAD.id === l.toAreaId ? 'MAD' : 'PET')}`,
  );
  assert.ok(codes.includes('AMM_MAD'));
  assert.ok(codes.includes('MAD_PET'));
});

test('generateLegsFromStops apply replaceExisting=true: wipes prior legs then writes fresh from stops', async () => {
  const prisma = buildFakePrisma({
    stops: [
      { id: 's1', touringRouteId: 'tr-1', order: 1, city: 'Amman', location: null },
      { id: 's2', touringRouteId: 'tr-1', order: 2, city: 'Petra', location: null },
    ],
    legs: [
      { id: 'old-1', touringRouteId: 'tr-1', sequence: 1, legType: 'DRIVE', fromAreaId: MAD.id, toAreaId: NEB.id },
      { id: 'old-2', touringRouteId: 'tr-1', sequence: 2, legType: 'DRIVE', fromAreaId: NEB.id, toAreaId: PET.id },
    ],
    areas: [AMM, MAD, NEB, PET],
    standards: [],
  });
  const service = new TouringRouteLegsService(prisma as any);
  const result = await service.generateLegsFromStops({
    touringRouteId: 'tr-1',
    mode: 'apply',
    replaceExisting: true,
  });
  assert.equal(result.replacedCount, 2);
  assert.equal(result.createdCount, 1); // AMM_PET
  assert.equal((prisma as any).__internal.legs.length, 1);
  assert.equal((prisma as any).__internal.legs[0].fromAreaId, AMM.id);
  assert.equal((prisma as any).__internal.legs[0].toAreaId, PET.id);
});

// ---------------------------------------------------------------------------
// Pricing untouched — structural guarantee
// ---------------------------------------------------------------------------
test('service source never references TouringRoutePricing (pricing untouched guarantee)', () => {
  const source = readFileSync(join(__dirname, 'touring-route-legs.service.ts'), 'utf8');
  assert.ok(!source.includes('touringRoutePricing'));
  assert.ok(!source.includes('TouringRoutePricing'));
});
