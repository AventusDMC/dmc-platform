export type VehicleTypeOption = {
  id: string;
  label: string;
};

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
export const VEHICLE_TYPE_STORAGE_KEY = 'dmc.transport.vehicleTypes';
export const VEHICLE_TYPE_ASSIGNMENT_STORAGE_KEY = 'dmc.transport.vehicleTypeAssignments';

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

export function normalizeVehicleTypeKey(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function getJordanVehicleCapacityRange(value: string | null | undefined, maxPax?: number | null) {
  const key = normalizeVehicleTypeKey(value);
  const text = String(value || '').toLowerCase();
  const exactMatch = JORDAN_VEHICLE_CAPACITY_RANGES.find(
    (range) => normalizeVehicleTypeKey(range.label) === key || range.aliases.some((alias) => normalizeVehicleTypeKey(alias) === key),
  );
  const explicitMatch = exactMatch || JORDAN_VEHICLE_CAPACITY_RANGES.find((range) => range.aliases.some((alias) => text.includes(alias)));

  if (explicitMatch) {
    return explicitMatch;
  }

  const capacity = Number(maxPax || 0);
  if (!capacity) {
    return null;
  }

  return (
    JORDAN_VEHICLE_CAPACITY_RANGES.find((range) => capacity >= range.minPax && capacity <= range.maxPax) ||
    JORDAN_VEHICLE_CAPACITY_RANGES.find((range) => capacity <= range.maxPax) ||
    null
  );
}

export function getJordanVehicleCapacityMatches(pax: number) {
  const requestedPax = Math.max(1, Math.floor(Number(pax) || 1));
  return JORDAN_VEHICLE_CAPACITY_RANGES.filter((range) => requestedPax >= range.minPax && requestedPax <= range.maxPax);
}

export function slugifyVehicleTypeLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildVehicleTypeOption(label: string): VehicleTypeOption {
  const normalizedLabel = VEHICLE_TYPE_ALIASES[normalizeVehicleTypeKey(label)] || label.trim();

  return {
    id: slugifyVehicleTypeLabel(normalizedLabel) || `vehicle-type-${Date.now()}`,
    label: normalizedLabel,
  };
}

export function getDefaultVehicleTypeOptions(): VehicleTypeOption[] {
  return DEFAULT_VEHICLE_TYPE_LABELS.map((label) => buildVehicleTypeOption(label));
}

export function normalizeVehicleTypeOptions(options: VehicleTypeOption[]) {
  const seen = new Set<string>();

  return options
    .map((option) => buildVehicleTypeOption(option.label))
    .filter((option) => {
      if (!option.label || seen.has(option.id)) {
        return false;
      }

      seen.add(option.id);
      return true;
    });
}

export function getVehicleTypeOptionsWithFallback(options: VehicleTypeOption[]) {
  const normalized = normalizeVehicleTypeOptions(options);
  return normalized.length > 0 ? normalized : getDefaultVehicleTypeOptions();
}

export function normalizeVehicleTypeLabel(value: string | { label?: string | null } | null | undefined, options: VehicleTypeOption[] = []) {
  const rawLabel = typeof value === 'string' ? value : value?.label || '';
  const key = normalizeVehicleTypeKey(rawLabel);

  if (!key) {
    return '';
  }

  const catalogOptions = options.length > 0 ? getVehicleTypeOptionsWithFallback(options) : getDefaultVehicleTypeOptions();
  const match = catalogOptions.find((option) => option.id === rawLabel || normalizeVehicleTypeKey(option.label) === key || option.id === slugifyVehicleTypeLabel(rawLabel));

  const aliasMatch = VEHICLE_TYPE_ALIASES[key];
  if (match?.label || aliasMatch) {
    return match?.label || aliasMatch;
  }

  const normalizedText = rawLabel.toLowerCase();
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

export function readStoredVehicleTypeOptions() {
  if (typeof window === 'undefined') {
    return getDefaultVehicleTypeOptions();
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(VEHICLE_TYPE_STORAGE_KEY) || 'null') as VehicleTypeOption[] | null;
    return getVehicleTypeOptionsWithFallback(Array.isArray(parsed) ? parsed : []);
  } catch {
    return getDefaultVehicleTypeOptions();
  }
}

export function writeStoredVehicleTypeOptions(options: VehicleTypeOption[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(VEHICLE_TYPE_STORAGE_KEY, JSON.stringify(normalizeVehicleTypeOptions(options)));
  window.dispatchEvent(new CustomEvent('dmc:vehicle-types-changed'));
}

function readVehicleTypeAssignments() {
  if (typeof window === 'undefined') {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(VEHICLE_TYPE_ASSIGNMENT_STORAGE_KEY) || '{}') as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeVehicleTypeAssignment(vehicleKey: string | null | undefined, label: string) {
  if (typeof window === 'undefined' || !vehicleKey || !label.trim()) {
    return;
  }

  const assignments = readVehicleTypeAssignments();
  assignments[vehicleKey] = label.trim();
  window.localStorage.setItem(VEHICLE_TYPE_ASSIGNMENT_STORAGE_KEY, JSON.stringify(assignments));
  window.dispatchEvent(new CustomEvent('dmc:vehicle-types-changed'));
}

export function readVehicleTypeAssignment(vehicleKey: string | null | undefined) {
  if (!vehicleKey) {
    return '';
  }

  return readVehicleTypeAssignments()[vehicleKey] || '';
}

export function getVehicleTypeLabel(value: string | { label?: string | null } | null | undefined, options: VehicleTypeOption[] = []) {
  const rawLabel = typeof value === 'string' ? value : value?.label || '';
  const normalized = rawLabel.trim();

  if (!normalized) {
    return '';
  }

  const match = normalizeVehicleTypeLabel(normalized, options);

  return match || normalized;
}
