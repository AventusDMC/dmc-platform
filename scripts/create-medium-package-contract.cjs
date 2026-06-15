// PR11B-3B of the transport contract-regime refactor.
// Idempotent creation of ONE pilot PACKAGE_MIN_FULL_DAY contract
// (Alpha Bus and Limo Co + Medium Bus + USD) for SHADOW VALIDATION ONLY.
//
// This contract is NOT wired into live pricing yet. Live apply remains pinned to the Large 49
// pilot contract (66f5de06-…); PR 11B-3C will generalize the contract/vehicle allowlist. This
// contract represents the STANDARD Alpha Medium 30 daily package rate (525/307), NOT the premium
// Large VVIP 29 rate (1069/674) — the allowed vehicle (Medium 30
// da68f987-ce15-469a-8a65-50c2ee2bbca3) is enforced by the allowlist in a later PR, not here.
//
// Usage:
//   node scripts/create-medium-package-contract.cjs --dry-run   # preview, no write
//   node scripts/create-medium-package-contract.cjs             # create (idempotent)
//
// Idempotent: findMany → if exactly one match, do nothing; if >1, ABORT; if 0, create.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const MEDIUM = {
  supplierId: '3f63311b-021f-432a-8ff8-fc5d5f407ad0', // Alpha Bus and Limo Co
  vehicleClass: 'Medium Bus',
  currency: 'USD',
  regime: 'PACKAGE_MIN_FULL_DAY',
  minimumFullDays: 3,
  minimumDayPolicy: 'INELIGIBLE_UNDER_MIN',
  fullDayRate: 525, // standard Alpha Medium 30 DAILY_FULL_DAY USD
  halfDayRate: 307, // standard Alpha Medium 30 HALF_DAY USD
  airportTransferIncluded: false,
  active: true, // visible to the shadow endpoint only; not live-applied until PR 11B-3C allowlist
  validFrom: new Date('2026-04-01T00:00:00.000Z'),
  validTo: new Date('2026-12-31T00:00:00.000Z'),
  notes: 'PILOT — shadow only — Alpha Medium 30 only, not Large VVIP 29 live pricing',
};
// Expected standard vehicle for the FUTURE allowlist (NOT written to the contract here):
const MEDIUM_30_VEHICLE_ID = 'da68f987-ce15-469a-8a65-50c2ee2bbca3';

(async () => {
  const supplier = await prisma.supplier.findUnique({ where: { id: MEDIUM.supplierId }, select: { id: true, name: true } });
  if (!supplier) throw new Error(`ABORT: supplier not found (${MEDIUM.supplierId})`);
  if (!/alpha/i.test(supplier.name)) throw new Error(`ABORT: supplier ${MEDIUM.supplierId} is not Alpha (${supplier.name})`);

  // Confirm the standard Medium 30 rate values still match (read-only sanity).
  const m30 = await prisma.vehicle.findUnique({ where: { id: MEDIUM_30_VEHICLE_ID }, select: { id: true, name: true, vehicleClass: true } });
  if (!m30 || m30.vehicleClass !== 'Medium Bus') throw new Error('ABORT: Medium 30 vehicle missing or not Medium Bus');
  if (/VIP|VVIP/i.test(m30.name)) throw new Error(`ABORT: allowed vehicle resolved to a VIP variant (${m30.name})`);
  const daily = await prisma.vehicleRate.findFirst({ where: { vehicleId: MEDIUM_30_VEHICLE_ID, currency: 'USD', serviceType: { code: 'DAILY_FULL_DAY' } }, select: { price: true } });
  const half = await prisma.vehicleRate.findFirst({ where: { vehicleId: MEDIUM_30_VEHICLE_ID, currency: 'USD', serviceType: { code: 'HALF_DAY' } }, select: { price: true } });
  console.log('RATE CHECK ' + JSON.stringify({ vehicle: m30.name, dailyFullDay: daily?.price, halfDay: half?.price, expectedFull: MEDIUM.fullDayRate, expectedHalf: MEDIUM.halfDayRate }));
  if (daily?.price !== MEDIUM.fullDayRate || half?.price !== MEDIUM.halfDayRate) {
    throw new Error('ABORT: Medium 30 rate values no longer match the approved 525/307 — stop and report');
  }

  const matches = await prisma.transportContract.findMany({
    where: { supplierId: MEDIUM.supplierId, vehicleClass: MEDIUM.vehicleClass, currency: MEDIUM.currency, regime: MEDIUM.regime },
    select: { id: true, active: true, notes: true },
  });
  if (matches.length > 1) {
    throw new Error(`ABORT: ${matches.length} matching Medium contracts already exist: ${matches.map((m) => m.id).join(', ')}`);
  }
  if (matches.length === 1) {
    console.log('EXISTS ' + JSON.stringify({ id: matches[0].id, active: matches[0].active, action: 'none (idempotent)' }));
    await prisma.$disconnect();
    return;
  }
  if (DRY_RUN) {
    console.log('DRY_RUN would create exactly 1 contract: ' + JSON.stringify(MEDIUM));
    await prisma.$disconnect();
    return;
  }
  const created = await prisma.transportContract.create({ data: MEDIUM, select: { id: true } });
  console.log('CREATED ' + JSON.stringify({ id: created.id }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
