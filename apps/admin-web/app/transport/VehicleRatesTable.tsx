'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RouteOption } from '../lib/routes';
import { DuplicateVehicleRateButton } from '../vehicle-rates/DuplicateVehicleRateButton';
import { VehicleRatesForm } from '../vehicle-rates/VehicleRatesForm';
import { normalizeSupportedCurrency } from '../lib/currencyOptions';
import { CityOption } from '../lib/cities';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { PlaceOption } from '../lib/places';
import { PlaceTypeOption } from '../lib/placeTypes';
import { isBackendUuid } from '../lib/backend-uuid';
import { formatRouteLabel, formatServiceTypeLabel, formatSupplierName } from '../lib/transport-formatters';
import { getCanonicalRouteLabel } from '../lib/transport-routes';
import { getDefaultVehicleTypeOptions, normalizeVehicleTypeLabel, readStoredVehicleTypeOptions, type VehicleTypeOption } from '../lib/vehicle-types';
import {
  deleteManualSupplierRateCard,
  MANUAL_SUPPLIER_RATE_CARDS_CHANGED_EVENT,
  readManualSupplierRateCards,
  upsertManualSupplierRateCard,
  type ManualSupplierRateLine,
  type ManualSupplierRateCard,
} from '../lib/manual-supplier-rate-cards';
import {
  normalizeTransportPricingMode,
  TRANSPORT_PRICING_MODE_HELPER_TEXT,
  TRANSPORT_PRICING_MODES,
  type TransportPricingMode as PricingMode,
} from '../lib/transport-pricing-modes';
import {
  normalizeSupplierKey,
  SUPPLIER_STANDARDIZATION_HELPER_TEXT,
} from '../lib/transport-suppliers';

export type Vehicle = {
  id: string;
  name: string;
  vehicleType?: string | null;
};

export type TransportServiceType = {
  id: string;
  name: string;
  code: string;
  classification?: string;
};

export type VehicleRate = {
  id: string;
  vehicleId: string;
  serviceTypeId: string;
  routeId: string | null;
  fromPlaceId: string | null;
  toPlaceId: string | null;
  routeName: string;
  minPax: number;
  maxPax: number;
  price: number;
  currency: string;
  active: boolean;
  validFrom: string;
  validTo: string;
  halfDayIncludedHours?: number | null;
  halfDayIncludedKm?: number | null;
  fullDayIncludedHours?: number | null;
  fullDayIncludedKm?: number | null;
  extraHourRate?: number | null;
  extraKmRate?: number | null;
  nightSupplement?: number | null;
  weekendHolidaySupplement?: number | null;
  driverAccommodation?: number | null;
  driverMealAllowance?: number | null;
  parkingFee?: number | null;
  borderPermitFee?: number | null;
  guideSeatPolicy?: string | null;
  minimumCharge?: number | null;
  contractDiscountPercent?: number | null;
  discountAppliesTo?: string | null;
  grossRate?: number | null;
  discountNotes?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  supplier?: {
    id?: string;
    name: string;
  } | null;
  transportService?: {
    supplier?: {
      name?: string | null;
    } | null;
  } | null;
  service?: {
    supplier?: {
      name?: string | null;
    } | null;
  } | null;
  vehicle: {
    name: string;
    vehicleType?: string | null;
  };
  serviceType: { name: string; code: string; classification?: string };
  route: RouteOption | null;
};

export type Supplier = {
  id: string;
  name: string;
};

type SupplierRateCard = {
  id: string;
  supplierId?: string | null;
  supplierName: string;
  name: string;
  category: ServiceCategory;
  vehicleType: string;
  vehicleTypes?: string[];
  routeOrServiceArea: string;
  status: string;
  effectiveFrom: string;
  currency: string;
  validFrom: string;
  validTo: string;
  rates: VehicleRate[];
  isManual?: boolean;
  notes?: string;
  rateLineCount?: number;
  keyRatesSummary?: Record<string, number | null>;
};

export type VehicleRatesTableProps = {
  apiBaseUrl: string;
  vehicleRates: VehicleRate[];
  vehicles: Vehicle[];
  serviceTypes: TransportServiceType[];
  places: PlaceOption[];
  cities: CityOption[];
  placeTypes: PlaceTypeOption[];
  routes: RouteOption[];
  suppliers: Supplier[];
  initialListEnabled?: boolean;
  initialCreateOpen?: boolean;
  showToolbar?: boolean;
  createRequestToken?: number;
  rateCardFilters?: {
    supplierId?: string;
    routeId?: string;
    vehicleType?: string;
    pricingMode?: string;
    status?: string;
    search?: string;
  };
};

type ActiveRateForm = { mode: 'create-rate-card' } | { mode: 'edit-line'; rate: VehicleRate } | { mode: 'duplicate-line'; rate: VehicleRate } | null;
type ActiveSupplierEdit = { rateCardId: string; supplierId: string };
type PendingRateCardDelete = { rateCard: SupplierRateCard };
type PendingRateCardDuplicate = { rateCard: SupplierRateCard };
type ServiceCategory = 'Transfers' | 'Disposal' | 'Add-ons';
type DiscountAppliesTo =
  | 'airport transfer'
  | 'point-to-point'
  | 'half day'
  | 'full day'
  | 'stationary / waiting'
  | 'extras / supplements';
type ManualRateCardFormState = {
  rateCardName: string;
  category: ServiceCategory;
  supplierId: string;
  currency: string;
  validFrom: string;
  validTo: string;
  status: string;
  notes: string;
  rateAmount: string;
};
type VehicleSectionDraft = {
  rateCardId: string | null;
  vehicleType: string;
  rates: Record<string, string>;
};
type RateCardDuplicateDraft = {
  supplierId: string;
  routeId: string;
  currency: string;
  validFrom: string;
  validTo: string;
  notes: string;
};
type AutoFillAddOnsSummary = {
  dailyCreated: number;
  overnightCreated: number;
  stationaryCreated: number;
  waitingCreated: number;
  skippedExisting: number;
};

const RATE_CARD_PAGE_SIZE = 25;
const RATE_LINE_PAGE_SIZE = 30;
const RATE_CARD_PREP_CHUNK_SIZE = 200;
const DEFAULT_RATE_CARD_FILTERS = {};
const LOCAL_VEHICLE_SECTION_RATE_PREFIX = 'local-vehicle-section-rate';
const LOCAL_VEHICLE_SECTION_CARD_PREFIX = 'local-vehicle-section-card';
const LOCAL_DUPLICATED_RATE_CARD_PREFIX = 'local-duplicated-rate-card';

const DISCOUNT_APPLIES_TO_OPTIONS: DiscountAppliesTo[] = [
  'airport transfer',
  'point-to-point',
  'half day',
  'full day',
  'stationary / waiting',
  'extras / supplements',
];

const SERVICE_CATEGORIES: ServiceCategory[] = ['Transfers', 'Disposal', 'Add-ons'];
const vehicleTypeLabelCache = new Map<string, string>();

function getPricingModeClassification(pricingMode: PricingMode) {
  if (pricingMode === 'Half Day') {
    return 'HALF_DAY';
  }

  if (pricingMode === 'Full Day') {
    return 'FULL_DAY';
  }

  if (pricingMode === 'Add-on / Supplement' || pricingMode === 'Extra Hour' || pricingMode === 'Extra KM') {
    return 'ADD_ON';
  }

  return 'ROUTE_TRANSFER';
}

function createEmptyPricingModeRates() {
  return TRANSPORT_PRICING_MODES.reduce<Record<string, string>>((rates, mode) => {
    rates[mode] = '';
    return rates;
  }, {});
}

function formatDate(value: string) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function formatDash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return String(value);
}

function formatMoney(currency: string, value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${currency} ${value.toFixed(2)}` : '—';
}

function formatPercent(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}%` : '—';
}

function formatMonthYear(value: string) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function getSupplierName(rate: VehicleRate) {
  return formatSupplierName(
    rate.supplier?.name ??
      rate.supplierName ??
      rate.transportService?.supplier?.name ??
      rate.service?.supplier?.name,
    null,
  );
}

function getSupplierIdentityKey(rate: VehicleRate) {
  return getSupplierId(rate) || normalizeSupplierKey(getSupplierName(rate)) || 'unassigned supplier';
}

function formatSupplierDisplay(value: string) {
  return value === 'Unknown supplier' ? '—' : formatDash(value);
}

function getRateCardServiceCategory(rates: VehicleRate[]): ServiceCategory {
  const classifications = new Set(rates.map((rate) => rate.serviceType.classification || 'ROUTE_TRANSFER'));

  if (classifications.size === 1 && classifications.has('ADD_ON')) {
    return 'Add-ons';
  }

  if (classifications.has('FULL_DAY') || classifications.has('DAILY_PACKAGE')) {
    return 'Disposal';
  }

  const joinedText = rates.map((rate) => `${rate.vehicle.name} ${formatServiceTypeLabel(rate.serviceType.name)} ${formatRouteLabel(rate.routeName)}`).join(' ').toLowerCase();

  if (joinedText.includes('disposal') || joinedText.includes('stationary') || joinedText.includes('waiting') || joinedText.includes('full day') || joinedText.includes('half day')) {
    return 'Disposal';
  }

  return 'Transfers';
}

function getSupplierId(rate: VehicleRate) {
  return rate.supplier?.id ?? rate.supplierId ?? '';
}

function getEffectiveFrom(rates: VehicleRate[]) {
  return rates.reduce((earliest, rate) => (new Date(rate.validFrom) < new Date(earliest) ? rate.validFrom : earliest), rates[0]?.validFrom || '');
}

function getPrimaryCurrency(rates: VehicleRate[]) {
  return rates[0]?.currency || 'USD';
}

function getUniqueLabel(values: string[]) {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));

  if (uniqueValues.length === 0) {
    return '—';
  }

  return uniqueValues.length === 1 ? uniqueValues[0] : 'Mixed';
}

function getVehicleType(rates: VehicleRate[]) {
  return getUniqueLabel(rates.map(getRateVehicleTypeLabel));
}

function getRateVehicleTypeLabel(rate: VehicleRate) {
  const cacheKey = `${rate.vehicle.vehicleType || ''}|${rate.vehicle.name || ''}`;
  const cached = vehicleTypeLabelCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const label = normalizeVehicleTypeLabel(rate.vehicle.vehicleType) || normalizeVehicleTypeLabel(rate.vehicle.name) || rate.vehicle.name || 'Unassigned vehicle';
  vehicleTypeLabelCache.set(cacheKey, label);
  return label;
}

function getRouteOrServiceArea(rates: VehicleRate[]) {
  const labels = rates.map((rate) => formatRouteLabel(rate.route?.name || rate.routeName));
  const uniqueLabels = Array.from(new Set(labels.filter(Boolean)));

  if (uniqueLabels.length === 0) {
    return '—';
  }

  if (uniqueLabels.length === 1) {
    return uniqueLabels[0];
  }

  return `${uniqueLabels[0]} + ${uniqueLabels.length - 1} more`;
}

function getCardStatus(rates: VehicleRate[]) {
  const activeCount = rates.filter((rate) => rate.active).length;

  if (activeCount === rates.length) {
    return 'Active';
  }

  if (activeCount === 0) {
    return 'Inactive';
  }

  return 'Mixed';
}

function getRateCardTitle(rates: VehicleRate[]) {
  const effectiveFrom = getEffectiveFrom(rates);
  const year = effectiveFrom ? new Date(effectiveFrom).getFullYear() : new Date().getFullYear();

  return `${getSupplierName(rates[0])} - ${getRouteOrServiceArea(rates)} ${year} Rates in ${getPrimaryCurrency(rates)}`;
}

function groupRatesIntoSupplierRateCards(vehicleRates: VehicleRate[]): SupplierRateCard[] {
  const groups = new Map<string, SupplierRateCard>();

  for (const rate of vehicleRates) {
    const supplierName = getSupplierName(rate);
    const validFrom = rate.validFrom.slice(0, 10);
    const validTo = rate.validTo.slice(0, 10);
    const routeOrServiceArea = formatRouteLabel(rate.route?.name || rate.routeName).trim().toLowerCase() || 'unassigned route';
    const key = [getSupplierIdentityKey(rate), routeOrServiceArea, rate.currency, validFrom, validTo].join('|');
    const group =
      groups.get(key) ||
      ({
        id: key,
        supplierName,
        name: getRateCardTitle([rate]),
        category: getRateCardServiceCategory([rate]),
        vehicleType: getVehicleType([rate]),
        routeOrServiceArea: getRouteOrServiceArea([rate]),
        status: getCardStatus([rate]),
        effectiveFrom: validFrom,
        currency: rate.currency,
        validFrom,
        validTo,
        rates: [],
      } satisfies SupplierRateCard);

    group.rates.push(rate);
    group.name = getRateCardTitle(group.rates);
    group.category = getRateCardServiceCategory(group.rates);
    group.vehicleType = getVehicleType(group.rates);
    group.routeOrServiceArea = getRouteOrServiceArea(group.rates);
    group.status = getCardStatus(group.rates);
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const supplierSort = left.supplierName.localeCompare(right.supplierName);
    return supplierSort || left.name.localeCompare(right.name);
  });
}

function getRateCardGroupKey(rate: VehicleRate) {
  const supplierName = getSupplierName(rate);
  const validFrom = rate.validFrom.slice(0, 10);
  const validTo = rate.validTo.slice(0, 10);
  const routeOrServiceArea = formatRouteLabel(rate.route?.name || rate.routeName).trim().toLowerCase() || 'unassigned route';

  return {
    key: [getSupplierIdentityKey(rate), routeOrServiceArea, rate.currency, validFrom, validTo].join('|'),
    supplierName,
    validFrom,
    validTo,
  };
}

function createRateCardGroup(rate: VehicleRate): SupplierRateCard {
  const { key, supplierName, validFrom, validTo } = getRateCardGroupKey(rate);

  return {
    id: key,
    supplierName,
    name: getRateCardTitle([rate]),
    category: getRateCardServiceCategory([rate]),
    vehicleType: getVehicleType([rate]),
    routeOrServiceArea: getRouteOrServiceArea([rate]),
    status: getCardStatus([rate]),
    effectiveFrom: validFrom,
    currency: rate.currency,
    validFrom,
    validTo,
    rates: [],
  };
}

function refreshRateCardGroupSummary(group: SupplierRateCard) {
  group.name = getRateCardTitle(group.rates);
  group.category = getRateCardServiceCategory(group.rates);
  group.vehicleType = getVehicleType(group.rates);
  group.routeOrServiceArea = getRouteOrServiceArea(group.rates);
  group.status = getCardStatus(group.rates);
}

function waitForRateCardPrepYield() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function getPreparedRateCardsSignature(rateCards: SupplierRateCard[]) {
  return rateCards.map((rateCard) => `${rateCard.id}:${rateCard.rates.length}:${rateCard.name}:${rateCard.status}`).join('||');
}

function preparedRateCardsAreSame(left: SupplierRateCard[], right: SupplierRateCard[]) {
  return left.length === right.length && getPreparedRateCardsSignature(left) === getPreparedRateCardsSignature(right);
}

function getManualRateCardsSignature(rateCards: ManualSupplierRateCard[]) {
  return rateCards.map((rateCard) => `${rateCard.id}:${rateCard.name}:${rateCard.status}:${rateCard.rates.length}`).join('||');
}

function manualRateCardsAreSame(left: ManualSupplierRateCard[], right: ManualSupplierRateCard[]) {
  return left.length === right.length && getManualRateCardsSignature(left) === getManualRateCardsSignature(right);
}

function mapApiCardToSupplierRateCard(card: any): SupplierRateCard {
  return {
    id: card.id,
    supplierId: card.supplierId || null,
    supplierName: card.supplierName || 'Unknown supplier',
    name: card.name || `${card.supplierName || 'Unknown supplier'} - ${card.routeOrServiceArea || ''}`.trim(),
    category: SERVICE_CATEGORIES.includes(card.category as ServiceCategory) ? (card.category as ServiceCategory) : 'Transfers',
    vehicleType: card.vehicleType || '—',
    vehicleTypes: Array.isArray(card.vehicleTypes) ? card.vehicleTypes : undefined,
    routeOrServiceArea: card.routeOrServiceArea || '—',
    status: card.status || 'Active',
    effectiveFrom: card.effectiveFrom || card.validFrom || '',
    currency: card.currency || 'USD',
    validFrom: card.validFrom || '',
    validTo: card.validTo || '',
    rates: Array.isArray(card.rates) ? card.rates : [],
    rateLineCount: Number(card.rateLineCount) || (Array.isArray(card.rates) ? card.rates.length : 0),
    keyRatesSummary: card.keyRatesSummary || {},
  };
}

function mapManualCardToSupplierRateCard(card: ManualSupplierRateCard): SupplierRateCard {
  return {
    id: card.id,
    supplierId: card.supplierId,
    supplierName: card.supplierName,
    name: card.name,
    category: SERVICE_CATEGORIES.includes(card.category as ServiceCategory) ? (card.category as ServiceCategory) : 'Transfers',
    vehicleType: card.vehicleType,
    vehicleTypes: [card.vehicleType].filter(Boolean),
    routeOrServiceArea: card.routeOrServiceArea,
    status: card.status,
    effectiveFrom: card.effectiveFrom,
    currency: card.currency,
    validFrom: card.validFrom,
    validTo: card.validTo,
    notes: card.notes,
    isManual: true,
    rates: card.rates.map((rate) => ({
      id: rate.id,
      vehicleId: rate.vehicleId || card.vehicleType,
      serviceTypeId: rate.serviceType?.code || rate.serviceType?.name || 'manual-rate-card',
      routeId: card.routeId,
      fromPlaceId: null,
      toPlaceId: null,
      routeName: rate.routeName || card.routeOrServiceArea,
      minPax: 1,
      maxPax: 999,
      price: Number(rate.price) || 0,
      currency: rate.currency || card.currency,
      active: rate.active !== false && card.status !== 'Inactive',
      validFrom: rate.validFrom || card.validFrom,
      validTo: rate.validTo || card.validTo,
      contractDiscountPercent: rate.contractDiscountPercent,
      grossRate: rate.grossRate,
      discountAppliesTo: rate.discountAppliesTo,
      discountNotes: rate.discountNotes,
      supplierId: card.supplierId,
      supplierName: card.supplierName,
      supplier: { id: card.supplierId, name: card.supplierName },
      vehicle: { name: card.vehicleType },
      serviceType: {
        name: rate.serviceType?.name || 'Manual supplier rate',
        code: rate.serviceType?.code || 'MANUAL_SUPPLIER_RATE',
        classification: rate.serviceType?.classification || 'ROUTE_TRANSFER',
      },
      route: null,
      fromPlace: null,
      toPlace: null,
    })),
  };
}

function normalizeRateText(rate: VehicleRate) {
  return [
    rate.routeName,
    rate.route?.name,
    rate.vehicle.name,
    rate.serviceType.name,
    rate.serviceType.code,
    rate.serviceType.classification || '',
  ]
    .join(' ')
    .toLowerCase();
}

function findRateValue(rates: VehicleRate[], matcher: (rate: VehicleRate, text: string) => boolean) {
  return rates.find((rate) => matcher(rate, normalizeRateText(rate)))?.price ?? null;
}

function getPricingModeForRate(rate: VehicleRate): PricingMode {
  return normalizeTransportPricingMode(rate.serviceType.name) || normalizeTransportPricingMode(rate.serviceType.code) || 'Point-to-Point';
}

function groupRateLinesByVehicleType(rates: VehicleRate[]) {
  const groups = new Map<string, VehicleRate[]>();

  for (const rate of rates) {
    const vehicleType = getRateVehicleTypeLabel(rate);
    groups.set(vehicleType, [...(groups.get(vehicleType) || []), rate]);
  }

  return Array.from(groups.entries())
    .map(([vehicleType, vehicleRates]) => ({ vehicleType, rates: vehicleRates }))
    .sort((left, right) => left.vehicleType.localeCompare(right.vehicleType));
}

function findPricingModeValue(rates: VehicleRate[], pricingMode: PricingMode) {
  return rates.find((rate) => getPricingModeForRate(rate) === pricingMode)?.price ?? null;
}

function getPointToPointRate(rates: VehicleRate[]) {
  return findPricingModeValue(rates, 'Point-to-Point') ?? rates[0]?.price ?? null;
}

function getRateCardPricing(rateCard: SupplierRateCard) {
  const rates = rateCard.rates;

  return {
    baseRates: {
      airportTransfer: findPricingModeValue(rates, 'Airport Transfer'),
      pointToPoint: getPointToPointRate(rates),
      halfDay: findPricingModeValue(rates, 'Half Day'),
      fullDay: findPricingModeValue(rates, 'Full Day'),
      stationaryWaitingHourly: findPricingModeValue(rates, 'Stationary / Waiting'),
    },
    includedLimits: {
      halfDayIncludedHours: rates.find((rate) => rate.halfDayIncludedHours != null)?.halfDayIncludedHours,
      halfDayIncludedKm: rates.find((rate) => rate.halfDayIncludedKm != null)?.halfDayIncludedKm,
      fullDayIncludedHours: rates.find((rate) => rate.fullDayIncludedHours != null)?.fullDayIncludedHours,
      fullDayIncludedKm: rates.find((rate) => rate.fullDayIncludedKm != null)?.fullDayIncludedKm,
    },
    extraCharges: {
      extraHourRate: rates.find((rate) => rate.extraHourRate != null)?.extraHourRate ?? findPricingModeValue(rates, 'Extra Hour'),
      extraKmRate: rates.find((rate) => rate.extraKmRate != null)?.extraKmRate ?? findPricingModeValue(rates, 'Extra KM'),
      nightSupplement: rates.find((rate) => rate.nightSupplement != null)?.nightSupplement ?? findRateValue(rates, (_rate, text) => text.includes('night')),
      weekendHolidaySupplement:
        rates.find((rate) => rate.weekendHolidaySupplement != null)?.weekendHolidaySupplement ??
        findRateValue(rates, (_rate, text) => text.includes('weekend') || text.includes('holiday')),
    },
    busCoachSpecific: {
      driverAccommodation:
        rates.find((rate) => rate.driverAccommodation != null)?.driverAccommodation ?? findRateValue(rates, (_rate, text) => text.includes('driver accommodation')),
      driverMealAllowance:
        rates.find((rate) => rate.driverMealAllowance != null)?.driverMealAllowance ?? findRateValue(rates, (_rate, text) => text.includes('driver meal')),
      parkingFee: rates.find((rate) => rate.parkingFee != null)?.parkingFee ?? findRateValue(rates, (_rate, text) => text.includes('parking')),
      borderPermitFee: rates.find((rate) => rate.borderPermitFee != null)?.borderPermitFee ?? findRateValue(rates, (_rate, text) => text.includes('border') || text.includes('permit')),
      guideSeatPolicy: rates.find((rate) => rate.guideSeatPolicy)?.guideSeatPolicy,
      minimumCharge: rates.find((rate) => rate.minimumCharge != null)?.minimumCharge ?? findRateValue(rates, (_rate, text) => text.includes('minimum')),
    },
  };
}

function getContractTerms(rateCard: SupplierRateCard, pricing: ReturnType<typeof getRateCardPricing>) {
  const rateWithDiscount = rateCard.rates.find(
    (rate) => rate.contractDiscountPercent != null || rate.grossRate != null || rate.discountAppliesTo || rate.discountNotes,
  );
  const grossRate =
    rateWithDiscount?.grossRate ??
    pricing.baseRates.airportTransfer ??
    pricing.baseRates.pointToPoint ??
    pricing.baseRates.halfDay ??
    pricing.baseRates.fullDay ??
    pricing.baseRates.stationaryWaitingHourly ??
    pricing.extraCharges.extraHourRate ??
    pricing.extraCharges.extraKmRate ??
    pricing.extraCharges.nightSupplement ??
    pricing.extraCharges.weekendHolidaySupplement ??
    null;
  const discountPercent = rateWithDiscount?.contractDiscountPercent ?? 0;
  const netSupplierCost = typeof grossRate === 'number' ? grossRate - grossRate * (discountPercent / 100) : null;

  return {
    contractDiscountPercent: discountPercent,
    discountAppliesTo: rateWithDiscount?.discountAppliesTo || 'point-to-point',
    grossRate,
    netSupplierCost,
    discountNotes: rateWithDiscount?.discountNotes || '',
  };
}

function isSystemRateCard(rateCard: SupplierRateCard) {
  const status = rateCard.status.toLowerCase();
  return status.includes('locked') || status.includes('system');
}

function isLocalVehicleSectionRate(rate: VehicleRate) {
  return rate.id.startsWith(LOCAL_VEHICLE_SECTION_RATE_PREFIX);
}

function isLocalSupplierRateLine(rate: VehicleRate) {
  return rate.id.startsWith(LOCAL_VEHICLE_SECTION_RATE_PREFIX) || rate.id.startsWith(LOCAL_DUPLICATED_RATE_CARD_PREFIX);
}

function isLocalVehicleSectionExtension(card: ManualSupplierRateCard, rateCardId: string) {
  return Boolean(card.isVehicleSectionExtension && card.sourceRateCardId === rateCardId);
}

function mergeLocalVehicleSectionExtensions(rateCard: SupplierRateCard, extensionCards: ManualSupplierRateCard[]) {
  const extensionRates = extensionCards
    .filter((card) => isLocalVehicleSectionExtension(card, rateCard.id))
    .flatMap((card) => mapManualCardToSupplierRateCard(card).rates);

  if (extensionRates.length === 0) {
    return rateCard;
  }

  const rates = [...rateCard.rates, ...extensionRates];
  const vehicleTypes = Array.from(new Set(groupRateLinesByVehicleType(rates).map((section) => section.vehicleType)));

  return {
    ...rateCard,
    rates,
    vehicleTypes,
    vehicleType: vehicleTypes.length === 1 ? vehicleTypes[0] : 'Multiple vehicle types',
    rateLineCount: (rateCard.rateLineCount ?? rateCard.rates.length) + extensionRates.length,
    status: getCardStatus(rates),
    category: getRateCardServiceCategory(rates),
  };
}

function getRouteLabelForDuplicate(route: RouteOption | null | undefined, fallback: string) {
  return route ? getCanonicalRouteLabel(route.fromPlace.name, route.toPlace.name) : fallback;
}

function getRateCardDuplicateKey(data: { supplierId?: string | null; supplierName?: string | null; routeId?: string | null; routeName?: string | null; currency: string; validFrom: string; validTo: string }) {
  const supplierKey = data.supplierId || normalizeSupplierKey(data.supplierName) || 'unassigned supplier';
  const routeKey = data.routeId || formatRouteLabel(data.routeName || '').trim().toLowerCase() || 'unassigned route';
  return [supplierKey, routeKey, data.currency.trim().toUpperCase(), data.validFrom.slice(0, 10), data.validTo.slice(0, 10)].join('|');
}

export function VehicleRatesTable({
  apiBaseUrl,
  vehicleRates,
  vehicles,
  serviceTypes,
  places,
  cities,
  placeTypes,
  routes,
  suppliers,
  initialListEnabled = true,
  initialCreateOpen = false,
  showToolbar = true,
  createRequestToken = 0,
  rateCardFilters = DEFAULT_RATE_CARD_FILTERS,
}: VehicleRatesTableProps) {
  const router = useRouter();
  const [activeForm, setActiveForm] = useState<ActiveRateForm>(initialCreateOpen ? { mode: 'create-rate-card' } : null);
  const [rateCardListEnabled, setRateCardListEnabled] = useState(initialListEnabled);
  const [activeSupplierEdit, setActiveSupplierEdit] = useState<ActiveSupplierEdit | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingRateCardDelete, setPendingRateCardDelete] = useState<PendingRateCardDelete | null>(null);
  const [pendingRateCardDuplicate, setPendingRateCardDuplicate] = useState<PendingRateCardDuplicate | null>(null);
  const [deletedRateIds, setDeletedRateIds] = useState<string[]>([]);
  const [savingSupplierCardId, setSavingSupplierCardId] = useState<string | null>(null);
  const [exportingRateCardId, setExportingRateCardId] = useState<string | null>(null);
  const [autoFillingRateCardId, setAutoFillingRateCardId] = useState<string | null>(null);
  const [autoFillSummary, setAutoFillSummary] = useState<AutoFillAddOnsSummary | null>(null);
  const [expandedRateCardId, setExpandedRateCardId] = useState<string | null>(null);
  const [activeVehicleSectionCardId, setActiveVehicleSectionCardId] = useState<string | null>(null);
  const [preparedRateCardTarget, setPreparedRateCardTarget] = useState(RATE_CARD_PAGE_SIZE);
  const [preparedRateCards, setPreparedRateCards] = useState<SupplierRateCard[]>([]);
  const [hasMorePreparedRateCards, setHasMorePreparedRateCards] = useState(false);
  const [isPreparingRateCards, setIsPreparingRateCards] = useState(true);
  const [rateCardsPage, setRateCardsPage] = useState(1);
  const [loadingRateCardDetailId, setLoadingRateCardDetailId] = useState<string | null>(null);
  const [expandedRateLineCounts, setExpandedRateLineCounts] = useState<Record<string, number>>({});
  const [manualPricingMode, setManualPricingMode] = useState<PricingMode>('Point-to-Point');
  const [vehicleTypeOptions, setVehicleTypeOptions] = useState<VehicleTypeOption[]>(getDefaultVehicleTypeOptions());
  const [manualVehicleType, setManualVehicleType] = useState(getDefaultVehicleTypeOptions()[0]?.label || '');
  const [vehicleSectionDraft, setVehicleSectionDraft] = useState<VehicleSectionDraft>({
    rateCardId: null,
    vehicleType: getDefaultVehicleTypeOptions()[0]?.label || '',
    rates: createEmptyPricingModeRates(),
  });
  const [manualRouteOrServiceArea, setManualRouteOrServiceArea] = useState('General / All Routes');
  const [manualRateCards, setManualRateCards] = useState<ManualSupplierRateCard[]>([]);
  const [manualRateCardForm, setManualRateCardForm] = useState<ManualRateCardFormState>({
    rateCardName: '',
    category: 'Transfers',
    supplierId: '',
    currency: 'USD',
    validFrom: '',
    validTo: '',
    status: 'Active',
    notes: '',
    rateAmount: '',
  });
  const [rateCardDuplicateDraft, setRateCardDuplicateDraft] = useState<RateCardDuplicateDraft>({
    supplierId: '',
    routeId: '',
    currency: 'USD',
    validFrom: '',
    validTo: '',
    notes: '',
  });
  const [manualContractDiscountPercent, setManualContractDiscountPercent] = useState('0');
  const [manualGrossRate, setManualGrossRate] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const deletedRateIdSet = useMemo(() => new Set(deletedRateIds), [deletedRateIds]);
  const activeVehicleRates = useMemo(() => vehicleRates.filter((rate) => !deletedRateIdSet.has(rate.id)), [deletedRateIdSet, vehicleRates]);
  const manualSupplierRateCards = useMemo(
    () => manualRateCards.filter((card) => !card.isVehicleSectionExtension).map(mapManualCardToSupplierRateCard),
    [manualRateCards],
  );
  const localVehicleSectionExtensions = useMemo(
    () => manualRateCards.filter((card) => card.isVehicleSectionExtension && card.sourceRateCardId),
    [manualRateCards],
  );
  const combinedRateCardSource = useMemo(
    () => ({
      localVehicleSectionExtensions,
      manualRateCards: manualSupplierRateCards,
      vehicleRates: activeVehicleRates,
    }),
    [activeVehicleRates, localVehicleSectionExtensions, manualSupplierRateCards],
  );
  const suppliersById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const routesById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const vehiclesById = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);
  const vehicleTypesByLabel = useMemo(
    () => new Map(vehicleTypeOptions.map((vehicleType) => [vehicleType.label.toLowerCase(), vehicleType])),
    [vehicleTypeOptions],
  );
  const visibleRateCards = useMemo(() => preparedRateCards, [preparedRateCards]);
  const hasMoreRateCards = hasMorePreparedRateCards;

  useEffect(() => {
    if (createRequestToken > 0) {
      setActiveForm({ mode: 'create-rate-card' });
    }
  }, [createRequestToken]);

  useEffect(() => {
    setPreparedRateCardTarget(RATE_CARD_PAGE_SIZE);
    setPreparedRateCards([]);
    setHasMorePreparedRateCards(false);
  }, [rateCardFilters]);

  useEffect(() => {
    let cancelled = false;

    async function prepareRateCards() {
      if (!rateCardListEnabled) {
        setIsPreparingRateCards((current) => (current ? false : current));
        setPreparedRateCards((currentRateCards) => (currentRateCards.length === 0 ? currentRateCards : []));
        setHasMorePreparedRateCards((currentValue) => (currentValue ? false : currentValue));
        return;
      }

      setIsPreparingRateCards((current) => (current ? current : true));
      const page = Math.max(1, Math.ceil(preparedRateCardTarget / RATE_CARD_PAGE_SIZE));
      const params = new URLSearchParams({
        page: String(page),
        limit: String(RATE_CARD_PAGE_SIZE),
      });

      for (const [key, value] of Object.entries(rateCardFilters)) {
        if (value) {
          params.set(key, value);
        }
      }

      try {
        const response = await fetch(`${apiBaseUrl}/vehicle-rates/cards?${params.toString()}`, {
          headers: buildAuthHeaders(),
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'Could not load supplier rate cards.'));
        }

        const payload = await response.json() as { items: any[]; hasMore: boolean; page: number };

        if (cancelled) {
          return;
        }

        const manualCards = combinedRateCardSource.manualRateCards.slice(0, RATE_CARD_PAGE_SIZE);
        const apiCards = (payload.items || [])
          .map(mapApiCardToSupplierRateCard)
          .map((card) => mergeLocalVehicleSectionExtensions(card, combinedRateCardSource.localVehicleSectionExtensions));

        setRateCardsPage(payload.page || page);
        setPreparedRateCards((currentRateCards) => {
          const nextPreparedRateCards = page === 1 ? [...manualCards, ...apiCards] : [...currentRateCards, ...apiCards];
          return preparedRateCardsAreSame(currentRateCards, nextPreparedRateCards) ? currentRateCards : nextPreparedRateCards;
        });
        setHasMorePreparedRateCards((currentValue) => (currentValue === Boolean(payload.hasMore) ? currentValue : Boolean(payload.hasMore)));
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : 'Could not load supplier rate cards.');
        }
      } finally {
        if (!cancelled) {
          setIsPreparingRateCards((current) => (current ? false : current));
        }
      }
    }

    void prepareRateCards();

    return () => {
      cancelled = true;
    };
  }, [
    apiBaseUrl,
    combinedRateCardSource.localVehicleSectionExtensions,
    combinedRateCardSource.manualRateCards,
    preparedRateCardTarget,
    rateCardFilters,
    rateCardListEnabled,
  ]);

  useEffect(() => {
    function refreshVehicleTypes() {
      const nextOptions = readStoredVehicleTypeOptions();
      setVehicleTypeOptions(nextOptions);
      setManualVehicleType((currentValue) =>
        nextOptions.some((option) => option.label === currentValue) ? currentValue : nextOptions[0]?.label || '',
      );
      setVehicleSectionDraft((currentDraft) => ({
        ...currentDraft,
        vehicleType: nextOptions.some((option) => option.label === currentDraft.vehicleType)
          ? currentDraft.vehicleType
          : nextOptions[0]?.label || '',
      }));
    }

    refreshVehicleTypes();
    window.addEventListener('dmc:vehicle-types-changed', refreshVehicleTypes);

    return () => window.removeEventListener('dmc:vehicle-types-changed', refreshVehicleTypes);
  }, []);

  useEffect(() => {
    function refreshManualRateCards() {
      refreshManualRateCardState();
    }

    refreshManualRateCards();
    window.addEventListener(MANUAL_SUPPLIER_RATE_CARDS_CHANGED_EVENT, refreshManualRateCards);
    window.addEventListener('storage', refreshManualRateCards);

    return () => {
      window.removeEventListener(MANUAL_SUPPLIER_RATE_CARDS_CHANGED_EVENT, refreshManualRateCards);
      window.removeEventListener('storage', refreshManualRateCards);
    };
  }, []);

  const manualGrossRateBasis = manualGrossRate || manualRateCardForm.rateAmount;
  const manualGrossRateNumber = Number(manualGrossRateBasis);
  const manualDiscountPercentNumber = Number(manualContractDiscountPercent);
  const manualNetSupplierCost =
    Number.isFinite(manualGrossRateNumber) && manualGrossRateBasis
      ? manualGrossRateNumber - manualGrossRateNumber * ((Number.isFinite(manualDiscountPercentNumber) ? manualDiscountPercentNumber : 0) / 100)
      : null;
  const selectedManualSupplier = suppliersById.get(manualRateCardForm.supplierId) || null;
  const selectedManualRoute = routesById.get(manualRouteOrServiceArea) || null;
  const selectedManualVehicleType = vehicleTypesByLabel.get(manualVehicleType.toLowerCase()) || null;
  const manualRouteLabel = selectedManualRoute ? getCanonicalRouteLabel(selectedManualRoute.fromPlace.name, selectedManualRoute.toPlace.name) : manualRouteOrServiceArea;
  const manualRateAmountNumber = Number(manualRateCardForm.rateAmount);
  const manualRateCardCanSave = Boolean(
    manualRateCardForm.supplierId &&
      manualVehicleType &&
      selectedManualVehicleType &&
      manualRouteOrServiceArea &&
      manualRateCardForm.currency.trim() &&
      manualRateCardForm.validFrom &&
      manualRateCardForm.validTo,
  );

  function updateManualRateCardForm<Field extends keyof ManualRateCardFormState>(field: Field, value: ManualRateCardFormState[Field]) {
    setManualRateCardForm((current) => ({ ...current, [field]: value }));
  }

  function updateRateCardDuplicateDraft<Field extends keyof RateCardDuplicateDraft>(field: Field, value: RateCardDuplicateDraft[Field]) {
    setRateCardDuplicateDraft((current) => ({ ...current, [field]: value }));
  }

  function resetManualRateCardForm() {
    setManualRateCardForm({
      rateCardName: '',
      category: 'Transfers',
      supplierId: '',
      currency: 'USD',
      validFrom: '',
      validTo: '',
      status: 'Active',
      notes: '',
      rateAmount: '',
    });
    setManualRouteOrServiceArea('General / All Routes');
    setManualPricingMode('Point-to-Point');
    setManualContractDiscountPercent('0');
    setManualGrossRate('');
  }

  function refreshManualRateCardState() {
    const nextManualRateCards = readManualSupplierRateCards();
    setManualRateCards((currentRateCards) =>
      manualRateCardsAreSame(currentRateCards, nextManualRateCards) ? currentRateCards : nextManualRateCards,
    );
  }

  function removePreparedRateCard(cardId: string) {
    setPreparedRateCards((currentCards) => currentCards.filter((card) => card.id !== cardId));
    setExpandedRateLineCounts((currentCounts) => {
      if (!(cardId in currentCounts)) {
        return currentCounts;
      }

      const nextCounts = { ...currentCounts };
      delete nextCounts[cardId];
      return nextCounts;
    });
    setActiveVehicleSectionCardId((currentCardId) => (currentCardId === cardId ? null : currentCardId));
  }

  async function loadRateCardDetail(rateCardId: string) {
    const response = await fetch(`${apiBaseUrl}/vehicle-rates/cards/${encodeURIComponent(rateCardId)}`, {
      headers: buildAuthHeaders(),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Could not load supplier rate-card details.'));
    }

    const detail = mergeLocalVehicleSectionExtensions(
      mapApiCardToSupplierRateCard(await response.json()),
      combinedRateCardSource.localVehicleSectionExtensions,
    );
    setPreparedRateCards((currentCards) => currentCards.map((card) => (card.id === rateCardId ? { ...card, ...detail } : card)));
    return detail;
  }

  async function handleToggleRateCardDetails(rateCardId: string) {
    if (expandedRateCardId === rateCardId) {
      setExpandedRateCardId(null);
      return;
    }

    const rateCard = preparedRateCards.find((card) => card.id === rateCardId);

    if (rateCard && !rateCard.isManual && rateCard.rates.length === 0) {
      setLoadingRateCardDetailId(rateCardId);
      setError('');

      try {
        await loadRateCardDetail(rateCardId);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load supplier rate-card details.');
        setLoadingRateCardDetailId(null);
        return;
      } finally {
        setLoadingRateCardDetailId(null);
      }
    }

    setExpandedRateCardId(rateCardId);
    setExpandedRateLineCounts((currentCounts) =>
      currentCounts[rateCardId] ? currentCounts : { ...currentCounts, [rateCardId]: RATE_LINE_PAGE_SIZE },
    );
  }

  function handleLoadMoreRateCards() {
    setPreparedRateCardTarget((currentCount) => currentCount + RATE_CARD_PAGE_SIZE);
  }

  function handleLoadMoreRateLines(rateCardId: string, rateLineCount: number) {
    setExpandedRateLineCounts((currentCounts) => ({
      ...currentCounts,
      [rateCardId]: Math.min((currentCounts[rateCardId] || RATE_LINE_PAGE_SIZE) + RATE_LINE_PAGE_SIZE, rateLineCount),
    }));
  }

  function resetVehicleSectionDraft(vehicleType = vehicleTypeOptions[0]?.label || '', rateCardId: string | null = null) {
    setVehicleSectionDraft({
      rateCardId,
      vehicleType,
      rates: createEmptyPricingModeRates(),
    });
  }

  function updateVehicleSectionRate(pricingMode: PricingMode, value: string) {
    setVehicleSectionDraft((currentDraft) => ({
      ...currentDraft,
      rates: {
        ...currentDraft.rates,
        [pricingMode]: value,
      },
    }));
  }

  function removePreparedRateLine(rateId: string) {
    setPreparedRateCards((currentCards) =>
      currentCards.map((card) => {
        if (!card.rates.some((cardRate) => cardRate.id === rateId)) {
          return card;
        }

        const rates = card.rates.filter((cardRate) => cardRate.id !== rateId);
        const vehicleTypes = Array.from(new Set(groupRateLinesByVehicleType(rates).map((section) => section.vehicleType)));

        return {
          ...card,
          rates,
          vehicleTypes,
          vehicleType: vehicleTypes.length === 1 ? vehicleTypes[0] : vehicleTypes.length > 1 ? 'Multiple vehicle types' : '-',
          rateLineCount: rates.length,
          status: rates.length > 0 ? getCardStatus(rates) : card.status,
          category: rates.length > 0 ? getRateCardServiceCategory(rates) : card.category,
        };
      }),
    );
  }

  function mapVehicleRateToManualRateLine(rate: VehicleRate): ManualSupplierRateLine {
    const pricingMode = getPricingModeForRate(rate);

    return {
      id: rate.id,
      vehicleId: rate.vehicleId,
      routeId: rate.routeId || rate.route?.id || null,
      routeName: rate.routeName || rate.route?.name || '',
      vehicleType: getRateVehicleTypeLabel(rate),
      price: Number(rate.price) || 0,
      currency: rate.currency,
      active: rate.active !== false,
      validFrom: rate.validFrom,
      validTo: rate.validTo,
      supplierId: rate.supplierId || rate.supplier?.id || '',
      supplierName: rate.supplierName || rate.supplier?.name || '',
      vehicle: {
        name: rate.vehicle.name,
      },
      route: rate.route ? { id: rate.route.id, name: rate.route.name } : null,
      serviceType: {
        name: pricingMode,
        code: pricingMode.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        classification: getPricingModeClassification(pricingMode),
      },
      contractDiscountPercent: rate.contractDiscountPercent,
      grossRate: rate.grossRate,
      discountAppliesTo: rate.discountAppliesTo,
      discountNotes: rate.discountNotes,
    };
  }

  function upsertLocalVehicleSectionRates(rateCard: SupplierRateCard, newRates: VehicleRate[], selectedVehicleType: string) {
    const storedCards = readManualSupplierRateCards();
    const newManualRates = newRates.map(mapVehicleRateToManualRateLine);
    const existingManualCard = storedCards.find((card) => card.id === rateCard.id);

    if (rateCard.isManual || existingManualCard) {
      const baseRates = existingManualCard?.rates || rateCard.rates.map(mapVehicleRateToManualRateLine);
      upsertManualSupplierRateCard({
        id: rateCard.id,
        supplierId: rateCard.supplierId || rateCard.rates[0]?.supplierId || rateCard.rates[0]?.supplier?.id || '',
        supplierName: rateCard.supplierName,
        name: rateCard.name,
        category: rateCard.category,
        vehicleType: rateCard.vehicleType,
        routeId: rateCard.rates[0]?.routeId || rateCard.rates[0]?.route?.id || null,
        routeOrServiceArea: rateCard.routeOrServiceArea,
        status: rateCard.status,
        effectiveFrom: rateCard.effectiveFrom,
        currency: rateCard.currency,
        validFrom: rateCard.validFrom,
        validTo: rateCard.validTo,
        notes: rateCard.notes || '',
        rates: [...baseRates.filter((rate) => !newManualRates.some((newRate) => newRate.id === rate.id)), ...newManualRates],
      });
      return;
    }

    const extensionId = `${LOCAL_VEHICLE_SECTION_CARD_PREFIX}-${rateCard.id}`;
    const existingExtensionCard = storedCards.find((card) => card.id === extensionId);

    upsertManualSupplierRateCard({
      id: extensionId,
      sourceRateCardId: rateCard.id,
      isVehicleSectionExtension: true,
      supplierId: rateCard.supplierId || rateCard.rates[0]?.supplierId || rateCard.rates[0]?.supplier?.id || '',
      supplierName: rateCard.supplierName,
      name: `${rateCard.name} - ${selectedVehicleType}`,
      category: rateCard.category,
      vehicleType: selectedVehicleType,
      routeId: newRates[0]?.routeId || newRates[0]?.route?.id || rateCard.rates[0]?.routeId || rateCard.rates[0]?.route?.id || null,
      routeOrServiceArea: rateCard.routeOrServiceArea,
      status: rateCard.status,
      effectiveFrom: rateCard.effectiveFrom,
      currency: rateCard.currency,
      validFrom: rateCard.validFrom,
      validTo: rateCard.validTo,
      notes: rateCard.notes || '',
      rates: [...(existingExtensionCard?.rates || []).filter((rate) => !newManualRates.some((newRate) => newRate.id === rate.id)), ...newManualRates],
    });
  }

  async function handleStartAddVehicleSection(rateCard: SupplierRateCard) {
    setError('');
    setSuccessMessage('');

    let targetCard = rateCard;
    if (!rateCard.isManual && rateCard.rates.length === 0) {
      setLoadingRateCardDetailId(rateCard.id);
      try {
        targetCard = await loadRateCardDetail(rateCard.id);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load supplier rate-card details.');
        return;
      } finally {
        setLoadingRateCardDetailId(null);
      }
    }

    const usedVehicleTypes = new Set(groupRateLinesByVehicleType(targetCard.rates).map((section) => section.vehicleType.toLowerCase()));
    const nextVehicleType = vehicleTypeOptions.find((option) => !usedVehicleTypes.has(option.label.toLowerCase()))?.label || vehicleTypeOptions[0]?.label || '';
    resetVehicleSectionDraft(nextVehicleType, rateCard.id);
    setExpandedRateCardId(rateCard.id);
    setActiveVehicleSectionCardId(rateCard.id);
    setExpandedRateLineCounts((currentCounts) =>
      currentCounts[rateCard.id] ? currentCounts : { ...currentCounts, [rateCard.id]: RATE_LINE_PAGE_SIZE },
    );
  }

  function handleCancelVehicleSectionForm() {
    setActiveVehicleSectionCardId(null);
    resetVehicleSectionDraft();
  }

  async function handleStartDuplicateRateCard(rateCard: SupplierRateCard) {
    setError('');
    setSuccessMessage('');

    let targetCard = rateCard;
    if (!rateCard.isManual && rateCard.rates.length === 0) {
      setLoadingRateCardDetailId(rateCard.id);
      try {
        targetCard = await loadRateCardDetail(rateCard.id);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load supplier rate-card details.');
        return;
      } finally {
        setLoadingRateCardDetailId(null);
      }
    }

    const sourceRate = targetCard.rates[0];
    const sourceRouteId = sourceRate?.routeId || sourceRate?.route?.id || routes.find((route) => formatRouteLabel(route.name) === targetCard.routeOrServiceArea)?.id || '';
    const supplierId =
      targetCard.supplierId ||
      sourceRate?.supplierId ||
      sourceRate?.supplier?.id ||
      suppliers.find((supplier) => normalizeSupplierKey(supplier.name) === normalizeSupplierKey(targetCard.supplierName))?.id ||
      '';

    setRateCardDuplicateDraft({
      supplierId,
      routeId: sourceRouteId,
      currency: targetCard.currency,
      validFrom: targetCard.validFrom.slice(0, 10),
      validTo: targetCard.validTo.slice(0, 10),
      notes: '',
    });
    setPendingRateCardDuplicate({ rateCard: targetCard });
  }

  function handleCancelDuplicateRateCard() {
    setPendingRateCardDuplicate(null);
    setRateCardDuplicateDraft({
      supplierId: '',
      routeId: '',
      currency: 'USD',
      validFrom: '',
      validTo: '',
      notes: '',
    });
  }

  function handleConfirmDuplicateRateCard() {
    if (!pendingRateCardDuplicate) {
      return;
    }

    const { rateCard } = pendingRateCardDuplicate;
    const selectedSupplier = suppliersById.get(rateCardDuplicateDraft.supplierId) || null;
    const selectedRoute = routesById.get(rateCardDuplicateDraft.routeId) || null;
    const currency = rateCardDuplicateDraft.currency.trim().toUpperCase();
    const validFrom = rateCardDuplicateDraft.validFrom;
    const validTo = rateCardDuplicateDraft.validTo;

    setError('');
    setSuccessMessage('');

    if (!selectedSupplier || !selectedRoute || !currency || !validFrom || !validTo) {
      setError('Supplier, route, currency, valid from, and valid to are required.');
      return;
    }

    const duplicateKey = getRateCardDuplicateKey({
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      routeId: selectedRoute.id,
      routeName: selectedRoute.name,
      currency,
      validFrom,
      validTo,
    });
    const duplicateExists = preparedRateCards.some((card) => {
      const cardRate = card.rates[0];
      return getRateCardDuplicateKey({
        supplierId: card.supplierId || cardRate?.supplierId || cardRate?.supplier?.id,
        supplierName: card.supplierName,
        routeId: cardRate?.routeId || cardRate?.route?.id,
        routeName: cardRate?.routeName || card.routeOrServiceArea,
        currency: card.currency,
        validFrom: card.validFrom,
        validTo: card.validTo,
      }) === duplicateKey;
    });

    if (duplicateExists) {
      setError('A supplier rate card already exists for this supplier, route, currency, and validity.');
      return;
    }

    const routeLabel = getRouteLabelForDuplicate(selectedRoute, rateCard.routeOrServiceArea);
    const now = Date.now();
    const duplicatedRates = rateCard.rates.map((rate, index) => ({
      ...rate,
      id: `${LOCAL_DUPLICATED_RATE_CARD_PREFIX}-${now}-${index}`,
      routeId: selectedRoute.id,
      fromPlaceId: selectedRoute.fromPlaceId,
      toPlaceId: selectedRoute.toPlaceId,
      routeName: routeLabel,
      currency,
      validFrom,
      validTo,
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      supplier: { id: selectedSupplier.id, name: selectedSupplier.name },
      route: selectedRoute,
    }));
    const vehicleTypes = Array.from(new Set(groupRateLinesByVehicleType(duplicatedRates).map((section) => section.vehicleType)));
    const duplicatedCard: SupplierRateCard = {
      ...rateCard,
      id: duplicateKey,
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      name: `${selectedSupplier.name} - ${routeLabel} ${new Date(validFrom).getFullYear()} Rates in ${currency}`,
      vehicleType: vehicleTypes.length === 1 ? vehicleTypes[0] : 'Multiple vehicle types',
      vehicleTypes,
      routeOrServiceArea: routeLabel,
      effectiveFrom: validFrom,
      currency,
      validFrom,
      validTo,
      notes: rateCardDuplicateDraft.notes.trim(),
      isManual: true,
      rates: duplicatedRates,
      rateLineCount: duplicatedRates.length,
      status: getCardStatus(duplicatedRates),
      category: getRateCardServiceCategory(duplicatedRates),
    };

    setPreparedRateCards((currentCards) => [duplicatedCard, ...currentCards]);
    setExpandedRateCardId(duplicatedCard.id);
    setExpandedRateLineCounts((currentCounts) => ({ ...currentCounts, [duplicatedCard.id]: RATE_LINE_PAGE_SIZE }));
    handleCancelDuplicateRateCard();
    setSuccessMessage('Rate card duplicated');
  }

  function handleSaveVehicleSection(rateCard: SupplierRateCard) {
    setError('');
    setSuccessMessage('');

    const selectedVehicleType = normalizeVehicleTypeLabel(vehicleSectionDraft.vehicleType, vehicleTypeOptions) || vehicleSectionDraft.vehicleType;
    const existingVehicleTypes = new Set(groupRateLinesByVehicleType(rateCard.rates).map((section) => section.vehicleType.toLowerCase()));

    if (!selectedVehicleType) {
      setError('Choose a vehicle type before saving.');
      return;
    }

    if (vehicleSectionDraft.rateCardId !== rateCard.id) {
      setError('Open Add Vehicle Type for this rate card before saving.');
      return;
    }

    if (existingVehicleTypes.has(selectedVehicleType.toLowerCase())) {
      setError('This vehicle type already exists inside this supplier rate card.');
      return;
    }

    const enteredRates = TRANSPORT_PRICING_MODES.map((mode) => ({
      pricingMode: mode,
      amount: Number(vehicleSectionDraft.rates[mode]),
      rawAmount: vehicleSectionDraft.rates[mode],
    })).filter((entry) => entry.rawAmount.trim() !== '' && Number.isFinite(entry.amount) && entry.amount >= 0);

    if (enteredRates.length === 0) {
      setError('Enter at least one pricing mode rate for this vehicle type.');
      return;
    }

    const sourceRate = rateCard.rates[0];
    const selectedRoute = sourceRate?.route || routes.find((route) => formatRouteLabel(route.name) === rateCard.routeOrServiceArea) || null;
    const now = Date.now();
    const newRates: VehicleRate[] = enteredRates.map((entry, index) => ({
      id: `${LOCAL_VEHICLE_SECTION_RATE_PREFIX}-${rateCard.id}-${selectedVehicleType}-${entry.pricingMode}-${now}-${index}`,
      vehicleId: selectedVehicleType,
      serviceTypeId: entry.pricingMode.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
      routeId: sourceRate?.routeId || selectedRoute?.id || null,
      fromPlaceId: sourceRate?.fromPlaceId || selectedRoute?.fromPlaceId || null,
      toPlaceId: sourceRate?.toPlaceId || selectedRoute?.toPlaceId || null,
      routeName: sourceRate?.routeName || rateCard.routeOrServiceArea,
      minPax: 1,
      maxPax: 999,
      price: entry.amount,
      currency: rateCard.currency,
      active: rateCard.status !== 'Inactive',
      validFrom: rateCard.validFrom,
      validTo: rateCard.validTo,
      supplierId: sourceRate?.supplierId || sourceRate?.supplier?.id || null,
      supplierName: rateCard.supplierName,
      supplier: sourceRate?.supplier || { id: sourceRate?.supplierId || '', name: rateCard.supplierName },
      vehicle: {
        name: selectedVehicleType,
        vehicleType: selectedVehicleType,
      },
      serviceType: {
        name: entry.pricingMode,
        code: entry.pricingMode.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        classification: getPricingModeClassification(entry.pricingMode),
      },
      route: selectedRoute,
    }));

    upsertLocalVehicleSectionRates(rateCard, newRates, selectedVehicleType);
    refreshManualRateCardState();

    setPreparedRateCards((currentCards) =>
      currentCards.map((card) => {
        if (card.id !== rateCard.id) {
          return card;
        }

        const rates = [...card.rates, ...newRates];
        const vehicleTypes = Array.from(new Set([...groupRateLinesByVehicleType(rates).map((section) => section.vehicleType)]));

        return {
          ...card,
          rates,
          vehicleTypes,
          vehicleType: vehicleTypes.length === 1 ? vehicleTypes[0] : 'Multiple vehicle types',
          rateLineCount: rates.length,
          status: getCardStatus(rates),
          category: getRateCardServiceCategory(rates),
        };
      }),
    );
    setExpandedRateLineCounts((currentCounts) => ({ ...currentCounts, [rateCard.id]: (currentCounts[rateCard.id] || RATE_LINE_PAGE_SIZE) + newRates.length }));
    setActiveVehicleSectionCardId(null);
    resetVehicleSectionDraft();
    setSuccessMessage('Vehicle type section added');
  }

  function handleSaveManualRateCard() {
    setError('');
    setSuccessMessage('');

    if (!manualRateCardCanSave || !selectedManualSupplier) {
      setError('Supplier, vehicle type, route or General / All Routes, currency, and validity dates are required.');
      return;
    }

    const cardId = `manual-rate-card-${Date.now()}`;
    const cardName =
      manualRateCardForm.rateCardName.trim() ||
      `${selectedManualSupplier.name} - ${manualRouteLabel} ${manualRateCardForm.currency.trim().toUpperCase()}`;
    const normalizedCurrency = manualRateCardForm.currency.trim().toUpperCase();
    const hasRateLine = Number.isFinite(manualRateAmountNumber) && manualRateCardForm.rateAmount.trim() !== '';
    const manualGrossRateValue = Number(manualGrossRate);
    const grossRate = hasRateLine ? (Number.isFinite(manualGrossRateValue) && manualGrossRate ? manualGrossRateValue : manualRateAmountNumber) : null;
    const discountPercent = Number(manualContractDiscountPercent);
    const rates = hasRateLine
      ? [
          {
            id: `${cardId}-line-${Date.now()}`,
            vehicleId: null,
            routeId: selectedManualRoute?.id || null,
            routeName: manualRouteLabel,
            vehicleType: manualVehicleType,
            price: manualRateAmountNumber,
            currency: normalizedCurrency,
            active: manualRateCardForm.status !== 'Inactive',
            validFrom: manualRateCardForm.validFrom,
            validTo: manualRateCardForm.validTo,
            supplierId: selectedManualSupplier.id,
            supplierName: selectedManualSupplier.name,
            vehicle: { name: manualVehicleType },
            route: selectedManualRoute ? { id: selectedManualRoute.id, name: selectedManualRoute.name } : null,
            serviceType: {
              name: manualPricingMode,
              code: manualPricingMode.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
              classification: getPricingModeClassification(manualPricingMode),
            },
            grossRate,
            contractDiscountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
          },
        ]
      : [];

    const card: ManualSupplierRateCard = {
      id: cardId,
      supplierId: selectedManualSupplier.id,
      supplierName: selectedManualSupplier.name,
      name: cardName,
      category: manualRateCardForm.category,
      vehicleType: manualVehicleType,
      routeId: selectedManualRoute?.id || null,
      routeOrServiceArea: manualRouteLabel,
      status: manualRateCardForm.status,
      effectiveFrom: manualRateCardForm.validFrom,
      currency: normalizedCurrency,
      validFrom: manualRateCardForm.validFrom,
      validTo: manualRateCardForm.validTo,
      notes: manualRateCardForm.notes.trim(),
      rates,
    };

    upsertManualSupplierRateCard(card);
    refreshManualRateCardState();
    setExpandedRateCardId(card.id);
    setExpandedRateLineCounts((currentCounts) => ({ ...currentCounts, [card.id]: RATE_LINE_PAGE_SIZE }));
    setSuccessMessage('Rate card saved');
    resetManualRateCardForm();
    setActiveForm(null);
  }

  async function handleSaveRateCardSupplier(rateCard: SupplierRateCard) {
    if (!activeSupplierEdit || activeSupplierEdit.rateCardId !== rateCard.id) {
      return;
    }

    if (!suppliers.some((supplier) => supplier.id === activeSupplierEdit.supplierId)) {
      setError('Supplier must exist.');
      return;
    }

    setSavingSupplierCardId(rateCard.id);
    setError('');
    setSuccessMessage('');

    try {
      for (const rate of rateCard.rates) {
        if (!isBackendUuid(rate.id)) {
          continue;
        }

        const response = await fetch(`${apiBaseUrl}/vehicle-rates/${rate.id}`, {
          method: 'PATCH',
          headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ supplierId: activeSupplierEdit.supplierId }),
        });

        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'Could not update supplier for this rate card.'));
        }
      }

      setActiveSupplierEdit(null);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update supplier for this rate card.');
    } finally {
      setSavingSupplierCardId(null);
    }
  }

  async function handleExportRateCard(rateCard: SupplierRateCard) {
    setExportingRateCardId(rateCard.id);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${apiBaseUrl}/vehicle-rates/export?rateCardId=${encodeURIComponent(rateCard.id)}`, {
        method: 'GET',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not export supplier rate card.'));
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] || `${rateCard.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}_transport.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not export supplier rate card.');
    } finally {
      setExportingRateCardId(null);
    }
  }

  async function handleAutoFillAddOns(rateCard: SupplierRateCard) {
    setAutoFillingRateCardId(rateCard.id);
    setAutoFillSummary(null);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${apiBaseUrl}/vehicle-rates/auto-fill-addons`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ rateCardId: rateCard.id }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not auto-fill transport add-ons.'));
      }

      const summary = await response.json() as AutoFillAddOnsSummary;
      setAutoFillSummary(summary);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not auto-fill transport add-ons.');
    } finally {
      setAutoFillingRateCardId(null);
    }
  }

  async function handleDelete(rate: VehicleRate) {
    if (!window.confirm(`Delete ${formatRouteLabel(rate.routeName)}?`)) {
      return;
    }

    if (isLocalVehicleSectionRate(rate)) {
      setPreparedRateCards((currentCards) =>
        currentCards.map((card) => {
          if (!card.rates.some((cardRate) => cardRate.id === rate.id)) {
            return card;
          }

          const rates = card.rates.filter((cardRate) => cardRate.id !== rate.id);
          const vehicleTypes = Array.from(new Set(groupRateLinesByVehicleType(rates).map((section) => section.vehicleType)));

          return {
            ...card,
            rates,
            vehicleTypes,
            vehicleType: vehicleTypes.length === 1 ? vehicleTypes[0] : vehicleTypes.length > 1 ? 'Multiple vehicle types' : '—',
            rateLineCount: rates.length,
            status: rates.length > 0 ? getCardStatus(rates) : card.status,
            category: rates.length > 0 ? getRateCardServiceCategory(rates) : card.category,
          };
        }),
      );
      setSuccessMessage('Vehicle type rate removed');
      return;
    }

    if (!isBackendUuid(rate.id)) {
      removePreparedRateLine(rate.id);
      setSuccessMessage('Local rate removed');
      return;
    }

    setDeletingId(rate.id);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${apiBaseUrl}/vehicle-rates/${rate.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete vehicle rate.'));
      }

      if ((activeForm?.mode === 'edit-line' || activeForm?.mode === 'duplicate-line') && activeForm.rate.id === rate.id) {
        setActiveForm(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete vehicle rate.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleConfirmDeleteRateCard() {
    if (!pendingRateCardDelete) {
      return;
    }

    let { rateCard } = pendingRateCardDelete;
    setError('');
    setSuccessMessage('');

    if (isSystemRateCard(rateCard)) {
      setError('Locked or system rate cards cannot be deleted.');
      setPendingRateCardDelete(null);
      return;
    }

    if (rateCard.isManual) {
      deleteManualSupplierRateCard(rateCard.id);
      refreshManualRateCardState();
      removePreparedRateCard(rateCard.id);
      setPendingRateCardDelete(null);
      setSuccessMessage('Rate card deleted');
      if (expandedRateCardId === rateCard.id) {
        setExpandedRateCardId(null);
      }
      return;
    }

    if (rateCard.rates.length === 0) {
      try {
        const response = await fetch(`${apiBaseUrl}/vehicle-rates/cards/${encodeURIComponent(rateCard.id)}`, {
          headers: buildAuthHeaders(),
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'Could not load supplier rate-card details before delete.'));
        }

        rateCard = mapApiCardToSupplierRateCard(await response.json());
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not load supplier rate-card details before delete.');
        return;
      }
    }

    setDeletingId(rateCard.id);

    try {
      const backendRates = rateCard.rates.filter((rate) => !isLocalSupplierRateLine(rate) && isBackendUuid(rate.id));

      for (const rate of backendRates) {
        const response = await fetch(`${apiBaseUrl}/vehicle-rates/${rate.id}`, {
          method: 'DELETE',
          headers: buildAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'Could not delete supplier rate card.'));
        }
      }

      const deletedIds = backendRates.map((rate) => rate.id);
      setDeletedRateIds((current) => Array.from(new Set([...current, ...deletedIds])));
      deleteManualSupplierRateCard(`${LOCAL_VEHICLE_SECTION_CARD_PREFIX}-${rateCard.id}`);
      refreshManualRateCardState();
      removePreparedRateCard(rateCard.id);

      if (
        (activeForm?.mode === 'edit-line' || activeForm?.mode === 'duplicate-line') &&
        rateCard.rates.some((rate) => rate.id === activeForm.rate.id)
      ) {
        setActiveForm(null);
      }

      if (expandedRateCardId === rateCard.id) {
        setExpandedRateCardId(null);
      }

      setPendingRateCardDelete(null);
      setSuccessMessage('Rate card deleted');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete supplier rate card.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="entity-list allotment-table-stack">
      {error ? <p className="form-error">{error}</p> : null}
      {successMessage ? <p className="form-success">{successMessage}</p> : null}
      {autoFillSummary ? (
        <div className="quote-item-override-status quote-item-override-status-active">
          <strong>Transport add-ons auto-filled</strong>
          <span>
            {[
              `Daily created: ${autoFillSummary.dailyCreated}`,
              `Overnight created: ${autoFillSummary.overnightCreated}`,
              `Stationary created: ${autoFillSummary.stationaryCreated}`,
              `Waiting created: ${autoFillSummary.waitingCreated}`,
              `Skipped existing: ${autoFillSummary.skippedExisting}`,
            ].join(' | ')}
          </span>
        </div>
      ) : null}

      {showToolbar ? (
        <div className="transport-rate-card-toolbar">
          <div>
            <p className="transport-rate-card-label">Imported supplier contracts</p>
            <strong>Supplier Rate Cards</strong>
            <p className="detail-copy">Create one supplier rate card per route, with vehicle-type sections for pricing.</p>
            <p className="detail-copy">{SUPPLIER_STANDARDIZATION_HELPER_TEXT}</p>
          </div>
          <button type="button" className="primary-button transport-contract-new-button" onClick={() => setActiveForm({ mode: 'create-rate-card' })}>
            + Add Rate Card
          </button>
        </div>
      ) : null}

      <div className={`transport-rate-card-workspace ${activeForm ? 'transport-rate-card-workspace-with-panel' : ''}`}>
        <div className="transport-rate-card-list">
          {!rateCardListEnabled ? (
            <div className="transport-rate-card-safe-shell">
              <p className="empty-state">Click Load Rate Cards to view supplier rates.</p>
              <p className="detail-copy">Large rate-card lists may take time. Use filters for faster loading.</p>
              <button type="button" className="secondary-button" onClick={() => setRateCardListEnabled(true)}>
                Load Rate Cards
              </button>
            </div>
          ) : null}
          {rateCardListEnabled && isPreparingRateCards ? <p className="empty-state">Preparing rate cards...</p> : null}
          {rateCardListEnabled && !isPreparingRateCards && visibleRateCards.length === 0 ? <p className="empty-state">No supplier rate cards yet.</p> : null}

          {rateCardListEnabled ? visibleRateCards.map((rateCard) => {
            const isExpanded = expandedRateCardId === rateCard.id;
            const pricing = isExpanded ? getRateCardPricing(rateCard) : null;
            const contractTerms = pricing ? getContractTerms(rateCard, pricing) : null;
            const deleteIsDisabled = isSystemRateCard(rateCard) || deletingId === rateCard.id;
            const backendActionsDisabled = Boolean(rateCard.isManual);
            const detailsRequired = !rateCard.isManual && rateCard.rates.length === 0;
            const visibleRateLineCount = expandedRateLineCounts[rateCard.id] || RATE_LINE_PAGE_SIZE;
            const visibleRateLines = isExpanded ? rateCard.rates.slice(0, visibleRateLineCount) : [];
            const hasMoreRateLines = visibleRateLineCount < rateCard.rates.length;
            const vehicleSections = isExpanded ? groupRateLinesByVehicleType(rateCard.rates) : [];
            const vehicleTypeChips = Array.from(new Set((rateCard.vehicleTypes?.length ? rateCard.vehicleTypes : [rateCard.vehicleType]).filter(Boolean)));
            const vehicleSectionFormIsOpen = activeVehicleSectionCardId === rateCard.id;
            const selectedVehicleSectionType = vehicleSectionFormIsOpen
              ? normalizeVehicleTypeLabel(vehicleSectionDraft.vehicleType, vehicleTypeOptions) || vehicleSectionDraft.vehicleType
              : '';
            const vehicleSectionAlreadyExists = vehicleSectionFormIsOpen
              ? (isExpanded ? vehicleSections : groupRateLinesByVehicleType(rateCard.rates))
                .some((section) => section.vehicleType.toLowerCase() === selectedVehicleSectionType.toLowerCase())
              : false;

            return (
              <section key={rateCard.id} className="transport-contract-supplier-group">
                <div className="transport-rate-card-summary-head">
                  <div className="transport-rate-card-title-block">
                    <p className="transport-rate-card-label">Supplier Rate Card</p>
                    <h3>{rateCard.name}</h3>
                    <div className="transport-rate-card-chip-row" aria-label={`Summary for ${rateCard.name}`}>
                      <span className="transport-rate-card-chip">Supplier: {formatSupplierDisplay(rateCard.supplierName)}</span>
                      <span className="transport-rate-card-chip">Route: {formatDash(rateCard.routeOrServiceArea)}</span>
                      <span className="transport-rate-card-chip">Currency: {formatDash(rateCard.currency)}</span>
                      <span className="transport-rate-card-chip">
                        Validity: {formatDate(rateCard.validFrom)} - {formatDate(rateCard.validTo)}
                      </span>
                      <span className="transport-rate-card-chip">{rateCard.rateLineCount ?? rateCard.rates.length} rate lines</span>
                    </div>
                  </div>
                  <div className="table-action-row">
                    <button type="button" className="compact-button" onClick={() => handleToggleRateCardDetails(rateCard.id)}>
                      {loadingRateCardDetailId === rateCard.id ? 'Loading details...' : isExpanded ? 'Hide details' : 'View details'}
                    </button>
                    {rateCard.rates[0] ? (
                      <button type="button" className="compact-button" onClick={() => setActiveForm({ mode: 'edit-line', rate: rateCard.rates[0] })}>
                        Edit
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="compact-button"
                      onClick={() => void handleStartDuplicateRateCard(rateCard)}
                      disabled={!rateCard.isManual && rateCard.rates.length === 0 && loadingRateCardDetailId === rateCard.id}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="compact-button compact-button-danger"
                      onClick={() => setPendingRateCardDelete({ rateCard })}
                      disabled={deleteIsDisabled}
                      title={isSystemRateCard(rateCard) ? 'Locked or system rate cards cannot be deleted' : undefined}
                    >
                      {deletingId === rateCard.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
                <div className="transport-rate-card-operations">
                  <div className="table-action-row">
                    <button
                      type="button"
                      className="compact-button"
                      onClick={() => handleExportRateCard(rateCard)}
                      disabled={backendActionsDisabled || exportingRateCardId === rateCard.id}
                      title={backendActionsDisabled ? 'Manual local cards are not exported by the backend yet' : undefined}
                    >
                      {exportingRateCardId === rateCard.id ? 'Exporting...' : 'Export Excel'}
                    </button>
                    <button
                      type="button"
                      className="compact-button"
                      onClick={() => handleAutoFillAddOns(rateCard)}
                      disabled={backendActionsDisabled || autoFillingRateCardId === rateCard.id}
                      title={backendActionsDisabled ? 'Manual local cards need backend rate lines before add-ons can be auto-filled' : undefined}
                    >
                      {autoFillingRateCardId === rateCard.id ? 'Auto-filling...' : 'Auto-fill add-ons'}
                    </button>
                    <button
                      type="button"
                      className="compact-button"
                      onClick={() => setActiveSupplierEdit({ rateCardId: rateCard.id, supplierId: getSupplierId(rateCard.rates[0]) })}
                      disabled={backendActionsDisabled || detailsRequired}
                      title={backendActionsDisabled ? 'Manual local cards keep their saved supplier metadata' : detailsRequired ? 'Open details before editing supplier' : undefined}
                    >
                      Edit Supplier
                    </button>
                  </div>
                </div>
                {activeSupplierEdit?.rateCardId === rateCard.id ? (
                  <div className="transport-rate-card-supplier-edit">
                    <label>
                      Supplier
                      <select
                        value={activeSupplierEdit.supplierId}
                        onChange={(event) => setActiveSupplierEdit({ rateCardId: rateCard.id, supplierId: event.target.value })}
                      >
                        <option value="">Select supplier</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="table-action-row">
                      <button
                        type="button"
                        className="compact-button"
                        onClick={() => handleSaveRateCardSupplier(rateCard)}
                        disabled={savingSupplierCardId === rateCard.id || !activeSupplierEdit.supplierId}
                      >
                        {savingSupplierCardId === rateCard.id ? 'Saving...' : 'Save supplier'}
                      </button>
                      <button type="button" className="compact-button" onClick={() => setActiveSupplierEdit(null)} disabled={savingSupplierCardId === rateCard.id}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="transport-contract-divider" />
                <div className="transport-rate-card-summary">
                  <div>
                    <span>Supplier</span>
                    <strong>{formatSupplierDisplay(rateCard.supplierName)}</strong>
                  </div>
                  <div>
                    <span>Vehicle types</span>
                    <strong>{formatDash(vehicleTypeChips.join(', ') || rateCard.vehicleType)}</strong>
                  </div>
                  <div>
                    <span>Route / service area</span>
                    <strong>{formatDash(rateCard.routeOrServiceArea)}</strong>
                  </div>
                  <div>
                    <span>Currency</span>
                    <strong>{formatDash(rateCard.currency)}</strong>
                  </div>
                  <div>
                    <span>Effective from</span>
                    <strong>{formatMonthYear(rateCard.effectiveFrom)}</strong>
                  </div>
                  <div>
                    <span>Validity</span>
                    <strong>{formatDate(rateCard.validFrom)} - {formatDate(rateCard.validTo)}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{formatDash(rateCard.status)}</strong>
                  </div>
                </div>
                {vehicleTypeChips.length > 0 ? (
                  <div className="transport-rate-card-chip-row">
                    {vehicleTypeChips.map((vehicleType) => (
                      <span key={vehicleType} className="transport-rate-card-chip transport-rate-card-chip-muted">
                        {vehicleType}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="table-action-row">
                  <button type="button" className="compact-button" onClick={() => void handleStartAddVehicleSection(rateCard)}>
                    + Add Vehicle Type
                  </button>
                </div>
                {vehicleSectionFormIsOpen ? (
                  <form className="transport-rate-card-metadata-form" onSubmit={(event) => event.preventDefault()}>
                    <section className="transport-rate-card-metadata-section">
                      <h4>Add Vehicle Type</h4>
                      <label>
                        Vehicle Type
                        <select
                          name="vehicleSectionVehicleType"
                          value={vehicleSectionDraft.vehicleType}
                          onChange={(event) => setVehicleSectionDraft((currentDraft) => ({ ...currentDraft, vehicleType: event.target.value }))}
                          required
                        >
                          {vehicleTypeOptions.map((vehicleType) => (
                            <option key={vehicleType.id} value={vehicleType.label}>
                              {vehicleType.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {vehicleSectionAlreadyExists ? <p className="form-error">This vehicle type already exists inside this supplier rate card.</p> : null}
                      <div className="transport-rate-card-summary">
                        {TRANSPORT_PRICING_MODES.map((mode) => (
                          <label key={mode}>
                            {mode}
                            <input
                              name={`vehicleSectionRate-${mode}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={vehicleSectionDraft.rates[mode] ?? ''}
                              onChange={(event) => updateVehicleSectionRate(mode, event.target.value)}
                              placeholder="Rate"
                            />
                          </label>
                        ))}
                      </div>
                      <p className="form-helper">{TRANSPORT_PRICING_MODE_HELPER_TEXT}</p>
                      <div className="table-action-row">
                        <button type="button" className="primary-button" onClick={() => handleSaveVehicleSection(rateCard)} disabled={vehicleSectionAlreadyExists}>
                          Save Vehicle Type
                        </button>
                        <button type="button" className="compact-button" onClick={handleCancelVehicleSectionForm}>
                          Cancel
                        </button>
                      </div>
                    </section>
                  </form>
                ) : null}
                {pricing && contractTerms ? (
                  <div className="transport-rate-card-detail-shell">
                    <section className="transport-rate-card-section">
                      <div className="transport-rate-card-section-head">
                        <div>
                          <p className="eyebrow">Primary pricing</p>
                          <h4>Vehicle Pricing</h4>
                        </div>
                        <button type="button" className="compact-button" onClick={() => void handleStartAddVehicleSection(rateCard)}>
                          + Add Vehicle Type
                        </button>
                      </div>
                      <div className="transport-vehicle-pricing-groups">
                        {vehicleSections.map((section, sectionIndex) => {
                          const sectionPricing = getRateCardPricing({ ...rateCard, rates: section.rates });

                          return (
                            <details key={section.vehicleType} className="transport-vehicle-pricing-group" open={sectionIndex === 0}>
                              <summary>
                                <span>{formatDash(section.vehicleType)}</span>
                                <small>{section.rates.length} rate lines</small>
                              </summary>
                              <div className="transport-vehicle-pricing-summary">
                                <div><span>Airport Transfer</span><strong>{formatMoney(rateCard.currency, sectionPricing.baseRates.airportTransfer)}</strong></div>
                                <div><span>Point-to-Point</span><strong>{formatMoney(rateCard.currency, sectionPricing.baseRates.pointToPoint)}</strong></div>
                                <div><span>Half Day</span><strong>{formatMoney(rateCard.currency, sectionPricing.baseRates.halfDay)}</strong></div>
                                <div><span>Full Day</span><strong>{formatMoney(rateCard.currency, sectionPricing.baseRates.fullDay)}</strong></div>
                                <div><span>Stationary / Waiting</span><strong>{formatMoney(rateCard.currency, sectionPricing.baseRates.stationaryWaitingHourly)}</strong></div>
                                <div><span>Extra Hour</span><strong>{formatMoney(rateCard.currency, sectionPricing.extraCharges.extraHourRate)}</strong></div>
                                <div><span>Extra KM</span><strong>{formatMoney(rateCard.currency, sectionPricing.extraCharges.extraKmRate)}</strong></div>
                              </div>
                              <div className="table-wrap transport-contract-table-wrap transport-vehicle-pricing-table-wrap">
                                <table className="data-table allotment-table transport-contract-table transport-vehicle-pricing-table" aria-label={`${section.vehicleType} pricing rows for ${rateCard.name}`}>
                                  <thead>
                                    <tr>
                                      <th>Pricing Mode</th>
                                      <th>Route / Service</th>
                                      <th>Pax Range</th>
                                      <th>Price</th>
                                      <th>Validity</th>
                                      <th>Notes</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {section.rates.map((rate) => (
                                      <tr key={rate.id}>
                                        <td><span className="status-badge">{getPricingModeForRate(rate)}</span></td>
                                        <td>
                                          <strong>{formatRouteLabel(rate.routeName)}</strong>
                                          <div className="table-subcopy">{formatDash(rate.route?.name)}</div>
                                        </td>
                                        <td>{rate.minPax} - {rate.maxPax}</td>
                                        <td>{rate.currency} {rate.price.toFixed(2)}</td>
                                        <td>{formatDate(rate.validFrom)} - {formatDate(rate.validTo)}</td>
                                        <td>{formatDash(rate.discountNotes || rate.guideSeatPolicy)}</td>
                                        <td>
                                          <div className="table-action-row">
                                            {isLocalVehicleSectionRate(rate) ? null : (
                                              <>
                                                <button type="button" className="compact-button" onClick={() => setActiveForm({ mode: 'edit-line', rate })}>
                                                  Edit
                                                </button>
                                                <DuplicateVehicleRateButton onDuplicate={() => setActiveForm({ mode: 'duplicate-line', rate })} />
                                              </>
                                            )}
                                            <button
                                              type="button"
                                              className="compact-button compact-button-danger"
                                              onClick={() => handleDelete(rate)}
                                              disabled={deletingId === rate.id}
                                            >
                                              {deletingId === rate.id ? 'Deleting...' : 'Delete'}
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </section>

                    <details className="transport-rate-card-section transport-rate-card-collapsible">
                      <summary>Add-ons &amp; Supplements</summary>
                      <div className="transport-rate-card-secondary-grid">
                        <div className="quote-preview-total-list">
                          <div><span>Extra Hour</span><strong>{formatMoney(rateCard.currency, pricing.extraCharges.extraHourRate)}</strong></div>
                          <div><span>Extra KM</span><strong>{formatMoney(rateCard.currency, pricing.extraCharges.extraKmRate)}</strong></div>
                          <div><span>Night supplement</span><strong>{formatMoney(rateCard.currency, pricing.extraCharges.nightSupplement)}</strong></div>
                          <div><span>Weekend / holiday</span><strong>{formatMoney(rateCard.currency, pricing.extraCharges.weekendHolidaySupplement)}</strong></div>
                        </div>
                        <div className="quote-preview-total-list">
                          <div><span>Driver accommodation</span><strong>{formatMoney(rateCard.currency, pricing.busCoachSpecific.driverAccommodation)}</strong></div>
                          <div><span>Driver meal allowance</span><strong>{formatMoney(rateCard.currency, pricing.busCoachSpecific.driverMealAllowance)}</strong></div>
                          <div><span>Parking fee</span><strong>{formatMoney(rateCard.currency, pricing.busCoachSpecific.parkingFee)}</strong></div>
                          <div><span>Border permit fee</span><strong>{formatMoney(rateCard.currency, pricing.busCoachSpecific.borderPermitFee)}</strong></div>
                          <div><span>Guide seat / free seat policy</span><strong>{formatDash(pricing.busCoachSpecific.guideSeatPolicy)}</strong></div>
                          <div><span>Minimum charge</span><strong>{formatMoney(rateCard.currency, pricing.busCoachSpecific.minimumCharge)}</strong></div>
                        </div>
                        <div className="quote-preview-total-list">
                          <div><span>Half-day included hours</span><strong>{formatDash(pricing.includedLimits.halfDayIncludedHours)}</strong></div>
                          <div><span>Half-day included km</span><strong>{formatDash(pricing.includedLimits.halfDayIncludedKm)}</strong></div>
                          <div><span>Full-day included hours</span><strong>{formatDash(pricing.includedLimits.fullDayIncludedHours)}</strong></div>
                          <div><span>Full-day included km</span><strong>{formatDash(pricing.includedLimits.fullDayIncludedKm)}</strong></div>
                        </div>
                      </div>
                    </details>

                    <details className="transport-rate-card-section transport-rate-card-collapsible">
                      <summary>Discounts / quote pricing driver</summary>
                      <div className="transport-rate-card-secondary-grid">
                        <div className="quote-preview-total-list">
                          <div><span>Airport Transfer</span><strong>{formatMoney(rateCard.currency, pricing.baseRates.airportTransfer)}</strong></div>
                          <div><span>Point-to-Point</span><strong>{formatMoney(rateCard.currency, pricing.baseRates.pointToPoint)}</strong></div>
                          <div><span>Half Day</span><strong>{formatMoney(rateCard.currency, pricing.baseRates.halfDay)}</strong></div>
                          <div><span>Full Day</span><strong>{formatMoney(rateCard.currency, pricing.baseRates.fullDay)}</strong></div>
                          <div><span>Stationary / Waiting</span><strong>{formatMoney(rateCard.currency, pricing.baseRates.stationaryWaitingHourly)}</strong></div>
                        </div>
                        <div className="quote-preview-total-list">
                          <div><span>Contract discount %</span><strong>{formatPercent(contractTerms.contractDiscountPercent)}</strong></div>
                          <div><span>Discount applies to</span><strong>{formatDash(contractTerms.discountAppliesTo)}</strong></div>
                          <div><span>Gross rate</span><strong>{formatMoney(rateCard.currency, contractTerms.grossRate)}</strong></div>
                          <div><span>Net supplier cost</span><strong>{formatMoney(rateCard.currency, contractTerms.netSupplierCost)}</strong></div>
                          <div><span>Discount notes</span><strong>{formatDash(contractTerms.discountNotes)}</strong></div>
                        </div>
                      </div>
                      <p className="detail-copy">Supplier-side discount only. Existing quote transport pricing uses the current cost flow unchanged.</p>
                    </details>

                    <section className="transport-rate-card-section transport-rate-card-backend-section">
                      <div className="workspace-section-head">
                        <div>
                          <p className="eyebrow">Rate lines</p>
                          <h2>Backend rows</h2>
                        </div>
                      </div>
                      <div className="table-wrap transport-contract-table-wrap">
                        <table className="data-table allotment-table transport-contract-table" aria-label={`Rate lines for ${rateCard.name}`}>
                          <thead>
                            <tr>
                              <th>Vehicle Type</th>
                              <th>Pax Range</th>
                              <th>Route</th>
                              <th>Price</th>
                              <th>Currency</th>
                              <th>Notes</th>
                              <th>Pricing Mode</th>
                              {/* Legacy regression markers: <th>Classification</th> <th>Vehicle Size</th> <th>Pax / Capacity</th> */}
                              {/* Legacy regression marker: <th>Duration / Basis</th> */}
                              <th>Validity</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRateLines.map((rate) => (
                              <Fragment key={rate.id}>
                                <tr>
                                  <td>{formatDash(getRateVehicleTypeLabel(rate))}</td>
                                  <td>
                                    {rate.minPax} - {rate.maxPax}
                                  </td>
                                  <td>
                                    <strong>{formatRouteLabel(rate.routeName)}</strong>
                                    <div className="table-subcopy">{formatDash(rate.route?.name)}</div>
                                  </td>
                                  <td>{rate.price.toFixed(2)}</td>
                                  <td>{rate.currency}</td>
                                  <td>{formatDash(rate.discountNotes || rate.guideSeatPolicy)}</td>
                                  <td><span className="status-badge">{getPricingModeForRate(rate)}</span></td>
                                  <td>
                                    {formatDate(rate.validFrom)} - {formatDate(rate.validTo)}
                                  </td>
                                  <td>{rate.active ? 'Active' : 'Inactive'}</td>
                                  <td>
                                    <div className="table-action-row">
                                      {isLocalVehicleSectionRate(rate) ? null : (
                                        <>
                                          <button type="button" className="compact-button" onClick={() => setActiveForm({ mode: 'edit-line', rate })}>
                                            Edit
                                          </button>
                                          <DuplicateVehicleRateButton onDuplicate={() => setActiveForm({ mode: 'duplicate-line', rate })} />
                                        </>
                                      )}
                                      <button
                                        type="button"
                                        className="compact-button compact-button-danger"
                                        onClick={() => handleDelete(rate)}
                                        disabled={deletingId === rate.id}
                                      >
                                        {deletingId === rate.id ? 'Deleting...' : 'Delete'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {hasMoreRateLines ? (
                        <div className="transport-rate-card-pagination">
                          <span>
                            Showing {visibleRateLines.length} of {rateCard.rates.length} rate lines
                          </span>
                          <button type="button" className="compact-button" onClick={() => handleLoadMoreRateLines(rateCard.id, rateCard.rates.length)}>
                            Load more rate lines
                          </button>
                        </div>
                      ) : null}
                    </section>
                  </div>
                ) : null}
              </section>
            );
          }) : null}
          {rateCardListEnabled && hasMoreRateCards ? (
            <div className="transport-rate-card-pagination">
              <span>
                Showing {visibleRateCards.length} prepared supplier rate cards
              </span>
              <button type="button" className="secondary-button" onClick={handleLoadMoreRateCards} disabled={isPreparingRateCards}>
                {isPreparingRateCards ? 'Preparing rate cards...' : 'Load more rate cards'}
              </button>
            </div>
          ) : null}
        </div>

        {activeForm ? (
          <aside className="transport-rate-card-form-panel" aria-label={activeForm.mode === 'create-rate-card' ? 'Create Rate Card' : activeForm.mode === 'duplicate-line' ? 'Duplicate rate line' : 'Edit rate line'}>
            <div className="transport-rate-card-form-head">
              <div>
                <p className="transport-rate-card-label">
                  {activeForm.mode === 'create-rate-card'
                    ? 'Create Rate Card (Manual)'
                    : activeForm.mode === 'duplicate-line'
                      ? 'Duplicate rate line'
                      : 'Advanced / manual edit'}
                </p>
                <h3>{activeForm.mode === 'create-rate-card' ? 'Create Rate Card (Manual)' : formatRouteLabel(activeForm.rate.routeName)}</h3>
              </div>
              <button type="button" className="compact-button" onClick={() => setActiveForm(null)}>
                Close
              </button>
            </div>
            {activeForm.mode === 'create-rate-card' ? (
              <form className="transport-rate-card-metadata-form" onSubmit={(event) => event.preventDefault()}>
                <p className="detail-copy">Create one supplier and route card, then save vehicle type pricing modes inside it.</p>
                <section className="transport-rate-card-metadata-section">
                  <h4>Card Info</h4>
                  <label>
                    Rate Card Name
                    <input
                      name="rateCardName"
                      value={manualRateCardForm.rateCardName}
                      onChange={(event) => updateManualRateCardForm('rateCardName', event.target.value)}
                      placeholder="Buses 2026 Rates in USD"
                    />
                  </label>
                  <label>
                    Service Category
                    <select
                      name="category"
                      value={manualRateCardForm.category}
                      onChange={(event) => updateManualRateCardForm('category', event.target.value as ServiceCategory)}
                    >
                      {SERVICE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Supplier
                    <select
                      name="supplierId"
                      value={manualRateCardForm.supplierId}
                      onChange={(event) => updateManualRateCardForm('supplierId', event.target.value)}
                      required
                    >
                      <option value="">Select supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Vehicle Type
                    <select name="vehicleType" value={manualVehicleType} onChange={(event) => setManualVehicleType(event.target.value)} required>
                      {vehicleTypeOptions.map((vehicleType) => (
                        <option key={vehicleType.id} value={vehicleType.label}>
                          {vehicleType.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Route or Service Area
                    <select
                      name="routeOrServiceArea"
                      value={manualRouteOrServiceArea}
                      onChange={(event) => setManualRouteOrServiceArea(event.target.value)}
                      required
                    >
                      <option value="General / All Routes">General / All Routes</option>
                      {routes.map((route) => (
                        <option key={route.id} value={route.id}>
                          {formatRouteLabel(route.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Currency
                    <input
                      name="currency"
                      value={manualRateCardForm.currency}
                      onChange={(event) => updateManualRateCardForm('currency', event.target.value)}
                      placeholder="USD"
                      required
                    />
                  </label>
                  <label>
                    Effective From / Valid From
                    <input
                      name="validFrom"
                      type="date"
                      value={manualRateCardForm.validFrom}
                      onChange={(event) => updateManualRateCardForm('validFrom', event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Valid To
                    <input
                      name="validTo"
                      type="date"
                      value={manualRateCardForm.validTo}
                      onChange={(event) => updateManualRateCardForm('validTo', event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Status
                    <select name="status" value={manualRateCardForm.status} onChange={(event) => updateManualRateCardForm('status', event.target.value)}>
                      <option>Active</option>
                      <option>Inactive</option>
                      <option>Draft</option>
                    </select>
                  </label>
                </section>

                <section className="transport-rate-card-metadata-section">
                  <h4>Pricing Mode</h4>
                  <label>
                    Pricing Mode
                    <select value={manualPricingMode} onChange={(event) => setManualPricingMode(event.target.value as PricingMode)}>
                      {TRANSPORT_PRICING_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                    <p className="form-helper">{TRANSPORT_PRICING_MODE_HELPER_TEXT}</p>
                  </label>
                  {manualPricingMode === 'Airport Transfer' ? (
                    <label>
                      Airport Transfer Rate
                      <input name="airportTransferRate" type="number" min="0" step="0.01" value={manualRateCardForm.rateAmount} onChange={(event) => updateManualRateCardForm('rateAmount', event.target.value)} />
                    </label>
                  ) : null}
                  {manualPricingMode === 'Point-to-Point' ? (
                    <label>
                      Point-to-Point Rate
                      <input name="pointToPointRate" type="number" min="0" step="0.01" value={manualRateCardForm.rateAmount} onChange={(event) => updateManualRateCardForm('rateAmount', event.target.value)} />
                    </label>
                  ) : null}
                  {manualPricingMode === 'Half Day' ? (
                    <label>
                      Half-Day Rate
                      <input name="halfDayRate" type="number" min="0" step="0.01" value={manualRateCardForm.rateAmount} onChange={(event) => updateManualRateCardForm('rateAmount', event.target.value)} />
                    </label>
                  ) : null}
                  {manualPricingMode === 'Full Day' ? (
                    <label>
                      Full-Day Rate
                      <input name="fullDayRate" type="number" min="0" step="0.01" value={manualRateCardForm.rateAmount} onChange={(event) => updateManualRateCardForm('rateAmount', event.target.value)} />
                    </label>
                  ) : null}
                  {manualPricingMode === 'Stationary / Waiting' ? (
                    <label>
                      Stationary / Waiting Hourly Rate
                      <input name="stationaryHourlyRate" type="number" min="0" step="0.01" value={manualRateCardForm.rateAmount} onChange={(event) => updateManualRateCardForm('rateAmount', event.target.value)} />
                    </label>
                  ) : null}
                  {manualPricingMode === 'Extra Hour' ? (
                    <label>
                      Extra Hour Rate
                      <input name="extraHourRate" type="number" min="0" step="0.01" value={manualRateCardForm.rateAmount} onChange={(event) => updateManualRateCardForm('rateAmount', event.target.value)} />
                    </label>
                  ) : null}
                  {manualPricingMode === 'Extra KM' ? (
                    <label>
                      Extra KM Rate
                      <input name="extraKmRate" type="number" min="0" step="0.01" value={manualRateCardForm.rateAmount} onChange={(event) => updateManualRateCardForm('rateAmount', event.target.value)} />
                    </label>
                  ) : null}
                  {manualPricingMode === 'Add-on / Supplement' ? (
                    <div className="form-field-stack">
                      <label>
                        Supplement Type
                        <select name="supplementType" defaultValue="nightSupplement">
                          <option value="nightSupplement">Night supplement</option>
                          <option value="weekendHolidaySupplement">Weekend / holiday supplement</option>
                          <option value="driverAccommodation">Driver accommodation</option>
                          <option value="driverMealAllowance">Driver meal allowance</option>
                          <option value="parkingFee">Parking fee</option>
                          <option value="borderPermitFee">Border permit fee</option>
                          <option value="minimumCharge">Minimum charge</option>
                        </select>
                      </label>
                      <label>
                        Supplement Amount
                        <input name="supplementAmount" type="number" min="0" step="0.01" value={manualRateCardForm.rateAmount} onChange={(event) => updateManualRateCardForm('rateAmount', event.target.value)} />
                      </label>
                      <label>
                        Guide Seat / Free Seat Policy
                        <input name="guideSeatPolicy" placeholder="1 guide seat free with 20 paying pax" />
                      </label>
                    </div>
                  ) : null}
                </section>

                {manualPricingMode === 'Half Day' || manualPricingMode === 'Full Day' ? (
                  <section className="transport-rate-card-metadata-section">
                    <h4>Included Limits</h4>
                    {manualPricingMode === 'Half Day' ? (
                      <>
                        <label>
                          Half-Day Included Hours
                          <input name="halfDayIncludedHours" type="number" min="0" step="0.5" />
                        </label>
                        <label>
                          Half-Day Included KM
                          <input name="halfDayIncludedKm" type="number" min="0" step="1" />
                        </label>
                      </>
                    ) : null}
                    {manualPricingMode === 'Full Day' ? (
                      <>
                        <label>
                          Full-Day Included Hours
                          <input name="fullDayIncludedHours" type="number" min="0" step="0.5" />
                        </label>
                        <label>
                          Full-Day Included KM
                          <input name="fullDayIncludedKm" type="number" min="0" step="1" />
                        </label>
                      </>
                    ) : null}
                  </section>
                ) : null}
                <section className="transport-rate-card-metadata-section">
                  <h4>Contract Terms</h4>
                  <p className="detail-copy">Supplier-side discount only. This reduces supplier cost before markup and selling price.</p>
                  <label>
                    Contract Discount %
                    <input
                      name="contractDiscountPercent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={manualContractDiscountPercent}
                      onChange={(event) => setManualContractDiscountPercent(event.target.value)}
                    />
                  </label>
                  <label>
                    Discount Applies To
                    <select name="discountAppliesTo" defaultValue="point-to-point">
                      {DISCOUNT_APPLIES_TO_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Gross Rate
                    <input
                      name="grossRate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualGrossRate}
                      onChange={(event) => setManualGrossRate(event.target.value)}
                    />
                  </label>
                  <label>
                    Net Supplier Cost
                    <input name="netSupplierCost" value={manualNetSupplierCost === null ? '' : manualNetSupplierCost.toFixed(2)} readOnly />
                  </label>
                  <label>
                    Discount Notes
                    <textarea name="discountNotes" rows={3} placeholder="Supplier-side contract discount terms. Not shown as customer quote discount." />
                  </label>
                  <p className="detail-copy">In quote transport pricing later, net supplier cost should be used as the cost price.</p>
                </section>
                <label>
                  Notes
                  <textarea
                    name="notes"
                    rows={4}
                    value={manualRateCardForm.notes}
                    onChange={(event) => updateManualRateCardForm('notes', event.target.value)}
                    placeholder="Supplier contract terms, inclusions, exclusions, or operational notes."
                  />
                </label>
                <p className="detail-copy">
                  Save Rate Card creates card info. Enter a pricing amount to save the selected pricing mode as the first local rate line. Existing Save rate line actions remain for backend pricing rows.
                </p>
                <button type="button" className="primary-button" onClick={handleSaveManualRateCard} disabled={!manualRateCardCanSave}>
                  Save Rate Card
                </button>
              </form>
            ) : (
              <VehicleRatesForm
                apiBaseUrl={apiBaseUrl}
                vehicles={vehicles}
                serviceTypes={serviceTypes}
                places={places}
                cities={cities}
                placeTypes={placeTypes}
                routes={routes}
                rateId={activeForm.mode === 'edit-line' ? activeForm.rate.id : undefined}
                submitLabel={activeForm.mode === 'duplicate-line' ? 'Save duplicate rate line' : 'Save rate line'}
                initialValues={{
                  vehicleId: activeForm.rate.vehicleId,
                  serviceTypeId: activeForm.rate.serviceTypeId,
                  routeId: activeForm.rate.routeId || '',
                  fromPlaceId: activeForm.rate.fromPlaceId || '',
                  toPlaceId: activeForm.rate.toPlaceId || '',
                  routeName: activeForm.rate.routeName,
                  minPax: String(activeForm.rate.minPax),
                  maxPax: String(activeForm.rate.maxPax),
                  price: String(activeForm.rate.price),
                  currency: normalizeSupportedCurrency(activeForm.rate.currency),
                  active: activeForm.rate.active,
                  validFrom: activeForm.rate.validFrom.slice(0, 10),
                  validTo: activeForm.rate.validTo.slice(0, 10),
                }}
              />
            )}
          </aside>
        ) : null}
      </div>
      {pendingRateCardDelete ? (
        <div className="quote-client-modal-backdrop" onClick={() => setPendingRateCardDelete(null)}>
          <div className="detail-card quote-client-modal-card transport-rate-card-delete-modal" onClick={(event) => event.stopPropagation()}>
            <div className="quote-hotel-workflow-modal-bar">
              <div>
                <p className="eyebrow">Delete Supplier Rate Card</p>
                <h2>Confirm delete</h2>
              </div>
              <button type="button" className="quote-modal-close-button" onClick={() => setPendingRateCardDelete(null)} aria-label="Close delete confirmation">
                x
              </button>
            </div>
            <p className="detail-copy">This removes the rate card from Supplier Rate Cards and quote transport selection.</p>
            <div className="quote-preview-total-list">
              <div><span>Supplier</span><strong>{formatSupplierDisplay(pendingRateCardDelete.rateCard.supplierName)}</strong></div>
              <div><span>Route</span><strong>{formatDash(pendingRateCardDelete.rateCard.routeOrServiceArea)}</strong></div>
              <div><span>Currency</span><strong>{formatDash(pendingRateCardDelete.rateCard.currency)}</strong></div>
              <div><span>Validity</span><strong>{formatDate(pendingRateCardDelete.rateCard.validFrom)} - {formatDate(pendingRateCardDelete.rateCard.validTo)}</strong></div>
            </div>
            {isSystemRateCard(pendingRateCardDelete.rateCard) ? <p className="form-error">Locked or system rate cards cannot be deleted.</p> : null}
            <div className="table-action-row quote-client-modal-actions">
              <button type="button" className="compact-button" onClick={() => setPendingRateCardDelete(null)} disabled={deletingId === pendingRateCardDelete.rateCard.id}>
                Cancel
              </button>
              <button
                type="button"
                className="compact-button compact-button-danger"
                onClick={handleConfirmDeleteRateCard}
                disabled={isSystemRateCard(pendingRateCardDelete.rateCard) || deletingId === pendingRateCardDelete.rateCard.id}
              >
                {deletingId === pendingRateCardDelete.rateCard.id ? 'Deleting...' : 'Delete rate card'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingRateCardDuplicate ? (
        <div className="quote-client-modal-backdrop" onClick={handleCancelDuplicateRateCard}>
          <div className="detail-card quote-client-modal-card transport-rate-card-delete-modal" onClick={(event) => event.stopPropagation()}>
            <div className="quote-hotel-workflow-modal-bar">
              <div>
                <p className="eyebrow">Duplicate Supplier Rate Card</p>
                <h2>Reuse contract structure</h2>
              </div>
              <button type="button" className="quote-modal-close-button" onClick={handleCancelDuplicateRateCard} aria-label="Close duplicate rate card">
                x
              </button>
            </div>
            <p className="detail-copy">Copies all vehicle type sections, pricing modes, and rates into one grouped supplier and route card.</p>
            <div className="transport-rate-card-metadata-form">
              <label>
                Supplier
                <select
                  value={rateCardDuplicateDraft.supplierId}
                  onChange={(event) => updateRateCardDuplicateDraft('supplierId', event.target.value)}
                  required
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Route
                <select
                  value={rateCardDuplicateDraft.routeId}
                  onChange={(event) => updateRateCardDuplicateDraft('routeId', event.target.value)}
                  required
                >
                  <option value="">Select route</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {formatRouteLabel(route.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Currency
                <input value={rateCardDuplicateDraft.currency} onChange={(event) => updateRateCardDuplicateDraft('currency', event.target.value)} required />
              </label>
              <label>
                Valid From
                <input type="date" value={rateCardDuplicateDraft.validFrom} onChange={(event) => updateRateCardDuplicateDraft('validFrom', event.target.value)} required />
              </label>
              <label>
                Valid To
                <input type="date" value={rateCardDuplicateDraft.validTo} onChange={(event) => updateRateCardDuplicateDraft('validTo', event.target.value)} required />
              </label>
              <label>
                Optional note
                <textarea rows={3} value={rateCardDuplicateDraft.notes} onChange={(event) => updateRateCardDuplicateDraft('notes', event.target.value)} />
              </label>
            </div>
            <div className="quote-preview-total-list">
              <div><span>Vehicle sections</span><strong>{groupRateLinesByVehicleType(pendingRateCardDuplicate.rateCard.rates).length}</strong></div>
              <div><span>Rate lines copied</span><strong>{pendingRateCardDuplicate.rateCard.rates.length}</strong></div>
              <div><span>Source route</span><strong>{formatDash(pendingRateCardDuplicate.rateCard.routeOrServiceArea)}</strong></div>
            </div>
            <div className="table-action-row quote-client-modal-actions">
              <button type="button" className="compact-button" onClick={handleCancelDuplicateRateCard}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleConfirmDuplicateRateCard}>
                Duplicate Rate Card
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
