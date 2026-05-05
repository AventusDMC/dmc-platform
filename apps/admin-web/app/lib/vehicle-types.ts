export type VehicleTypeOption = {
  id: string;
  label: string;
};

export const DEFAULT_VEHICLE_TYPE_LABELS = ['Sedan', 'SUV', 'Mini Van', 'Van', 'Mini Bus', 'Coach', 'Luxury'] as const;
export const VEHICLE_TYPE_STORAGE_KEY = 'dmc.transport.vehicleTypes';
export const VEHICLE_TYPE_ASSIGNMENT_STORAGE_KEY = 'dmc.transport.vehicleTypeAssignments';

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

  return match?.label || VEHICLE_TYPE_ALIASES[key] || '';
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
