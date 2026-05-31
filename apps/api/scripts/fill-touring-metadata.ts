/**
 * Fill estimatedDistanceKm / estimatedDriveHours / includedKm for the 51 touring
 * routes that only have includedHours. Estimates = base-city round-trip drives
 * (mirrors the 37 region-flow routes that already carry this metadata).
 * includedHours is LEFT AS-IS. Dry-run by default; --apply to write.
 */
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

// code -> [estDistanceKm, estDriveHours]  (round-trip from start city)
const EST: Record<string, [number, number]> = {
  'JOR-TR-AJLOUN-AJLOUN-JERASH': [50, 1.2],
  'JOR-TR-AMMAN-AJLOUN-JERASH': [150, 3.5],
  'JOR-TR-AMMAN-AQABA-FULL-DAY': [660, 8.0],
  'JOR-TR-AMMAN-AS-SALT-HERITAGE-TOUR': [70, 1.7],
  'JOR-TR-AMMAN-BAPTISM-SITE-DEAD-SEA': [130, 2.8],
  'JOR-TR-AMMAN-DANA-BIOSPHERE-RESERVE': [380, 6.0],
  'JOR-TR-AMMAN-DEAD-SEA-DAY-TOUR': [120, 2.4],
  'JOR-TR-AMMAN-DESERT-CASTLES-TOUR': [230, 4.0],
  'JOR-TR-AMMAN-IRAQ-AL-AMIR-EXPERIENCE': [50, 1.5],
  'JOR-TR-AMMAN-JERASH-AMMAN-CITY-TOUR': [135, 2.8],
  'JOR-TR-AMMAN-KERAK-CASTLE-TOUR': [250, 4.5],
  'JOR-TR-AMMAN-MADABA-MOUNT-NEBO': [95, 2.2],
  'JOR-TR-AMMAN-MUKAWIR-MADABA': [170, 3.4],
  'JOR-TR-AMMAN-PELLA-UMM-QAYS': [245, 5.1],
  'JOR-TR-AMMAN-PETRA-FULL-DAY': [470, 6.8],
  'JOR-TR-AMMAN-SALT-IRAQ-AL-AMIR': [95, 2.6],
  'JOR-TR-AMMAN-SHOBAK-CASTLE-TOUR': [420, 6.7],
  'JOR-TR-AMMAN-UMM-QAYS-EXCURSION': [240, 4.5],
  'JOR-TR-AMMAN-WADI-RUM-FULL-DAY': [640, 8.5],
  'JOR-TR-AQABA-AYLA-GOLF-EXPERIENCE': [20, 0.6],
  'JOR-TR-AQABA-BERENICE-BEACH-CLUB': [30, 0.7],
  'JOR-TR-AQABA-BOAT-TRIP-EXPERIENCE': [15, 0.5],
  'JOR-TR-AQABA-GLASS-BOAT-TOUR': [20, 0.5],
  'JOR-TR-AQABA-PETRA-DAY-TOUR': [250, 4.2],
  'JOR-TR-AQABA-PRIVATE-YACHT-CHARTER': [20, 0.5],
  'JOR-TR-AQABA-SCUBA-DIVING-EXPERIENCE': [35, 0.8],
  'JOR-TR-AQABA-SNORKELING-EXPERIENCE': [35, 0.8],
  'JOR-TR-AQABA-SOUTH-BEACH-DAY': [35, 0.8],
  'JOR-TR-AQABA-SUBMARINE-EXPERIENCE': [20, 0.6],
  'JOR-TR-AQABA-WADI-RUM-EXCURSION': [145, 2.5],
  'JOR-TR-DEADSEA-AMMAN-CITY-TOUR': [155, 3.0],
  'JOR-TR-DEADSEA-BAPTISM-SITE-TOUR': [55, 1.2],
  'JOR-TR-DEADSEA-DEAD-SEA-WELLNESS-DAY': [10, 0.3],
  'JOR-TR-DEADSEA-KERAK-CASTLE-TOUR': [180, 3.4],
  'JOR-TR-DEADSEA-MADABA-NEBO': [120, 2.6],
  'JOR-TR-DEADSEA-MUKAWIR-EXCURSION': [120, 2.6],
  'JOR-TR-DEADSEA-PETRA-DAY-TOUR': [390, 6.0],
  'JOR-TR-DEADSEA-WADI-RUM-EXCURSION': [580, 8.0],
  'JOR-TR-IRBID-JERASH-EXCURSION': [80, 1.8],
  'JOR-TR-IRBID-UMM-QAYS-EXCURSION': [60, 1.4],
  'JOR-TR-PETRA-AQABA-EXCURSION': [250, 4.2],
  'JOR-TR-PETRA-DANA-RESERVE-EXCURSION': [150, 3.2],
  'JOR-TR-PETRA-LITTLE-PETRA-EXPERIENCE': [28, 0.9],
  'JOR-TR-PETRA-SHOBAK-CASTLE-TOUR': [70, 1.3],
  'JOR-TR-PETRA-WADI-RUM-EXCURSION': [210, 3.0],
  'JOR-TR-QAIA-QAIA-LAYOVER-AMMAN-CITY-TOUR': [80, 1.8],
  'JOR-TR-QAIA-QAIA-LAYOVER-DEAD-SEA-TOUR': [110, 2.0],
  'JOR-TR-UMMQAYS-PELLA-EXCURSION': [60, 1.4],
  'JOR-TR-WADIRUM-AQABA-EXCURSION': [120, 2.0],
  'JOR-TR-WADIRUM-CAMP-TRANSFER-OPERATIONS': [30, 0.8],
  'JOR-TR-WADIRUM-PETRA-EXCURSION': [210, 3.0],
};

async function main() {
  const prisma = new PrismaClient();
  const codes = Object.keys(EST);
  const rs = await prisma.touringRoute.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, estimatedDistanceKm: true },
  });
  const present = new Set(rs.map((r) => r.code));
  const missingCodes = codes.filter((c) => !present.has(c));
  if (missingCodes.length) console.log('WARN codes not found: ' + missingCodes.join(', '));

  let write = 0;
  const ops: (() => Promise<any>)[] = [];
  for (const r of rs) {
    const [km, hr] = EST[r.code];
    write++;
    ops.push(() =>
      prisma.touringRoute.update({
        where: { id: r.id },
        data: { estimatedDistanceKm: km, estimatedDriveHours: hr, includedKm: km },
      }),
    );
    if (r.estimatedDistanceKm != null) console.log(`  (overwrite) ${r.code} ${r.estimatedDistanceKm} -> ${km}`);
  }
  console.log(`\nTouring routes to fill: ${write} (estKm + estDriveHrs + inclKm; includedHours untouched)`);

  if (APPLY) {
    let ok = 0, f = 0;
    for (const op of ops) { try { await op(); ok++; } catch (e: any) { f++; console.log('  ERR ' + (e?.message?.split('\n')[0] || e)); } }
    console.log(`Applied: ${ok} updated, ${f} failed`);
    const left = await prisma.touringRoute.count({ where: { estimatedDistanceKm: null } });
    console.log(`Touring routes still missing estDistance: ${left}`);
  } else console.log('\n(DRY-RUN — pass --apply to write.)');
  await prisma.$disconnect();
}
main();
