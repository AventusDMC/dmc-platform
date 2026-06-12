// Canonical fleet taxonomy — single source of truth for the 8 vehicle classes used
// by the transport contract-regime refactor. Introduced in PR1.
//
// This is intentionally SEPARATE from `vehicle-type-normalization.ts` (the legacy
// label matcher wired into live pricing): PR1 must not alter pricing behaviour. This
// module is inert until later PRs consume it. The `Vehicle.vehicleClass` column is a
// plain nullable string validated against `VEHICLE_CLASSES` here (no DB enum yet).

export const VEHICLE_CLASSES = [
  'Sedan',
  'SUV',
  'Mini Van',
  'Van',
  'Small Mini Bus',
  'Medium Bus',
  'Large Bus',
  'Large Bus X',
] as const;

export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

export function isVehicleClass(value: unknown): value is VehicleClass {
  return typeof value === 'string' && (VEHICLE_CLASSES as readonly string[]).includes(value);
}

// Approved capacity bands (decisions D1–D5, 2026-06-13): capacity wins over the
// free-text vehicle name; SUV is the one name-driven exception.
//   Sedan ≤3 · SUV (name) · Mini Van 4–6 · Van 7–9 · Small Mini Bus 10–17 ·
//   Medium Bus 18–30 · Large Bus 31–49 · Large Bus X 50+.
// Returns null only for a non-positive pax (caller decides how to handle).
export function classifyVehicleClass(name: string, maxPax: number): VehicleClass | null {
  if (/\bsuv\b/i.test(name)) return 'SUV';
  const pax = Math.floor(Number(maxPax) || 0);
  if (pax <= 0) return null;
  if (pax <= 3) return 'Sedan';
  if (pax <= 6) return 'Mini Van';
  if (pax <= 9) return 'Van';
  if (pax <= 17) return 'Small Mini Bus';
  if (pax <= 30) return 'Medium Bus';
  if (pax <= 49) return 'Large Bus';
  return 'Large Bus X';
}
