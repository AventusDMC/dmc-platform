import { formatPricingPolicyMarkup, getPricingPolicyRecommendation } from './pricing-policy';

export type PricingDiagnosticRate = {
  id?: string | null;
  pricingMode?: string | null;
  maxPaxPerUnit?: number | null;
  costBaseAmount?: number | null;
  costCurrency?: string | null;
};

export type PricingDiagnosticService = {
  name?: string | null;
  category?: string | null;
  unitType?: string | null;
  baseCost?: number | null;
  currency?: string | null;
  serviceType?: {
    name?: string | null;
    code?: string | null;
  } | null;
  serviceRates?: PricingDiagnosticRate[] | null;
};

export type PricingDiagnosticQuoteItem = {
  service?: PricingDiagnosticService | null;
  activityId?: string | null;
  activity?: {
    name?: string | null;
  } | null;
  appliedVehicleRate?: {
    routeName?: string | null;
    vehicle?: {
      name?: string | null;
    } | null;
    serviceType?: {
      name?: string | null;
      code?: string | null;
    } | null;
  } | null;
  hotel?: {
    name?: string | null;
  } | null;
  contract?: {
    name?: string | null;
  } | null;
  roomCategory?: {
    name?: string | null;
  } | null;
  hotelId?: string | null;
  contractId?: string | null;
  roomCategoryId?: string | null;
  seasonName?: string | null;
  occupancyType?: string | null;
  mealPlan?: string | null;
  externalPackageName?: string | null;
  externalPackageCountry?: string | null;
  externalPricingBasis?: string | null;
  externalNetCost?: number | null;
  externalPackagePricingMatrixJson?: unknown;
  quantity?: number | null;
  paxCount?: number | null;
  roomCount?: number | null;
  nightCount?: number | null;
  dayCount?: number | null;
  costBaseAmount?: number | null;
  costCurrency?: string | null;
  baseCost?: number | null;
  totalCost?: number | null;
  totalSell?: number | null;
  currency?: string | null;
  quoteCurrency?: string | null;
  overrideCost?: number | null;
  finalCost?: number | null;
  markupAmount?: number | null;
  sellPrice?: number | null;
  useOverride?: boolean | null;
  markupPercent?: number | null;
  pricingDescription?: string | null;
  jordanPassCovered?: boolean | null;
  jordanPassSavingsJod?: number | null;
};

export type PricingDiagnostics = {
  pricingSource: string;
  pricingMode: string;
  unitsUsed: string;
  appliedRateSource: string;
  fallbackStatus: string;
  overrideStatus: string;
  policyEligible: string;
  suggestedMarkup: string;
  policySkippedBecause: string;
  rows: Array<{
    label: string;
    value: string;
  }>;
};

type PricingDiagnosticsBase = Pick<
  PricingDiagnostics,
  'pricingSource' | 'pricingMode' | 'unitsUsed' | 'appliedRateSource' | 'fallbackStatus' | 'overrideStatus'
>;

type PricingBreakdownRows = {
  basis: string;
  unitPrice: string;
  pax: string;
  units: string;
  nights: string | null;
  calculatedTotal: string;
};

function normalize(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

function normalizeCode(value: string | null | undefined) {
  return normalize(value).replace(/[\s-]+/g, '_');
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== '';
}

function getPositiveNumber(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function hasPositiveValue(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasNumericValue(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value);
}

function getServiceKind(item: PricingDiagnosticQuoteItem) {
  const service = item.service;
  const category = normalize(service?.category);
  const typeName = normalize(service?.serviceType?.name);
  const typeCode = normalizeCode(service?.serviceType?.code);
  const serviceName = normalize(service?.name);
  const combined = `${category} ${typeName} ${typeCode} ${serviceName}`;

  if (combined.includes('external') && combined.includes('package')) {
    return 'external';
  }
  if (category === 'hotel' || typeCode === 'hotel' || combined.includes('hotel')) {
    return 'hotel';
  }
  if (category === 'transport' || combined.includes('transport') || combined.includes('transfer')) {
    return 'transport';
  }
  if (typeCode === 'meal' || category === 'meal' || combined.includes('meal') || combined.includes('lunch') || combined.includes('dinner')) {
    return 'meal';
  }
  if (typeCode === 'guide' || category === 'guide' || combined.includes('guide')) {
    return 'guide';
  }
  if (combined.includes('entrance')) {
    return 'entrance';
  }
  if (category === 'activity' || combined.includes('activity') || combined.includes('experience')) {
    return 'activity';
  }

  return 'service';
}

function hasExternalPackageData(item: PricingDiagnosticQuoteItem) {
  return Boolean(item.externalPackageName || item.externalPackageCountry || hasValue(item.externalNetCost) || item.externalPackagePricingMatrixJson);
}

function hasHotelData(item: PricingDiagnosticQuoteItem) {
  return Boolean(item.hotelId || item.contractId || item.roomCategoryId || item.hotel || item.contract || item.roomCategory);
}

function formatMode(mode: string | null | undefined) {
  return mode ? mode.replace(/_/g, ' ') : 'Not specified';
}

function formatPricingBasis(mode: string | null | undefined) {
  const normalizedMode = normalizeCode(mode);
  if (normalizedMode === 'hotel_per_person_night') return 'PER PERSON / NIGHT';
  if (normalizedMode === 'hotel_per_room_night') return 'PER ROOM / NIGHT';
  if (normalizedMode === 'ticket_per_person') return 'PER PERSON';
  if (normalizedMode === 'per_person') return 'PER PERSON';
  if (normalizedMode === 'per_room' || normalizedMode === 'hotel_rate') return 'PER ROOM';
  if (normalizedMode === 'per_group') return 'PER GROUP';
  if (normalizedMode === 'transport_per_group') return 'PER GROUP';
  if (normalizedMode === 'capacity_unit') return 'PER GROUP';
  if (normalizedMode === 'per_day') return 'PER DAY';
  if (normalizedMode === 'per_night') return 'PER NIGHT';
  if (normalizedMode === 'per_stay') return 'PER STAY';
  return formatMode(mode).toUpperCase();
}

function formatUnitsForMode(mode: string | null | undefined, item: PricingDiagnosticQuoteItem, rate?: PricingDiagnosticRate | null) {
  const normalizedMode = normalizeCode(mode);
  const quantity = getPositiveNumber(item.quantity, 1);
  const pax = getPositiveNumber(item.paxCount, 1);
  const days = getPositiveNumber(item.dayCount, 1);
  const rooms = getPositiveNumber(item.roomCount, 1);
  const nights = getPositiveNumber(item.nightCount, 1);

  if (normalizedMode === 'per_person') {
    const units = quantity * pax;
    return quantity > 1 ? `${quantity} qty x ${pax} pax = ${units} person units` : `${pax} pax`;
  }

  if (normalizedMode === 'ticket_per_person') {
    return `${pax} pax`;
  }

  if (normalizedMode === 'hotel_per_person_night') {
    return `${pax} pax x ${nights} night${nights === 1 ? '' : 's'}`;
  }

  if (normalizedMode === 'hotel_per_room_night') {
    return `${rooms} room${rooms === 1 ? '' : 's'} x ${nights} night${nights === 1 ? '' : 's'}`;
  }

  if (normalizedMode === 'per_day') {
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  if (normalizedMode === 'per_room' || normalizedMode === 'hotel_rate') {
    return `${rooms} room${rooms === 1 ? '' : 's'} x ${nights} night${nights === 1 ? '' : 's'}`;
  }

  if (normalizedMode === 'per_group') {
    const maxPaxPerUnit = getPositiveNumber(rate?.maxPaxPerUnit, 0);
    if (maxPaxPerUnit > 0) {
      return `${Math.ceil(pax / maxPaxPerUnit)} unit${Math.ceil(pax / maxPaxPerUnit) === 1 ? '' : 's'} for ${pax} pax`;
    }
    return `${quantity} group unit${quantity === 1 ? '' : 's'}`;
  }

  return `${quantity} unit${quantity === 1 ? '' : 's'}`;
}

function getUnitCountForMode(mode: string | null | undefined, item: PricingDiagnosticQuoteItem, rate?: PricingDiagnosticRate | null) {
  const normalizedMode = normalizeCode(mode);
  const quantity = getPositiveNumber(item.quantity, 1);
  const pax = getPositiveNumber(item.paxCount, 1);
  const days = getPositiveNumber(item.dayCount, 1);
  const rooms = getPositiveNumber(item.roomCount, 1);
  const nights = getPositiveNumber(item.nightCount, 1);

  if (normalizedMode === 'per_person') {
    return quantity * pax;
  }
  if (normalizedMode === 'ticket_per_person') {
    return pax;
  }
  if (normalizedMode === 'hotel_per_person_night') {
    return pax * nights;
  }
  if (normalizedMode === 'hotel_per_room_night') {
    return rooms * nights;
  }
  if (normalizedMode === 'per_day') {
    return quantity * days;
  }
  if (normalizedMode === 'per_room' || normalizedMode === 'hotel_rate') {
    return rooms * nights;
  }
  if (normalizedMode === 'per_group') {
    const maxPaxPerUnit = getPositiveNumber(rate?.maxPaxPerUnit, 0);
    return maxPaxPerUnit > 0 ? Math.ceil(pax / maxPaxPerUnit) : quantity;
  }
  if (normalizedMode === 'transport_per_group') {
    return quantity;
  }
  return quantity;
}

function formatOperationalUnits(mode: string | null | undefined, item: PricingDiagnosticQuoteItem, rate?: PricingDiagnosticRate | null) {
  const normalizedMode = normalizeCode(mode);
  const quantity = getPositiveNumber(item.quantity, 1);
  const pax = getPositiveNumber(item.paxCount, 1);
  const rooms = getPositiveNumber(item.roomCount, 1);
  const nights = getPositiveNumber(item.nightCount, 1);
  const days = getPositiveNumber(item.dayCount, 1);
  const count = getUnitCountForMode(mode, item, rate);

  if (normalizedMode === 'hotel_per_person_night') return `${pax} pax x ${nights} night${nights === 1 ? '' : 's'}`;
  if (normalizedMode === 'hotel_per_room_night' || normalizedMode === 'per_room' || normalizedMode === 'hotel_rate') return `${rooms} room${rooms === 1 ? '' : 's'} x ${nights} night${nights === 1 ? '' : 's'}`;
  if (normalizedMode === 'ticket_per_person' || normalizedMode === 'per_person') return `${count} person unit${count === 1 ? '' : 's'}`;
  if (normalizedMode === 'per_day') return `${days} day${days === 1 ? '' : 's'}`;
  if (normalizedMode === 'per_night') return `${nights} night${nights === 1 ? '' : 's'}`;
  if (normalizedMode === 'per_stay') return '1 stay';
  if (normalizedMode === 'capacity_unit') return `${count} vehicle${count === 1 ? '' : 's'}`;
  if (normalizedMode === 'transport_per_group') return `${count} vehicle${count === 1 ? '' : 's'}`;
  if (normalizedMode === 'per_group') return `${count} group unit${count === 1 ? '' : 's'}`;
  return `${quantity} unit${quantity === 1 ? '' : 's'}`;
}

function formatDiagnosticMoney(value: number | null | undefined, currency: string | null | undefined) {
  if (!hasNumericValue(value)) {
    return 'Pricing to be confirmed';
  }
  return `${currency || 'USD'} ${Number(value).toFixed(2)}`;
}

function buildPricingBreakdownRows(item: PricingDiagnosticQuoteItem, mode: string | null | undefined, rate?: PricingDiagnosticRate | null): PricingBreakdownRows {
  const totalPrice = hasNumericValue(item.totalCost) ? Number(item.totalCost) : hasNumericValue(item.finalCost) ? Number(item.finalCost) : hasNumericValue(item.baseCost) ? Number(item.baseCost) : null;
  const unitCount = Math.max(1, getUnitCountForMode(mode, item, rate));
  const unitPrice = hasNumericValue(totalPrice) ? Number((Number(totalPrice) / unitCount).toFixed(2)) : null;
  const currency = item.quoteCurrency || item.currency || item.costCurrency || 'USD';
  const nights = getPositiveNumber(item.nightCount, 1);

  return {
    basis: formatPricingBasis(mode),
    unitPrice: formatDiagnosticMoney(unitPrice, currency),
    pax: `${getPositiveNumber(item.paxCount, 1)} pax`,
    units: formatOperationalUnits(mode, item, rate),
    nights: normalizeCode(mode).includes('night') || normalizeCode(mode) === 'per_night' || nights > 1 ? String(nights) : null,
    calculatedTotal: formatDiagnosticMoney(totalPrice, currency),
  };
}

function inferHotelPricingMode(item: PricingDiagnosticQuoteItem) {
  const description = normalize(item.pricingDescription);
  if (/\bx\s*\d+\s*pax\b/.test(description) || description.includes('per person')) {
    return 'HOTEL_PER_PERSON_NIGHT';
  }
  return 'HOTEL_PER_ROOM_NIGHT';
}

function formatHotelPricingMode(mode: string) {
  return mode === 'HOTEL_PER_PERSON_NIGHT' ? 'Hotel per person/night' : 'Hotel room/night';
}

function getOverrideStatus(item: PricingDiagnosticQuoteItem) {
  const statuses = [];
  if (item.useOverride && hasValue(item.overrideCost)) {
    statuses.push('Cost override active');
  }
  if (hasPositiveValue(item.sellPrice)) {
    statuses.push('Sell override active');
  }
  if (hasPositiveValue(item.markupAmount)) {
    statuses.push('Markup amount active');
  }
  if (!statuses.length && hasValue(item.markupPercent)) {
    statuses.push(`Markup ${item.markupPercent}%`);
  }
  return statuses.length ? statuses.join(' | ') : 'No override';
}

function buildRows(diagnostics: Omit<PricingDiagnostics, 'rows'>, pricingBreakdown: PricingBreakdownRows) {
  const rows = [
    { label: 'Source', value: diagnostics.pricingSource },
    { label: 'Pricing basis', value: pricingBreakdown.basis },
    { label: 'Unit price', value: pricingBreakdown.unitPrice },
    { label: 'Pax', value: pricingBreakdown.pax },
    { label: 'Units', value: pricingBreakdown.units },
    ...(pricingBreakdown.nights ? [{ label: 'Nights', value: pricingBreakdown.nights }] : []),
    { label: 'Calculated total', value: pricingBreakdown.calculatedTotal },
    { label: 'Rate', value: diagnostics.appliedRateSource },
    { label: 'Fallback', value: diagnostics.fallbackStatus },
    { label: 'Override', value: diagnostics.overrideStatus },
    { label: 'Policy eligible', value: diagnostics.policyEligible },
    { label: 'Suggested markup', value: diagnostics.suggestedMarkup },
    { label: 'Skipped because...', value: diagnostics.policySkippedBecause },
  ];

  return rows;
}

export function buildPricingDiagnostics(item: PricingDiagnosticQuoteItem): PricingDiagnostics {
  const serviceKind = getServiceKind(item);
  const latestServiceRate = item.service?.serviceRates?.[0] || null;
  const pricingDescription = item.pricingDescription || '';
  const overrideStatus = getOverrideStatus(item);
  const pricingPolicy = getPricingPolicyRecommendation(item);

  let base: PricingDiagnosticsBase;
  let priceSnapshotMode: string | null | undefined;
  let priceSnapshotRate: PricingDiagnosticRate | null | undefined;

  if (hasExternalPackageData(item) || serviceKind === 'external') {
    const mode = item.externalPricingBasis || 'PER_PERSON';
    priceSnapshotMode = mode;
    base = {
      pricingSource: 'External package',
      pricingMode: formatMode(mode),
      unitsUsed: formatUnitsForMode(mode, item),
      appliedRateSource: item.externalPackagePricingMatrixJson ? 'Package matrix metadata' : 'Package net cost',
      fallbackStatus: hasValue(item.externalNetCost) ? 'External net cost available' : 'External net cost missing',
      overrideStatus,
    };
  } else if (hasHotelData(item) || serviceKind === 'hotel') {
    const rateParts = [item.contract?.name, item.seasonName, item.roomCategory?.name, item.mealPlan].filter(Boolean);
    const hotelPricingMode = inferHotelPricingMode(item);
    priceSnapshotMode = hotelPricingMode;
    base = {
      pricingSource: 'Hotel rate',
      pricingMode: formatHotelPricingMode(hotelPricingMode),
      unitsUsed: formatUnitsForMode(hotelPricingMode, item),
      appliedRateSource: rateParts.length ? rateParts.join(' | ') : 'Hotel quote row',
      fallbackStatus: hasValue(item.costBaseAmount) ? 'Hotel rate amount captured' : 'Hotel fallback/manual amount',
      overrideStatus,
    };
  } else if (item.appliedVehicleRate || serviceKind === 'transport') {
    const mode = pricingDescription.toLowerCase().includes('capacity') ? 'CAPACITY_UNIT' : 'PER_GROUP';
    const rateParts = [item.appliedVehicleRate?.routeName, item.appliedVehicleRate?.vehicle?.name, item.appliedVehicleRate?.serviceType?.name].filter(Boolean);
    priceSnapshotMode = mode === 'CAPACITY_UNIT' ? mode : 'TRANSPORT_PER_GROUP';
    base = {
      pricingSource: 'Transport rate',
      pricingMode: formatMode(mode),
      unitsUsed: formatUnitsForMode('PER_GROUP', item),
      appliedRateSource: rateParts.length ? rateParts.join(' | ') : 'Transport quote row',
      fallbackStatus: item.appliedVehicleRate ? 'Matched transport rate' : 'Transport fallback/manual amount',
      overrideStatus,
    };
  } else if (item.activityId || item.activity || serviceKind === 'activity') {
    const mode = pricingDescription.includes('PER_GROUP') ? 'PER_GROUP' : 'PER_PERSON';
    priceSnapshotMode = mode;
    base = {
      pricingSource: item.activityId || item.activity ? 'Activity catalog' : 'Activity service',
      pricingMode: formatMode(mode),
      unitsUsed: formatUnitsForMode(mode, item),
      appliedRateSource: item.activity?.name || item.service?.name || 'Activity quote row',
      fallbackStatus: item.activityId || item.activity ? 'Catalog activity snapshot' : 'Supplier service fallback',
      overrideStatus,
    };
  } else if (serviceKind === 'entrance') {
    priceSnapshotMode = item.jordanPassCovered ? 'PER_GROUP' : 'TICKET_PER_PERSON';
    base = {
      pricingSource: 'Entrance fee',
      pricingMode: item.jordanPassCovered ? 'Jordan Pass covered' : 'PER PERSON unit rate',
      unitsUsed: formatUnitsForMode('TICKET_PER_PERSON', item),
      appliedRateSource: item.jordanPassCovered ? 'Jordan Pass coverage' : item.service?.name || 'Entrance quote row',
      fallbackStatus: item.jordanPassCovered ? 'Coverage applied' : 'Entrance amount captured',
      overrideStatus,
    };
  } else if (serviceKind === 'meal') {
    priceSnapshotMode = 'PER_PERSON';
    base = {
      pricingSource: 'Meal quote row',
      pricingMode: 'PER_PERSON',
      unitsUsed: formatUnitsForMode('PER_PERSON', item),
      appliedRateSource: item.service?.name || 'Meal custom amount',
      fallbackStatus: 'Specialized meal pricing preserved',
      overrideStatus,
    };
  } else if (serviceKind === 'guide') {
    priceSnapshotMode = 'PER_DAY';
    base = {
      pricingSource: 'Guide rate table',
      pricingMode: pricingDescription || 'Guide rate',
      unitsUsed: formatUnitsForMode('PER_DAY', item),
      appliedRateSource: item.service?.name || 'Guide quote row',
      fallbackStatus: 'Specialized guide pricing preserved',
      overrideStatus,
    };
  } else if (latestServiceRate) {
    const mode = latestServiceRate.pricingMode || item.service?.unitType || 'PER_GROUP';
    priceSnapshotMode = mode;
    priceSnapshotRate = latestServiceRate;
    base = {
      pricingSource: 'ServiceRate',
      pricingMode: formatMode(mode),
      unitsUsed: formatUnitsForMode(mode, item, latestServiceRate),
      appliedRateSource: latestServiceRate.id ? `Latest service rate ${latestServiceRate.id}` : 'Latest service rate',
      fallbackStatus: 'Structured service rate',
      overrideStatus,
    };
  } else {
    const mode = item.service?.unitType || 'PER_GROUP';
    priceSnapshotMode = mode;
    base = {
      pricingSource: 'SupplierService base cost',
      pricingMode: formatMode(mode),
      unitsUsed: formatUnitsForMode(mode, item),
      appliedRateSource: item.service?.name || 'Quote row base cost',
      fallbackStatus: 'Base cost fallback',
      overrideStatus,
    };
  }

  const pricingBreakdown = buildPricingBreakdownRows(item, priceSnapshotMode || base.pricingMode, priceSnapshotRate);

  return {
    ...base,
    policyEligible: pricingPolicy.eligible ? 'Yes' : 'No',
    suggestedMarkup: formatPricingPolicyMarkup(pricingPolicy.markupPercent),
    policySkippedBecause: pricingPolicy.skippedReason || 'None',
    rows: buildRows(
      {
        ...base,
        policyEligible: pricingPolicy.eligible ? 'Yes' : 'No',
        suggestedMarkup: formatPricingPolicyMarkup(pricingPolicy.markupPercent),
        policySkippedBecause: pricingPolicy.skippedReason || 'None',
      },
      pricingBreakdown,
    ),
  };
}
