export type CanonicalTransportPricingMode =
  | 'Point-to-Point'
  | 'Airport Transfer'
  | 'Half Day'
  | 'Daily Full Day'
  | 'Extra Hour'
  | 'Extra KM'
  | 'Petra Overnight'
  | 'Wadi Rum Overnight'
  | 'Aqaba Overnight'
  | 'Stationary / Waiting'
  | 'Add-on / Supplement';

export const CANONICAL_TRANSPORT_PRICING_MODES: CanonicalTransportPricingMode[] = [
  'Airport Transfer',
  'Point-to-Point',
  'Daily Full Day',
  'Half Day',
  'Stationary / Waiting',
  'Extra Hour',
  'Extra KM',
  'Petra Overnight',
  'Wadi Rum Overnight',
  'Aqaba Overnight',
];

const TRANSPORT_PRICING_MODE_ALIASES: Record<string, CanonicalTransportPricingMode> = {
  pointtopoint: 'Point-to-Point',
  airporttransfer: 'Airport Transfer',
  halfday: 'Half Day',
  halfday100km: 'Half Day',
  fullday: 'Daily Full Day',
  fullday200km: 'Daily Full Day',
  fulldaytour: 'Daily Full Day',
  dailyfd: 'Daily Full Day',
  dailyfullday: 'Daily Full Day',
  dailypackage: 'Daily Full Day',
  minimum3fulldays: 'Daily Full Day',
  daytour: 'Daily Full Day',
  daytours: 'Daily Full Day',
  daytouring: 'Daily Full Day',
  sightseeingday: 'Daily Full Day',
  sightseeingtour: 'Daily Full Day',
  fittouring: 'Daily Full Day',
  extrahour: 'Extra Hour',
  extrakm: 'Extra KM',
  extrakilometer: 'Extra KM',
  extrakilometre: 'Extra KM',
  driverovernight: 'Petra Overnight',
  overnight: 'Petra Overnight',
  overnightdriver: 'Petra Overnight',
  petraovernight: 'Petra Overnight',
  petraovernightdriver: 'Petra Overnight',
  wadirumovernight: 'Wadi Rum Overnight',
  rumovernight: 'Wadi Rum Overnight',
  wadirumovernightdriver: 'Wadi Rum Overnight',
  aqabaovernight: 'Aqaba Overnight',
  aqabaovernightdriver: 'Aqaba Overnight',
  stationary: 'Stationary / Waiting',
  stationarywaiting: 'Stationary / Waiting',
  waiting: 'Stationary / Waiting',
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

export function getOriginalTransportPricingModeAlias(value?: string | null) {
  const raw = String(value || '').trim();
  const canonical = normalizeTransportPricingMode(raw);
  return raw && canonical && raw.toLowerCase() !== canonical.toLowerCase() ? raw : null;
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

  if (/\b(petra\s+overnight|petra.*driver\s+overnight)\b/.test(text)) {
    return 'Petra Overnight';
  }

  if (/\b(wadi\s*rum\s+overnight|rum\s+overnight|wadi\s*rum.*driver\s+overnight)\b/.test(text)) {
    return 'Wadi Rum Overnight';
  }

  if (/\b(aqaba\s+overnight|aqaba.*driver\s+overnight)\b/.test(text)) {
    return 'Aqaba Overnight';
  }

  if (/\b(full_day|daily_package|daily\s*fd|daily\s+full\s+day|full\s+day|day\s*tour|minimum\s+3)\b/.test(text)) {
    return 'Daily Full Day';
  }

  if (/\b(jerash|petra)\b/.test(text) && /\b(touring|tour|day)\b/.test(text)) {
    return 'Daily Full Day';
  }

  if (/\b(half_day|half\s+day)\b/.test(text)) {
    return 'Half Day';
  }

  if (/\b(stationary|waiting)\b/.test(text)) {
    return 'Stationary / Waiting';
  }

  if (/\b(qaia|airport)\b/.test(text) && /\b(amman|city)\b/.test(text)) {
    return 'Airport Transfer';
  }

  if (/\b(route_transfer|route transfer|transfer|transfers|private transfer)\b/.test(text)) {
    return 'Point-to-Point';
  }

  return null;
}
