/**
 * Phase 3: generate touring-route legs from stops for every stop-bearing
 * route, using the tested TouringRouteLegsService. Non-destructive
 * (replaceExisting:false). Then print a per-route + aggregate summary and
 * verify a few computed flows. Dry-run (preview) unless --apply.
 */
import { PrismaClient } from '@prisma/client';
import { TouringRouteLegsService } from '../src/touring-route-legs/touring-route-legs.service';

const APPLY = process.argv.includes('--apply');

async function main() {
  const prisma = new PrismaClient();
  const svc = new TouringRouteLegsService(prisma as any);
  const trs = await prisma.touringRoute.findMany({ where: { stops: { some: {} } }, orderBy: { code: 'asc' }, select: { id: true, code: true } });

  let totCreated = 0, totReused = 0, totMissingStd = 0, totUnmatched = 0;
  for (const t of trs) {
    const r: any = await svc.generateLegsFromStops({ touringRouteId: t.id, mode: APPLY ? 'apply' : 'preview', replaceExisting: false });
    const c = APPLY ? r.createdCount : r.newCount;
    totCreated += c || 0; totReused += r.reusedCount || 0; totMissingStd += r.missingStandardCount || 0; totUnmatched += r.skippedUnmatched || 0;
    if ((c || 0) > 0 || (r.skippedUnmatched || 0) > 0)
      console.log(`  ${t.code.padEnd(40)} ${APPLY ? 'created' : 'would-create'}=${c} reuse=${r.reusedCount} missingStd=${r.missingStandardCount} unmatched=${r.skippedUnmatched}`);
  }
  console.log(`\n${APPLY ? 'APPLIED' : 'PREVIEW'} — created ${totCreated}, reused ${totReused}, missingStd ${totMissingStd}, unmatched ${totUnmatched}`);

  if (APPLY) {
    // verify a handful of computed summaries
    console.log('\n=== Sample computed flows ===');
    const samples = ['JOR-TR-CENTRAL-MADABA-NEBO-DEAD-SEA-RT', 'JOR-TR-NORTH-JERASH-AJLOUN-RT', 'JOR-TR-SOUTH-AMMAN-DANA-PETRA-ON', 'JOR-TR-CENTRAL-DESERT-CASTLES-RT', 'JOR-TR-AQABA-GLASS-BOAT-RT'];
    for (const code of samples) {
      const tr = await prisma.touringRoute.findUnique({ where: { code }, select: { id: true } });
      if (!tr) continue;
      const s = await svc.computeSummary(tr.id);
      console.log(`  ${code}`);
      console.log(`     flow: ${s.flow}`);
      console.log(`     legs=${s.legCount} drive=${s.driveLegCount} driveKm=${s.totalDriveDistanceKm} driveHrs=${s.totalDriveDurationHours} missingStd=${s.missingRouteStandardCount} flags=${JSON.stringify(s.riskFlags)}`);
    }
    const withLegs = await prisma.touringRoute.count({ where: { routeLegs: { some: {} } } });
    const totalLegs = await prisma.touringRouteLeg.count();
    console.log(`\nTouring routes with >=1 leg: ${withLegs} | total legs: ${totalLegs}`);
  } else console.log('\n(DRY-RUN — pass --apply to write.)');
  await prisma.$disconnect();
}
main();
