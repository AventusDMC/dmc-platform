export type TransportPricingMode =
  | 'Point-to-Point'
  | 'Airport Transfer'
  | 'Half Day'
  | 'Full Day'
  | 'Extra Hour'
  | 'Extra KM'
  | 'Stationary / Waiting'
  | 'Add-on / Supplement';

export const TRANSPORT_PRICING_MODES: TransportPricingMode[] = [
  'Point-to-Point',
  'Airport Transfer',
  'Half Day',
  'Full Day',
  'Extra Hour',
  'Extra KM',
  'Stationary / Waiting',
  'Add-on / Supplement',
];

export const TRANSPORT_PRICING_MODE_HELPER_TEXT = 'Pricing Mode defines how the rate is calculated (e.g., Full Day, Point-to-Point).';

const PRICING_MODE_ALIASES: Record<string, TransportPricingMode> = {
  pointtopoint: 'Point-to-Point',
  airporttransfer: 'Airport Transfer',
  halfday: 'Half Day',
  fullday: 'Full Day',
  extrahour: 'Extra Hour',
  extrakm: 'Extra KM',
  extrakilometer: 'Extra KM',
  stationarywaiting: 'Stationary / Waiting',
  addonsupplement: 'Add-on / Supplement',
  addon: 'Add-on / Supplement',
  supplement: 'Add-on / Supplement',
  transfer: 'Point-to-Point',
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
