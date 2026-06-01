/**
 * Data alignment for daily-package STATIONARY (local-standby) day pricing.
 *
 * In daily-package mode a same-city STAY at an overnight base (Petra / Wadi Rum
 * / Aqaba) bills at the cheaper STATIONARY_WAITING rate (vehicle waits locally:
 * hotel ↔ site ↔ hotel) instead of the full daily rate. The pricing engine
 * requires a route, but the 4 Almushtari STATIONARY_WAITING rates (Sedan 40,
 * SUV 50, Mini Van 50, Van 60 JOD) are routeless → unreachable. Re-point them
 * onto the same "Amman → Amman" disposal route the DAILY_FULL_DAY rates use so
 * `calculate(disposalRoute, STATIONARY_WAITING, pax)` resolves them.
 *
 * Safe: those rates are unreachable today, so this only ADDS reachability.
 * `calculate` filters by serviceTypeId, so stationary and full-day rates on the
 * same route never shadow each other.
 *
 * Dry-run unless --apply.
 */
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const DISPOSAL_ROUTE_ID = '15801601-6f9e-47cd-90bb-5fb0e515cc9a'; // Amman → Amman
const DISPOSAL_PLACE_ID = 'b4c6129c-8068-440f-bfac-1468f947c091'; // Amman (from==to)

async function main() {
  const prisma = new PrismaClient();

  const st = await prisma.transportServiceType.findFirst({ where: { code: 'STATIONARY_WAITING' } });
  if (!st) {
    console.log('STATIONARY_WAITING service type missing — abort.');
    await prisma.$disconnect();
    return;
  }

  // Re-point the routeless Almushtari STATIONARY_WAITING rates onto the disposal
  // route. The Alpha Bus STATIONARY_WAITING rates are already on their own route
  // (a different, USD route) and are left untouched.
  const routeless = await prisma.vehicleRate.findMany({
    where: { serviceTypeId: st.id, active: true, routeId: null },
    select: { id: true, price: true, currency: true, vehicle: { select: { name: true } }, supplier: { select: { name: true } } },
  });
  console.log('=== Re-point routeless STATIONARY_WAITING rates -> Amman → Amman disposal route ===');
  routeless.forEach((r) =>
    console.log(`  ${(r.vehicle?.name ?? '').padEnd(14)} ${r.price} ${r.currency}  ${r.supplier?.name ?? ''}  (rate ${r.id})`),
  );
  if (APPLY && routeless.length) {
    await prisma.vehicleRate.updateMany({
      where: { id: { in: routeless.map((r) => r.id) } },
      data: { routeId: DISPOSAL_ROUTE_ID, fromPlaceId: DISPOSAL_PLACE_ID, toPlaceId: DISPOSAL_PLACE_ID },
    });
    console.log(`  -> re-pointed ${routeless.length} rates`);
  }

  // Guard: deactivate any STATIONARY_WAITING pricing RULES on the disposal route
  // — `calculate` prefers rules over vehicle-rates, so a stray rule would shadow
  // the Almushtari JOD rate (the exact problem the DAILY rules caused earlier).
  const rules = await prisma.transportPricingRule.findMany({
    where: { routeId: DISPOSAL_ROUTE_ID, transportServiceTypeId: st.id, isActive: true },
    select: { id: true },
  });
  console.log(`\n=== STATIONARY_WAITING pricing rules on disposal route: ${rules.length} ===`);
  if (APPLY && rules.length) {
    await prisma.transportPricingRule.updateMany({ where: { id: { in: rules.map((r) => r.id) } }, data: { isActive: false } });
    console.log(`  -> deactivated ${rules.length}`);
  }

  if (APPLY) {
    const onRoute = await prisma.vehicleRate.findMany({
      where: { serviceTypeId: st.id, active: true, routeId: DISPOSAL_ROUTE_ID },
      select: { price: true, currency: true, vehicle: { select: { name: true } } },
      orderBy: { price: 'asc' },
    });
    console.log('\nVERIFY STATIONARY_WAITING on disposal route:');
    onRoute.forEach((r) => console.log(`  ${(r.vehicle?.name ?? '').padEnd(14)} ${r.price} ${r.currency}`));
  } else {
    console.log('\n(DRY-RUN — pass --apply to write.)');
  }
  await prisma.$disconnect();
}
main();
