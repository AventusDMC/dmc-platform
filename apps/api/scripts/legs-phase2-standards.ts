/**
 * Phase 2: create/upsert the 55 RouteStandards the touring legs need.
 * Distances/durations are drive-only segment estimates (Jordan road network).
 * Flags: M=mountainRoad, A=airportRoute, L=longDistance(>=150km).
 * Upsert by routeCode (unique) so inactive leftovers reactivate, no collision.
 * Dry-run unless --apply.
 */
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

// code, km, driveHours, flags ('' | 'M' | 'A' | combos)
const STD: [string, number, number, string][] = [
  ['ADC_AQJ', 15, 0.35, ''], ['AMM_BET', 55, 1.0, ''], ['AMM_BLT', 135, 1.6, ''],
  ['AMM_DAN', 190, 2.5, 'L'], ['AMM_JER', 50, 0.8, ''], ['AMM_JVI', 105, 1.8, ''],
  ['AMM_MAC', 85, 1.5, 'M'], ['AMM_MUT', 130, 1.6, ''], ['AMM_QKH', 60, 0.7, ''],
  ['AMM_SLT', 35, 0.6, ''], ['AMM_UMQ', 120, 1.6, ''], ['AQJ_ADC', 15, 0.35, ''],
  ['AQJ_AQM', 5, 0.15, ''], ['AQJ_AQS', 17, 0.4, ''], ['AQJ_BER', 13, 0.3, ''],
  ['AQJ_GBP', 8, 0.2, ''], ['AQJ_SBS', 17, 0.4, ''], ['AQJ_WR', 60, 1.0, ''],
  ['AQM_AQJ', 5, 0.15, ''], ['AQS_AQJ', 17, 0.4, ''], ['BER_AQJ', 13, 0.3, ''],
  ['BET_DS', 12, 0.3, ''], ['BLT_AMM', 135, 1.6, ''], ['DAN_PET', 60, 1.0, ''],
  ['DS_BET', 12, 0.3, ''], ['DS_KRK', 90, 1.5, 'M'], ['DS_NEB', 35, 0.7, 'M'],
  ['DS_QAIA', 55, 0.9, 'A'], ['GBP_AQJ', 8, 0.2, ''], ['IAA_AMM', 25, 0.5, ''],
  ['JER_AMM', 50, 0.8, ''], ['JER_QAIA', 85, 1.3, 'A'], ['JVI_AMM', 105, 1.8, ''],
  ['LPT_PET', 14, 0.3, ''], ['MAC_AMM', 85, 1.5, 'M'], ['MAD_AMM', 35, 0.6, ''],
  ['MUT_PET', 110, 1.4, ''], ['NEB_AMM', 40, 0.7, ''], ['NEB_DS', 35, 0.7, 'M'],
  ['NEB_MAD', 10, 0.25, ''], ['PEL_AMM', 95, 1.5, ''], ['PET_DAN', 60, 1.0, ''],
  ['PET_LPT', 14, 0.3, ''], ['QAIA_AMM_CIT', 40, 0.7, 'A'], ['QAIA_DS', 55, 0.9, 'A'],
  ['QAIA_JER', 85, 1.3, 'A'], ['QAM_QAZ', 25, 0.3, ''], ['QAZ_AMM', 100, 1.2, ''],
  ['QKH_QAM', 16, 0.2, ''], ['ROM_QAIA', 40, 0.7, 'A'], ['SBS_AQJ', 17, 0.4, ''],
  ['SLT_AMM', 35, 0.6, ''], ['SLT_IAA', 35, 0.7, ''], ['UMQ_PEL', 30, 0.6, ''],
  ['WR_AQJ', 60, 1.0, ''],
];

async function main() {
  const prisma = new PrismaClient();
  const areas = await prisma.operationalArea.findMany({ select: { code: true, name: true, city: true } });
  const am = new Map(areas.map((a) => [a.code, a]));

  let created = 0, updated = 0, fail = 0;
  for (const [code, km, hr, flags] of STD) {
    // split code into from/to area codes (codes may contain underscores e.g. AMM_CIT)
    // strategy: find the split point where BOTH halves are known area codes.
    let from = '', to = '';
    const parts = code.split('_');
    for (let i = 1; i < parts.length; i++) {
      const f = parts.slice(0, i).join('_'), t = parts.slice(i).join('_');
      if (am.has(f) && am.has(t)) { from = f; to = t; break; }
    }
    const fa = am.get(from), ta = am.get(to);
    const routeName = fa && ta ? `${fa.name} → ${ta.name}` : code;
    const data = {
      routeName,
      fromCity: fa?.city ?? null,
      toCity: ta?.city ?? null,
      standardDistanceKm: km,
      standardDurationHours: hr,
      operationalBufferMinutes: 15,
      longDistanceFlag: flags.includes('L') || km >= 150,
      mountainRoadFlag: flags.includes('M'),
      airportRouteFlag: flags.includes('A'),
      borderCrossingFlag: false,
      canonicalRouteCode: code,
      isActive: true,
      source: 'MANUAL',
      reviewStatus: 'VERIFIED',
    };
    const existing = await prisma.routeStandard.findUnique({ where: { routeCode: code } });
    console.log(`  ${existing ? 'update' : 'CREATE'} ${code.padEnd(13)} ${km}km/${hr}h ${flags} | ${routeName}`);
    if (APPLY) {
      try {
        if (existing) { await prisma.routeStandard.update({ where: { routeCode: code }, data }); updated++; }
        else { await prisma.routeStandard.create({ data: { routeCode: code, ...data } }); created++; }
      } catch (e: any) { fail++; console.log('    ERR ' + (e?.message?.split('\n')[0] || e)); }
    }
  }
  console.log(`\n${APPLY ? `Applied: created ${created}, updated ${updated}, failed ${fail}` : '(DRY-RUN)'}`);
  await prisma.$disconnect();
}
main();
