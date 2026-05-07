export type PricingPolicyRate = {
  pricingMode?: string | null;
  maxPaxPerUnit?: number | null;
};

export type PricingPolicyService = {
  name?: string | null;
  category?: string | null;
  unitType?: string | null;
  serviceType?: {
    name?: string | null;
    code?: string | null;
  } | null;
  serviceRates?: PricingPolicyRate[] | null;
};

export type PricingPolicyQuoteItem = {
  service?: PricingPolicyService | null;
  activityId?: string | null;
  activity?: unknown;
  appliedVehicleRate?: unknown;
  hotel?: unknown;
  contract?: unknown;
  roomCategory?: unknown;
  hotelId?: string | null;
  contractId?: string | null;
  roomCategoryId?: string | null;
  seasonName?: string | null;
  occupancyType?: string | null;
  mealPlan?: string | null;
  externalPackageName?: string | null;
  externalPackageCountry?: string | null;
  externalSupplierName?: string | null;
  externalPricingBasis?: string | null;
  externalNetCost?: number | null;
  externalPackagePricingMatrixJson?: unknown;
  costBaseAmount?: number | null;
  totalCost?: number | null;
  totalSell?: number | null;
  markupAmount?: number | null;
  sellPrice?: number | null;
  useOverride?: boolean | null;
  overrideCost?: number | null;
};

export type PricingPolicyRecommendation = {
  eligible: boolean;
  markupPercent: number | null;
  reason: string;
  skippedReason: string | null;
};

const DEFAULT_MARKUPS = {
  transport: 20,
  genericServiceRate: 20,
  hotel: 15,
} as const;

function normalize(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

function normalizeCode(value: string | null | undefined) {
  return normalize(value).replace(/[\s-]+/g, '_');
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== '';
}

function hasExternalPackageData(item: PricingPolicyQuoteItem) {
  return Boolean(
    item.externalPackageName ||
      item.externalPackageCountry ||
      item.externalSupplierName ||
      item.externalPricingBasis ||
      hasValue(item.externalNetCost) ||
      item.externalPackagePricingMatrixJson,
  );
}

function getServiceKind(item: PricingPolicyQuoteItem) {
  const service = item.service;
  const category = normalize(service?.category);
  const typeName = normalize(service?.serviceType?.name);
  const typeCode = normalizeCode(service?.serviceType?.code);
  const serviceName = normalize(service?.name);
  const combined = `${category} ${typeName} ${typeCode} ${serviceName}`;

  if (hasExternalPackageData(item) || (combined.includes('external') && combined.includes('package'))) {
    return 'external';
  }
  if (hasStructuredHotelRate(item) || category === 'hotel' || typeCode === 'hotel' || combined.includes('hotel') || combined.includes('accommodation')) {
    return 'hotel';
  }
  if (category === 'transport' || combined.includes('transport') || combined.includes('transfer') || combined.includes('vehicle')) {
    return 'transport';
  }
  if (typeCode === 'meal' || category === 'meal' || category === 'dining' || combined.includes('meal') || combined.includes('lunch') || combined.includes('dinner')) {
    return 'meal';
  }
  if (typeCode === 'guide' || category === 'guide' || combined.includes('guide')) {
    return 'guide';
  }
  if (category === 'activity' || combined.includes('activity') || combined.includes('experience') || combined.includes('sightseeing') || combined.includes('entrance')) {
    return 'activity';
  }

  return 'service';
}

function getStructuredServiceRate(item: PricingPolicyQuoteItem) {
  return item.service?.serviceRates?.[0] || null;
}

function hasStructuredHotelRate(item: PricingPolicyQuoteItem) {
  return Boolean(
    item.hotelId ||
      item.contractId ||
      item.roomCategoryId ||
      item.hotel ||
      item.contract ||
      item.roomCategory ||
      item.seasonName ||
      item.occupancyType ||
      item.mealPlan,
  );
}

function skip(reason: string): PricingPolicyRecommendation {
  return {
    eligible: false,
    markupPercent: null,
    reason: 'Pricing policy recommendation skipped.',
    skippedReason: reason,
  };
}

function recommend(markupPercent: number, reason: string): PricingPolicyRecommendation {
  return {
    eligible: true,
    markupPercent,
    reason,
    skippedReason: null,
  };
}

export function getPricingPolicyRecommendation(item: PricingPolicyQuoteItem): PricingPolicyRecommendation {
  if (hasValue(item.sellPrice)) {
    return skip('Sell override is active.');
  }

  if (hasValue(item.markupAmount)) {
    return skip('Markup amount override is active.');
  }

  if (item.useOverride || hasValue(item.overrideCost)) {
    return skip('Cost override is active.');
  }

  const totalCost = Number(item.totalCost ?? 0);
  if (!Number.isFinite(totalCost) || totalCost <= 0) {
    return skip('Cost is missing or zero.');
  }

  const totalSell = Number(item.totalSell ?? 0);
  if (Number.isFinite(totalSell) && totalSell > 0) {
    return skip('Sell price already exists.');
  }

  const kind = getServiceKind(item);

  if (kind === 'activity') {
    return skip('Activities preserve catalog or planner sell pricing.');
  }

  if (kind === 'meal') {
    return skip('Meals remain manual in Phase 1.');
  }

  if (kind === 'guide') {
    return skip('Guides remain manual in Phase 1.');
  }

  if (kind === 'external') {
    return skip('External packages remain manual in Phase 1.');
  }

  if (kind === 'transport') {
    return recommend(DEFAULT_MARKUPS.transport, 'Transport row is missing sell and has a resolved cost.');
  }

  if (kind === 'hotel') {
    if (!hasStructuredHotelRate(item)) {
      return skip('Hotel row is not linked to structured hotel-rate data.');
    }

    return recommend(DEFAULT_MARKUPS.hotel, 'Structured hotel-rate row is missing sell and has a resolved cost.');
  }

  if (getStructuredServiceRate(item)) {
    return recommend(DEFAULT_MARKUPS.genericServiceRate, 'Generic ServiceRate row is missing sell and has a resolved cost.');
  }

  return skip('No Phase 1 pricing policy matches this row.');
}

export function formatPricingPolicyMarkup(value: number | null) {
  return value === null ? 'Not available' : `${value.toFixed(2)}%`;
}
