// PR8 of the transport contract-regime refactor.
// Idempotent creation of ONE pilot PACKAGE_MIN_FULL_DAY contract
// (Alpha Bus and Limo Co + Large Bus + USD) for SHADOW VALIDATION ONLY.
//
// This contract is NOT wired into live pricing — no live pricing path reads PACKAGE
// contracts; only the read-only package-eligibility shadow endpoint does. It represents the
// STANDARD Alpha Large Bus / Large 49 daily package rate, NOT the premium VIP 31-33 rate
// (per-vehicle/package-rate nuance is deferred to PR9+).
//
// Usage:
//   node scripts/create-pilot-package-contract.cjs --dry-run   # preview, no write
//   node scripts/create-pilot-package-contract.cjs             # create (idempotent)
//
// Idempotent: findMany → if exactly one match, do nothing; if >1, ABORT; if 0, create.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const PILOT = {
  supplierId: '3f63311b-021f-432a-8ff8-fc5d5f407ad0', // Alpha Bus and Limo Co
  vehicleClass: 'Large Bus',
  currency: 'USD',
  regime: 'PACKAGE_MIN_FULL_DAY',
  minimumFullDays: 3,
  minimumDayPolicy: 'INELIGIBLE_UNDER_MIN',
  fullDayRate: 656, // standard Alpha Large 49 DAILY_FULL_DAY USD
  halfDayRate: 370, // standard Alpha Large 49 HALF_DAY USD
  airportTransferIncluded: false,
  active: true, // visible to the shadow endpoint only; no live pricing reads PACKAGE contracts
  validFrom: new Date('2026-04-01T00:00:00.000Z'),
  validTo: new Date('2026-12-31T00:00:00.000Z'),
  notes: 'PILOT — shadow only — standard Alpha Large Bus 49 rate, not VIP 31-33 live pricing',
};

(async () => {
  const supplier = await prisma.supplier.findUnique({ where: { id: PILOT.supplierId }, select: { id: true, name: true } });
  if (!supplier) throw new Error(`ABORT: pilot supplier not found (${PILOT.supplierId})`);
  if (!/alpha/i.test(supplier.name)) throw new Error(`ABORT: supplier ${PILOT.supplierId} is not Alpha (${supplier.name})`);

  const matches = await prisma.transportContract.findMany({
    where: { supplierId: PILOT.supplierId, vehicleClass: PILOT.vehicleClass, currency: PILOT.currency, regime: PILOT.regime },
    select: { id: true, active: true, notes: true },
  });
  if (matches.length > 1) {
    throw new Error(`ABORT: ${matches.length} matching pilot contracts already exist: ${matches.map((m) => m.id).join(', ')}`);
  }
  if (matches.length === 1) {
    console.log('EXISTS ' + JSON.stringify({ id: matches[0].id, active: matches[0].active, action: 'none (idempotent)' }));
    await prisma.$disconnect();
    return;
  }
  if (DRY_RUN) {
    console.log('DRY_RUN would create exactly 1 contract: ' + JSON.stringify(PILOT));
    await prisma.$disconnect();
    return;
  }
  const created = await prisma.transportContract.create({ data: PILOT, select: { id: true } });
  console.log('CREATED ' + JSON.stringify({ id: created.id }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
