/**
 * Phase 1 of touring-leg build:
 *  (A) add missing OperationalAreas (tourism sites the touring stops reference)
 *  (B) canonicalize 6 stop labels to match existing areas (no dup areas)
 * Then re-detect every consecutive matched stop-pair whose RouteStandard is
 * missing, so Phase 2 can create exactly those. Dry-run unless --apply.
 */
import { PrismaClient } from '@prisma/client';
import { matchStopToArea } from '../src/touring-route-legs/touring-route-legs.service';

const APPLY = process.argv.includes('--apply');

// New areas: name MUST equal the stop label so the matcher hits on name.
const NEW_AREAS: { code: string; name: string; city: string; type: string; region: string }[] = [
  { code: 'PEL', name: 'Pella', city: 'Irbid', type: 'TOURISM_SITE', region: 'North' },
  { code: 'SLT', name: 'Salt', city: 'Salt', type: 'CITY', region: 'Central' },
  { code: 'IAA', name: 'Iraq Al Amir', city: 'Amman', type: 'TOURISM_SITE', region: 'Central' },
  { code: 'MUT', name: 'Muta', city: 'Karak', type: 'TOURISM_SITE', region: 'South' },
  { code: 'QKH', name: 'Qasr Kharana', city: 'Amman', type: 'TOURISM_SITE', region: 'East' },
  { code: 'QAM', name: 'Qasr Amra', city: 'Amman', type: 'TOURISM_SITE', region: 'East' },
  { code: 'QAZ', name: 'Qasr Azraq', city: 'Amman', type: 'TOURISM_SITE', region: 'East' },
  { code: 'BLT', name: 'Blessed Tree', city: 'Amman', type: 'TOURISM_SITE', region: 'East' },
  { code: 'JVI', name: 'Jordan Valley Islamic Sites', city: 'Amman', type: 'TOURISM_SITE', region: 'Central' },
  { code: 'BER', name: 'Berenice Beach Club', city: 'Aqaba', type: 'RESORT_AREA', region: 'South' },
  { code: 'ADC', name: 'Diving Center', city: 'Aqaba', type: 'RESORT_AREA', region: 'South' },
  { code: 'GBP', name: 'Glass Boat Pier', city: 'Aqaba', type: 'PORT', region: 'South' },
  { code: 'SBS', name: 'South Beach Snorkeling Site', city: 'Aqaba', type: 'RESORT_AREA', region: 'South' },
  { code: 'AQM', name: 'Aqaba Marina', city: 'Aqaba', type: 'PORT', region: 'South' },
];

// Stop label (exact, case-insensitive on location OR city) -> canonical area name to set as location.
const STOP_FIXES: { match: string; toLocation: string }[] = [
  { match: 'Kerak', toLocation: 'Karak Castle' },
  { match: 'Mukawir', toLocation: 'Machaerus (Mukawir)' },
  { match: 'Roman Theater', toLocation: 'Amman Roman Theater' },
  { match: 'Downtown Amman', toLocation: 'Down Town Amman' },
  { match: 'QAIA', toLocation: 'Queen Alia International Airport' },
  { match: 'South Beach', toLocation: 'Aqaba South Beach' },
];

async function main() {
  const prisma = new PrismaClient();

  // (A) upsert new areas
  console.log('=== (A) New OperationalAreas ===');
  for (const a of NEW_AREAS) {
    const exists = await prisma.operationalArea.findUnique({ where: { code: a.code } });
    console.log(`  ${exists ? 'exists ' : 'CREATE '} ${a.code.padEnd(5)} ${a.name}`);
    if (APPLY && !exists) {
      await prisma.operationalArea.create({ data: { code: a.code, name: a.name, city: a.city, type: a.type, region: a.region, isActive: true } });
    }
  }

  // (B) canonicalize stop labels (exact match on location OR city, case-insensitive)
  console.log('\n=== (B) Stop label fixes ===');
  for (const f of STOP_FIXES) {
    const rows = await prisma.touringRouteStop.findMany({ where: { OR: [{ location: { equals: f.match, mode: 'insensitive' } }, { AND: [{ location: null }, { city: { equals: f.match, mode: 'insensitive' } }] }] }, select: { id: true } });
    console.log(`  "${f.match}" -> location="${f.toLocation}"  (${rows.length} stops)`);
    if (APPLY && rows.length) {
      await prisma.touringRouteStop.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { location: f.toLocation } });
    }
  }

  if (!APPLY) { console.log('\n(DRY-RUN — pass --apply to write, then re-run to see missing standards.)'); await prisma.$disconnect(); return; }

  // Re-detect missing RouteStandards across all matched consecutive pairs
  console.log('\n=== Missing RouteStandards after Phase 1 ===');
  const areas = await prisma.operationalArea.findMany({ where: { isActive: true } });
  const trs = await prisma.touringRoute.findMany({ where: { stops: { some: {} } }, select: { id: true, code: true, stops: { orderBy: { order: 'asc' } } } });
  const missing = new Map<string, { from: string; to: string; count: number }>();
  let unmatchedLeft = 0;
  for (const t of trs) {
    const ms = (t.stops as any[]).map((s) => ({ s, a: matchStopToArea(s, areas as any) }));
    for (const x of ms) if (!x.a) { unmatchedLeft++; console.log(`  STILL UNMATCHED: ${t.code} #${x.s.order} "${x.s.location || x.s.city}"`); }
    for (let i = 0; i < ms.length - 1; i++) {
      const f = ms[i].a, tt = ms[i + 1].a; if (!f || !tt || f.code === tt.code) continue;
      const code = `${f.code}_${tt.code}`;
      const std = await prisma.routeStandard.findFirst({ where: { OR: [{ canonicalRouteCode: code }, { routeCode: code }], isActive: true } });
      if (!std && !missing.has(code)) missing.set(code, { from: f.name, to: tt.name, count: 1 });
    }
  }
  console.log(`\nUnmatched stops remaining: ${unmatchedLeft}`);
  console.log(`Missing RouteStandard codes: ${missing.size}`);
  [...missing.entries()].sort().forEach(([c, v]) => console.log(`  ${c.padEnd(12)} ${v.from} -> ${v.to}`));
  await prisma.$disconnect();
}
main();
