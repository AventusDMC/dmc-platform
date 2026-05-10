export type TransportPricingMode =
  | 'Point-to-Point'
  | 'Airport Transfer'
  | 'Half Day'
  | 'Full Day'
  | 'Day Tour'
  | 'Extra Hour'
  | 'Extra KM'
  | 'Driver Overnight'
  | 'Stationary / Waiting'
  | 'Add-on / Supplement';

export const TRANSPORT_RATE_CARD_PRICING_MODES: TransportPricingMode[] = [
  'Airport Transfer',
  'Point-to-Point',
  'Half Day',
  'Full Day',
  'Day Tour',
  'Stationary / Waiting',
  'Extra Hour',
  'Extra KM',
];

export const TRANSPORT_PRICING_MODES: TransportPricingMode[] = [
  ...TRANSPORT_RATE_CARD_PRICING_MODES,
  'Driver Overnight',
  'Add-on / Supplement',
];

export const TRANSPORT_PRICING_MODE_HELPER_TEXT = 'Pricing Mode defines how the rate is calculated (e.g., Full Day, Point-to-Point).';

const PRICING_MODE_ALIASES: Record<string, TransportPricingMode> = {
  pointtopoint: 'Point-to-Point',
  airporttransfer: 'Airport Transfer',
  halfday: 'Half Day',
  halfday100km: 'Half Day',
  fullday: 'Full Day',
  fullday200km: 'Full Day',
  dailyfd: 'Full Day',
  dailyfullday: 'Full Day',
  dailypackage: 'Full Day',
  minimum3fulldays: 'Full Day',
  daytour: 'Day Tour',
  daytours: 'Day Tour',
  daytouring: 'Day Tour',
  sightseeingday: 'Day Tour',
  sightseeingtour: 'Day Tour',
  fittouring: 'Day Tour',
  extrahour: 'Extra Hour',
  extrakm: 'Extra KM',
  extrakilometer: 'Extra KM',
  extrakilometre: 'Extra KM',
  driverovernight: 'Driver Overnight',
  overnightdriver: 'Driver Overnight',
  stationary: 'Stationary / Waiting',
  stationarywaiting: 'Stationary / Waiting',
  addonsupplement: 'Add-on / Supplement',
  addon: 'Add-on / Supplement',
  supplement: 'Add-on / Supplement',
  transfer: 'Point-to-Point',
  transfers: 'Point-to-Point',
  transferrows: 'Point-to-Point',
  privatetransfer: 'Point-to-Point',
  routetransfer: 'Point-to-Point',
  oneway: 'Point-to-Point',
  airport: 'Airport Transfer',
  perhour: 'Extra Hour',
  perkm: 'Extra KM',
};

function normalizePricingModeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeTransportPricingMode(value?: string | null): TransportPricingMode | null {
  const normalized = normalizePricingModeKey(value || '');
  return normalized ? PRICING_MODE_ALIASES[normalized] || null : null;
}

export function getTransportPricingModeClassification(pricingMode: TransportPricingMode) {
  if (pricingMode === 'Half Day') {
    return 'HALF_DAY';
  }

  if (pricingMode === 'Full Day' || pricingMode === 'Day Tour') {
    return 'FULL_DAY';
  }

  if (
    pricingMode === 'Stationary / Waiting' ||
    pricingMode === 'Extra Hour' ||
    pricingMode === 'Extra KM' ||
    pricingMode === 'Driver Overnight' ||
    pricingMode === 'Add-on / Supplement'
  ) {
    return 'ADD_ON';
  }

  return 'ROUTE_TRANSFER';
}

type TransportServiceTypeLike = {
  id: string;
  name: string;
  code: string;
  classification?: string | null;
};

export type TransportPricingModeServiceTypeOption<T extends TransportServiceTypeLike = TransportServiceTypeLike> = {
  mode: TransportPricingMode;
  serviceType: T;
};

function scoreServiceTypeForMode(serviceType: TransportServiceTypeLike, mode: TransportPricingMode) {
  const normalizedName = normalizeTransportPricingMode(serviceType.name);
  const normalizedCode = normalizeTransportPricingMode(serviceType.code);
  const expectedCode = mode.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  let score = 0;

  if (serviceType.name.trim().toLowerCase() === mode.toLowerCase()) score += 100;
  if (serviceType.code.trim().toUpperCase() === expectedCode) score += 80;
  if (normalizedName === mode) score += 20;
  if (normalizedCode === mode) score += 10;
  if (serviceType.classification === getTransportPricingModeClassification(mode)) score += 5;

  return score;
}

export function buildTransportPricingModeServiceTypeOptions<T extends TransportServiceTypeLike>(
  serviceTypes: T[],
  modes: TransportPricingMode[] = TRANSPORT_RATE_CARD_PRICING_MODES,
): TransportPricingModeServiceTypeOption<T>[] {
  return modes
    .map((mode) => {
      const matches = serviceTypes
        .filter((serviceType) => normalizeTransportPricingMode(serviceType.name) === mode || normalizeTransportPricingMode(serviceType.code) === mode)
        .sort((left, right) => scoreServiceTypeForMode(right, mode) - scoreServiceTypeForMode(left, mode));

      return matches[0] ? { mode, serviceType: matches[0] } : null;
    })
    .filter((option): option is TransportPricingModeServiceTypeOption<T> => Boolean(option));
}

type TransportPricingModeSource = {
  pricingMode?: string | null;
  routeName?: string | null;
  route?: {
    name?: string | null;
  } | null;
  serviceType?: {
    name?: string | null;
    code?: string | null;
    classification?: string | null;
  } | null;
};

export function deriveTransportPricingMode(source: TransportPricingModeSource): TransportPricingMode | null {
  const explicitMode =
    normalizeTransportPricingMode(source.pricingMode) ||
    normalizeTransportPricingMode(source.serviceType?.name) ||
    normalizeTransportPricingMode(source.serviceType?.code);

  if (explicitMode) {
    return explicitMode;
  }

  const text = [
    source.serviceType?.classification,
    source.serviceType?.name,
    source.serviceType?.code,
    source.routeName,
    source.route?.name,
  ].join(' ').toLowerCase();

  if (/\b(full_day|daily_package|daily\s*fd|daily\s+full\s+day|full\s+day|minimum\s+3)\b/.test(text)) {
    return 'Full Day';
  }

  if (/\b(half_day|half\s+day)\b/.test(text)) {
    return 'Half Day';
  }

  if (/\b(stationary|waiting)\b/.test(text)) {
    return 'Stationary / Waiting';
  }

  if (/\b(route_transfer|route transfer|transfer|transfers|private transfer)\b/.test(text)) {
    return 'Point-to-Point';
  }

  return null;
}
