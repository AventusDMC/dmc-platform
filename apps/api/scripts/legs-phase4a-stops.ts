/**
 * Phase 4a: author ordered TouringRouteStops for the 49 stop-less excursion
 * routes (2 in-place routes intentionally skipped). Each stop's location is
 * set to the exact OperationalArea name so the stop->area matcher hits on
 * name. Then re-detect missing RouteStandards for the new segments.
 * Idempotent: only writes stops for routes that currently have none.
 * Dry-run unless --apply.
 */
import { PrismaClient } from '@prisma/client';
import { matchStopToArea } from '../src/touring-route-legs/touring-route-legs.service';

const APPLY = process.argv.includes('--apply');

// touring route code -> ordered OperationalArea codes
const SEQ: Record<string, string[]> = {
  'JOR-TR-AJLOUN-AJLOUN-JERASH': ['AJL', 'JER', 'AJL'],
  'JOR-TR-AMMAN-AJLOUN-JERASH': ['AMM', 'JER', 'AJL', 'AMM'],
  'JOR-TR-AMMAN-AQABA-FULL-DAY': ['AMM', 'AQJ', 'AMM'],
  'JOR-TR-AMMAN-AS-SALT-HERITAGE-TOUR': ['AMM', 'SLT', 'AMM'],
  'JOR-TR-AMMAN-BAPTISM-SITE-DEAD-SEA': ['AMM', 'BET', 'DS', 'AMM'],
  'JOR-TR-AMMAN-DANA-BIOSPHERE-RESERVE': ['AMM', 'DAN', 'AMM'],
  'JOR-TR-AMMAN-DEAD-SEA-DAY-TOUR': ['AMM', 'DS', 'AMM'],
  'JOR-TR-AMMAN-DESERT-CASTLES-TOUR': ['AMM', 'QKH', 'QAM', 'QAZ', 'AMM'],
  'JOR-TR-AMMAN-IRAQ-AL-AMIR-EXPERIENCE': ['AMM', 'IAA', 'AMM'],
  'JOR-TR-AMMAN-JERASH-AMMAN-CITY-TOUR': ['AMM', 'JER', 'AMM'],
  'JOR-TR-AMMAN-KERAK-CASTLE-TOUR': ['AMM', 'KRK', 'AMM'],
  'JOR-TR-AMMAN-MADABA-MOUNT-NEBO': ['AMM', 'MAD', 'NEB', 'AMM'],
  'JOR-TR-AMMAN-MUKAWIR-MADABA': ['AMM', 'MAD', 'MAC', 'AMM'],
  'JOR-TR-AMMAN-PELLA-UMM-QAYS': ['AMM', 'PEL', 'UMQ', 'AMM'],
  'JOR-TR-AMMAN-PETRA-FULL-DAY': ['AMM', 'PET', 'AMM'],
  'JOR-TR-AMMAN-SALT-IRAQ-AL-AMIR': ['AMM', 'SLT', 'IAA', 'AMM'],
  'JOR-TR-AMMAN-SHOBAK-CASTLE-TOUR': ['AMM', 'SHBK', 'AMM'],
  'JOR-TR-AMMAN-UMM-QAYS-EXCURSION': ['AMM', 'UMQ', 'AMM'],
  'JOR-TR-AMMAN-WADI-RUM-FULL-DAY': ['AMM', 'WR', 'AMM'],
  'JOR-TR-AQABA-AYLA-GOLF-EXPERIENCE': ['AQJ', 'AQM', 'AQJ'],
  'JOR-TR-AQABA-BERENICE-BEACH-CLUB': ['AQJ', 'BER', 'AQJ'],
  'JOR-TR-AQABA-BOAT-TRIP-EXPERIENCE': ['AQJ', 'AQM', 'AQJ'],
  'JOR-TR-AQABA-GLASS-BOAT-TOUR': ['AQJ', 'GBP', 'AQJ'],
  'JOR-TR-AQABA-PETRA-DAY-TOUR': ['AQJ', 'PET', 'AQJ'],
  'JOR-TR-AQABA-PRIVATE-YACHT-CHARTER': ['AQJ', 'AQM', 'AQJ'],
  'JOR-TR-AQABA-SCUBA-DIVING-EXPERIENCE': ['AQJ', 'ADC', 'AQJ'],
  'JOR-TR-AQABA-SNORKELING-EXPERIENCE': ['AQJ', 'SBS', 'AQJ'],
  'JOR-TR-AQABA-SOUTH-BEACH-DAY': ['AQJ', 'AQS', 'AQJ'],
  'JOR-TR-AQABA-SUBMARINE-EXPERIENCE': ['AQJ', 'AQM', 'AQJ'],
  'JOR-TR-AQABA-WADI-RUM-EXCURSION': ['AQJ', 'WR', 'AQJ'],
  'JOR-TR-DEADSEA-AMMAN-CITY-TOUR': ['DS', 'AMM', 'DS'],
  'JOR-TR-DEADSEA-BAPTISM-SITE-TOUR': ['DS', 'BET', 'DS'],
  'JOR-TR-DEADSEA-KERAK-CASTLE-TOUR': ['DS', 'KRK', 'DS'],
  'JOR-TR-DEADSEA-MADABA-NEBO': ['DS', 'NEB', 'MAD', 'DS'],
  'JOR-TR-DEADSEA-MUKAWIR-EXCURSION': ['DS', 'MAC', 'DS'],
  'JOR-TR-DEADSEA-PETRA-DAY-TOUR': ['DS', 'PET', 'DS'],
  'JOR-TR-DEADSEA-WADI-RUM-EXCURSION': ['DS', 'WR', 'DS'],
  'JOR-TR-IRBID-JERASH-EXCURSION': ['IRB', 'JER', 'IRB'],
  'JOR-TR-IRBID-UMM-QAYS-EXCURSION': ['IRB', 'UMQ', 'IRB'],
  'JOR-TR-PETRA-AQABA-EXCURSION': ['PET', 'AQJ', 'PET'],
  'JOR-TR-PETRA-DANA-RESERVE-EXCURSION': ['PET', 'DAN', 'PET'],
  'JOR-TR-PETRA-LITTLE-PETRA-EXPERIENCE': ['PET', 'LPT', 'PET'],
  'JOR-TR-PETRA-SHOBAK-CASTLE-TOUR': ['PET', 'SHBK', 'PET'],
  'JOR-TR-PETRA-WADI-RUM-EXCURSION': ['PET', 'WR', 'PET'],
  'JOR-TR-QAIA-QAIA-LAYOVER-AMMAN-CITY-TOUR': ['QAIA', 'AMM', 'QAIA'],
  'JOR-TR-QAIA-QAIA-LAYOVER-DEAD-SEA-TOUR': ['QAIA', 'DS', 'QAIA'],
  'JOR-TR-UMMQAYS-PELLA-EXCURSION': ['UMQ', 'PEL', 'UMQ'],
  'JOR-TR-WADIRUM-AQABA-EXCURSION': ['WR', 'AQJ', 'WR'],
  'JOR-TR-WADIRUM-PETRA-EXCURSION': ['WR', 'PET', 'WR'],
};
// intentionally NOT authored (no inter-area movement):
//   JOR-TR-DEADSEA-DEAD-SEA-WELLNESS-DAY, JOR-TR-WADIRUM-CAMP-TRANSFER-OPERATIONS

async function main() {
  const prisma = new PrismaClient();
  const areas = await prisma.operationalArea.findMany({ where: { isActive: true } });
  const am = new Map(areas.map((a) => [a.code, a]));

  // sanity: every code resolves
  const bad = new Set<string>();
  for (const codes of Object.values(SEQ)) for (const c of codes) if (!am.has(c)) bad.add(c);
  if (bad.size) { console.log('UNKNOWN AREA CODES: ' + [...bad].join(', ')); await prisma.$disconnect(); return; }

  let wrote = 0, skipped = 0;
  for (const [code, seq] of Object.entries(SEQ)) {
    const tr = await prisma.touringRoute.findUnique({ where: { code }, select: { id: true, _count: { select: { stops: true } } } });
    if (!tr) { console.log('  MISSING ROUTE ' + code); continue; }
    if (tr._count.stops > 0) { skipped++; continue; }
    const stopsData = seq.map((c, i) => ({ order: i + 1, city: am.get(c)!.city, location: am.get(c)!.name }));
    console.log(`  ${code.padEnd(42)} ${seq.join(' → ')}`);
    if (APPLY) {
      for (const s of stopsData) await prisma.touringRouteStop.create({ data: { touringRouteId: tr.id, order: s.order, city: s.city, location: s.location } });
      wrote++;
    }
  }
  console.log(`\n${APPLY ? `Authored stops for ${wrote} routes` : 'DRY-RUN'} | already had stops: ${skipped}`);
  if (!APPLY) { console.log('(pass --apply to write, then re-run to see missing standards.)'); await prisma.$disconnect(); return; }

  // detect missing RouteStandards across newly-stopped routes
  const missing = new Map<string, { from: string; to: string }>();
  for (const [code, seq] of Object.entries(SEQ)) {
    for (let i = 0; i < seq.length - 1; i++) {
      const f = am.get(seq[i])!, t = am.get(seq[i + 1])!;
      if (f.code === t.code) continue;
      const rc = `${f.code}_${t.code}`;
      const std = await prisma.routeStandard.findFirst({ where: { OR: [{ canonicalRouteCode: rc }, { routeCode: rc }], isActive: true } });
      if (!std && !missing.has(rc)) missing.set(rc, { from: f.name, to: t.name });
    }
  }
  console.log(`\nMissing RouteStandard codes: ${missing.size}`);
  [...missing.entries()].sort().forEach(([c, v]) => console.log(`  ${c.padEnd(12)} ${v.from} -> ${v.to}`));
  await prisma.$disconnect();
}
main();
