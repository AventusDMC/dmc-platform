export const DEFAULT_VEHICLE_TYPE_LABELS = ['Sedan', 'SUV', 'Mini Van', 'Van', 'Mini Bus', 'Coach', 'Luxury'] as const;

const VEHICLE_TYPE_ALIASES: Record<string, string> = {
  minivan: 'Mini Van',
  bus: 'Coach',
  coach: 'Coach',
  largebus: 'Coach',
  sedan: 'Sedan',
  car: 'Sedan',
  suv: 'SUV',
  jeep: 'SUV',
};

export function normalizeVehicleTypeKey(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeVehicleTypeLabel(value: string | null | undefined, catalogLabels: string[] = [...DEFAULT_VEHICLE_TYPE_LABELS]) {
  const rawValue = String(value || '').trim();
  const key = normalizeVehicleTypeKey(rawValue);

  if (!key) {
    return '';
  }

  const catalogMatch = catalogLabels.find((label) => normalizeVehicleTypeKey(label) === key);
  return catalogMatch || VEHICLE_TYPE_ALIASES[key] || '';
}

export function getVehicleTypeCatalogLabels(extraLabels: Array<string | null | undefined> = []) {
  const labels = [...DEFAULT_VEHICLE_TYPE_LABELS, ...extraLabels].map((label) => normalizeVehicleTypeLabel(label || '') || String(label || '').trim()).filter(Boolean);
  const seen = new Set<string>();

  return labels.filter((label) => {
    const key = normalizeVehicleTypeKey(label);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
