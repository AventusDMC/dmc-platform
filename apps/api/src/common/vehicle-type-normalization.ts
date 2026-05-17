export const DEFAULT_VEHICLE_TYPE_LABELS = ['Sedan', 'SUV', 'Mini Van', 'Van', 'Mini Bus', 'Coach', 'Luxury'] as const;
export const JORDAN_VEHICLE_CAPACITY_RANGES = [
  { label: 'Sedan', minPax: 1, maxPax: 2, aliases: ['sedan', 'saloon', 'car', 'camry'] },
  { label: 'Mini Van', minPax: 3, maxPax: 6, aliases: ['mini van', 'minivan', 'h1', 'staria'] },
  { label: 'Van', minPax: 6, maxPax: 9, aliases: ['van', 'sprinter', 'v class', 'h350'] },
  { label: 'Mini Bus / Toyota Coaster', minPax: 9, maxPax: 17, aliases: ['mini bus', 'minibus', 'mini coach', 'toyota coaster', 'coaster', 'small 17'] },
  { label: 'Medium Bus', minPax: 14, maxPax: 29, aliases: ['medium bus', 'medium coach', 'medium 29', 'medium 30', 'large vip 29', 'large vvip 29'] },
  { label: 'Large Bus', minPax: 30, maxPax: 48, aliases: ['large bus', 'large coach', 'coach', 'bus', 'large 48', 'large 49'] },
  { label: 'Large Bus X', minPax: 30, maxPax: 51, aliases: ['large bus x', 'large 51', 'bus x', 'coach x'] },
] as const;

export function getJordanVehicleCapacityMatches(pax: number) {
  const requestedPax = Math.max(1, Math.floor(Number(pax) || 1));
  return JORDAN_VEHICLE_CAPACITY_RANGES.filter((range) => requestedPax >= range.minPax && requestedPax <= range.maxPax);
}

const VEHICLE_TYPE_ALIASES: Record<string, string> = {
  minivan5: 'Mini Van',
  minivan: 'Mini Van',
  vanvip9: 'Van',
  van9: 'Van',
  van12: 'Van',
  small17: 'Mini Bus',
  medium30: 'Coach',
  large49: 'Coach',
  largevip29: 'Coach',
  largevvip29: 'Coach',
  largevip3133: 'Coach',
  largevvip3133: 'Coach',
  large3133: 'Coach',
  bus: 'Coach',
  minibus: 'Mini Bus',
  smallbus: 'Mini Bus',
  mediumbus: 'Coach',
  coach: 'Coach',
  largebus: 'Coach',
  vipbus: 'Coach',
  vipcoach: 'Coach',
  luxurycoach: 'Coach',
  sedan: 'Sedan',
  car: 'Sedan',
  suv: 'SUV',
  jeep: 'SUV',
};

const LEGACY_VEHICLE_TYPE_LABELS: Record<string, string> = {
  'Mini Van 5': 'Mini Van',
  'Van VIP 9': 'Van',
  'Van 9': 'Van',
  'Van 12': 'Van',
  'Small 17': 'Mini Bus',
  'Medium 30': 'Coach',
  'Large 49': 'Coach',
  'Large VIP 29': 'Coach',
  'Large VVIP 29': 'Coach',
  'Large VIP 31-33': 'Coach',
  'Large VVIP 31-33': 'Coach',
  'Large 31-33': 'Coach',
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
  const aliasMatch = VEHICLE_TYPE_ALIASES[key];
  if (catalogMatch || aliasMatch) {
    return catalogMatch || aliasMatch;
  }

  const normalizedText = rawValue.toLowerCase();
  if (/\b(sedan|saloon|camry|car)\b/.test(normalizedText)) {
    return 'Sedan';
  }

  if (/\b(suv|jeep)\b/.test(normalizedText)) {
    return 'SUV';
  }

  if (/\b(mini\s*van|minivan|h1|staria)\b/.test(normalizedText)) {
    return 'Mini Van';
  }

  if (/\b(sprinter|v[-\s]*class|h350|van)\b/.test(normalizedText)) {
    return 'Van';
  }

  if (/\b(small\s*17|mini\s*bus|mini\s*coach|coaster)\b/.test(normalizedText)) {
    return 'Mini Bus';
  }

  if (/\b(coach|bus|large|medium|grand\s*star)\b/.test(normalizedText) || /\b(29|30|31|33|49)\b/.test(normalizedText)) {
    return 'Coach';
  }

  return '';
}

export function getVehicleTypeMatchLabels(value: string | null | undefined, catalogLabels: string[] = [...DEFAULT_VEHICLE_TYPE_LABELS]) {
  const canonical = normalizeVehicleTypeLabel(value, catalogLabels);
  if (!canonical) {
    return [];
  }

  const labels = [
    canonical,
    ...Object.entries(LEGACY_VEHICLE_TYPE_LABELS)
      .filter(([, label]) => label === canonical)
      .map(([label]) => label),
    ...Object.entries(VEHICLE_TYPE_ALIASES)
      .filter(([, label]) => label === canonical)
      .map(([key]) => key),
  ];
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
