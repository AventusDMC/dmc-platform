/** Phase 4b: create the 19 RouteStandards the excursion-route legs need. */
import { PrismaClient } from '@prisma/client';
const APPLY = process.argv.includes('--apply');

const STD: [string, number, number, string][] = [
  ['AMM_IAA', 25, 0.5, ''], ['AMM_PEL', 95, 1.5, ''], ['AMM_SHBK', 210, 2.5, 'L'],
  ['DAN_AMM', 190, 2.5, 'L'], ['DS_MAC', 60, 1.0, 'M'], ['DS_WR', 290, 3.5, 'L'],
  ['IRB_JER', 40, 0.7, ''], ['IRB_UMQ', 30, 0.6, ''], ['JER_IRB', 40, 0.7, ''],
  ['KRK_DS', 90, 1.5, 'M'], ['MAC_DS', 60, 1.0, 'M'], ['MAD_DS', 50, 0.9, ''],
  ['MAD_MAC', 50, 0.9, 'M'], ['PEL_UMQ', 30, 0.6, ''], ['PET_SHBK', 35, 0.6, ''],
  ['SHBK_AMM', 210, 2.5, 'L'], ['SHBK_PET', 35, 0.6, ''], ['UMQ_AMM', 120, 1.6, ''],
  ['UMQ_IRB', 30, 0.6, ''],
];

async function main() {
  const prisma = new PrismaClient();
  const areas = await prisma.operationalArea.findMany({ select: { code: true, name: true, city: true } });
  const am = new Map(areas.map((a) => [a.code, a]));
  let created = 0, updated = 0, fail = 0;
  for (const [code, km, hr, flags] of STD) {
    const parts = code.split('_'); let from = '', to = '';
    for (let i = 1; i < parts.length; i++) { const f = parts.slice(0, i).join('_'), t = parts.slice(i).join('_'); if (am.has(f) && am.has(t)) { from = f; to = t; break; } }
    const fa = am.get(from), ta = am.get(to);
    const data = {
      routeName: fa && ta ? `${fa.name} → ${ta.name}` : code,
      fromCity: fa?.city ?? null, toCity: ta?.city ?? null,
      standardDistanceKm: km, standardDurationHours: hr, operationalBufferMinutes: 15,
      longDistanceFlag: flags.includes('L') || km >= 150, mountainRoadFlag: flags.includes('M'),
      airportRouteFlag: flags.includes('A'), borderCrossingFlag: false,
      canonicalRouteCode: code, isActive: true, source: 'MANUAL', reviewStatus: 'VERIFIED',
    };
    const existing = await prisma.routeStandard.findUnique({ where: { routeCode: code } });
    console.log(`  ${existing ? 'update' : 'CREATE'} ${code.padEnd(10)} ${km}km/${hr}h ${flags} | ${data.routeName}`);
    if (APPLY) { try { if (existing) { await prisma.routeStandard.update({ where: { routeCode: code }, data }); updated++; } else { await prisma.routeStandard.create({ data: { routeCode: code, ...data } }); created++; } } catch (e: any) { fail++; console.log('    ERR ' + (e?.message?.split('\n')[0] || e)); } }
  }
  console.log(`\n${APPLY ? `Applied: created ${created}, updated ${updated}, failed ${fail}` : '(DRY-RUN)'}`);
  await prisma.$disconnect();
}
main();
