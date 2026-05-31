/**
 * Data alignment for daily-package transport auto-build:
 *  (A) Re-point the 4 routeless Almushtari DAILY_FULL_DAY rates onto the
 *      "Amman → Amman" disposal route so the pricing engine (which requires a
 *      route) can resolve them. This makes the 75 JOD/day rate reachable.
 *  (B) Mirror the PETRA_OVERNIGHT add-on rate set (15 JOD/vehicle) into
 *      WADI_RUM_OVERNIGHT and AQABA_OVERNIGHT (both currently empty) so driver
 *      overnights at those stops attach in daily-package mode.
 * Dry-run unless --apply.
 */
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const DISPOSAL_ROUTE_ID = '15801601-6f9e-47cd-90bb-5fb0e515cc9a'; // Amman → Amman
const DISPOSAL_PLACE_ID = 'b4c6129c-8068-440f-bfac-1468f947c091'; // Amman (from==to on the disposal route)

async function main() {
  const prisma = new PrismaClient();

  // (A) re-point routeless Almushtari DAILY_FULL_DAY rates
  const dfd = await prisma.transportServiceType.findFirst({ where: { code: 'DAILY_FULL_DAY' } });
  const routeless = await prisma.vehicleRate.findMany({
    where: { serviceTypeId: dfd!.id, active: true, routeId: null },
    select: { id: true, price: true, currency: true, vehicle: { select: { name: true } } },
  });
  console.log('=== (A) Re-point Almushtari DAILY_FULL_DAY rates -> Amman → Amman ===');
  routeless.forEach((r) => console.log(`  ${r.vehicle?.name?.padEnd(14)} ${r.price} ${r.currency}  (rate ${r.id})`));
  if (APPLY && routeless.length) {
    await prisma.vehicleRate.updateMany({
      where: { id: { in: routeless.map((r) => r.id) } },
      data: { routeId: DISPOSAL_ROUTE_ID, fromPlaceId: DISPOSAL_PLACE_ID, toPlaceId: DISPOSAL_PLACE_ID },
    });
    console.log(`  -> re-pointed ${routeless.length} rates`);
  }

  // (B) mirror PETRA_OVERNIGHT rates into WADI_RUM_OVERNIGHT + AQABA_OVERNIGHT
  const petra = await prisma.transportServiceType.findFirst({ where: { code: 'PETRA_OVERNIGHT' } });
  const template = await prisma.vehicleRate.findMany({
    where: { serviceTypeId: petra!.id, active: true },
    select: { vehicleId: true, supplierId: true, routeName: true, minPax: true, maxPax: true, price: true, currency: true, validFrom: true, validTo: true, fromPlaceId: true, toPlaceId: true, routeId: true, notes: true },
  });
  console.log(`\n=== (B) Mirror ${template.length} PETRA_OVERNIGHT rates into Wadi Rum + Aqaba + Dead Sea ===`);
  for (const code of ['WADI_RUM_OVERNIGHT', 'AQABA_OVERNIGHT', 'DEAD_SEA_OVERNIGHT']) {
    let st = await prisma.transportServiceType.findFirst({ where: { code } });
    if (!st && code === 'DEAD_SEA_OVERNIGHT') {
      // Dead Sea overnight is OPTIONAL (operator opt-in) and has no service
      // type yet — create it so the opt-in actually prices.
      console.log(`  ${code}: creating ADD_ON service type`);
      if (APPLY) {
        st = await prisma.transportServiceType.create({ data: { code, name: 'Dead Sea Overnight', classification: 'ADD_ON' } });
      }
    }
    if (!st) { console.log(`  ${code}: SERVICE TYPE MISSING — skip`); continue; }
    const existing = await prisma.vehicleRate.count({ where: { serviceTypeId: st.id, active: true } });
    if (existing > 0) { console.log(`  ${code}: already has ${existing} rates — skip`); continue; }
    const label = code === 'WADI_RUM_OVERNIGHT' ? 'Wadi Rum' : code === 'AQABA_OVERNIGHT' ? 'Aqaba' : 'Dead Sea';
    console.log(`  ${code}: create ${template.length} rates (15 JOD/vehicle)`);
    if (APPLY) {
      for (const t of template) {
        await prisma.vehicleRate.create({
          data: {
            serviceTypeId: st.id,
            vehicleId: t.vehicleId,
            supplierId: t.supplierId,
            routeName: `Driver Overnight ${label}`,
            minPax: t.minPax,
            maxPax: t.maxPax,
            price: t.price, // 15 JOD
            currency: t.currency,
            validFrom: t.validFrom,
            validTo: t.validTo,
            fromPlaceId: t.fromPlaceId,
            toPlaceId: t.toPlaceId,
            routeId: t.routeId,
            notes: t.notes,
            active: true,
          },
        });
      }
      console.log(`    -> created ${template.length}`);
    }
  }

  // (C) Deactivate the redundant DAILY_FULL_DAY pricing RULES on the disposal
  // route. They are Alpha Bus duplicates of the Alpha Bus DAILY vehicle-rates,
  // and because `calculate` prefers pricing-rules over vehicle-rates they
  // shadow the routeless-but-now-routed Almushtari JOD daily rates (75 JOD
  // etc.) from the candidate list. Deactivating them lets calculate fall
  // through to vehicle-rate matching, which returns ALL daily vehicles
  // (Almushtari JOD + Alpha Bus USD) and surfaces driver-overnight add-ons.
  console.log('\n=== (C) Deactivate redundant DAILY pricing rules on disposal route ===');
  const dailyRules = await prisma.transportPricingRule.findMany({
    where: { routeId: DISPOSAL_ROUTE_ID, transportServiceTypeId: dfd!.id, isActive: true },
    select: { id: true },
  });
  console.log(`  ${dailyRules.length} active DAILY rules to deactivate`);
  if (APPLY && dailyRules.length) {
    await prisma.transportPricingRule.updateMany({ where: { id: { in: dailyRules.map((r) => r.id) } }, data: { isActive: false } });
    console.log(`  -> deactivated ${dailyRules.length}`);
  }

  if (APPLY) {
    // verify
    for (const code of ['DAILY_FULL_DAY', 'PETRA_OVERNIGHT', 'WADI_RUM_OVERNIGHT', 'AQABA_OVERNIGHT', 'DEAD_SEA_OVERNIGHT']) {
      const st = await prisma.transportServiceType.findFirst({ where: { code } });
      const onRoute = await prisma.vehicleRate.count({ where: { serviceTypeId: st!.id, active: true, routeId: { not: null } } });
      const total = await prisma.vehicleRate.count({ where: { serviceTypeId: st!.id, active: true } });
      console.log(`VERIFY ${code}: ${total} active (${onRoute} routed)`);
    }
  } else console.log('\n(DRY-RUN — pass --apply to write.)');
  await prisma.$disconnect();
}
main();
