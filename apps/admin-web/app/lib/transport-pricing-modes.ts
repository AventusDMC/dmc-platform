export type TransportPricingMode =
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

export const TRANSPORT_RATE_CARD_PRICING_MODES: TransportPricingMode[] = [
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

export const TRANSPORT_PRICING_MODES: TransportPricingMode[] = [
  ...TRANSPORT_RATE_CARD_PRICING_MODES,
  'Add-on / Supplement',
];

export const TRANSPORT_PRICING_MODE_HELPER_TEXT = 'Pricing Mode defines how the rate is calculated (e.g., Daily Full Day, Point-to-Point).';

export const TRANSPORT_PRICING_MODE_GROUPS: Array<{ label: string; modes: TransportPricingMode[] }> = [
  { label: 'Movement', modes: ['Airport Transfer', 'Point-to-Point'] },
  { label: 'Touring', modes: ['Daily Full Day', 'Half Day'] },
  {
    label: 'Operational Supplements',
    modes: ['Stationary / Waiting', 'Extra Hour', 'Extra KM', 'Petra Overnight', 'Wadi Rum Overnight', 'Aqaba Overnight'],
  },
];

const PRICING_MODE_ALIASES: Record<string, TransportPricingMode> = {
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

function normalizePricingModeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeTransportPricingMode(value?: string | null): TransportPricingMode | null {
  const normalized = normalizePricingModeKey(value || '');
  return normalized ? PRICING_MODE_ALIASES[normalized] || null : null;
}

export function getOriginalTransportPricingModeAlias(value?: string | null) {
  const raw = String(value || '').trim();
  const canonical = normalizeTransportPricingMode(raw);
  return raw && canonical && raw.toLowerCase() !== canonical.toLowerCase() ? raw : null;
}

export function getTransportPricingModeClassification(pricingMode: TransportPricingMode) {
  if (pricingMode === 'Half Day') {
    return 'HALF_DAY';
  }

  if (pricingMode === 'Daily Full Day') {
    return 'FULL_DAY';
  }

  if (
    pricingMode === 'Stationary / Waiting' ||
    pricingMode === 'Extra Hour' ||
    pricingMode === 'Extra KM' ||
    pricingMode === 'Petra Overnight' ||
    pricingMode === 'Wadi Rum Overnight' ||
    pricingMode === 'Aqaba Overnight' ||
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
  if (mode === 'Daily Full Day' && /\bfull\s*day\b/i.test(serviceType.name)) score += 30;
  if (mode === 'Daily Full Day' && /\bfull_day\b/i.test(serviceType.code)) score += 25;
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
