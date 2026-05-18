'use client';

import { useEffect, useMemo, useState } from 'react';
import { DrawerPanel } from '../../components/ui';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { calculateMarginPercent, calculateProfit, formatMarginPercent } from '../../lib/financials';
import { RouteOption } from '../../lib/routes';
import { filterCanonicalFleetVehicles, formatTransportVehicleDisplay, resolveVehicleTypeLabel } from '../../lib/transport-vehicles';
import { formatSupplierName } from '../../lib/transport-formatters';
import { normalizeTransportRouteText, transportRoutePairsMatch } from '../../lib/transport-routes';
import {
  getJordanVehicleCapacityRange,
  normalizeVehicleTypeLabel,
  readStoredVehicleTypeOptions,
  type VehicleTypeOption,
} from '../../lib/vehicle-types';
import { MANUAL_SUPPLIER_RATE_CARDS_CHANGED_EVENT, readManualSupplierRateCards } from '../../lib/manual-supplier-rate-cards';
import { resolveSupplierNameById, SUPPLIER_STANDARDIZATION_HELPER_TEXT } from '../../lib/transport-suppliers';
import {
  deriveTransportPricingMode,
  TRANSPORT_PRICING_MODE_HELPER_TEXT,
  TRANSPORT_PRICING_MODES,
  type TransportPricingMode as PricingMode,
} from '../../lib/transport-pricing-modes';

const SHOW_TRANSPORT_PRICING_DIAGNOSTICS = process.env.NODE_ENV !== 'production';

type Vehicle = {
  id: string;
  supplierId?: string | null;
  supplierName?: string | null;
  name: string;
  vehicleType?: string | null;
  maxPax: number;
  luggageCapacity?: number | null;
  active?: boolean | null;
  isActive?: boolean | null;
};

type Supplier = {
  id: string;
  name: string;
};

type SupplierService = {
  id: string;
  supplierId: string;
  name: string;
  category: string;
  serviceTypeId?: string | null;
  serviceType?: {
    id: string;
    name: string;
    code: string | null;
    isActive?: boolean;
  } | null;
};

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
  classification?: string | null;
};

type VehicleRate = {
  id: string;
  vehicleId?: string | null;
  routeId: string | null;
  touringRouteId?: string | null;
  touringRoutePricingId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName: string;
  vehicleType?: string | null;
  minPax?: number | null;
  maxPax?: number | null;
  price: number;
  currency: string;
  costCurrency?: string | null;
  active: boolean;
  validFrom: string;
  validTo: string;
  supplierId?: string | null;
  supplierName?: string | null;
  supplier?: {
    id?: string;
    name?: string | null;
  } | null;
  vehicle?: {
    name?: string | null;
    vehicleType?: string | null;
    maxPax?: number | null;
  } | null;
  route?: RouteOption | null;
  serviceType?: {
    id?: string | null;
    name: string;
    code: string;
    classification?: string | null;
  } | null;
  pricingMode?: string | null;
  contractDiscountPercent?: number | null;
  grossRate?: number | null;
  rates?: VehicleRate[];
};

type SupplierRateMatch = {
  rate: VehicleRate;
  priority: 1 | 2 | 3 | 4 | 5;
  badge: 'Exact match' | 'Route match' | 'Vehicle type match' | 'Pricing mode match' | 'Fallback';
};

type TransportSelectionMode = 'TRANSFER_ROUTE' | 'TOURING_ROUTE' | 'DISPOSAL';

type VehicleRecommendationGroup = 'Recommended' | 'Available' | 'Too small';

type RankedVehicle = {
  vehicle: Vehicle;
  group: VehicleRecommendationGroup;
  isRecommended: boolean;
  isTooSmall: boolean;
  capacityRangeLabel: string | null;
  standardCapacityMatch: boolean;
};

type QuoteTransportPickerProps = {
  apiBaseUrl: string;
  quoteId: string;
  itineraryId: string;
  routes: RouteOption[];
  vehicles: Vehicle[];
  supplierRateCards: VehicleRate[];
  services: SupplierService[];
  transportServiceTypes: TransportServiceType[];
  transportDataStatus: TransportDataStatus;
  totalPax: number;
  quoteCurrency: string;
  dayNumber?: number;
  onSaved?: (item: unknown) => void;
};

type TransportDataStatus = {
  routes: {
    status: 'ok' | 'error';
    message?: string;
  };
  vehicles: {
    status: 'ok' | 'error';
    message?: string;
  };
  supplierRateCards: {
    status: 'ok' | 'error';
    message?: string;
  };
};

function formatRoute(route: RouteOption | null) {
  if (!route) {
    return 'Select route';
  }

  return route.name || `${route.fromPlace.name} -> ${route.toPlace.name}`;
}

function getRouteAreaName(route: RouteOption) {
  return route.fromPlace.city || route.toPlace.city || route.fromPlace.name || route.toPlace.name || route.name;
}

function isSameAreaRouteOption(route: RouteOption) {
  const fromName = normalizeTransportRouteText(route.fromPlace.name);
  const toName = normalizeTransportRouteText(route.toPlace.name);
  const from = normalizeTransportRouteText(route.fromPlace.city || route.fromPlace.name);
  const to = normalizeTransportRouteText(route.toPlace.city || route.toPlace.name);
  const routeText = normalizeTransportRouteText(`${route.name} ${route.notes || ''}`);
  return Boolean((fromName && toName && fromName === toName) || (from && to && from === to && /city|disposal|day_services/.test(routeText)));
}

function isProgramOrDisposalRouteOption(route: RouteOption) {
  const normalized = normalizeTransportRouteText(`${route.name} ${route.routeType || ''} ${route.notes || ''}`);
  return isSameAreaRouteOption(route) || normalized.includes('program') || normalized.includes('disposal') || normalized.includes('day_services');
}

function isTouringRouteOption(route: RouteOption) {
  return route.transportPickerMode === 'TOURING_ROUTE' || normalizeType(route.canonicalRouteType || route.routeType) === normalizeType('TOURING_ROUTE');
}

function formatDisposalAreaName(value: string) {
  const clean = value.trim();
  if (/disposal$/i.test(clean)) {
    return clean;
  }
  if (/^dead sea city$/i.test(clean)) {
    return 'Dead Sea Disposal';
  }
  return `${clean} Disposal`;
}

function getDisposalRouteBaseName(route: RouteOption) {
  const normalizedName = normalizeTransportRouteText(route.name);
  if (normalizedName.includes('city') || normalizedName.includes('disposal') || normalizedName.includes('day_services')) {
    return route.name.replace(/\s+disposal$/i, '').trim();
  }
  return getRouteAreaName(route);
}

function getDisposalAreaKey(route: RouteOption) {
  const area = getDisposalRouteBaseName(route);
  const region = route.routeOperations?.region || route.fromPlace.city || route.toPlace.city || area;
  return normalizeTransportRouteText(`${formatDisposalAreaName(area)} ${region}`);
}

function getTransferRouteKey(route: RouteOption) {
  return normalizeTransportRouteText(`${route.fromPlace.name} ${route.fromPlace.city || ''} ${route.toPlace.name} ${route.toPlace.city || ''}`);
}

export function formatRouteSelectionLabel(route: RouteOption) {
  if (isProgramOrDisposalRouteOption(route)) {
    return formatDisposalAreaName(getDisposalRouteBaseName(route));
  }

  const normalized = normalizeTransportRouteText(route.name);
  if (normalized.includes('jordan_program')) return 'Jordan Program';
  if (normalized.includes('disposal') || normalized.includes('day_services')) return 'Disposal / Day Services';
  return formatRoute(route);
}

export function getQuoteTransportRouteSelectorGroups(routes: RouteOption[]) {
  const transferReviewIds: string[] = [];
  const seenTransferRoutes = new Set<string>();
  const seenTouringRoutes = new Set<string>();
  const transferRoutes = routes.filter((route) => {
    if (isTouringRouteOption(route) || isProgramOrDisposalRouteOption(route)) {
      return false;
    }

    const key = getTransferRouteKey(route);
    if (seenTransferRoutes.has(key)) {
      transferReviewIds.push(route.id);
      return false;
    }

    seenTransferRoutes.add(key);
    return true;
  });
  const touringRoutes = routes.filter((route) => {
    if (!isTouringRouteOption(route)) {
      return false;
    }

    const key = normalizeTransportRouteText(route.code || route.normalizedKey || route.name || route.id);
    if (seenTouringRoutes.has(key)) {
      transferReviewIds.push(route.id);
      return false;
    }

    seenTouringRoutes.add(key);
    return true;
  });
  const disposalReviewIds: string[] = [];
  const seenServiceAreas = new Set<string>();
  const serviceAreas = routes.filter((route) => {
    if (isTouringRouteOption(route) || !isProgramOrDisposalRouteOption(route)) {
      return false;
    }

    const key = getDisposalAreaKey(route);
    if (seenServiceAreas.has(key)) {
      disposalReviewIds.push(route.id);
      return false;
    }

    seenServiceAreas.add(key);
    return true;
  });

  return {
    transferRoutes,
    touringRoutes,
    serviceAreas,
    transferReviewIds,
    disposalReviewIds,
  };
}

function getRouteOptionsForTransportMode(groups: ReturnType<typeof getQuoteTransportRouteSelectorGroups>, mode: TransportSelectionMode) {
  if (mode === 'TOURING_ROUTE') return groups.touringRoutes;
  if (mode === 'DISPOSAL') return groups.serviceAreas;
  return groups.transferRoutes;
}

function getTransportModeLabel(mode: TransportSelectionMode) {
  if (mode === 'TOURING_ROUTE') return 'Touring Route';
  if (mode === 'DISPOSAL') return 'Disposal / Stationary';
  return 'Transfer Route';
}

function formatMoney(value: number, currency: string) {
  return `${currency || 'USD'} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getQuoteTransportRateCurrency(rate: Pick<VehicleRate, 'currency' | 'costCurrency'> | null | undefined, fallbackCurrency = 'USD') {
  return String(rate?.costCurrency || rate?.currency || fallbackCurrency || 'USD').trim().toUpperCase();
}

function getMarginTone(marginPercent: number) {
  if (marginPercent >= 20) return 'quote-live-pricing-profit-good';
  if (marginPercent >= 10) return 'quote-live-pricing-profit-watch';
  return 'quote-live-pricing-profit-risk';
}

function normalizeType(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[\s-]/g, '').trim() || '';
}

function normalizeRouteText(value: string | null | undefined) {
  return normalizeTransportRouteText(value);
}

function getRouteRawLabels(route: RouteOption) {
  return [
    route.name,
    formatRoute(route),
    `${route.fromPlace.name} -> ${route.toPlace.name}`,
    `${route.fromPlace.name} \u2192 ${route.toPlace.name}`,
  ].filter((label): label is string => Boolean(label));
}

function getRateRawRouteLabels(rate: VehicleRate) {
  return [
    rate.routeName,
    rate.route?.name,
    rate.route ? `${rate.route.fromPlace.name} -> ${rate.route.toPlace.name}` : '',
    rate.route ? `${rate.route.fromPlace.name} \u2192 ${rate.route.toPlace.name}` : '',
  ].filter((label): label is string => Boolean(label));
}

function getPricingModeForRate(rate: VehicleRate): PricingMode {
  return getNormalizedPricingModeForRate(rate) || 'Point-to-Point';
}

function getNormalizedPricingModeForRate(rate: VehicleRate) {
  return deriveTransportPricingMode(rate);
}

function getServiceCategorySource(service: SupplierService) {
  return service.serviceType?.code || service.serviceType?.name || service.category;
}

function isTransportSupplierService(service: SupplierService) {
  const normalized = getServiceCategorySource(service).toLowerCase();
  return normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle');
}

function inferSupplierServicePricingMode(service: SupplierService): PricingMode | null {
  const directMode =
    deriveTransportPricingMode({
      serviceType: service.serviceType
        ? {
            name: service.serviceType.name,
            code: service.serviceType.code,
          }
        : null,
    }) ||
    deriveTransportPricingMode({ pricingMode: service.name }) ||
    deriveTransportPricingMode({ routeName: service.name });

  if (directMode) {
    return directMode;
  }

  const text = service.name.toLowerCase();
  if (/\bextra\s*(km|kilometer|kilometre)|per\s*km\b/.test(text)) return 'Extra KM';
  if (/\bwadi\s*rum\b.*\bovernight\b|\bovernight\b.*\bwadi\s*rum\b/.test(text)) return 'Wadi Rum Overnight';
  if (/\baqaba\b.*\bovernight\b|\bovernight\b.*\baqaba\b/.test(text)) return 'Aqaba Overnight';
  if (/\bdriver\s*overnight|overnight\s*driver|petra\b.*\bovernight\b|\bovernight\b.*\bpetra\b/.test(text)) return 'Petra Overnight';
  if (/\bstationary|waiting\b/.test(text)) return 'Stationary / Waiting';
  if (/\bday\s*tour|sightseeing\s*day|fit\s*touring\b/.test(text)) return 'Daily Full Day';
  if (/\bhalf\s*day\b/.test(text)) return 'Half Day';
  if (/\bfull\s*day|daily\s*fd|daily\s*package|minimum\s*3\b/.test(text)) return 'Daily Full Day';

  return null;
}

function findSupplierServiceForRate(services: SupplierService[], rate: VehicleRate, pricingMode: PricingMode | '') {
  const transportServices = services.filter(isTransportSupplierService);
  const supplierId = rate.supplierId || rate.supplier?.id || null;
  const supplierScoped = supplierId ? transportServices.filter((service) => service.supplierId === supplierId) : transportServices;
  const searchPool = supplierScoped.length > 0 ? supplierScoped : transportServices;
  const targetMode = pricingMode || getNormalizedPricingModeForRate(rate);
  const modeMatch = targetMode ? searchPool.find((service) => inferSupplierServicePricingMode(service) === targetMode) : null;
  const serviceTypeMatch = searchPool.find((service) => service.serviceTypeId === rate.serviceType?.id);

  return modeMatch || serviceTypeMatch || null;
}

function findTransportServiceTypeIdForRate(rate: VehicleRate, transportServiceTypes: TransportServiceType[], pricingMode: PricingMode | '') {
  if (rate.serviceType?.id) {
    return rate.serviceType.id;
  }

  const targetMode = pricingMode || getNormalizedPricingModeForRate(rate);
  if (!targetMode) {
    return '';
  }

  return (
    transportServiceTypes.find((serviceType) => deriveTransportPricingMode({ serviceType }) === targetMode)?.id ||
    transportServiceTypes.find((serviceType) => serviceType.name.toLowerCase() === targetMode.toLowerCase())?.id ||
    ''
  );
}

function isMinimumFullDayRate(rate: VehicleRate) {
  const text = [rate.serviceType?.classification, rate.serviceType?.name, rate.serviceType?.code].join(' ').toLowerCase();
  return /\b(daily_package|daily\s*fd|daily\s+full\s+day|minimum\s+3)\b/.test(text);
}

function getSupplierDisplay(rate: VehicleRate, suppliers: Supplier[]) {
  return formatSupplierName(resolveSupplierNameById(rate.supplierId || rate.supplier?.id, suppliers) || rate.supplier?.name || rate.supplierName, null);
}

export function getQuoteTransportRateUnitCost(rate: VehicleRate) {
  return Number(rate.price) || 0;
}

export function getQuoteTransportRateUnitCount(rate: VehicleRate, pax: number) {
  const requestedPax = Math.max(1, Math.floor(Number(pax) || 1));
  const unitCapacity = Number(rate.maxPax ?? rate.vehicle?.maxPax ?? 0);
  return unitCapacity > 0 ? Math.max(1, Math.ceil(requestedPax / unitCapacity)) : 1;
}

export function getQuoteTransportRateBillableDays(rate: VehicleRate, selectedDays = 1) {
  return Math.max(1, Math.floor(Number(selectedDays) || 1));
}

export function getQuoteTransportPersistedCostPreview(rate: VehicleRate, pax: number, selectedDays = 1) {
  const unitCost = getQuoteTransportRateUnitCost(rate);
  const unitCount = getQuoteTransportRateUnitCount(rate, pax);
  const billableDays = getQuoteTransportRateBillableDays(rate, selectedDays);

  return Number((unitCost * unitCount * billableDays).toFixed(2));
}

function hasNumericRate(rate: VehicleRate) {
  return Number.isFinite(Number(rate.price));
}

function usesBillableDaysInput(pricingMode: PricingMode | '') {
  return pricingMode === 'Daily Full Day' || pricingMode === 'Petra Overnight' || pricingMode === 'Wadi Rum Overnight' || pricingMode === 'Aqaba Overnight';
}

function getRateCapacity(rate: VehicleRate) {
  return Number(rate.maxPax ?? rate.vehicle?.maxPax ?? 0) || null;
}

function formatRateMoney(value: number, currency: string) {
  return `${String(currency || 'USD').trim().toUpperCase()} ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function getMatchBadge(priority: SupplierRateMatch['priority']): SupplierRateMatch['badge'] {
  if (priority === 1) return 'Exact match';
  if (priority === 2) return 'Route match';
  if (priority === 3) return 'Vehicle type match';
  if (priority === 4) return 'Pricing mode match';
  return 'Fallback';
}

function getRateVehicleTypeForMatch(rate: VehicleRate, vehicleTypes: VehicleTypeOption[]) {
  return (
    normalizeVehicleTypeLabel(rate.vehicleType || rate.vehicle?.vehicleType, vehicleTypes) ||
    normalizeVehicleTypeLabel(rate.vehicle?.name, vehicleTypes)
  );
}

function rateMatchesSelectedVehicleFallback(rate: VehicleRate, selectedCanonicalVehicleType: string, vehicleTypes: VehicleTypeOption[], requestedPax?: number) {
  const selectedType = normalizeType(selectedCanonicalVehicleType);
  const rateType = normalizeType(getCanonicalRateVehicleType(rate, vehicleTypes));
  if (!selectedType || !rateType || selectedType !== rateType) {
    return false;
  }

  const rateCapacity = getRateCapacity(rate);
  return !requestedPax || !rateCapacity || rateCapacity >= requestedPax;
}

export function getCanonicalRateVehicleType(rate: VehicleRate, vehicleTypes: VehicleTypeOption[] = []) {
  return getRateVehicleTypeForMatch(rate, vehicleTypes);
}

export function getCanonicalPickerVehicleType(vehicle: Vehicle | null, vehicleTypes: VehicleTypeOption[] = []) {
  return vehicle ? resolveVehicleTypeLabel(vehicle, vehicleTypes) : '';
}

function parseDateBoundary(value: string | null | undefined, boundary: 'start' | 'end') {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (boundary === 'start') {
    parsed.setHours(0, 0, 0, 0);
  } else {
    parsed.setHours(23, 59, 59, 999);
  }

  return parsed;
}

export function isActiveValidTransportRate(rate: VehicleRate, now = new Date()) {
  if (rate.active === false) {
    return false;
  }

  const validFrom = parseDateBoundary(rate.validFrom, 'start');
  const validTo = parseDateBoundary(rate.validTo, 'end');
  const current = new Date(now);

  return (!validFrom || validFrom <= current) && (!validTo || validTo >= current);
}

function getTransportRateValidityIssue(rate: VehicleRate, now = new Date()) {
  if (rate.active === false) {
    return 'inactive';
  }

  const validFrom = parseDateBoundary(rate.validFrom, 'start');
  const validTo = parseDateBoundary(rate.validTo, 'end');
  const current = new Date(now);

  if (validFrom && validFrom > current) {
    return 'not yet valid';
  }

  if (validTo && validTo < current) {
    return 'expired';
  }

  return '';
}

function getRouteNames(route: RouteOption) {
  return getRouteRawLabels(route).map(normalizeRouteText);
}

function getRoutePlaceTokens(route: RouteOption) {
  return Array.from(
    new Set(
      [
        route.fromPlace?.name,
        route.fromPlace?.city,
        route.fromPlace?.country,
        route.toPlace?.name,
        route.toPlace?.city,
        route.toPlace?.country,
      ]
        .map(normalizeRouteText)
        .filter(Boolean),
    ),
  );
}

function isDisposalPricingMode(mode: PricingMode | null) {
  return mode === 'Daily Full Day' || mode === 'Half Day' || mode === 'Stationary / Waiting';
}

function getRoutePricingModeScope(route: RouteOption) {
  if (isTouringRouteOption(route)) {
    return 'touring';
  }

  if (isProgramOrDisposalRouteOption(route)) {
    return 'disposal';
  }

  return 'transfer';
}

function pricingModeMatchesRouteScope(mode: PricingMode, route: RouteOption) {
  const scope = getRoutePricingModeScope(route);

  if (scope === 'transfer') {
    return mode === 'Airport Transfer' || mode === 'Point-to-Point';
  }

  if (scope === 'disposal') {
    return mode === 'Half Day' || mode === 'Daily Full Day' || mode === 'Extra Hour' || mode === 'Stationary / Waiting';
  }

  return mode === 'Daily Full Day' || mode === 'Half Day';
}

export function transportRateMatchesSelectedRoute(rate: VehicleRate, route: RouteOption) {
  if (rate.routeId === route.id || rate.route?.id === route.id) {
    return true;
  }

  if (rate.fromPlaceId && rate.toPlaceId) {
    return rate.fromPlaceId === route.fromPlaceId && rate.toPlaceId === route.toPlaceId;
  }

  if (rate.route?.fromPlace && rate.route?.toPlace) {
    return transportRoutePairsMatch(
      { fromPlaceName: rate.route.fromPlace.name, toPlaceName: rate.route.toPlace.name },
      { fromPlaceName: route.fromPlace.name, toPlaceName: route.toPlace.name },
    );
  }

  const selectedRouteNames = getRouteNames(route);
  const rateRouteNames = getRateRawRouteLabels(rate).map(normalizeRouteText);

  return rateRouteNames.some((rateName) => Boolean(rateName) && selectedRouteNames.includes(rateName));
}

function disposalRateMatchesSelectedServiceArea(rate: VehicleRate, route: RouteOption) {
  if (!isDisposalPricingMode(getNormalizedPricingModeForRate(rate))) {
    return false;
  }

  if (transportRateMatchesSelectedRoute(rate, route) || isGeneralTransportRouteRate(rate)) {
    return true;
  }

  const rateRouteNames = getRateRawRouteLabels(rate).map(normalizeRouteText).filter(Boolean);
  const routePlaceTokens = getRoutePlaceTokens(route);
  if (rateRouteNames.length === 0 || routePlaceTokens.length === 0) {
    return false;
  }

  return rateRouteNames.some((rateName) => {
    if (rateName.includes('program') && routePlaceTokens.some((token) => token === 'jordan')) {
      return true;
    }

    return routePlaceTokens.some((token) => token.length >= 3 && rateName.includes(token));
  });
}

export function isGeneralTransportRouteRate(rate: VehicleRate) {
  if (rate.routeId || rate.route?.id) {
    return false;
  }

  const routeName = normalizeRouteText(rate.routeName || rate.route?.name || '');
  return !routeName || routeName.includes('general') || routeName.includes('all_routes') || routeName.includes('any_route');
}

function getRouteCandidateRates(rates: VehicleRate[], route: RouteOption, now = new Date()) {
  const activeValidRates = rates.filter((rate) => isActiveValidTransportRate(rate, now));
  if (isTouringRouteOption(route)) {
    return activeValidRates.filter((rate) => rate.touringRouteId === route.id || rate.routeId === route.id);
  }

  const exactRouteRates = activeValidRates.filter((rate) => transportRateMatchesSelectedRoute(rate, route));
  const disposalServiceAreaRates = activeValidRates.filter((rate) => disposalRateMatchesSelectedServiceArea(rate, route));
  const candidates = [...exactRouteRates, ...disposalServiceAreaRates];

  if (candidates.length > 0) {
    const seen = new Set<string>();
    return candidates.filter((rate) => {
      if (seen.has(rate.id)) {
        return false;
      }

      seen.add(rate.id);
      return true;
    });
  }

  return activeValidRates.filter(isGeneralTransportRouteRate);
}

export function getAvailableTransportPricingModesForSelection({
  rates,
  route,
  selectedCanonicalVehicleType,
  requestedPax,
  vehicleTypes = [],
  now = new Date(),
}: {
  rates: VehicleRate[];
  route: RouteOption | null;
  selectedCanonicalVehicleType: string;
  requestedPax?: number;
  vehicleTypes?: VehicleTypeOption[];
  now?: Date;
}) {
  if (!route || !selectedCanonicalVehicleType) {
    return [] as PricingMode[];
  }

  return Array.from(
    new Set(
      getRouteCandidateRates(rates, route, now)
        .filter((rate) => rateMatchesSelectedVehicleFallback(rate, selectedCanonicalVehicleType, vehicleTypes, requestedPax))
        .map(getNormalizedPricingModeForRate)
        .filter((mode): mode is PricingMode => Boolean(mode)),
    ),
  ).filter((mode) => pricingModeMatchesRouteScope(mode, route));
}

export function getTransportPricingModeOptionLabel({
  mode,
  rates,
  route,
  selectedCanonicalVehicleType,
  requestedPax,
  vehicleTypes = [],
  now = new Date(),
}: {
  mode: PricingMode;
  rates: VehicleRate[];
  route: RouteOption | null;
  selectedCanonicalVehicleType: string;
  requestedPax?: number;
  vehicleTypes?: VehicleTypeOption[];
  now?: Date;
}) {
  if (mode !== 'Daily Full Day' || !route || !selectedCanonicalVehicleType) {
    return mode;
  }

  const hasMinimumFullDayRate = getRouteCandidateRates(rates, route, now).some(
    (rate) =>
      getNormalizedPricingModeForRate(rate) === 'Daily Full Day' &&
      rateMatchesSelectedVehicleFallback(rate, selectedCanonicalVehicleType, vehicleTypes, requestedPax) &&
      isMinimumFullDayRate(rate),
  );

  return hasMinimumFullDayRate ? 'Daily Full Day - minimum 3 days' : mode;
}

function getTransportPricingModeDiagnostics({
  rates,
  route,
  selectedVehicleId,
  selectedVehicleName,
  selectedCanonicalVehicleType,
  requestedPax,
  vehicleTypes,
  now = new Date(),
}: {
  rates: VehicleRate[];
  route: RouteOption;
  selectedVehicleId: string;
  selectedVehicleName: string;
  selectedCanonicalVehicleType: string;
  requestedPax?: number;
  vehicleTypes: VehicleTypeOption[];
  now?: Date;
}) {
  const selectedType = normalizeType(selectedCanonicalVehicleType);
  const rejectedReasonCounts: Record<string, number> = {};
  const pricingModesFound = new Set<PricingMode>();
  const routeRates: VehicleRate[] = [];
  const normalizedCandidateRoutes = new Map<string, string>();
  let activeValidRowsCount = 0;

  function reject(reason: string) {
    rejectedReasonCounts[reason] = (rejectedReasonCounts[reason] || 0) + 1;
  }

  function rejectForMode(mode: PricingMode | null, reason: string) {
    reject(reason);
    if (mode === 'Daily Full Day') {
      reject(`Daily Full Day ${reason}`);
    }
  }

  for (const rate of rates) {
    const pricingMode = getNormalizedPricingModeForRate(rate);
    for (const rawRoute of getRateRawRouteLabels(rate)) {
      const normalizedRoute = normalizeRouteText(rawRoute);
      if (normalizedRoute && !normalizedCandidateRoutes.has(normalizedRoute)) {
        normalizedCandidateRoutes.set(normalizedRoute, rawRoute);
      }
    }

    if (!transportRateMatchesSelectedRoute(rate, route) && !disposalRateMatchesSelectedServiceArea(rate, route)) {
      rejectForMode(pricingMode, 'route/service area mismatch');
      continue;
    }

    routeRates.push(rate);

    const validityIssue = getTransportRateValidityIssue(rate, now);
    if (validityIssue) {
      rejectForMode(pricingMode, validityIssue);
      continue;
    }

    activeValidRowsCount += 1;

    const canonicalRateType = getCanonicalRateVehicleType(rate, vehicleTypes);
    if (!rateMatchesSelectedVehicleFallback(rate, selectedCanonicalVehicleType, vehicleTypes, requestedPax)) {
      rejectForMode(pricingMode, 'vehicle/capacity mismatch');
      continue;
    }

    if (!pricingMode) {
      reject('missing pricingMode');
      continue;
    }

    if (!hasNumericRate(rate)) {
      rejectForMode(pricingMode, 'missing price');
      continue;
    }

    pricingModesFound.add(pricingMode);
  }

  const legacyVehicleTypes = Array.from(
    new Set(routeRates.map((rate) => rate.vehicleType || rate.vehicle?.vehicleType || rate.vehicle?.name || '').filter(Boolean)),
  );

  return {
    selectedRouteId: route.id,
    selectedRouteName: formatRoute(route),
    selectedRouteRawLabels: getRouteRawLabels(route),
    selectedRouteNormalizedLabels: Array.from(new Set(getRouteRawLabels(route).map(normalizeRouteText).filter(Boolean))),
    normalizedCandidateRoutes: Array.from(normalizedCandidateRoutes.entries())
      .map(([normalized, raw]) => ({ raw, normalized }))
      .slice(0, 20),
    selectedVehicleId,
    selectedVehicleName,
    selectedCanonicalVehicleType: selectedCanonicalVehicleType || 'Unrecognized',
    vehicleRatesLoaded: rates.length,
    routeMatchingRowsCount: routeRates.length,
    legacyVehicleTypes,
    activeValidRowsCount,
    pricingModesFound: Array.from(pricingModesFound),
    supportedPricingModes: TRANSPORT_PRICING_MODES,
    rejectedReasonCounts: Object.entries(rejectedReasonCounts).map(([reason, count]) => ({ reason, count })),
  };
}

function isActiveVehicle(vehicle: Vehicle) {
  return vehicle.active !== false && vehicle.isActive !== false;
}

export function formatVehicleOptionLabel(entry: RankedVehicle, vehicleTypes: VehicleTypeOption[]) {
  const capacityGuidance = entry.capacityRangeLabel ? ` | ${entry.capacityRangeLabel}` : '';
  const recommendation = entry.isRecommended ? ' — Suggested' : entry.isTooSmall ? ' — Manual override' : '';
  return `${formatTransportVehicleDisplay(entry.vehicle, vehicleTypes)}${capacityGuidance}${recommendation}`;
}

export function formatSupplierRateOptionLabel(
  match: SupplierRateMatch,
  suppliers: Supplier[],
  vehicleTypes: VehicleTypeOption[],
  fallbackRoute: RouteOption | null,
  pax: number,
  billableDays = 1,
) {
  const rate = match.rate;
  const supplier = getSupplierDisplay(rate, suppliers);
  const vehicle = {
    name: rate.vehicle?.name || rate.vehicleType,
    vehicleType: rate.vehicleType || rate.vehicle?.vehicleType,
    maxPax: rate.vehicle?.maxPax ?? rate.maxPax,
  };
  const vehicleLabel = formatTransportVehicleDisplay(vehicle, vehicleTypes);
  const route = rate.routeName || rate.route?.name || (fallbackRoute ? formatRoute(fallbackRoute) : 'General / All Routes');
  const pricingMode = getPricingModeForRate(rate);
  const currency = getQuoteTransportRateCurrency(rate);
  const previewCost = getQuoteTransportPersistedCostPreview(rate, pax, billableDays);
  return `${supplier} — ${vehicleLabel} — ${route} — ${pricingMode}: ${formatRateMoney(previewCost, currency)}`;
  return `${supplier} — ${vehicleLabel} — ${route} — ${pricingMode}: ${formatRateMoney(getQuoteTransportPersistedCostPreview(rate, pax, billableDays), rate.currency)}`;
}

export function getRankedVehicles(vehicles: Vehicle[], pax: number): RankedVehicle[] {
  const requestedPax = Math.max(1, Math.floor(pax || 1));
  const fittingVehicles = vehicles.filter((vehicle) => vehicle.maxPax >= requestedPax);
  const recommendedCapacity = fittingVehicles.reduce<number | null>(
    (smallest, vehicle) => (smallest === null || vehicle.maxPax < smallest ? vehicle.maxPax : smallest),
    null,
  );

  return vehicles
    .map((vehicle) => {
      const capacityRange = getJordanVehicleCapacityRange(`${vehicle.vehicleType || ''} ${vehicle.name || ''}`, vehicle.maxPax);
      const isTooSmall = vehicle.maxPax < requestedPax;
      const standardCapacityMatch = Boolean(capacityRange && requestedPax >= capacityRange.minPax && requestedPax <= capacityRange.maxPax);
      const isRecommended = standardCapacityMatch || (recommendedCapacity !== null && vehicle.maxPax === recommendedCapacity);
      return {
        vehicle,
        group: isRecommended ? 'Recommended' : isTooSmall ? 'Too small' : 'Available',
        isRecommended,
        isTooSmall,
        capacityRangeLabel: capacityRange ? `${capacityRange.label} ${capacityRange.minPax}-${capacityRange.maxPax} pax` : null,
        standardCapacityMatch,
      } satisfies RankedVehicle;
    })
    .sort((left, right) => {
      const groupOrder: Record<VehicleRecommendationGroup, number> = {
        Recommended: 0,
        Available: 1,
        'Too small': 2,
      };
      const groupSort = groupOrder[left.group] - groupOrder[right.group];
      if (groupSort !== 0) {
        return groupSort;
      }

      const capacitySort = left.vehicle.maxPax - right.vehicle.maxPax;
      return capacitySort || left.vehicle.name.localeCompare(right.vehicle.name);
    });
}

function normalizeSupplierRateRows(payload: unknown): VehicleRate[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => {
      if (entry && typeof entry === 'object' && Array.isArray((entry as { rates?: unknown }).rates)) {
        return normalizeSupplierRateRows((entry as { rates: unknown }).rates);
      }

      return [entry as VehicleRate];
    });
  }

  if (payload && typeof payload === 'object') {
    const record = payload as {
      supplierRateCards?: unknown;
      vehicleRates?: unknown;
      rateLines?: unknown;
      transportRates?: unknown;
      data?: unknown;
      items?: unknown;
    };

    return normalizeSupplierRateRows(
      record.supplierRateCards ?? record.vehicleRates ?? record.rateLines ?? record.transportRates ?? record.data ?? record.items ?? [],
    );
  }

  return [];
}

function getTouringRouteSupplierRateRows(routes: RouteOption[]): VehicleRate[] {
  return routes.flatMap((route) =>
    (route.touringRoutePricings || [])
      .filter((pricing) => pricing.active !== false)
      .map((pricing) => ({
        id: pricing.id,
        vehicleId: pricing.vehicleId || null,
        routeId: route.id,
        touringRouteId: route.id,
        touringRoutePricingId: pricing.id,
        routeName: formatRoute(route),
        minPax: pricing.minPax ?? null,
        maxPax: pricing.maxPax ?? null,
        price: Number(pricing.baseCost || 0),
        currency: pricing.currency || 'USD',
        costCurrency: pricing.currency || 'USD',
        active: pricing.active !== false,
        validFrom: '',
        validTo: '',
        supplierId: pricing.supplierId || pricing.supplier?.id || null,
        supplierName: pricing.supplier?.name || null,
        supplier: pricing.supplier ? { id: pricing.supplier.id || undefined, name: pricing.supplier.name || null } : null,
        vehicle: pricing.vehicle
          ? {
              name: pricing.vehicle.name || null,
              vehicleType: pricing.vehicle.vehicleType || null,
              maxPax: pricing.vehicle.maxPax ?? null,
            }
          : null,
        serviceType: pricing.transportServiceType
          ? {
              id: pricing.transportServiceType.id || null,
              name: pricing.transportServiceType.name || 'Daily Full Day',
              code: pricing.transportServiceType.code || 'DAILY_FULL_DAY',
              classification: pricing.transportServiceType.classification || 'FULL_DAY',
            }
          : { id: pricing.transportServiceTypeId || null, name: 'Daily Full Day', code: 'DAILY_FULL_DAY', classification: 'FULL_DAY' },
        pricingMode: pricing.transportServiceType?.name || 'Daily Full Day',
      })),
  );
}

export function QuoteTransportPicker({
  apiBaseUrl,
  quoteId,
  itineraryId,
  routes,
  vehicles: propVehicles,
  supplierRateCards,
  services,
  transportServiceTypes,
  transportDataStatus,
  totalPax,
  quoteCurrency,
  dayNumber,
  onSaved,
}: QuoteTransportPickerProps) {
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [transportMode, setTransportMode] = useState<TransportSelectionMode>('TRANSFER_ROUTE');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedPricingMode, setSelectedPricingMode] = useState<PricingMode | ''>('');
  const [selectedRateId, setSelectedRateId] = useState('');
  const [paxInput, setPaxInput] = useState(String(Math.max(1, totalPax || 1)));
  const [billableDaysInput, setBillableDaysInput] = useState('1');
  const [markupPercent, setMarkupPercent] = useState('30');
  const [isSavingTransport, setIsSavingTransport] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeOption[]>([]);
  const [manualSupplierRateCards, setManualSupplierRateCards] = useState<VehicleRate[]>([]);

  useEffect(() => {
    if (!open || suppliers.length > 0 || isLoading) {
      return;
    }

    let cancelled = false;

    async function loadTransportData() {
      setIsLoading(true);
      setError('');

      try {
        const suppliersResponse = await fetch(`${apiBaseUrl}/suppliers`, { cache: 'no-store' });

        if (!cancelled) {
          setSuppliers(await readJsonResponse<Supplier[]>(suppliersResponse, 'Could not load suppliers.'));
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : 'Could not load transport setup.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTransportData();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, isLoading, open, suppliers.length]);

  useEffect(() => {
    function loadVehicleTypes() {
      setVehicleTypes(readStoredVehicleTypeOptions());
    }

    loadVehicleTypes();
    window.addEventListener('dmc:vehicle-types-changed', loadVehicleTypes);
    window.addEventListener('storage', loadVehicleTypes);

    return () => {
      window.removeEventListener('dmc:vehicle-types-changed', loadVehicleTypes);
      window.removeEventListener('storage', loadVehicleTypes);
    };
  }, []);

  useEffect(() => {
    function loadManualSupplierRateCards() {
      setManualSupplierRateCards(normalizeSupplierRateRows(readManualSupplierRateCards()));
    }

    loadManualSupplierRateCards();
    window.addEventListener(MANUAL_SUPPLIER_RATE_CARDS_CHANGED_EVENT, loadManualSupplierRateCards);
    window.addEventListener('storage', loadManualSupplierRateCards);

    return () => {
      window.removeEventListener(MANUAL_SUPPLIER_RATE_CARDS_CHANGED_EVENT, loadManualSupplierRateCards);
      window.removeEventListener('storage', loadManualSupplierRateCards);
    };
  }, []);

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || null;
  const routeSelectorGroups = useMemo(() => getQuoteTransportRouteSelectorGroups(routes), [routes]);
  const routeTransferOptions = routeSelectorGroups.transferRoutes;
  const touringRouteOptions = routeSelectorGroups.touringRoutes;
  const serviceAreaOptions = routeSelectorGroups.serviceAreas;
  const routeOptionsForMode = getRouteOptionsForTransportMode(routeSelectorGroups, transportMode);
  const allVehicles = useMemo(() => filterCanonicalFleetVehicles(propVehicles.filter(isActiveVehicle), [selectedVehicleId]), [propVehicles, selectedVehicleId]);
  const loadedSupplierRates = useMemo(
    () => [...manualSupplierRateCards, ...normalizeSupplierRateRows(supplierRateCards), ...getTouringRouteSupplierRateRows(routes)],
    [manualSupplierRateCards, routes, supplierRateCards],
  );
  const requestedPax = Math.max(1, Math.floor(Number(paxInput) || totalPax || 1));
  const requestedBillableDays = Math.max(1, Math.floor(Number(billableDaysInput) || 1));
  const rankedVehicles = useMemo(() => getRankedVehicles(allVehicles, requestedPax), [allVehicles, requestedPax]);

  useEffect(() => {
    setPaxInput(String(Math.max(1, totalPax || 1)));
  }, [totalPax]);

  const selectedVehicle = allVehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null;
  const selectedVehicleType = selectedVehicle ? resolveVehicleTypeLabel(selectedVehicle, vehicleTypes) : 'Other';
  const selectedVehicleTypeForMatch = getCanonicalPickerVehicleType(selectedVehicle, vehicleTypes);

  useEffect(() => {
    if (!selectedRoute) {
      setSelectedVehicleId('');
      return;
    }

    const selectedRankedVehicle = rankedVehicles.find((entry) => entry.vehicle.id === selectedVehicleId);

    if (selectedVehicleId && !selectedRankedVehicle) {
      setSelectedVehicleId('');
    }
  }, [rankedVehicles, selectedRoute, selectedVehicleId]);

  function handleRouteChange(routeId: string) {
    setSelectedRouteId(routeId);
    setSelectedVehicleId('');
    setSelectedPricingMode('');
    setSelectedRateId('');
  }

  function handleVehicleChange(vehicleId: string) {
    setSelectedVehicleId(vehicleId);
    setSelectedPricingMode('');
    setSelectedRateId('');
  }

  function handlePricingModeChange(pricingMode: PricingMode | '') {
    setSelectedPricingMode(pricingMode);
    setSelectedRateId('');
    setBillableDaysInput('1');
  }

  function handleTransportModeChange(mode: TransportSelectionMode) {
    setTransportMode(mode);
    setSelectedRouteId('');
    setSelectedVehicleId('');
    setSelectedPricingMode('');
    setSelectedRateId('');
  }

  const supplierRateMatches = useMemo(() => {
    if (!selectedRoute || !selectedVehicle || !selectedPricingMode) {
      return [] as SupplierRateMatch[];
    }
    function rateMatchesVehicleType(rate: VehicleRate) {
      return rateMatchesSelectedVehicleFallback(rate, selectedVehicleTypeForMatch, vehicleTypes, requestedPax);
    }

    function rateMatchesPricingMode(rate: VehicleRate) {
      return getNormalizedPricingModeForRate(rate) === selectedPricingMode;
    }

    const routeCandidateRates = getRouteCandidateRates(loadedSupplierRates, selectedRoute);
    const routeScopedRates = routeCandidateRates.filter(
      (rate) => rateMatchesVehicleType(rate) && rateMatchesPricingMode(rate) && hasNumericRate(rate),
    );

    const rankedMatches = routeScopedRates.map((rate) => {
      const exactRoute = transportRateMatchesSelectedRoute(rate, selectedRoute);
      const exactVehicle = Boolean(rate.vehicleId && selectedVehicle.id && rate.vehicleId === selectedVehicle.id);
      const priority: SupplierRateMatch['priority'] = exactRoute && exactVehicle ? 1 : exactRoute ? 2 : exactVehicle ? 3 : 5;
      return {
        rate,
        priority,
        badge: getMatchBadge(priority),
      };
    });

    return rankedMatches.sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      const supplierSort = getSupplierDisplay(left.rate, suppliers).localeCompare(getSupplierDisplay(right.rate, suppliers));
      if (supplierSort !== 0) {
        return supplierSort;
      }

      return (
        getQuoteTransportPersistedCostPreview(left.rate, requestedPax, requestedBillableDays) -
        getQuoteTransportPersistedCostPreview(right.rate, requestedPax, requestedBillableDays)
      );
    });
  }, [loadedSupplierRates, requestedBillableDays, requestedPax, selectedPricingMode, selectedRoute, selectedVehicle, selectedVehicleTypeForMatch, suppliers, vehicleTypes]);
  const selectedRateMatch = supplierRateMatches.find((match) => match.rate.id === selectedRateId) || null;

  useEffect(() => {
    if (selectedRateId && supplierRateMatches.some((match) => match.rate.id === selectedRateId)) {
      return;
    }

    setSelectedRateId('');
  }, [selectedRateId, supplierRateMatches]);

  const selectedRate = selectedRateMatch?.rate || null;
  const selectedRateHasCost = Boolean(selectedRate && getNormalizedPricingModeForRate(selectedRate) === selectedPricingMode && hasNumericRate(selectedRate));
  const costPrice = selectedRate && selectedRateHasCost ? getQuoteTransportPersistedCostPreview(selectedRate, requestedPax, requestedBillableDays) : 0;
  const markup = Number(markupPercent) || 0;
  const sellingPrice = costPrice + costPrice * (markup / 100);
  const profit = calculateProfit(sellingPrice, costPrice);
  const marginPercent = calculateMarginPercent(sellingPrice, costPrice);
  const pricingCurrency = getQuoteTransportRateCurrency(selectedRate, quoteCurrency);
  const pricingReady = Boolean(selectedRoute && selectedVehicle && selectedPricingMode && selectedRate && selectedRateHasCost);
  const drawerTitle = dayNumber ? `Add Transport - Day ${dayNumber}` : 'Add Transport';
  const debugRate = selectedRate || supplierRateMatches[0]?.rate || null;
  const debugRateVehicleType = debugRate ? getRateVehicleTypeForMatch(debugRate, vehicleTypes) : '';
  const debugSelectedTypeNormalized = normalizeType(selectedVehicleTypeForMatch);
  const debugRateTypeNormalized = normalizeType(debugRateVehicleType);
  const debugTypeMatches = Boolean(debugSelectedTypeNormalized && debugRateTypeNormalized && debugSelectedTypeNormalized === debugRateTypeNormalized);
  const routesLoadFailed = transportDataStatus.routes.status === 'error';
  const vehiclesLoadFailed = transportDataStatus.vehicles.status === 'error';
  const supplierRatesLoadFailed = transportDataStatus.supplierRateCards.status === 'error';
  const transportDataLoadFailed = routesLoadFailed || vehiclesLoadFailed || supplierRatesLoadFailed;
  const routeListIsConfirmedEmpty = !routesLoadFailed && routes.length === 0;
  const vehicleListIsConfirmedEmpty = !vehiclesLoadFailed && allVehicles.length === 0;
  const supplierRateListIsConfirmedEmpty = !supplierRatesLoadFailed && loadedSupplierRates.length === 0;
  const vehicleListForRouteIsEmpty = Boolean(selectedRoute && !vehiclesLoadFailed && rankedVehicles.length === 0);
  const pricingModesForVehicle = useMemo(() => {
    if (!selectedRoute || !selectedVehicle || !selectedVehicleTypeForMatch) {
      return [] as PricingMode[];
    }

    return getAvailableTransportPricingModesForSelection({
      rates: loadedSupplierRates,
      route: selectedRoute,
      selectedCanonicalVehicleType: selectedVehicleTypeForMatch,
      requestedPax,
      vehicleTypes,
    });
  }, [loadedSupplierRates, requestedPax, selectedRoute, selectedVehicle, selectedVehicleTypeForMatch, vehicleTypes]);
  const pricingModesForVehicleIsEmpty = Boolean(selectedRoute && selectedVehicle && !supplierRatesLoadFailed && pricingModesForVehicle.length === 0);
  const noSupplierRateForSelection = Boolean(selectedRoute && selectedVehicle && selectedPricingMode && supplierRateMatches.length === 0 && !supplierRatesLoadFailed);
  const noPricingModesDiagnostics = useMemo(() => {
    if (!pricingModesForVehicleIsEmpty || !selectedRoute) {
      return null;
    }

    return getTransportPricingModeDiagnostics({
      rates: loadedSupplierRates,
      route: selectedRoute,
      selectedVehicleId,
      selectedVehicleName: selectedVehicle?.name || '',
      selectedCanonicalVehicleType: selectedVehicleTypeForMatch,
      requestedPax,
      vehicleTypes,
    });
  }, [loadedSupplierRates, pricingModesForVehicleIsEmpty, requestedPax, selectedRoute, selectedVehicle, selectedVehicleId, selectedVehicleTypeForMatch, vehicleTypes]);

  async function handleAddTransport() {
    if (!selectedRoute || !selectedVehicle || !selectedRate) {
      setError('Select a route, vehicle, pricing mode, and supplier rate card before adding transport.');
      return;
    }

    const service = findSupplierServiceForRate(services, selectedRate, selectedPricingMode);
    const transportServiceTypeId = findTransportServiceTypeIdForRate(selectedRate, transportServiceTypes, selectedPricingMode);
    const isTouringSelection = transportMode === 'TOURING_ROUTE' || isTouringRouteOption(selectedRoute);

    if (!service || !transportServiceTypeId) {
      setError('Could not resolve the selected supplier service and pricing mode for this transport rate.');
      return;
    }

    setIsSavingTransport(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/items`, {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          serviceId: service.id,
          itineraryId,
          quantity: 1,
          paxCount: requestedPax,
          dayCount: usesBillableDaysInput(selectedPricingMode) ? requestedBillableDays : 1,
          markupPercent: markup,
          markupAmount: null,
          sellPrice: null,
          overrideCost: null,
          overrideReason: null,
          useOverride: false,
          transportServiceTypeId,
          vehicleRateId: isTouringSelection ? undefined : selectedRate.id,
          transportVehicleId: selectedVehicle.id,
          routeId: isTouringSelection ? undefined : selectedRoute.id,
          routeName: formatRoute(selectedRoute),
          touringRouteId: isTouringSelection ? selectedRoute.id : undefined,
          touringRoutePricingId: isTouringSelection ? selectedRate.touringRoutePricingId || selectedRate.id : undefined,
          transportAddOns: [],
          currency: pricingCurrency,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save transport item.'));
      }

      const savedItem = await readJsonResponse<unknown>(response, 'Could not read saved transport item.');
      onSaved?.(savedItem);
      window.dispatchEvent(new CustomEvent('dmc:quote-pricing-stale', { detail: { quoteId } }));
      setSelectedRateId('');
      setSelectedPricingMode('');
      setSelectedVehicleId('');
      setSelectedRouteId('');
      setTransportMode('TRANSFER_ROUTE');
      setBillableDaysInput('1');
      setOpen(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save transport item.');
    } finally {
      setIsSavingTransport(false);
    }
  }

  return (
    <div className="section-stack">
      <button type="button" className="quote-service-empty-add" onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span>
        Add Transport
      </button>

      <DrawerPanel
        open={open}
        title={drawerTitle}
        description="Route-based transport using supplier rate cards."
        onClose={() => setOpen(false)}
        closeLabel="Cancel"
        className="quote-service-editor-drawer quote-transport-editor-drawer"
      >
        <div className="quote-service-editor-panel quote-service-editor-panel-drawer quote-transport-editor-panel">
          {error ? <p className="form-error">{error}</p> : null}
          {isLoading ? <p className="detail-copy">Loading transport setup...</p> : null}
          {transportDataLoadFailed ? (
            <p className="form-error">Transport setup data could not load after retry. Refresh the quote to retry.</p>
          ) : null}
          {SHOW_TRANSPORT_PRICING_DIAGNOSTICS ? (
            <details className="quote-transport-diagnostics" aria-label="Transport picker diagnostics">
              <summary>Transport diagnostics</summary>
              <div className="section-stack">
                <p className="form-helper">
                  Debug: {routes.length} routes, {allVehicles.length} vehicles, {loadedSupplierRates.length} supplier rates loaded
                </p>
                <p className="form-helper">
                  Selected vehicle type: {selectedVehicleTypeForMatch || '—'} | Normalized: {debugSelectedTypeNormalized || '—'}<br />
                  Rate vehicle type: {debugRateVehicleType || '—'} | Normalized: {debugRateTypeNormalized || '—'}<br />
                  Match: {debugTypeMatches ? 'YES' : 'NO'}
                </p>
              </div>
            </details>
          ) : null}

          <section className="quote-drawer-section quote-drawer-section-pricing">
            <header className="quote-drawer-section-head">
              <div>
                <p className="eyebrow">Pricing</p>
                <h3>Live transport price</h3>
              </div>
            </header>

            <div className="quote-live-pricing-panel quote-transport-live-pricing-panel">
              <div className="quote-live-pricing-head">
                <div>
                  <p className="eyebrow">Sell</p>
                  <h3>{pricingReady ? formatRoute(selectedRoute) : 'Build transport price'}</h3>
                </div>
                <span className={pricingReady ? 'quote-live-pricing-status quote-live-pricing-status-active' : 'quote-live-pricing-status'}>
                  {pricingReady ? 'Ready' : 'Pending'}
                </span>
              </div>

              <div className={`quote-live-pricing-profit ${getMarginTone(marginPercent)}`}>
                <span>Selling price</span>
                <strong>{formatMoney(sellingPrice, pricingCurrency)}</strong>
                <em>{formatMoney(profit, pricingCurrency)} profit</em>
              </div>

              <div className="quote-live-pricing-list">
                <div className="quote-live-pricing-row">
                  <span>Cost</span>
                  <strong>{formatMoney(costPrice, pricingCurrency)}</strong>
                </div>
                {usesBillableDaysInput(selectedPricingMode) ? (
                  <label className="quote-live-pricing-row quote-transport-markup-row">
                    <span>Billable days</span>
                    <input
                      value={billableDaysInput}
                      onChange={(event) => setBillableDaysInput(event.target.value)}
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                    />
                  </label>
                ) : null}
                <label className="quote-live-pricing-row quote-transport-markup-row">
                  <span>Markup %</span>
                  <input value={markupPercent} onChange={(event) => setMarkupPercent(event.target.value)} type="number" min="0" step="0.01" />
                </label>
                {selectedRate && isMinimumFullDayRate(selectedRate) ? (
                  <p className="form-helper">Supplier minimum 3 full days may apply.</p>
                ) : null}
                <div className="quote-live-pricing-row">
                  <span>Profit</span>
                  <strong>{formatMoney(profit, pricingCurrency)}</strong>
                </div>
                <div className="quote-live-pricing-row">
                  <span>Margin %</span>
                  <strong>{formatMarginPercent(marginPercent)}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="quote-drawer-section quote-drawer-section-details">
            <header className="quote-drawer-section-head">
              <div>
                <p className="eyebrow">Details</p>
                <h3>Route, vehicle type, pricing mode, and supplier</h3>
              </div>
            </header>

            <section className="quote-hotel-step-panel quote-transport-step-panel">
              <div className="quote-hotel-step-head">
                <div>
                  <p className="eyebrow">Transport Mode</p>
                  <h3>Choose operational transport mode</h3>
                  <p className="detail-copy">Use Transfer Route for airport/city movement, Touring Route for JOR-TR operational tours, and Disposal / Stationary for service-area operations.</p>
                </div>
              </div>
              <label>
                Transport mode
                <select value={transportMode} onChange={(event) => handleTransportModeChange(event.target.value as TransportSelectionMode)}>
                  <option value="TRANSFER_ROUTE">Transfer Route</option>
                  <option value="TOURING_ROUTE">Touring Route</option>
                  <option value="DISPOSAL">Disposal / Stationary</option>
                </select>
              </label>
              <label>
                {getTransportModeLabel(transportMode)}
                <select value={selectedRouteId} onChange={(event) => handleRouteChange(event.target.value)} disabled={routeOptionsForMode.length === 0}>
                {routeOptionsForMode.length > 0 ? <option value="">Select {getTransportModeLabel(transportMode)}</option> : null}
                {routesLoadFailed ? <option value="">Routes failed to load</option> : null}
                {routeListIsConfirmedEmpty ? <option value="">No routes available</option> : null}
                {transportMode === 'TRANSFER_ROUTE' && routeTransferOptions.length > 0 ? (
                  <optgroup label="Transfer Routes">
                    {routeTransferOptions.map((route) => (
                      <option key={route.id} value={route.id}>
                        {formatRoute(route)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {transportMode === 'TOURING_ROUTE' && touringRouteOptions.length > 0 ? (
                  <optgroup label="Touring Routes">
                    {touringRouteOptions.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.code ? `${route.code} | ${formatRoute(route)}` : formatRoute(route)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {transportMode === 'DISPOSAL' && serviceAreaOptions.length > 0 ? (
                  <optgroup label="Disposal / Service Areas">
                    {serviceAreaOptions.map((route) => (
                      <option key={route.id} value={route.id}>
                        {formatRouteSelectionLabel(route)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                </select>
              </label>
              {routeSelectorGroups.transferReviewIds.length + routeSelectorGroups.disposalReviewIds.length > 0 ? (
                <p className="form-helper">
                  {routeSelectorGroups.transferReviewIds.length + routeSelectorGroups.disposalReviewIds.length} duplicate transfer route or disposal area entries hidden for
                  cleanup review.
                </p>
              ) : null}
              {routesLoadFailed ? (
                <p className="form-error">{transportDataStatus.routes.message || 'Routes could not load after retry. Refresh this quote to retry.'}</p>
              ) : null}
            </section>

            {!selectedRoute ? <p className="empty-state">Select a {getTransportModeLabel(transportMode).toLowerCase()} to continue</p> : null}

            {selectedRoute ? (
              <section className="quote-hotel-step-panel quote-transport-step-panel">
                <div className="quote-hotel-step-head">
                  <div>
                    <p className="eyebrow">Vehicle Type</p>
                    <h3>Match capacity and type</h3>
                    <p className="detail-copy">Pax highlights matching Jordan capacity bands. Operators can still override when operations require it.</p>
                  </div>
                </div>
              {vehiclesLoadFailed ? (
                <p className="form-error">{transportDataStatus.vehicles.message || 'Vehicles could not load after retry. Refresh this quote to retry.'}</p>
              ) : null}
              {vehicleListIsConfirmedEmpty ? (
                <p className="empty-state">No vehicles found. Add vehicles in Product Catalog {'->'} Transport {'->'} Vehicle Fleet.</p>
              ) : vehicleListForRouteIsEmpty ? (
                <p className="empty-state">No vehicles for route.</p>
              ) : !vehiclesLoadFailed ? (
                <div className="section-stack">
                  <label>
                    Pax
                    <input
                      value={paxInput}
                      onChange={(event) => setPaxInput(event.target.value)}
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    Select vehicle / capacity
                    <select value={selectedVehicleId} onChange={(event) => handleVehicleChange(event.target.value)} disabled={!selectedRoute || vehicleListForRouteIsEmpty}>
                      <option value="">Select vehicle / capacity</option>
                      {rankedVehicles.map((entry) => (
                        <option key={entry.vehicle.id} value={entry.vehicle.id}>
                          {formatVehicleOptionLabel(entry, vehicleTypes)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </section>
            ) : null}

            {selectedRoute && selectedVehicle ? (
              <section className="quote-hotel-step-panel quote-transport-step-panel">
                <div className="quote-hotel-step-head">
                  <div>
                    <p className="eyebrow">Pricing Mode</p>
                    <h3>Select pricing mode</h3>
                  </div>
                </div>
                <select
                  aria-label="Select pricing mode"
                  className="quote-transport-pricing-mode-select"
                  value={selectedPricingMode}
                  onChange={(event) => handlePricingModeChange(event.target.value as PricingMode)}
                  disabled={!selectedRoute || !selectedVehicle}
                >
                  <option value="">{pricingModesForVehicleIsEmpty ? 'No pricing modes available' : 'Select pricing mode'}</option>
                  {pricingModesForVehicle.map((mode) => (
                    <option key={mode} value={mode}>
                      {getTransportPricingModeOptionLabel({
                        mode,
                        rates: loadedSupplierRates,
                        route: selectedRoute,
                        selectedCanonicalVehicleType: selectedVehicleTypeForMatch,
                        requestedPax,
                        vehicleTypes,
                      })}
                    </option>
                  ))}
                </select>
                {pricingModesForVehicleIsEmpty ? (
                  <div className="empty-state">
                    <p>No pricing modes for vehicle.</p>
                    {SHOW_TRANSPORT_PRICING_DIAGNOSTICS && noPricingModesDiagnostics ? (
                      <details className="quote-transport-diagnostics" aria-label="Transport pricing diagnostics">
                        <summary>Transport pricing diagnostics</summary>
                        <div className="section-stack">
                        <p>
                          Route: {noPricingModesDiagnostics.selectedRouteName} / routeId: {noPricingModesDiagnostics.selectedRouteId}
                          <br />
                          Raw selected route:{' '}
                          {noPricingModesDiagnostics.selectedRouteRawLabels.length > 0
                            ? noPricingModesDiagnostics.selectedRouteRawLabels.join(', ')
                            : 'None'}
                          <br />
                          Normalized selected route:{' '}
                          {noPricingModesDiagnostics.selectedRouteNormalizedLabels.length > 0
                            ? noPricingModesDiagnostics.selectedRouteNormalizedLabels.join(', ')
                            : 'None'}
                          <br />
                          Vehicle:{' '}
                          {selectedVehicle
                            ? formatTransportVehicleDisplay(selectedVehicle, vehicleTypes)
                            : noPricingModesDiagnostics.selectedVehicleName || 'Unknown'}{' '}
                          / vehicleId:{' '}
                          {noPricingModesDiagnostics.selectedVehicleId || 'None'}
                          <br />
                          Canonical type: {noPricingModesDiagnostics.selectedCanonicalVehicleType}
                          <br />
                          Vehicle rates loaded: {noPricingModesDiagnostics.vehicleRatesLoaded}
                          <br />
                          Rows for this route: {noPricingModesDiagnostics.routeMatchingRowsCount}
                          <br />
                          Legacy labels for route:{' '}
                          {noPricingModesDiagnostics.legacyVehicleTypes.length > 0
                            ? noPricingModesDiagnostics.legacyVehicleTypes.join(', ')
                            : 'None'}
                          <br />
                          Active/valid rows: {noPricingModesDiagnostics.activeValidRowsCount}
                          <br />
                          Pricing modes found:{' '}
                          {noPricingModesDiagnostics.pricingModesFound.length > 0
                            ? noPricingModesDiagnostics.pricingModesFound.join(', ')
                            : 'None'}
                          <br />
                          Supported normalized modes: {noPricingModesDiagnostics.supportedPricingModes.join(', ')}
                        </p>
                        <div>
                          <strong>Normalized candidate routes:</strong>
                          {noPricingModesDiagnostics.normalizedCandidateRoutes.length > 0 ? (
                            <ul>
                              {noPricingModesDiagnostics.normalizedCandidateRoutes.map((entry) => (
                                <li key={`${entry.normalized}:${entry.raw}`}>
                                  {entry.raw} → {entry.normalized}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>None</p>
                          )}
                        </div>
                        <div>
                          <strong>Rejected:</strong>
                          {noPricingModesDiagnostics.rejectedReasonCounts.length > 0 ? (
                            <ul>
                              {noPricingModesDiagnostics.rejectedReasonCounts.map((entry) => (
                                <li key={entry.reason}>
                                  {entry.count} {entry.reason}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>No rejected rows. Matching rows have no usable pricing mode.</p>
                          )}
                        </div>
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : null}
                <p className="form-helper">{TRANSPORT_PRICING_MODE_HELPER_TEXT}</p>
              </section>
            ) : null}

            {selectedRoute && selectedVehicle && selectedPricingMode ? (
              <section className="quote-hotel-step-panel quote-transport-step-panel">
                <div className="quote-hotel-step-head">
                  <div>
                    <p className="eyebrow">Supplier</p>
                    <h3>Choose supplier</h3>
                    <p className="detail-copy">Cost uses net supplier cost when a contract discount exists.</p>
                    <p className="detail-copy">{SUPPLIER_STANDARDIZATION_HELPER_TEXT}</p>
                  </div>
                </div>
                <div className="section-stack">
                  {supplierRatesLoadFailed ? (
                    <p className="form-error">
                      {transportDataStatus.supplierRateCards.message || 'Supplier rate cards could not load after retry. Refresh this quote to retry.'}
                    </p>
                  ) : null}
                  {supplierRateListIsConfirmedEmpty ? <p className="empty-state">No active supplier rate cards available yet.</p> : null}
                  {noSupplierRateForSelection ? <p className="empty-state">No suppliers for combination.</p> : null}
                  {noSupplierRateForSelection ? <p className="form-error">No rate found.</p> : null}
                  {noSupplierRateForSelection ? (
                    <p className="form-error">No supplier rate found for this route, vehicle type, and pricing mode. Add one in Transport → Supplier Rate Cards.</p>
                  ) : null}
                  <label>
                    Supplier
                    <select
                      value={selectedRateId}
                      onChange={(event) => setSelectedRateId(event.target.value)}
                      disabled={!selectedRoute || !selectedVehicle || !selectedPricingMode || supplierRateMatches.length === 0}
                    >
                      {supplierRateMatches.length > 0 ? <option value="">Select supplier</option> : null}
                      {supplierRateMatches.length === 0 ? <option value="">No supplier rate available</option> : null}
                      {supplierRateMatches.map((match) => (
                        <option key={match.rate.id} value={match.rate.id}>
                          {formatSupplierRateOptionLabel(match, suppliers, vehicleTypes, selectedRoute, requestedPax, requestedBillableDays)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedRate ? (
                    <div className="quote-live-pricing-panel quote-transport-live-pricing-panel">
                      <div className="quote-live-pricing-row">
                        <span>Selected price</span>
                        <strong>{formatMoney(costPrice, pricingCurrency)}</strong>
                      </div>
                      <div className="quote-live-pricing-row">
                        <span>Selling price</span>
                        <strong>{formatMoney(sellingPrice, pricingCurrency)}</strong>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </section>

          <button type="button" className="quote-transport-add-button" onClick={handleAddTransport} disabled={!pricingReady || isSavingTransport}>
            {isSavingTransport ? 'Saving Transport...' : 'Add Transport'}
          </button>
        </div>
      </DrawerPanel>
    </div>
  );
}

