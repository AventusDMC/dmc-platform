export type CanonicalTransportPricingMode =
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

export const CANONICAL_TRANSPORT_PRICING_MODES: CanonicalTransportPricingMode[] = [
  'Point-to-Point',
  'Airport Transfer',
  'Half Day',
  'Full Day',
  'Day Tour',
  'Extra Hour',
  'Extra KM',
  'Driver Overnight',
  'Stationary / Waiting',
  'Add-on / Supplement',
];

const TRANSPORT_PRICING_MODE_ALIASES: Record<string, CanonicalTransportPricingMode> = {
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

export function normalizeTransportPricingModeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeTransportPricingMode(value?: string | null): CanonicalTransportPricingMode | null {
  const normalized = normalizeTransportPricingModeKey(value || '');
  return normalized ? TRANSPORT_PRICING_MODE_ALIASES[normalized] || null : null;
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

export function deriveTransportPricingMode(source: TransportPricingModeSource): CanonicalTransportPricingMode | null {
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
