import { DEFAULT_VEHICLE_TYPE_LABELS, getVehicleTypeLabel, normalizeVehicleTypeLabel, readVehicleTypeAssignment, type VehicleTypeOption } from './vehicle-types';

export const VEHICLE_TYPES = [...DEFAULT_VEHICLE_TYPE_LABELS, 'Other'] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const CANONICAL_FLEET_ROWS = [
  { name: 'Sedan 2', maxPax: 2 },
  { name: 'Mini Van 6', maxPax: 6 },
  { name: 'Van 9', maxPax: 9 },
  { name: 'Toyota Coaster / Mini Bus 17', maxPax: 17 },
  { name: 'Medium Bus 30', maxPax: 30 },
  { name: 'Large Coach 49', maxPax: 49 },
] as const;

function normalizeFleetLabel(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function isCanonicalFleetVehicle(vehicle: { name?: string | null; maxPax?: number | null }) {
  return CANONICAL_FLEET_ROWS.some((canonical) => normalizeFleetLabel(vehicle.name) === normalizeFleetLabel(canonical.name) && Number(vehicle.maxPax || 0) === canonical.maxPax);
}

export function filterCanonicalFleetVehicles<T extends { id?: string | null; name?: string | null; maxPax?: number | null }>(
  vehicles: T[],
  selectedIds: Array<string | null | undefined> = [],
) {
  const selectedIdSet = new Set(selectedIds.filter(Boolean));
  return vehicles.filter((vehicle) => (vehicle.id && selectedIdSet.has(vehicle.id)) || isCanonicalFleetVehicle(vehicle));
}

export function inferVehicleType(vehicle: { name?: string | null; maxPax?: number | null; vehicleType?: string | null }): VehicleType {
  const explicitType = normalizeVehicleTypeLabel(vehicle.vehicleType);

  if (explicitType && VEHICLE_TYPES.includes(explicitType as VehicleType)) {
    return explicitType as VehicleType;
  }

  const name = String(vehicle.name || '').toLowerCase();
  const maxPax = Number(vehicle.maxPax || 0);

  if (name.includes('mini van')) {
    return 'Mini Van';
  }

  if (name.includes('suv')) {
    return 'SUV';
  }

  if (name.includes('mini bus') || name.includes('small 17') || name.includes('coaster')) {
    return 'Mini Bus';
  }

  if (name.includes('van')) {
    return 'Van';
  }

  if (name.includes('vip') || name.includes('vvip')) {
    return 'Luxury';
  }

  if (name.includes('bus') || name.includes('coach') || name.includes('large') || maxPax >= 20) {
    return 'Coach';
  }

  if (name.includes('sedan')) {
    return 'Sedan';
  }

  return 'Other';
}

export function resolveVehicleTypeLabel(
  vehicle: { id?: string | null; name?: string | null; maxPax?: number | null; vehicleType?: string | { label?: string | null } | null },
  options: VehicleTypeOption[] = [],
) {
  const assignedType = readVehicleTypeAssignment(vehicle.id) || readVehicleTypeAssignment(vehicle.name);
  const explicitType = getVehicleTypeLabel(vehicle.vehicleType, options) || getVehicleTypeLabel(assignedType, options);

  if (explicitType) {
    return explicitType;
  }

  return inferVehicleType({
    name: vehicle.name,
    maxPax: vehicle.maxPax,
    vehicleType: typeof vehicle.vehicleType === 'string' ? vehicle.vehicleType : vehicle.vehicleType?.label || null,
  });
}

export function formatTransportVehicleDisplay(
  vehicle: { id?: string | null; name?: string | null; maxPax?: number | null; vehicleType?: string | { label?: string | null } | null },
  options: VehicleTypeOption[] = [],
  settings: { order?: 'canonical-first' | 'supplier-first'; includePax?: boolean; fallback?: string } = {},
) {
  const order = settings.order || 'canonical-first';
  const includePax = settings.includePax ?? true;
  const fallback = settings.fallback || 'Vehicle';
  const canonicalType = resolveVehicleTypeLabel(vehicle, options) || fallback;
  const supplierLabel = String(vehicle.name || '').trim();
  const pax = Number(vehicle.maxPax || 0);
  const paxText = includePax && pax > 0 ? ` · ${pax} pax` : '';
  const hasDistinctSupplierLabel = supplierLabel && supplierLabel.toLowerCase() !== canonicalType.toLowerCase();

  if (order === 'supplier-first') {
    return hasDistinctSupplierLabel ? `${supplierLabel} · ${canonicalType}` : canonicalType;
  }

  return `${canonicalType}${paxText}${hasDistinctSupplierLabel ? ` — ${supplierLabel}` : ''}`;
}
export function formatLuggageCapacity(value?: number | null) {
  return value && value > 0 ? String(value) : '—';
}

