import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { blockDelete, ensureValidNumber, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import {
  CANONICAL_TRANSPORT_PRICING_MODES,
  deriveTransportPricingMode,
  normalizeTransportPricingMode,
  type CanonicalTransportPricingMode,
} from '../common/transport-pricing-mode-normalization';
import { getVehicleTypeCatalogLabels, getVehicleTypeMatchLabels, normalizeVehicleTypeLabel } from '../common/vehicle-type-normalization';
import { PrismaService } from '../prisma/prisma.service';
import { buildRouteNormalizedKey, formatRouteName, normalizeRouteDisplayName, normalizeRouteName, routePairsMatch } from '../routes/route-normalization';
import ExcelJS = require('exceljs');
import * as XLSX from 'xlsx';

type CreateVehicleRateInput = {
  vehicleId: string;
  serviceTypeId: string;
  supplierId?: string | null;
  routeId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  minPax: number;
  maxPax: number;
  price: number;
  currency: string;
  notes?: string | null;
  active?: boolean;
  validFrom: Date;
  validTo: Date;
};

type UpdateVehicleRateInput = {
  vehicleId?: string;
  serviceTypeId?: string;
  supplierId?: string | null;
  routeId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  minPax?: number;
  maxPax?: number;
  price?: number;
  currency?: string;
  notes?: string | null;
  active?: boolean;
  validFrom?: Date;
  validTo?: Date;
};

type VehicleRatePricingSyncData = {
  supplierId: string | null;
  serviceTypeId: string;
  routeId: string | null;
  vehicleId: string;
  minPax?: number;
  maxPax: number;
  price: number;
  currency: string;
  active: boolean;
};

type SupplierRateCardQuery = {
  page?: number;
  limit?: number;
  supplierId?: string;
  routeId?: string;
  serviceCategory?: string;
  vehicleType?: string;
  pricingMode?: string;
  status?: string;
  search?: string;
};

type TransportContractImportMode = 'preview' | 'import';
type TransportContractMergeMode = 'keep' | 'merge';
type TransportServiceClassification =
  | 'ROUTE_TRANSFER'
  | 'TOURING_ROUTE'
  | 'FULL_DAY'
  | 'HALF_DAY'
  | 'DAILY_PACKAGE'
  | 'ADD_ON'
  | 'SERVICE_BASED_TRANSPORT';
type TransportContractImportOptions = {
  contractMergeMode?: TransportContractMergeMode;
  contractNameOverride?: string;
  allowCreateSuppliers?: boolean;
  rowActions?: Record<number, TransportImportRowAction>;
};
type TransportAddOnType = 'DAILY' | 'OVERNIGHT' | 'STATIONARY' | 'WAITING';
type TransportImportResolutionStatus = 'NEW' | 'UPDATED' | 'UNCHANGED' | 'POSSIBLE_DUPLICATE' | 'VALIDITY_OVERLAP';
type TransportImportRowAction = 'UPDATE_EXISTING' | 'SKIP_IMPORTED_ROW' | 'CREATE_NEW_VALIDITY_VERSION' | 'ARCHIVE_OLD_VERSION';

const SUPPLIER_TARIFF_MATRIX_FLEET_COLUMNS = [
  { column: 'Sedan 2', name: 'Sedan 2', maxPax: 2 },
  { column: 'Mini Van 6', name: 'Mini Van 6', maxPax: 6 },
  { column: 'Van 9', name: 'Van 9', maxPax: 9 },
  { column: 'Toyota Coaster / Mini Bus 17', name: 'Toyota Coaster / Mini Bus 17', maxPax: 17 },
  { column: 'Medium Bus 30', name: 'Medium Bus 30', maxPax: 30 },
  { column: 'Large Coach 49', name: 'Large Coach 49', maxPax: 49 },
] as const;

const TRANSFER_TARIFF_MATRIX_COLUMNS = [
  'Route Code',
  'Route Name',
  'From',
  'To',
  'DistanceKm',
  'DurationMinutes',
  'Pricing Mode',
  ...SUPPLIER_TARIFF_MATRIX_FLEET_COLUMNS.map((vehicle) => vehicle.column),
  'Currency',
  'Supplier',
  'Notes',
] as const;

const TOURING_TARIFF_MATRIX_COLUMNS = [
  'Touring Route Code',
  'Touring Route Name',
  'Stops',
  'Overnight',
  'DistanceKm',
  'DurationHours',
  ...SUPPLIER_TARIFF_MATRIX_FLEET_COLUMNS.map((vehicle) => vehicle.column),
  'Currency',
  'Supplier',
  'Notes',
] as const;

type TransportContractImportRow = {
  supplierName: string;
  supplierContactName: string;
  supplierEmail: string;
  supplierPhone: string;
  supplierWebsite: string;
  contractName: string;
  contractValidFrom: string;
  contractValidTo: string;
  country: string;
  serviceCategory: string;
  serviceName: string;
  routeName: string;
  origin: string;
  destination: string;
  vehicleLabel: string;
  vehicleType: string;
  paxFrom: string;
  paxTo: string;
  maxPaxPerUnit: string;
  pricingMode: string;
  cost: string;
  currency: string;
  active: string;
  notes: string;
};

type NormalizedTransportContractImportRow = {
  supplierId?: string;
  supplierName: string;
  supplierContactName: string;
  supplierEmail: string;
  supplierPhone: string;
  supplierWebsite: string;
  contractName: string;
  contractValidFrom: Date;
  contractValidTo: Date;
  country: string;
  serviceCategory: string;
  serviceName: string;
  routeName: string;
  origin: string;
  destination: string;
  vehicleLabel: string;
  vehicleType: string;
  vehicleTypeWarning?: string;
  minPaxPerUnit: number;
  maxPaxPerUnit: number;
  pricingMode: 'PER_GROUP';
  cost: number;
  currency: string;
  active: boolean;
  notes: string;
};

type ParsedTransportImportRow = {
  rowNumber: number;
  normalized: NormalizedTransportContractImportRow;
};

type TransportImportExistingRate = {
  id: string;
  supplierId?: string | null;
  serviceTypeId: string;
  vehicleId: string;
  routeId?: string | null;
  routeName?: string | null;
  minPax: number;
  maxPax: number;
  price: number;
  currency: string;
  active: boolean;
  validFrom: Date | string;
  validTo: Date | string;
  supplier?: { id: string; name: string } | null;
  serviceType?: { id: string; name: string; code?: string | null } | null;
  vehicle?: { id: string; name: string; vehicleType?: string | null; maxPax?: number | null } | null;
  route?: { id: string; name?: string | null } | null;
};

type TransportImportResolution = {
  status: TransportImportResolutionStatus;
  existingRate: TransportImportExistingRate | null;
  changedFields: string[];
  validityComparison: string;
  allowedActions: TransportImportRowAction[];
};

const TRANSPORT_CONTRACT_IMPORT_COLUMNS = [
  'Supplier Name',
  'Rate Card Name',
  'Service Category',
  'Route / Service Area',
  'Vehicle Label',
  'Canonical Vehicle Type',
  'Pax From',
  'Pax To',
  'Pricing Mode',
  'Cost',
  'Currency',
  'Valid From',
  'Valid To',
  'Notes',
] as const;

const TRANSPORT_CONTRACT_IMPORT_FIELD_ALIASES = {
  supplierName: ['Supplier Name', 'Supplier', 'supplierName'],
  contractName: ['Rate Card Name', 'contractName'],
  vehicleLabel: ['Vehicle Label', 'Supplier Vehicle Label', 'vehicleLabel'],
  vehicleType: ['Canonical Vehicle Type', 'Vehicle Type', 'vehicleType'],
  paxFrom: ['Pax From', 'Min Pax', 'minPaxPerUnit'],
  paxTo: ['Pax To', 'Max Pax', 'maxPaxPerUnit'],
  maxPaxPerUnit: ['Pax To', 'Max Pax', 'maxPaxPerUnit'],
  routeName: ['Route', 'Route / Service Area', 'routeName'],
  serviceCategory: ['Service Category', 'serviceCategory', 'classification'],
  serviceName: ['serviceName', 'Pricing Mode'],
  pricingMode: ['Pricing Mode', 'pricing mode', 'Rate Type', 'Service Mode', 'Price Mode', 'pricingMode'],
  currency: ['Currency', 'currency'],
  cost: ['Cost', 'Rate', 'Rate Amount', 'cost'],
  contractValidFrom: ['Valid From', 'contractValidFrom'],
  contractValidTo: ['Valid To', 'contractValidTo'],
  active: ['Status', 'active'],
  supplierContactName: ['supplierContactName'],
  supplierEmail: ['supplierEmail'],
  supplierPhone: ['supplierPhone'],
  supplierWebsite: ['supplierWebsite'],
  country: ['country'],
  origin: ['origin'],
  destination: ['destination'],
  notes: ['notes'],
} satisfies Record<keyof TransportContractImportRow, string[]>;

const LEGACY_TRANSPORT_CONTRACT_IMPORT_COLUMNS = [
  'supplierName',
  'supplierContactName',
  'supplierEmail',
  'supplierPhone',
  'supplierWebsite',
  'contractName',
  'contractValidFrom',
  'contractValidTo',
  'country',
  'serviceName',
  'routeName',
  'origin',
  'destination',
  'vehicleType',
  'maxPaxPerUnit',
  'pricingMode',
  'cost',
  'currency',
  'active',
  'notes',
] as const;

const REQUIRED_TRANSPORT_CONTRACT_IMPORT_COLUMNS = [
  'supplierName',
  'contractValidFrom',
  'contractValidTo',
  'serviceName',
  'routeName',
  'vehicleType',
  'cost',
  'currency',
] as const;

function normalizeImportKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeImportText(value: unknown) {
  return String(value ?? '').trim();
}

function parseAlphaVehicleCapacity(value: string) {
  const numbers = normalizeImportText(value).match(/\d+/g);
  if (!numbers || numbers.length === 0) {
    return null;
  }

  return Number(numbers[numbers.length - 1]);
}

function normalizeImportName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeSupplierName(value?: string | null) {
  return normalizeImportName(String(value || ''));
}

function normalizeSupplierKey(value?: string | null) {
  return normalizeSupplierName(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatImportDate(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeCode(value: string) {
  return normalizeImportName(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'TRANSPORT';
}

function parseImportBoolean(value: string) {
  const normalized = value.trim().toLowerCase();

  return !['false', 'no', 'n', '0', 'inactive'].includes(normalized);
}

function isEmptyImportRow(row: Record<string, unknown>) {
  return (Object.keys(TRANSPORT_CONTRACT_IMPORT_FIELD_ALIASES) as Array<keyof TransportContractImportRow>).every((column) => !normalizeImportText(row[column]));
}

function formatSupplierRateCardStatus(value: boolean | string) {
  if (typeof value === 'boolean') {
    return value ? 'Active' : 'Inactive';
  }

  return parseImportBoolean(value) ? 'Active' : 'Inactive';
}

function splitRouteServiceArea(value: string) {
  const normalized = normalizeImportName(value);
  const parts = normalized.split(/\s*(?:->|→|-)\s*/).filter(Boolean);

  return {
    origin: parts[0] || normalized,
    destination: parts.length > 1 ? parts.slice(1).join(' - ') : normalized,
  };
}

function getServiceCategoryClassification(serviceCategory: string, pricingMode: string): TransportServiceClassification {
  const canonicalPricingMode = normalizeTransportPricingMode(pricingMode);
  const normalized = `${serviceCategory} ${canonicalPricingMode || pricingMode}`.trim().toLowerCase();

  if (normalized.includes('add')) return 'ADD_ON';
  if (canonicalPricingMode === 'Half Day' || normalized.includes('half')) return 'HALF_DAY';
  if (
    canonicalPricingMode === 'Petra Overnight' ||
    canonicalPricingMode === 'Wadi Rum Overnight' ||
    canonicalPricingMode === 'Aqaba Overnight'
  ) return 'ADD_ON';
  if (canonicalPricingMode === 'Daily Full Day' || normalized.includes('full') || normalized.includes('disposal')) return 'FULL_DAY';
  if (normalized.includes('daily')) return 'DAILY_PACKAGE';

  return classifyTransportServiceName(canonicalPricingMode || pricingMode);
}

function hasExplicitTransferRoute(row: Pick<NormalizedTransportContractImportRow, 'routeName' | 'origin' | 'destination'>) {
  const origin = normalizeImportName(row.origin);
  const destination = normalizeImportName(row.destination);
  const routeName = normalizeImportName(row.routeName);

  if (origin && destination && normalizeImportKey(origin) !== normalizeImportKey(destination)) {
    return true;
  }

  return /\s(?:->|â†’)\s|->|â†’/.test(routeName);
}

function isTouringRouteImportRow(row: Pick<NormalizedTransportContractImportRow, 'routeName' | 'serviceName' | 'serviceCategory' | 'notes'>) {
  const category = normalizeImportName(row.serviceCategory).toLowerCase();
  const text = [row.routeName, row.serviceName, row.serviceCategory, row.notes].filter(Boolean).join(' ').toLowerCase();
  const routeName = normalizeImportName(row.routeName);
  const multiStopMarkers = (routeName.match(/(?:->|â†’|\/|&|,|\s-\s)/g) || []).length;
  const scenicStopMarkers = (routeName.match(/(?:\/|&|,)/g) || []).length;

  return (
    /\btouring\s+routes?\b/.test(category) ||
    multiStopMarkers >= 2 ||
    (scenicStopMarkers >= 1 && /\b(tour|touring|circuit)\b/.test(text)) ||
    /\b(touring\s+route|route\s+program|route\s+programme|circuit|classical|biblical|round\s*trip|return\s+tour|multi[-\s]?day|[2-9]\s*day|[2-9]d)\b/.test(text)
  );
}

function isSpecialTariffMatrixRouteText(value: string) {
  const normalized = value.toLowerCase();

  return [
    'extra km',
    'extra kilometer',
    'stationary',
    'per hour',
    'hourly',
    'extra hour',
    'driver overnight',
    'deduct transfer',
    'not part of program',
  ].some((pattern) => normalized.includes(pattern));
}

function isServiceBasedTransportImportRow(row: NormalizedTransportContractImportRow, classification = getServiceCategoryClassification(row.serviceCategory, row.serviceName)) {
  const pricingMode = normalizeTransportPricingMode(row.serviceName);
  const serviceCategory = normalizeImportName(row.serviceCategory).toLowerCase();
  const serviceBasedMode =
    pricingMode === 'Daily Full Day' ||
    pricingMode === 'Half Day' ||
    classification === 'FULL_DAY' ||
    classification === 'HALF_DAY' ||
    classification === 'DAILY_PACKAGE';

  return (serviceCategory.includes('disposal') || serviceBasedMode) && serviceBasedMode && !hasExplicitTransferRoute(row);
}

function buildRouteName(fromPlaceName: string, toPlaceName: string) {
  return `${fromPlaceName.trim()} → ${toPlaceName.trim()}`;
}

function classifyTransportServiceName(serviceName: string): TransportServiceClassification {
  const normalized = serviceName.trim().toLowerCase();

  if (/\b(touring\s+route|circuit|classical|biblical|multi[-\s]?day|[2-9]\s*day|[2-9]d)\b/.test(normalized)) return 'TOURING_ROUTE';
  if (/\b(daily\s*fd|daily\s+full\s+day|daily\s+package)\b/.test(normalized)) return 'DAILY_PACKAGE';
  if (/\b(full\s+day|fd)\b/.test(normalized)) return 'FULL_DAY';
  if (/\b(half\s+day|hd)\b/.test(normalized)) return 'HALF_DAY';
  if (/\b(driver\s+overnight|stationary|waiting|daily\s+charge)\b/.test(normalized)) return 'ADD_ON';
  if (/\b(airport\s+transfer|transfer|pick[-\s]?up|drop[-\s]?off)\b/.test(normalized)) return 'ROUTE_TRANSFER';

  return 'ROUTE_TRANSFER';
}

function detectTransportAddOnType(serviceName: string): TransportAddOnType | null {
  const normalized = serviceName.trim().toLowerCase();

  if (/\b(overnight)\b/.test(normalized)) return 'OVERNIGHT';
  if (/\b(stationary)\b/.test(normalized)) return 'STATIONARY';
  if (/\b(waiting)\b/.test(normalized)) return 'WAITING';
  if (/\b(daily|full\s+day|fd)\b/.test(normalized)) return 'DAILY';

  return null;
}

function formatExportDate(value: Date | string) {
  return formatImportDate(value);
}

function sanitizeExportFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 70) || 'transport_contract'
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTransportExportFileName(supplierName: string, contractName: string, currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase();
  const supplierPart = sanitizeExportFileName(supplierName).slice(0, 40);
  const supplierPattern = new RegExp(`\\b${escapeRegExp(supplierName.trim())}\\b`, 'ig');
  const currencyPattern = new RegExp(`\\b${escapeRegExp(normalizedCurrency)}\\b`, 'ig');
  const contractPart = sanitizeExportFileName(
    contractName
      .replace(supplierPattern, ' ')
      .replace(new RegExp(`\\brates?\\s+in\\s+${escapeRegExp(normalizedCurrency)}\\b`, 'ig'), ' ')
      .replace(new RegExp(`\\bin\\s+${escapeRegExp(normalizedCurrency)}\\b`, 'ig'), ' ')
      .replace(currencyPattern, ' ')
      .replace(/\brates?\b/gi, ' ')
      .replace(/\btransport\s+contract\b/gi, 'Transport')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, 70);

  return `${supplierPart}_${contractPart || 'Transport'}_${sanitizeExportFileName(normalizedCurrency)}.xlsx`;
}

function getExportSupplierName(rate: { supplierId?: string | null; supplier?: { name?: string | null } | null; supplierName?: string | null }) {
  return normalizeSupplierName(rate.supplier?.name || rate.supplierName) || 'Unknown supplier';
}

function getExportRouteCategory(rates: Array<{ serviceType: { classification?: TransportServiceClassification | string | null }; vehicle: { name: string }; routeName: string }>) {
  const classifications = new Set(rates.map((rate) => rate.serviceType.classification || 'ROUTE_TRANSFER'));

  if (classifications.size > 1) {
    return 'Transport contract';
  }

  if (classifications.size === 1 && classifications.has('ADD_ON')) {
    return 'Add-ons';
  }

  if (classifications.has('FULL_DAY') || classifications.has('DAILY_PACKAGE')) {
    return 'Full-day packages';
  }

  const joinedText = rates.map((rate) => `${getRateVehicleType(rate)} ${rate.routeName}`).join(' ').toLowerCase();

  if (joinedText.includes('bus') || joinedText.includes('coach')) {
    return 'Buses';
  }

  return 'Transport';
}

function getExportRateCardKey(rate: {
  supplierId?: string | null;
  supplierName?: string | null;
  supplier?: { name?: string | null } | null;
  serviceType: { classification?: TransportServiceClassification | string | null };
  vehicle: { name: string; vehicleType?: string | null };
  routeName: string;
  currency: string;
  validFrom: Date;
  validTo: Date;
}) {
  return [
    rate.supplierId || normalizeSupplierKey(getExportSupplierName(rate)) || 'unassigned supplier',
    rate.currency,
    formatExportDate(rate.validFrom),
    formatExportDate(rate.validTo),
  ].join('|');
}

function getRateVehicleType(rate: { vehicle?: { name?: string | null; vehicleType?: string | null } | null; vehicleType?: string | null }) {
  return normalizeVehicleTypeLabel(rate.vehicleType || rate.vehicle?.vehicleType) || normalizeVehicleTypeLabel(rate.vehicle?.name) || rate.vehicle?.name || '';
}

function getSupplierRateCardKey(rate: {
  supplierId?: string | null;
  supplier?: { name?: string | null } | null;
  vehicle: { name: string; vehicleType?: string | null };
  route?: { id?: string | null; name?: string | null } | null;
  routeId?: string | null;
  routeName: string;
  currency: string;
  validFrom: Date;
  validTo: Date;
}) {
  const supplierKey = rate.supplierId || normalizeSupplierKey(getExportSupplierName(rate)) || 'unassigned supplier';
  const routeKey = rate.routeId || rate.route?.id || normalizeRouteName(rate.route?.name || rate.routeName) || 'unassigned route';

  return [supplierKey, routeKey, rate.currency, formatExportDate(rate.validFrom), formatExportDate(rate.validTo)].join('|');
}

function getLegacySupplierRateCardKey(rate: {
  supplierId?: string | null;
  supplier?: { name?: string | null } | null;
  vehicle: { name: string; vehicleType?: string | null };
  route?: { id?: string | null; name?: string | null } | null;
  routeId?: string | null;
  routeName: string;
  currency: string;
  validFrom: Date;
  validTo: Date;
}) {
  const supplierKey = rate.supplierId || normalizeSupplierKey(getExportSupplierName(rate)) || 'unassigned supplier';
  const vehicleKey = getRateVehicleType(rate).trim().toLowerCase() || 'unassigned vehicle';
  const routeKey = rate.routeId || rate.route?.id || normalizeRouteName(rate.route?.name || rate.routeName) || 'unassigned route';

  return [supplierKey, vehicleKey, routeKey, rate.currency, formatExportDate(rate.validFrom), formatExportDate(rate.validTo)].join('|');
}

function getCanonicalRateRouteLabel(rate: { route?: { fromPlace?: { name?: string | null } | null; toPlace?: { name?: string | null } | null; name?: string | null } | null; routeName?: string | null }) {
  if (rate.route?.fromPlace?.name && rate.route?.toPlace?.name) {
    return formatRouteName(rate.route.fromPlace.name, rate.route.toPlace.name);
  }

  return normalizeRouteDisplayName(rate.route?.name || rate.routeName || 'General / All Routes', '', '');
}

function normalizeCardSearch(value?: string) {
  return value?.trim().toLowerCase() || '';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getRatePricingMode(rate: { routeName: string; serviceType: { name: string; code?: string | null; classification?: string | null } }) {
  return deriveTransportPricingMode(rate) || 'Point-to-Point';
}

function normalizeSupplierTariffMatrixKey(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeSupplierScopeName(value: string | null | undefined) {
  return normalizeSupplierTariffMatrixKey(value);
}

function supplierMatchesTariffScope(
  supplier: { id?: string | null; name?: string | null },
  selectedSupplierId: string,
  selectedSupplierName: string,
) {
  if (selectedSupplierId) {
    return supplier.id === selectedSupplierId;
  }

  if (selectedSupplierName) {
    return normalizeSupplierScopeName(supplier.name) === selectedSupplierName;
  }

  return true;
}

function buildTariffMatrixSupplierWhere(selectedSupplierId: string, selectedSupplierName: string) {
  return {
    type: 'transport',
    ...(selectedSupplierId ? { id: selectedSupplierId } : {}),
    ...(selectedSupplierName ? { name: { equals: selectedSupplierName, mode: 'insensitive' as const } } : {}),
  };
}

function buildTariffMatrixRateSupplierWhere(selectedSupplierId: string, selectedSupplierName: string) {
  if (selectedSupplierId) {
    return { supplierId: selectedSupplierId };
  }

  if (selectedSupplierName) {
    return { supplier: { is: { name: { equals: selectedSupplierName, mode: 'insensitive' as const } } } };
  }

  return {};
}

function isCanonicalTariffMatrixVehicle(vehicle?: { name?: string | null; maxPax?: number | null } | null) {
  if (!vehicle) {
    return false;
  }

  return SUPPLIER_TARIFF_MATRIX_FLEET_COLUMNS.some(
    (canonicalVehicle) =>
      normalizeSupplierTariffMatrixKey(vehicle.name) === normalizeSupplierTariffMatrixKey(canonicalVehicle.name) &&
      Number(vehicle.maxPax || 0) === canonicalVehicle.maxPax,
  );
}

function getTariffMatrixVehicleColumn(vehicle?: { name?: string | null; maxPax?: number | null } | null) {
  if (!isCanonicalTariffMatrixVehicle(vehicle)) {
    return '';
  }

  return (
    SUPPLIER_TARIFF_MATRIX_FLEET_COLUMNS.find(
      (canonicalVehicle) =>
        normalizeSupplierTariffMatrixKey(vehicle?.name) === normalizeSupplierTariffMatrixKey(canonicalVehicle.name) &&
        Number(vehicle?.maxPax || 0) === canonicalVehicle.maxPax,
    )?.column || ''
  );
}

function buildTariffMatrixRouteCode(prefix: string, value: string | null | undefined, fallbackId: string) {
  const normalized = normalizeSupplierTariffMatrixKey(value);
  return `${prefix}-${(normalized || fallbackId.replace(/-/g, '')).slice(0, 12).toUpperCase()}`;
}

function getMostRecentTariffRate<T extends { validFrom?: Date | null; updatedAt?: Date | null; createdAt?: Date | null }>(rates: T[]) {
  return [...rates].sort((left, right) => {
    const leftTime = new Date(left.validFrom || left.updatedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.validFrom || right.updatedAt || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  })[0];
}

function collectTariffMatrixNotes(rates: Array<{ notes?: string | null }>) {
  return Array.from(new Set(rates.map((rate) => rate.notes?.trim()).filter(Boolean))).join(' | ');
}

function getTariffMatrixCurrency(rates: Array<{ currency?: string | null }>) {
  return rates.find((rate) => rate.currency?.trim())?.currency || 'USD';
}

function configureTariffMatrixWorksheet(worksheet: XLSX.WorkSheet, columns: readonly string[], protectedColumnCount: number) {
  worksheet['!cols'] = columns.map((column, index) => ({
    wch: Math.max(String(column).length + 2, index < protectedColumnCount ? 18 : 14),
  }));
  worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }) };
  (worksheet as XLSX.WorkSheet & { '!freeze'?: unknown; '!protect'?: unknown })['!freeze'] = { xSplit: protectedColumnCount, ySplit: 1 };
  (worksheet as XLSX.WorkSheet & { '!protect'?: unknown })['!protect'] = {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    insertRows: false,
    deleteRows: false,
  };
}

function isSupplierTariffMatrixEditableColumn(column: string) {
  return column === 'Notes' || SUPPLIER_TARIFF_MATRIX_FLEET_COLUMNS.some((vehicle) => vehicle.column === column);
}

async function buildSupplierTariffMatrixWorkbookBuffer(sheetName: string, columns: readonly string[], rows: Array<Record<string, string | number>>) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const editableFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F8E8' },
  };
  const systemFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F4F6' },
  };

  worksheet.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: Math.max(String(column).length + 2, isSupplierTariffMatrixEditableColumn(column) ? 16 : 18),
  }));

  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.protection = { locked: false };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF7' },
    };
  });

  for (const row of rows) {
    worksheet.addRow(row);
  }

  for (const columnName of columns) {
    const column = worksheet.getColumn(columnName);
    const editable = isSupplierTariffMatrixEditableColumn(columnName);
    column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }
      cell.protection = { locked: false };
      cell.fill = editable ? editableFill : systemFill;
    });
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

function groupRatesByVehicleType(rates: any[]) {
  const groups = new Map<string, any[]>();

  for (const rate of rates) {
    const vehicleType = getRateVehicleType(rate) || 'Unassigned vehicle';
    groups.set(vehicleType, [...(groups.get(vehicleType) || []), rate]);
  }

  return Array.from(groups.entries()).map(([vehicleType, vehicleRates]) => ({
    vehicleType,
    pricingModes: Array.from(new Set(vehicleRates.map(getRatePricingMode))),
    rateLineCount: vehicleRates.length,
    rates: vehicleRates,
  }));
}

@Injectable()
export class VehicleRatesService {
  private readonly logger = new Logger(VehicleRatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.vehicleRate.findMany({
      include: {
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        toPlace: true,
      },
      orderBy: [
        {
          routeName: 'asc',
        },
        {
          minPax: 'asc',
        },
      ],
    });
  }

  private getRateCardInclude() {
    return {
      vehicle: true,
      serviceType: true,
      route: {
        include: {
          fromPlace: true,
          toPlace: true,
        },
      },
      fromPlace: true,
      supplier: {
        select: {
          id: true,
          name: true,
        },
      },
      toPlace: true,
    };
  }

  async getSummary() {
    const [rateLines, activeRateLines] = await Promise.all([
      this.prisma.vehicleRate.count(),
      this.prisma.vehicleRate.count({ where: { active: true } }),
    ]);

    return {
      rateLines,
      activeRateLines,
    };
  }

  private buildRateCardWhere(query: SupplierRateCardQuery) {
    const where: Record<string, unknown> = {};
    const and: Array<Record<string, unknown>> = [];
    const search = normalizeCardSearch(query.search);

    if (query.supplierId?.trim()) {
      const supplierId = query.supplierId.trim();
      if (!isUuid(supplierId)) {
        throw new BadRequestException('supplierId must be a UUID');
      }
      where.supplierId = supplierId;
    }

    if (query.routeId?.trim()) {
      const routeId = query.routeId.trim();
      if (!isUuid(routeId)) {
        throw new BadRequestException('routeId must be a UUID');
      }
      where.routeId = routeId;
    }

    if (query.vehicleType?.trim()) {
      const vehicleType = normalizeVehicleTypeLabel(query.vehicleType) || query.vehicleType.trim();
      const vehicleTypeLabels = getVehicleTypeMatchLabels(vehicleType);
      and.push({
        OR: [
          { vehicle: { name: { equals: vehicleType, mode: 'insensitive' } } },
          { vehicle: { vehicleType: { equals: vehicleType, mode: 'insensitive' } } },
          ...vehicleTypeLabels.map((label) => ({ vehicle: { name: { equals: label, mode: 'insensitive' } } })),
          ...vehicleTypeLabels.map((label) => ({ vehicle: { vehicleType: { equals: label, mode: 'insensitive' } } })),
        ],
      });
    }

    if (query.serviceCategory?.trim()) {
      const normalizedCategory = query.serviceCategory.trim().toLowerCase();
      const classificationsByCategory: Record<string, TransportServiceClassification[]> = {
        transfers: ['ROUTE_TRANSFER'],
        disposal: ['FULL_DAY', 'HALF_DAY', 'DAILY_PACKAGE'],
        'add-ons': ['ADD_ON'],
        'add ons': ['ADD_ON'],
      };
      const classifications = classificationsByCategory[normalizedCategory] || [];
      if (classifications.length > 0) {
        and.push({
          OR: classifications.map((classification) => ({ serviceType: { classification } })),
        });
      } else {
        and.push({ id: '__service_category_not_recognized__' });
      }
    }

    if (query.status?.trim()) {
      const normalizedStatus = query.status.trim().toLowerCase();
      if (normalizedStatus === 'active') where.active = true;
      if (normalizedStatus === 'inactive') where.active = false;
    }

    if (query.pricingMode?.trim()) {
      const pricingMode = normalizeTransportPricingMode(query.pricingMode);
      if (pricingMode) {
        and.push({
          OR: [
            { serviceType: { name: { equals: pricingMode, mode: 'insensitive' } } },
            { serviceType: { code: { equals: normalizeCode(pricingMode), mode: 'insensitive' } } },
          ],
        });
      } else {
        and.push({ id: '__pricing_mode_not_recognized__' });
      }
    }

    if (search) {
      and.push({
        OR: [
          { routeName: { contains: search, mode: 'insensitive' } },
          { currency: { contains: search, mode: 'insensitive' } },
          { supplier: { name: { contains: search, mode: 'insensitive' } } },
          { vehicle: { name: { contains: search, mode: 'insensitive' } } },
          { serviceType: { name: { contains: search, mode: 'insensitive' } } },
          { route: { name: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    return where;
  }

  private summarizeRateCard(rates: any[]) {
    const first = rates[0];
    const pricingModes = Array.from(new Set(rates.map(getRatePricingMode)));
    const vehicleTypes = Array.from(new Set(rates.map(getRateVehicleType).filter(Boolean)));
    const activeCount = rates.filter((rate) => rate.active).length;
    const keyRatesSummary = pricingModes.reduce<Record<string, number | null>>((summary, mode) => {
      summary[mode] = rates.find((rate) => getRatePricingMode(rate) === mode)?.price ?? null;
      return summary;
    }, {});

    return {
      id: getSupplierRateCardKey(first),
      supplierId: first.supplierId || first.supplier?.id || null,
      supplierName: getExportSupplierName(first),
      name: `${getExportSupplierName(first)} - ${getCanonicalRateRouteLabel(first)} ${new Date(first.validFrom).getFullYear()} Rates in ${first.currency}`,
      category: getExportRouteCategory(rates),
      vehicleType: vehicleTypes.length === 1 ? vehicleTypes[0] : vehicleTypes.length > 1 ? 'Multiple vehicle types' : getRateVehicleType(first),
      vehicleTypes,
      routeOrServiceArea: getCanonicalRateRouteLabel(first),
      routeId: first.routeId || first.route?.id || null,
      currency: first.currency,
      validFrom: formatExportDate(first.validFrom),
      validTo: formatExportDate(first.validTo),
      effectiveFrom: formatExportDate(first.validFrom),
      status: activeCount === rates.length ? 'Active' : activeCount === 0 ? 'Inactive' : 'Mixed',
      availablePricingModes: pricingModes,
      keyRatesSummary,
      rateLineCount: rates.length,
    };
  }

  private groupRateCards(rates: any[]) {
    const groups = new Map<string, any[]>();

    for (const rate of rates) {
      const key = getSupplierRateCardKey(rate);
      groups.set(key, [...(groups.get(key) || []), rate]);
    }

    return Array.from(groups.values())
      .map((groupRates) => this.summarizeRateCard(groupRates))
      .sort((left, right) => {
        const supplierSort = left.supplierName.localeCompare(right.supplierName);
        return supplierSort || left.name.localeCompare(right.name);
      });
  }

  private logRateCardError(operation: string, error: unknown, context: Record<string, unknown>) {
    const prismaError = error as { code?: unknown; meta?: unknown; message?: unknown; name?: unknown };
    const payload = {
      context,
      error: {
        name: prismaError?.name,
        code: prismaError?.code,
        message: prismaError?.message,
        meta: prismaError?.meta,
      },
    };

    console.error(`[VehicleRatesService] ${operation} failed`, payload);
    this.logger.error(`${operation} failed`, JSON.stringify(payload));
  }

  async findRateCards(query: SupplierRateCardQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));

    try {
      const rates = await this.prisma.vehicleRate.findMany({
        where: this.buildRateCardWhere(query),
        include: {
          vehicle: {
            select: {
              id: true,
              name: true,
              vehicleType: true,
              maxPax: true,
            },
          },
          serviceType: true,
          route: {
            include: {
              fromPlace: true,
              toPlace: true,
            },
          },
          fromPlace: true,
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          toPlace: true,
        },
        orderBy: [{ routeName: 'asc' }, { maxPax: 'asc' }],
      });
      const cards = this.groupRateCards(rates);
      const start = (page - 1) * limit;
      const items = cards.slice(start, start + limit);

      return {
        items,
        total: cards.length,
        page,
        limit,
        hasMore: start + items.length < cards.length,
      };
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        this.logRateCardError('findRateCards', error, {
          page,
          limit,
          filters: {
            hasSupplierId: Boolean(query.supplierId?.trim()),
            hasRouteId: Boolean(query.routeId?.trim()),
            hasVehicleType: Boolean(query.vehicleType?.trim()),
            hasPricingMode: Boolean(query.pricingMode?.trim()),
            status: query.status?.trim() || undefined,
            hasSearch: Boolean(query.search?.trim()),
          },
        });
      }
      throw error;
    }
  }

  async findRateCardDetail(cardId: string) {
    if (!cardId?.trim()) {
      throw new BadRequestException('cardId is required');
    }

    const decodedCardId = decodeURIComponent(cardId);

    try {
      const rates = await this.prisma.vehicleRate.findMany({
        include: this.getRateCardInclude(),
        orderBy: [{ routeName: 'asc' }, { maxPax: 'asc' }],
      });
      const cardRates = rates.filter(
        (rate) =>
          getSupplierRateCardKey(rate) === decodedCardId ||
          getLegacySupplierRateCardKey(rate) === decodedCardId ||
          getExportRateCardKey(rate) === decodedCardId,
      );

      if (cardRates.length === 0) {
        throw new BadRequestException('Supplier rate card not found');
      }

      const summary = this.summarizeRateCard(cardRates);

      return {
        ...summary,
        baseRates: {
          airportTransfer: cardRates.find((rate) => getRatePricingMode(rate) === 'Airport Transfer')?.price ?? null,
          pointToPoint: cardRates.find((rate) => getRatePricingMode(rate) === 'Point-to-Point')?.price ?? cardRates[0]?.price ?? null,
          halfDay: cardRates.find((rate) => getRatePricingMode(rate) === 'Half Day')?.price ?? null,
          fullDay: cardRates.find((rate) => getRatePricingMode(rate) === 'Daily Full Day')?.price ?? null,
          stationaryWaitingHourly: cardRates.find((rate) => getRatePricingMode(rate) === 'Stationary / Waiting')?.price ?? null,
        },
        includedLimits: {
          halfDayIncludedHours: null,
          halfDayIncludedKm: null,
          fullDayIncludedHours: null,
          fullDayIncludedKm: null,
        },
        extraCharges: {
          extraHourRate: cardRates.find((rate) => getRatePricingMode(rate) === 'Extra Hour')?.price ?? null,
          extraKmRate: cardRates.find((rate) => getRatePricingMode(rate) === 'Extra KM')?.price ?? null,
          nightSupplement: cardRates.find((rate) => /night/i.test(`${rate.serviceType.name} ${rate.routeName}`))?.price ?? null,
          weekendHolidaySupplement: cardRates.find((rate) => /weekend|holiday/i.test(`${rate.serviceType.name} ${rate.routeName}`))?.price ?? null,
        },
        busCoachSpecific: {
          driverAccommodation: cardRates.find((rate) => /driver accommodation/i.test(`${rate.serviceType.name} ${rate.routeName}`))?.price ?? null,
          driverMealAllowance: cardRates.find((rate) => /driver meal/i.test(`${rate.serviceType.name} ${rate.routeName}`))?.price ?? null,
          parkingFee: cardRates.find((rate) => /parking/i.test(`${rate.serviceType.name} ${rate.routeName}`))?.price ?? null,
          borderPermitFee: cardRates.find((rate) => /border|permit/i.test(`${rate.serviceType.name} ${rate.routeName}`))?.price ?? null,
          guideSeatPolicy: null,
          minimumCharge: cardRates.find((rate) => /minimum/i.test(`${rate.serviceType.name} ${rate.routeName}`))?.price ?? null,
        },
        contractTerms: {
          contractDiscountPercent: 0,
          discountAppliesTo: 'point-to-point',
          grossRate: null,
          netSupplierCost: null,
          discountNotes: '',
        },
        vehicleSections: groupRatesByVehicleType(cardRates),
        rates: cardRates,
      };
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        this.logRateCardError('findRateCardDetail', error, {
          cardIdParts: decodedCardId.split('|').length,
        });
      }
      throw error;
    }
  }

  async findOne(id: string) {
    const vehicleRate = await this.prisma.vehicleRate.findUnique({
      where: { id },
      include: {
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        toPlace: true,
        _count: {
          select: {
            quoteItems: true,
          },
        },
      },
    });

    return throwIfNotFound(vehicleRate, 'Vehicle rate');
  }

  async create(data: CreateVehicleRateInput) {
    if (data.minPax > data.maxPax) {
      throw new BadRequestException('minPax cannot be greater than maxPax');
    }

    if (data.validFrom > data.validTo) {
      throw new BadRequestException('validFrom cannot be after validTo');
    }

    const [vehicle, serviceType, route, fromPlace, toPlace, supplier] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: data.vehicleId },
      }),
      this.prisma.transportServiceType.findUnique({
        where: { id: data.serviceTypeId },
      }),
      data.routeId
        ? this.prisma.route.findUnique({
            where: { id: data.routeId },
            include: {
              fromPlace: {
                select: { id: true, name: true },
              },
              toPlace: {
                select: { id: true, name: true },
              },
            },
          })
        : Promise.resolve(null),
      data.fromPlaceId
        ? this.prisma.place.findUnique({
            where: { id: data.fromPlaceId },
          })
        : Promise.resolve(null),
      data.toPlaceId
        ? this.prisma.place.findUnique({
            where: { id: data.toPlaceId },
          })
        : Promise.resolve(null),
      data.supplierId
        ? this.prisma.supplier.findUnique({
            where: { id: data.supplierId },
          })
        : Promise.resolve(null),
    ]);

    if (!vehicle) {
      throw new BadRequestException('Vehicle not found');
    }

    if (!serviceType) {
      throw new BadRequestException('Transport service type not found');
    }

    if (data.supplierId && !supplier) {
      throw new BadRequestException('Supplier not found');
    }

    const canonicalServiceType = await this.resolveCanonicalTransportPricingModeServiceType(serviceType);
    if (!canonicalServiceType) {
      throw new BadRequestException('Pricing mode not recognized');
    }

    const routeData = this.resolveRouteFields(
      {
        routeId: data.routeId,
        fromPlaceId: data.fromPlaceId,
        toPlaceId: data.toPlaceId,
        routeName: data.routeName,
      },
      route,
      fromPlace,
      toPlace,
    );
    await this.findOrCreateQuoteTransportSupplierService({
      supplierId: data.supplierId ?? null,
      serviceName: canonicalServiceType.name,
      price: data.price,
      currency: data.currency,
    });

    const vehicleRate = await this.prisma.vehicleRate.create({
      data: {
        vehicleId: data.vehicleId,
        serviceTypeId: canonicalServiceType.id,
        supplierId: data.supplierId ?? null,
        routeId: routeData.routeId,
        fromPlaceId: routeData.fromPlaceId,
        toPlaceId: routeData.toPlaceId,
        routeName: routeData.routeName,
        minPax: data.minPax,
        maxPax: data.maxPax,
        price: ensureValidNumber(data.price, 'price', { min: 0 }),
        currency: data.currency.trim().toUpperCase(),
        notes: data.notes?.trim() || null,
        active: data.active ?? true,
        validFrom: data.validFrom,
        validTo: data.validTo,
      },
      include: {
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        supplier: true,
        toPlace: true,
      },
    });

    await this.syncCapacityPricingRuleForVehicleRate(this.toVehicleRatePricingSyncData(vehicleRate));

    return vehicleRate;
  }

  async duplicate(id: string) {
    const existing = await this.findOne(id);

    return this.create({
      vehicleId: existing.vehicleId,
      serviceTypeId: existing.serviceTypeId,
      supplierId: existing.supplierId,
      routeId: existing.routeId,
      fromPlaceId: existing.fromPlaceId,
      toPlaceId: existing.toPlaceId,
      routeName: existing.routeName,
      minPax: existing.minPax,
      maxPax: existing.maxPax,
      price: existing.price,
      currency: existing.currency,
      notes: existing.notes,
      active: existing.active,
      validFrom: existing.validFrom,
      validTo: existing.validTo,
    });
  }

  async update(id: string, data: UpdateVehicleRateInput) {
    const existing = await this.findOne(id);
    const previousSyncData = this.toVehicleRatePricingSyncData(existing);
    const vehicleId = data.vehicleId ?? existing.vehicleId;
    const serviceTypeId = data.serviceTypeId ?? existing.serviceTypeId;
    const supplierId = data.supplierId === undefined ? existing.supplierId : data.supplierId;
    const routeId = data.routeId === undefined ? existing.routeId : data.routeId;
    const minPax = data.minPax ?? existing.minPax;
    const maxPax = data.maxPax ?? existing.maxPax;
    const validFrom = data.validFrom ?? existing.validFrom;
    const validTo = data.validTo ?? existing.validTo;
    const fromPlaceId = data.fromPlaceId === undefined ? existing.fromPlaceId : data.fromPlaceId;
    const toPlaceId = data.toPlaceId === undefined ? existing.toPlaceId : data.toPlaceId;
    const active = data.active ?? existing.active;

    if (minPax > maxPax) {
      throw new BadRequestException('minPax cannot be greater than maxPax');
    }

    if (validFrom > validTo) {
      throw new BadRequestException('validFrom cannot be after validTo');
    }

    const [vehicle, serviceType, route, fromPlace, toPlace, supplier] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
      }),
      this.prisma.transportServiceType.findUnique({
        where: { id: serviceTypeId },
      }),
      routeId
        ? this.prisma.route.findUnique({
            where: { id: routeId },
            include: {
              fromPlace: {
                select: { id: true, name: true },
              },
              toPlace: {
                select: { id: true, name: true },
              },
            },
          })
        : Promise.resolve(null),
      fromPlaceId
        ? this.prisma.place.findUnique({
            where: { id: fromPlaceId },
          })
        : Promise.resolve(null),
      toPlaceId
        ? this.prisma.place.findUnique({
            where: { id: toPlaceId },
          })
        : Promise.resolve(null),
      supplierId
        ? this.prisma.supplier.findUnique({
            where: { id: supplierId },
          })
        : Promise.resolve(null),
    ]);

    if (!vehicle) {
      throw new BadRequestException('Vehicle not found');
    }

    if (!serviceType) {
      throw new BadRequestException('Transport service type not found');
    }

    if (supplierId && !supplier) {
      throw new BadRequestException('Supplier not found');
    }

    const canonicalServiceType = await this.resolveCanonicalTransportPricingModeServiceType(serviceType);
    if (!canonicalServiceType) {
      throw new BadRequestException('Pricing mode not recognized');
    }

    const routeData = this.resolveRouteFields(
      {
        routeId,
        fromPlaceId,
        toPlaceId,
        routeName: data.routeName ?? existing.routeName,
      },
      route,
      fromPlace,
      toPlace,
    );
    await this.findOrCreateQuoteTransportSupplierService({
      supplierId: supplierId ?? null,
      serviceName: canonicalServiceType.name,
      price: data.price ?? existing.price,
      currency: data.currency ?? existing.currency,
    });

    const vehicleRate = await this.prisma.vehicleRate.update({
      where: { id },
      data: {
        vehicleId,
        serviceTypeId: canonicalServiceType.id,
        supplierId,
        routeId: routeData.routeId,
        fromPlaceId: routeData.fromPlaceId,
        toPlaceId: routeData.toPlaceId,
        routeName: routeData.routeName,
        minPax,
        maxPax,
        price: data.price === undefined ? undefined : ensureValidNumber(data.price, 'price', { min: 0 }),
        currency: data.currency === undefined ? undefined : data.currency.trim().toUpperCase(),
        notes: data.notes === undefined ? undefined : data.notes?.trim() || null,
        active,
        validFrom,
        validTo,
      },
      include: {
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        supplier: true,
        toPlace: true,
      },
    });

    await this.syncCapacityPricingRuleForVehicleRate(this.toVehicleRatePricingSyncData(vehicleRate), previousSyncData);

    return vehicleRate;
  }

  async remove(id: string) {
    const vehicleRate = await this.findOne(id);

    blockDelete('vehicle rate', 'quote items', vehicleRate._count.quoteItems);

    await this.deactivateCapacityPricingRulesForVehicleRate(this.toVehicleRatePricingSyncData(vehicleRate));

    return this.prisma.vehicleRate.delete({
      where: { id },
    });
  }

  async getTransportContractImportTemplate() {
    const [suppliers, vehicles, routes] = await Promise.all([
      this.prisma.supplier.findMany({ where: { type: { equals: 'transport', mode: 'insensitive' } }, orderBy: { name: 'asc' } }),
      this.prisma.vehicle.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.route.findMany({ where: { routeType: 'TRANSFER_ROUTE' }, orderBy: { name: 'asc' } }),
    ]);
    const vehicleTypeLabels = getVehicleTypeCatalogLabels(vehicles.map((vehicle) => (vehicle as any).vehicleType));
    const alphaSupplierName = suppliers.find((supplier) => normalizeSupplierName(supplier.name).includes('alpha'))?.name || 'Alpha Bus and Limo Co';
    const alphaRateCardName = 'Alpha Bus and Limo Co 2026 Rates in USD';
    const rows = [
      {
        'Supplier Name': alphaSupplierName,
        'Rate Card Name': alphaRateCardName,
        'Service Category': 'Transfers',
        'Route / Service Area': routes[0]?.name || 'Aqaba South Border -> Petra',
        'Vehicle Label': 'Large VVIP 29',
        'Canonical Vehicle Type': 'Luxury',
        'Pax From': 1,
        'Pax To': 29,
        'Pricing Mode': 'Point-to-Point',
        Cost: 560,
        Currency: 'USD',
        'Valid From': '2026-01-01',
        'Valid To': '2026-12-31',
        Notes: 'Alpha PDF sample: VVIP 29 mapped to Luxury; use Coach if planner policy prefers bus matching.',
      },
      {
        'Supplier Name': alphaSupplierName,
        'Rate Card Name': alphaRateCardName,
        'Service Category': 'Transfers',
        'Route / Service Area': routes[1]?.name || 'Amman -> Petra',
        'Vehicle Label': 'Large VIP 31-33',
        'Canonical Vehicle Type': 'Coach',
        'Pax From': 1,
        'Pax To': 33,
        'Pricing Mode': 'Point-to-Point',
        Cost: 520,
        Currency: 'USD',
        'Valid From': '2026-01-01',
        'Valid To': '2026-12-31',
        Notes: 'Alpha PDF sample: VIP 31-33 mapped to Coach.',
      },
      {
        'Supplier Name': alphaSupplierName,
        'Rate Card Name': alphaRateCardName,
        'Service Category': 'Disposal',
        'Route / Service Area': routes[2]?.name || 'Amman full day disposal',
        'Vehicle Label': 'Large 49',
        'Canonical Vehicle Type': 'Coach',
        'Pax From': 1,
        'Pax To': 49,
        'Pricing Mode': 'Full Day (200 KM)',
        Cost: 650,
        Currency: 'USD',
        'Valid From': '2026-01-01',
        'Valid To': '2026-12-31',
        Notes: 'Alpha PDF sample: Full Day (200 KM) normalizes to Full Day.',
      },
      {
        'Supplier Name': alphaSupplierName,
        'Rate Card Name': alphaRateCardName,
        'Service Category': 'Transfers',
        'Route / Service Area': routes[3]?.name || 'Petra local service',
        'Vehicle Label': 'Medium 30',
        'Canonical Vehicle Type': 'Coach',
        'Pax From': 1,
        'Pax To': 30,
        'Pricing Mode': 'Half Day (100 KM)',
        Cost: 300,
        Currency: 'USD',
        'Valid From': '2026-01-01',
        'Valid To': '2026-12-31',
        Notes: 'Alpha PDF sample: Half Day (100 KM) normalizes to Half Day.',
      },
      {
        'Supplier Name': alphaSupplierName,
        'Rate Card Name': alphaRateCardName,
        'Service Category': 'Disposal',
        'Route / Service Area': routes[4]?.name || 'Jerash & Ajloun Day Tour',
        'Vehicle Label': 'Small 17',
        'Canonical Vehicle Type': 'Mini Bus',
        'Pax From': 1,
        'Pax To': 17,
        'Pricing Mode': 'Day Tour',
        Cost: 280,
        Currency: 'USD',
        'Valid From': '2026-01-01',
        'Valid To': '2026-12-31',
        Notes: 'Sample: standalone sightseeing day normalizes to Day Tour under Disposal.',
      },
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...TRANSPORT_CONTRACT_IMPORT_COLUMNS] });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transport Rates');
    const dropdownValues = {
      Supplier: suppliers.map((supplier) => supplier.name),
      'Vehicle Label': ['Large VVIP 29', 'Large VIP 31-33', 'Large 49', 'Medium 30', 'Small 17', 'Van VIP 9', 'Van 12', 'Mini Van 5'],
      'Canonical Vehicle Type': vehicleTypeLabels,
      'Route / Service Area': routes.map((route) => route.name),
      'Service Category': ['Transfers', 'Disposal', 'Add-ons'],
      'Pricing Mode': [...CANONICAL_TRANSPORT_PRICING_MODES, 'Full Day (200 KM)', 'Half Day (100 KM)', 'Stationary'],
      Currency: ['USD', 'EUR', 'JOD'],
    };
    const dropdownRowCount = Math.max(...Object.values(dropdownValues).map((values) => values.length), 1);
    const dropdownRows = Array.from({ length: dropdownRowCount }, (_, index) => ({
      'Supplier Name': dropdownValues.Supplier[index] || '',
      'Rate Card Name': '',
      'Service Category': dropdownValues['Service Category'][index] || '',
      'Route / Service Area': dropdownValues['Route / Service Area'][index] || '',
      'Vehicle Label': dropdownValues['Vehicle Label'][index] || '',
      'Canonical Vehicle Type': dropdownValues['Canonical Vehicle Type'][index] || '',
      'Pax From': '',
      'Pax To': '',
      'Pricing Mode': dropdownValues['Pricing Mode'][index] || '',
      Cost: '',
      Currency: dropdownValues.Currency[index] || '',
      'Valid From': '',
      'Valid To': '',
      Notes: '',
    }));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(dropdownRows, { header: [...TRANSPORT_CONTRACT_IMPORT_COLUMNS] }),
      'Dropdown Values',
    );

    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  }

  async exportTransportRateCard(rateCardId: string) {
    if (!rateCardId?.trim()) {
      throw new BadRequestException('rateCardId is required');
    }

    const allRates = await this.prisma.vehicleRate.findMany({
      include: {
        supplier: true,
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        toPlace: true,
      },
      orderBy: [{ routeName: 'asc' }, { maxPax: 'asc' }],
    });
    const decodedRateCardId = decodeURIComponent(rateCardId);
    const rates = allRates.filter(
      (rate) =>
        getExportRateCardKey(rate) === decodedRateCardId ||
        getSupplierRateCardKey(rate) === decodedRateCardId ||
        getLegacySupplierRateCardKey(rate) === decodedRateCardId,
    );

    if (rates.length === 0) {
      throw new BadRequestException('Supplier rate card not found');
    }

    const supplier = rates[0].supplier;
    const supplierName = getExportSupplierName(rates[0]);
    const category = getExportRouteCategory(rates);
    const currency = rates[0].currency;
    const contractValidFrom = formatExportDate(rates[0].validFrom);
    const contractValidTo = formatExportDate(rates[0].validTo);
    const contractName = `${supplierName} - ${category} ${new Date(rates[0].validFrom).getFullYear()} Rates in ${currency}`;
    const notes = supplier?.notes || '';

    const toImportRow = (rate: (typeof rates)[number]) => ({
      Supplier: supplierName,
      'Vehicle Type': getRateVehicleType(rate),
      'Route / Service Area': rate.route?.name || rate.routeName,
      'Service Category': getExportRouteCategory([rate]),
      'Pricing Mode': getRatePricingMode(rate),
      Currency: rate.currency,
      'Rate Amount': rate.price,
      'Valid From': contractValidFrom,
      'Valid To': contractValidTo,
      Status: rate.active ? 'Active' : 'Inactive',
    });
    const importRows = rates.map(toImportRow);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importRows, { header: [...TRANSPORT_CONTRACT_IMPORT_COLUMNS] }), 'Import Compatible');
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { Supplier: supplierName, 'Valid From': contractValidFrom, 'Valid To': contractValidTo, Currency: currency, Notes: notes },
      ]),
      'Contract Summary',
    );

    const rowWithClassification = (row: ReturnType<typeof toImportRow>, rate: (typeof rates)[number]) => ({
      ...row,
      classification: rate.serviceType.classification || 'ROUTE_TRANSFER',
    });
    const routeTransferRows = importRows
      .map((row, index) => rowWithClassification(row, rates[index]))
      .filter((row) => row.classification === 'ROUTE_TRANSFER');
    const fullDayRows = importRows
      .map((row, index) => ({
        ...rowWithClassification(row, rates[index]),
        minimumDays: rates[index].serviceType.classification === 'DAILY_PACKAGE' ? 3 : '',
      }))
      .filter((row) => row.classification === 'FULL_DAY' || row.classification === 'DAILY_PACKAGE');
    const addOnRows = importRows
      .map((row, index) => ({
        ...rowWithClassification(row, rates[index]),
        type: this.getTransportAddOnExportType(row['Pricing Mode'], row['Route / Service Area']),
      }))
      .filter((row) => row.classification === 'ADD_ON');

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(routeTransferRows), 'Route Transfers');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fullDayRows), 'Full Day Packages');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(addOnRows), 'Add-ons');

    return {
      buffer: XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer,
      fileName: buildTransportExportFileName(supplierName, contractName, currency),
    };
  }

  async exportTransferRouteTariffMatrix(filters: { supplierId?: string | null; supplierName?: string | null } = {}) {
    const selectedSupplierId = String(filters.supplierId || '').trim();
    const selectedSupplierNameForQuery = String(filters.supplierName || '').trim();
    const selectedSupplierName = normalizeSupplierScopeName(filters.supplierName);
    const supplierWhere = buildTariffMatrixSupplierWhere(selectedSupplierId, selectedSupplierNameForQuery);
    const rateSupplierWhere = buildTariffMatrixRateSupplierWhere(selectedSupplierId, selectedSupplierNameForQuery);
    const [routes, suppliers, rates] = await Promise.all([
      this.prisma.route.findMany({
        where: {
          isActive: true,
          routeType: 'TRANSFER_ROUTE',
        },
        include: {
          fromPlace: true,
          toPlace: true,
        },
        orderBy: [{ normalizedKey: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.supplier.findMany({
        where: supplierWhere,
        orderBy: { name: 'asc' },
      }),
      this.prisma.vehicleRate.findMany({
        where: {
          active: true,
          routeId: { not: null },
          supplierId: { not: null },
          ...rateSupplierWhere,
          serviceType: { classification: 'ROUTE_TRANSFER' },
        },
        include: {
          supplier: true,
          vehicle: true,
          serviceType: true,
          route: true,
        },
        orderBy: [{ routeName: 'asc' }, { validFrom: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);
    const canonicalRoutes = routes.filter((route) => route.fromPlace?.name && route.toPlace?.name && !isSpecialTariffMatrixRouteText([route.name, route.notes].filter(Boolean).join(' ')));
    const supplierById = new Map(
      suppliers
        .filter((supplier) => supplierMatchesTariffScope(supplier, selectedSupplierId, selectedSupplierName))
        .map((supplier) => [supplier.id, supplier]),
    );

    for (const rate of rates) {
      if (
        rate.supplier &&
        supplierMatchesTariffScope(rate.supplier, selectedSupplierId, selectedSupplierName) &&
        !supplierById.has(rate.supplier.id)
      ) {
        supplierById.set(rate.supplier.id, rate.supplier);
      }
    }

    const orderedSuppliers = [...supplierById.values()].sort((left, right) => left.name.localeCompare(right.name));
    const ratesByRouteSupplier = new Map<string, typeof rates>();

    for (const rate of rates) {
      if (
        !rate.routeId ||
        !rate.supplierId ||
        !supplierById.has(rate.supplierId) ||
        !isCanonicalTariffMatrixVehicle(rate.vehicle)
      ) {
        continue;
      }

      const key = `${rate.routeId}:${rate.supplierId}`;
      ratesByRouteSupplier.set(key, [...(ratesByRouteSupplier.get(key) || []), rate]);
    }

    const rows = canonicalRoutes.flatMap((route) =>
      orderedSuppliers.map((supplier) => {
        const routeSupplierRates = ratesByRouteSupplier.get(`${route.id}:${supplier.id}`) || [];
        const row: Record<string, string | number> = {
          'Route Code': buildTariffMatrixRouteCode('TRF', route.normalizedKey, route.id),
          'Route Name': route.name,
          From: route.fromPlace.name,
          To: route.toPlace.name,
          DistanceKm: route.distanceKm ?? '',
          DurationMinutes: route.durationMinutes ?? '',
          'Pricing Mode': getMostRecentTariffRate(routeSupplierRates)?.serviceType
            ? getRatePricingMode(getMostRecentTariffRate(routeSupplierRates))
            : 'Point-to-Point',
          Currency: getTariffMatrixCurrency(routeSupplierRates),
          Supplier: supplier.name,
          Notes: collectTariffMatrixNotes(routeSupplierRates),
        };

        for (const vehicleColumn of SUPPLIER_TARIFF_MATRIX_FLEET_COLUMNS) {
          const vehicleRates = routeSupplierRates.filter((rate) => getTariffMatrixVehicleColumn(rate.vehicle) === vehicleColumn.column);
          const selectedRate = getMostRecentTariffRate(vehicleRates);
          row[vehicleColumn.column] = selectedRate ? selectedRate.price : '';
        }

        return row;
      }),
    );
    return {
      buffer: await buildSupplierTariffMatrixWorkbookBuffer('Transfer Tariffs', TRANSFER_TARIFF_MATRIX_COLUMNS, rows),
      fileName: 'transfer-route-tariff-matrix.xlsx',
    };
  }

  async exportTouringRouteTariffMatrix(filters: { supplierId?: string | null; supplierName?: string | null } = {}) {
    const selectedSupplierId = String(filters.supplierId || '').trim();
    const selectedSupplierNameForQuery = String(filters.supplierName || '').trim();
    const selectedSupplierName = normalizeSupplierScopeName(filters.supplierName);
    const supplierWhere = buildTariffMatrixSupplierWhere(selectedSupplierId, selectedSupplierNameForQuery);
    const pricingSupplierWhere = buildTariffMatrixRateSupplierWhere(selectedSupplierId, selectedSupplierNameForQuery);
    const [routes, suppliers, pricings] = await Promise.all([
      this.prisma.touringRoute.findMany({
        where: { active: true },
        include: {
          stops: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.supplier.findMany({
        where: supplierWhere,
        orderBy: { name: 'asc' },
      }),
      this.prisma.touringRoutePricing.findMany({
        where: {
          active: true,
          supplierId: { not: null },
          ...pricingSupplierWhere,
          vehicleId: { not: null },
        },
        include: {
          supplier: true,
          vehicle: true,
          touringRoute: true,
        },
        orderBy: [{ validFrom: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);
    const supplierById = new Map(
      suppliers
        .filter((supplier) => supplierMatchesTariffScope(supplier, selectedSupplierId, selectedSupplierName))
        .map((supplier) => [supplier.id, supplier]),
    );

    for (const pricing of pricings) {
      if (
        pricing.supplier &&
        supplierMatchesTariffScope(pricing.supplier, selectedSupplierId, selectedSupplierName) &&
        !supplierById.has(pricing.supplier.id)
      ) {
        supplierById.set(pricing.supplier.id, pricing.supplier);
      }
    }

    const orderedSuppliers = [...supplierById.values()].sort((left, right) => left.name.localeCompare(right.name));
    const pricingsByRouteSupplier = new Map<string, typeof pricings>();

    for (const pricing of pricings) {
      if (!pricing.supplierId || !supplierById.has(pricing.supplierId) || !isCanonicalTariffMatrixVehicle(pricing.vehicle)) {
        continue;
      }

      const key = `${pricing.touringRouteId}:${pricing.supplierId}`;
      pricingsByRouteSupplier.set(key, [...(pricingsByRouteSupplier.get(key) || []), pricing]);
    }

    const rows = routes.flatMap((route) =>
      orderedSuppliers.map((supplier) => {
        const routeSupplierPricings = pricingsByRouteSupplier.get(`${route.id}:${supplier.id}`) || [];
        const row: Record<string, string | number> = {
          'Touring Route Code': route.code,
          'Touring Route Name': route.name,
          Stops: route.stops.map((stop) => stop.location || stop.city).filter(Boolean).join(' > '),
          Overnight: route.overnightRisk || route.durationDays > 1 ? 'Yes' : 'No',
          DistanceKm: route.includedKm ?? route.estimatedDistanceKm ?? '',
          DurationHours: route.includedHours ?? route.estimatedDriveHours ?? '',
          Currency: getTariffMatrixCurrency(routeSupplierPricings),
          Supplier: supplier.name,
          Notes: collectTariffMatrixNotes(routeSupplierPricings),
        };

        for (const vehicleColumn of SUPPLIER_TARIFF_MATRIX_FLEET_COLUMNS) {
          const vehiclePricings = routeSupplierPricings.filter((pricing) => getTariffMatrixVehicleColumn(pricing.vehicle) === vehicleColumn.column);
          const selectedPricing = getMostRecentTariffRate(vehiclePricings);
          row[vehicleColumn.column] = selectedPricing ? selectedPricing.baseCost : '';
        }

        return row;
      }),
    );
    return {
      buffer: await buildSupplierTariffMatrixWorkbookBuffer('Touring Tariffs', TOURING_TARIFF_MATRIX_COLUMNS, rows),
      fileName: 'touring-route-tariff-matrix.xlsx',
    };
  }

  async autoFillTransportAddOns(rateCardId: string) {
    if (!rateCardId?.trim()) {
      throw new BadRequestException('rateCardId is required');
    }

    const allRates = await this.prisma.vehicleRate.findMany({
      include: {
        supplier: true,
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        toPlace: true,
      },
      orderBy: [{ routeName: 'asc' }, { maxPax: 'asc' }],
    });
    const decodedRateCardId = decodeURIComponent(rateCardId);
    const rates = allRates.filter(
      (rate) =>
        getExportRateCardKey(rate) === decodedRateCardId ||
        getSupplierRateCardKey(rate) === decodedRateCardId ||
        getLegacySupplierRateCardKey(rate) === decodedRateCardId,
    );

    if (rates.length === 0) {
      throw new BadRequestException('Supplier rate card not found');
    }

    const summary = {
      dailyCreated: 0,
      overnightCreated: 0,
      stationaryCreated: 0,
      waitingCreated: 0,
      skippedExisting: 0,
    };
    const addOnTypes: TransportAddOnType[] = ['DAILY', 'OVERNIGHT', 'STATIONARY', 'WAITING'];
    const routeVehicles = new Map<string, (typeof rates)[number]>();
    const addOnRowsByType = new Map<TransportAddOnType, (typeof rates)>();

    for (const type of addOnTypes) {
      addOnRowsByType.set(type, rates.filter((rate) => rate.active && detectTransportAddOnType(rate.serviceType.name) === type));
    }

    for (const rate of rates) {
      const addOnType = detectTransportAddOnType(rate.serviceType.name);
      const classification = rate.serviceType.classification || classifyTransportServiceName(rate.serviceType.name);
      if (!addOnType && classification === 'ROUTE_TRANSFER' && rate.active) {
        routeVehicles.set(`${rate.vehicleId}|${rate.maxPax}`, rate);
      }
    }

    const createdRates: Array<(typeof rates)[number]> = [];

    for (const targetRate of routeVehicles.values()) {
      for (const addOnType of addOnTypes) {
        const hasExisting = [...rates, ...createdRates].some(
          (rate) =>
            detectTransportAddOnType(rate.serviceType.name) === addOnType &&
            rate.vehicleId === targetRate.vehicleId &&
            rate.maxPax === targetRate.maxPax,
        );

        if (hasExisting) {
          summary.skippedExisting += 1;
          continue;
        }

        const baseRows = addOnRowsByType.get(addOnType) || [];
        if (baseRows.length === 0) {
          continue;
        }

        const baseRow = [...baseRows].sort(
          (left, right) =>
            Math.abs(left.maxPax - targetRate.maxPax) - Math.abs(right.maxPax - targetRate.maxPax) ||
            left.maxPax - right.maxPax ||
            left.vehicle.name.localeCompare(right.vehicle.name),
        )[0];

        const createdRate = await this.prisma.vehicleRate.create({
          data: {
            supplierId: targetRate.supplierId,
            serviceTypeId: baseRow.serviceTypeId,
            vehicleId: targetRate.vehicleId,
            routeId: baseRow.routeId,
            fromPlaceId: baseRow.fromPlaceId,
            toPlaceId: baseRow.toPlaceId,
            routeName: baseRow.routeName,
            minPax: 1,
            maxPax: targetRate.maxPax,
            price: baseRow.price,
            currency: baseRow.currency,
            active: baseRow.active,
            validFrom: baseRow.validFrom,
            validTo: baseRow.validTo,
          },
          include: {
            supplier: true,
            vehicle: true,
            serviceType: true,
            route: {
              include: {
                fromPlace: true,
                toPlace: true,
              },
            },
            fromPlace: true,
            toPlace: true,
          },
        });

        createdRates.push(createdRate);
        await this.syncCapacityPricingRuleForVehicleRate(this.toVehicleRatePricingSyncData(createdRate));

        if (addOnType === 'DAILY') summary.dailyCreated += 1;
        if (addOnType === 'OVERNIGHT') summary.overnightCreated += 1;
        if (addOnType === 'STATIONARY') summary.stationaryCreated += 1;
        if (addOnType === 'WAITING') summary.waitingCreated += 1;
      }
    }

    return summary;
  }

  async previewTransportContractImport(file: { buffer?: Buffer; path?: string; originalname?: string }, options: TransportContractImportOptions = {}) {
    return this.processTransportContractImport(file, 'preview', options);
  }

  async importTransportContract(file: { buffer?: Buffer; path?: string; originalname?: string }, options: TransportContractImportOptions = {}) {
    return this.processTransportContractImport(file, 'import', options);
  }

  private async processTransportContractImport(
    file: { buffer?: Buffer; path?: string; originalname?: string },
    mode: TransportContractImportMode,
    options: TransportContractImportOptions = {},
  ) {
    const parsedRows = this.parseTransportContractWorkbook(file);
    const summary = {
      mode,
      rows: parsedRows.length,
      createdSuppliers: 0,
      createdRoutes: 0,
      createdServices: 0,
      createdRates: 0,
      updatedRates: 0,
      skippedRows: 0,
      errors: [] as Array<{ row: number; message: string }>,
      previewRows: [] as Array<Record<string, unknown>>,
      routeTransfers: [] as Array<Record<string, unknown>>,
      touringRoutes: [] as Array<Record<string, unknown>>,
      serviceBasedTransport: [] as Array<Record<string, unknown>>,
      fullDay: [] as Array<Record<string, unknown>>,
      halfDay: [] as Array<Record<string, unknown>>,
      dayTour: [] as Array<Record<string, unknown>>,
      addOns: [] as Array<Record<string, unknown>>,
      contractWarnings: [] as Array<{
        supplierName: string;
        currency: string;
        contractValidFrom: string;
        contractValidTo: string;
        contractNames: string[];
        suggestedContractName: string;
        message: string;
      }>,
    };
    const seenRateKeys = new Set<string>();
    const validRows: ParsedTransportImportRow[] = [];
    const vehicleTypeCatalog = await this.getExistingVehicleTypeCatalog();

    for (const parsed of parsedRows) {
      if (parsed.empty) {
        summary.skippedRows += 1;
        continue;
      }

      if ((parsed.row.serviceName || parsed.row.pricingMode) && !normalizeTransportPricingMode(parsed.row.serviceName || parsed.row.pricingMode)) {
        summary.errors.push({ row: parsed.rowNumber, message: 'Pricing mode not recognized' });
        summary.skippedRows += 1;
        continue;
      }

      const errors = this.validateTransportContractImportRow(parsed.row, parsed.rowNumber);
      if (errors.length > 0) {
        summary.errors.push(...errors.map((message) => ({ row: parsed.rowNumber, message })));
        summary.skippedRows += 1;
        continue;
      }

      const normalized = this.normalizeTransportContractImportRow(parsed.row, vehicleTypeCatalog);
      const supplier = await this.findTransportImportSupplierMatch(normalized.supplierName);
      if (!supplier && !options.allowCreateSuppliers) {
        summary.errors.push({ row: parsed.rowNumber, message: 'Supplier not found' });
        summary.skippedRows += 1;
        continue;
      }
      if (supplier) {
        normalized.supplierId = supplier.id;
        normalized.supplierName = supplier.name;
      }
      if (normalized.vehicleTypeWarning && mode === 'import') {
        summary.errors.push({ row: parsed.rowNumber, message: normalized.vehicleTypeWarning });
        summary.skippedRows += 1;
        continue;
      }
      const rateKey = [
        normalizeImportKey(normalized.supplierName),
        normalizeImportKey(normalized.serviceName),
        normalizeImportKey(normalized.country),
        normalizeImportKey(normalized.origin),
        normalizeImportKey(normalized.destination),
        normalizeImportKey(normalized.vehicleLabel || normalized.vehicleType),
        normalized.currency,
        formatImportDate(normalized.contractValidFrom),
        formatImportDate(normalized.contractValidTo),
        normalized.maxPaxPerUnit,
      ].join('|');

      if (seenRateKeys.has(rateKey)) {
        summary.errors.push({ row: parsed.rowNumber, message: 'Duplicate rate row in upload.' });
        summary.skippedRows += 1;
        continue;
      }
      seenRateKeys.add(rateKey);

      validRows.push({ rowNumber: parsed.rowNumber, normalized });
    }

    summary.contractWarnings = this.detectTransportContractNameWarnings(validRows);

    if (options.contractMergeMode === 'merge' && summary.contractWarnings.length > 0) {
      const overrideName = normalizeImportName(options.contractNameOverride || '');
      if (!overrideName) {
        throw new BadRequestException('Choose a contract name before merging imported contract rows.');
      }

      const warningKeys = new Set(summary.contractWarnings.map((warning) => this.getContractPeriodKey(warning)));
      for (const entry of validRows) {
        if (warningKeys.has(this.getContractPeriodKey(entry.normalized))) {
          entry.normalized.contractName = overrideName;
        }
      }
      summary.contractWarnings = [];
    }

    for (const { rowNumber, normalized } of validRows) {
      const baseClassification = getServiceCategoryClassification(normalized.serviceCategory, normalized.serviceName);
      const touringRoute = isTouringRouteImportRow(normalized);
      const serviceBasedTransport = isServiceBasedTransportImportRow(normalized, baseClassification);
      const classification: TransportServiceClassification = touringRoute ? 'TOURING_ROUTE' : serviceBasedTransport ? 'SERVICE_BASED_TRANSPORT' : baseClassification;
      const existingRoute = serviceBasedTransport || touringRoute ? null : await this.findTransportImportRouteMatch(normalized);
      const existingSupplier = normalized.supplierId ? { id: normalized.supplierId, name: normalized.supplierName } : await this.findTransportImportSupplierMatch(normalized.supplierName);
      const existingServiceType = await this.findTransportImportServiceTypeMatch(normalized.serviceName);
      const existingVehicle = existingSupplier ? await this.findTransportImportVehicleMatch(existingSupplier, normalized) : null;
      const importResolution = await this.resolveTransportImportExistingRate({
        supplier: existingSupplier,
        serviceType: existingServiceType,
        vehicle: existingVehicle,
        route: existingRoute,
        normalized,
      });
      const fromPlaceMatch = await this.findTransportImportPlaceMatch(normalized.origin, normalized.country);
      const toPlaceMatch = await this.findTransportImportPlaceMatch(normalized.destination, normalized.country);
      const routeWarnings = serviceBasedTransport
        ? ['Service-based transport row; no transfer route required']
        : touringRoute
          ? ['Touring route row; create/link TouringRoute inventory instead of a fake transfer route']
        : [
            fromPlaceMatch ? null : 'From Place not found',
            toPlaceMatch ? null : 'To Place not found',
            existingRoute ? null : 'Route not found',
          ].filter(Boolean);
      const routeWarning = routeWarnings.join(' | ');
      const previewRow = {
        row: rowNumber,
        supplierName: normalized.supplierName,
        contractName: normalized.contractName,
        contractValidFrom: formatImportDate(normalized.contractValidFrom),
        contractValidTo: formatImportDate(normalized.contractValidTo),
        country: normalized.country,
        serviceCategory: normalized.serviceCategory,
        serviceName: normalized.serviceName,
        classification,
        rateCardGroup: `${normalized.supplierName} | ${normalized.routeName}`,
        vehicleTypeSection: normalized.vehicleType,
        vehicleLabel: normalized.vehicleLabel,
        routeName: normalized.routeName,
        routeId: existingRoute?.id || null,
        fromPlaceId: fromPlaceMatch?.id || null,
        toPlaceId: toPlaceMatch?.id || null,
        routeWarning,
        transportProductType: touringRoute ? 'TOURING_ROUTE' : serviceBasedTransport ? 'SERVICE_BASED' : 'TRANSFER',
        touringRoute,
        serviceBasedTransport,
        vehicleType: normalized.vehicleType,
        vehicleTypeWarning: normalized.vehicleTypeWarning || '',
        minPaxPerUnit: normalized.minPaxPerUnit,
        maxPaxPerUnit: normalized.maxPaxPerUnit,
        pricingMode: 'PER_GROUP',
        cost: normalized.cost,
        currency: normalized.currency,
        active: normalized.active,
        importDecision: importResolution.status,
        existingRate: importResolution.existingRate ? this.formatTransportImportExistingRate(importResolution.existingRate) : null,
        importedRate: this.formatTransportImportImportedRate(normalized),
        changedFields: importResolution.changedFields,
        validityComparison: importResolution.validityComparison,
        allowedActions: importResolution.allowedActions,
      };

      summary.previewRows.push(previewRow);
      const pricingMode = normalizeTransportPricingMode(normalized.serviceName);
      if (touringRoute) {
        summary.touringRoutes.push(previewRow);
      } else if (serviceBasedTransport) {
        summary.serviceBasedTransport.push(previewRow);
        if (baseClassification === 'HALF_DAY') {
          summary.halfDay.push(previewRow);
        } else {
          summary.fullDay.push(previewRow);
        }
      } else if (classification === 'ADD_ON') {
        summary.addOns.push(previewRow);
      } else if (classification === 'HALF_DAY') {
        summary.halfDay.push(previewRow);
      } else if (classification === 'FULL_DAY' || classification === 'DAILY_PACKAGE') {
        summary.fullDay.push(previewRow);
      } else {
        summary.routeTransfers.push(previewRow);
      }

      if (!normalized.active) {
        summary.skippedRows += 1;
        continue;
      }

      if (mode === 'preview') {
        continue;
      }

      if (!existingRoute && !serviceBasedTransport) {
        summary.errors.push({ row: rowNumber, message: touringRoute ? 'Touring route rows must be reviewed as TouringRoute inventory before rate-card import' : 'Route not found' });
        summary.skippedRows += 1;
        continue;
      }

      const supplierResult = await this.findOrCreateTransportImportSupplier(normalized);
      if (supplierResult.created) summary.createdSuppliers += 1;

      const serviceResult = await this.findOrCreateTransportImportService(supplierResult.supplier, normalized);
      if (serviceResult.created) summary.createdServices += 1;

      const serviceType = await this.findOrCreateTransportImportServiceType(normalized.serviceName, normalized.serviceCategory);
      const vehicle = await this.findOrCreateTransportImportVehicle(supplierResult.supplier, normalized);
      const resolvedMaxPaxPerUnit = normalized.maxPaxPerUnit > 1 ? normalized.maxPaxPerUnit : vehicle.maxPax;
      const currentResolution = await this.resolveTransportImportExistingRate({
        supplier: supplierResult.supplier,
        serviceType,
        vehicle,
        route: existingRoute,
        normalized: {
          ...normalized,
          maxPaxPerUnit: resolvedMaxPaxPerUnit,
        },
      });
      const rowAction = this.resolveTransportImportRowAction(rowNumber, currentResolution, options.rowActions);
      if (rowAction === 'SKIP_IMPORTED_ROW') {
        summary.skippedRows += 1;
        continue;
      }
      if (rowAction === 'ARCHIVE_OLD_VERSION' && currentResolution.existingRate) {
        await this.prisma.vehicleRate.update({
          where: { id: currentResolution.existingRate.id },
          data: { active: false },
        });
      }
      if (
        (currentResolution.status === 'UPDATED' && rowAction !== 'UPDATE_EXISTING') ||
        (currentResolution.status === 'VALIDITY_OVERLAP' && !['CREATE_NEW_VALIDITY_VERSION', 'ARCHIVE_OLD_VERSION'].includes(rowAction)) ||
        (currentResolution.status === 'POSSIBLE_DUPLICATE' && !['CREATE_NEW_VALIDITY_VERSION', 'ARCHIVE_OLD_VERSION'].includes(rowAction))
      ) {
        summary.errors.push({
          row: rowNumber,
          message: `Existing transport rate detected (${currentResolution.status}). Choose an operator action before importing this row.`,
        });
        summary.skippedRows += 1;
        continue;
      }
      const rateResult = await this.upsertTransportImportVehicleRate({
        supplierId: supplierResult.supplier.id,
        serviceTypeId: serviceType.id,
        vehicleId: vehicle.id,
        routeId: existingRoute?.id || null,
        fromPlaceId: existingRoute?.fromPlaceId || null,
        toPlaceId: existingRoute?.toPlaceId || null,
        routeName: normalized.routeName,
        minPaxPerUnit: normalized.minPaxPerUnit,
        maxPaxPerUnit: resolvedMaxPaxPerUnit,
        cost: normalized.cost,
        currency: normalized.currency,
        validFrom: normalized.contractValidFrom,
        validTo: normalized.contractValidTo,
        forceCreate: rowAction === 'CREATE_NEW_VALIDITY_VERSION' || rowAction === 'ARCHIVE_OLD_VERSION',
      });
      if (existingRoute) {
        await this.upsertTransportImportCapacityRule({
          supplierId: supplierResult.supplier.id,
          serviceTypeId: serviceType.id,
          vehicleId: vehicle.id,
          routeId: existingRoute.id,
          minPaxPerUnit: normalized.minPaxPerUnit,
          maxPaxPerUnit: resolvedMaxPaxPerUnit,
          cost: normalized.cost,
          currency: normalized.currency,
        });
      }

      if (rateResult.created) {
        summary.createdRates += 1;
      } else {
        summary.updatedRates += 1;
      }
    }

    return summary;
  }

  private detectTransportContractNameWarnings(rows: ParsedTransportImportRow[]) {
    const groups = new Map<string, { sample: NormalizedTransportContractImportRow; contractNames: Map<string, string> }>();

    for (const { normalized } of rows) {
      const key = this.getContractPeriodKey(normalized);
      const group = groups.get(key) || { sample: normalized, contractNames: new Map<string, string>() };
      const contractName = normalizeImportName(normalized.contractName);
      group.contractNames.set(contractName.toLowerCase(), contractName);
      groups.set(key, group);
    }

    return Array.from(groups.values())
      .filter((group) => group.contractNames.size > 1)
      .map((group) => {
        const supplierName = group.sample.supplierName;
        const currency = group.sample.currency;
        const contractValidFrom = formatImportDate(group.sample.contractValidFrom);
        const contractValidTo = formatImportDate(group.sample.contractValidTo);

        return {
          supplierName,
          currency,
          contractValidFrom,
          contractValidTo,
          contractNames: Array.from(group.contractNames.values()).sort((left, right) => left.localeCompare(right)),
          suggestedContractName: this.buildSuggestedTransportContractName(group.sample),
          message: 'Multiple contract names detected for the same supplier and validity period. This will create separate rate cards.',
        };
      });
  }

  private getContractPeriodKey(row: { supplierName: string; currency: string; contractValidFrom: Date | string; contractValidTo: Date | string }) {
    return [
      normalizeImportKey(row.supplierName),
      row.currency.trim().toUpperCase(),
      formatImportDate(row.contractValidFrom),
      formatImportDate(row.contractValidTo),
    ].join('|');
  }

  private buildSuggestedTransportContractName(row: { supplierName: string; currency: string; contractValidFrom: Date | string }) {
    return normalizeImportName(`${row.supplierName} Transport ${new Date(row.contractValidFrom).getFullYear()} ${row.currency.trim().toUpperCase()}`);
  }

  private parseTransportContractWorkbook(file: { buffer?: Buffer; path?: string; originalname?: string }) {
    if (!file?.buffer && !file?.path) {
      throw new BadRequestException('Transport contract Excel file is required');
    }

    const workbook = file.buffer ? XLSX.read(file.buffer, { type: 'buffer', cellDates: true }) : XLSX.readFile(file.path!, { cellDates: true });
    const sheetName = workbook.SheetNames.find((name) => normalizeImportKey(name) === normalizeImportKey('Import Compatible')) || workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('Workbook does not contain any sheets');
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: false, blankrows: false });
    const headerMap = new Map<string, string>();
    for (const sourceHeader of Object.keys(rawRows[0] || {})) {
      headerMap.set(normalizeImportKey(sourceHeader), sourceHeader);
    }

    const missingColumns = REQUIRED_TRANSPORT_CONTRACT_IMPORT_COLUMNS.filter((field) =>
      !TRANSPORT_CONTRACT_IMPORT_FIELD_ALIASES[field].some((header) => headerMap.has(normalizeImportKey(header))),
    );
    if (missingColumns.length > 0) {
      throw new BadRequestException(`Missing import columns: ${missingColumns.join(', ')}`);
    }

    return rawRows.map((rawRow, index) => {
      const row = (Object.keys(TRANSPORT_CONTRACT_IMPORT_FIELD_ALIASES) as Array<keyof TransportContractImportRow>).reduce((accumulator, field) => {
        const sourceHeader = TRANSPORT_CONTRACT_IMPORT_FIELD_ALIASES[field]
          .map((header: string) => headerMap.get(normalizeImportKey(header)))
          .find(Boolean);
        accumulator[field] = normalizeImportText(sourceHeader ? rawRow[sourceHeader] : '');
        return accumulator;
      }, {} as TransportContractImportRow);

      return {
        rowNumber: index + 2,
        row,
        empty: isEmptyImportRow(row),
      };
    });
  }

  private validateTransportContractImportRow(row: TransportContractImportRow, rowNumber: number) {
    const errors: string[] = [];

    for (const column of REQUIRED_TRANSPORT_CONTRACT_IMPORT_COLUMNS) {
      if (!row[column]) {
        errors.push(`${column} is required.`);
      }
    }

    const maxPaxPerUnit = Number(row.maxPaxPerUnit || 1);
    const paxFrom = Number(row.paxFrom || 1);
    const paxTo = Number(row.paxTo || row.maxPaxPerUnit || 1);
    const cost = Number(row.cost);
    const validFrom = new Date(row.contractValidFrom);
    const validTo = new Date(row.contractValidTo);
    const normalizedCategory = normalizeImportName(row.serviceCategory).toLowerCase();
    const normalizedStatus = normalizeImportName(row.active).toLowerCase();

    if (row.maxPaxPerUnit && (!Number.isInteger(maxPaxPerUnit) || maxPaxPerUnit < 1)) {
      errors.push('maxPaxPerUnit must be a positive whole number.');
    }
    if (row.paxFrom && (!Number.isInteger(paxFrom) || paxFrom < 1)) {
      errors.push('paxFrom must be a positive whole number.');
    }
    if (row.paxTo && (!Number.isInteger(paxTo) || paxTo < 1)) {
      errors.push('paxTo must be a positive whole number.');
    }
    if (row.paxFrom && row.paxTo && Number.isInteger(paxFrom) && Number.isInteger(paxTo) && paxFrom > paxTo) {
      errors.push('paxFrom cannot be greater than paxTo.');
    }
    if (row.cost && (!Number.isFinite(cost) || cost < 0)) {
      errors.push('cost must be zero or greater.');
    }
    if (row.contractValidFrom && Number.isNaN(validFrom.getTime())) {
      errors.push('contractValidFrom must be a valid date.');
    }
    if (row.contractValidTo && Number.isNaN(validTo.getTime())) {
      errors.push('contractValidTo must be a valid date.');
    }
    if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validTo.getTime()) && validFrom > validTo) {
      errors.push('contractValidFrom cannot be after contractValidTo.');
    }
    if (row.currency && !['USD', 'EUR', 'JOD'].includes(row.currency.trim().toUpperCase())) {
      errors.push('currency must be one of USD, EUR, or JOD.');
    }
    if (row.serviceCategory && !['transfers', 'disposal', 'add-ons', 'add ons', 'touring routes', 'touring route'].includes(normalizedCategory)) {
      errors.push('serviceCategory must be one of Transfers, Touring Routes, Disposal, or Add-ons.');
    }
    if (row.active && !['active', 'inactive', 'true', 'false', 'yes', 'no', '1', '0'].includes(normalizedStatus)) {
      errors.push('status must be Active or Inactive.');
    }

    return errors.map((error) => `Row ${rowNumber}: ${error}`);
  }

  private normalizeTransportContractImportRow(row: TransportContractImportRow, vehicleTypeCatalog: string[]): NormalizedTransportContractImportRow {
    const routeServiceArea = normalizeImportName(row.routeName);
    const splitRoute = splitRouteServiceArea(routeServiceArea);
    const origin = normalizeImportName(row.origin) || splitRoute.origin;
    const destination = normalizeImportName(row.destination) || splitRoute.destination;
    const serviceCategory = normalizeImportName(row.serviceCategory) || 'Transfers';
    const pricingMode = normalizeTransportPricingMode(row.serviceName || row.pricingMode);
    if (!pricingMode) {
      throw new BadRequestException('Pricing mode not recognized');
    }
    const rawVehicleLabel = normalizeImportName(row.vehicleLabel) || normalizeImportName(row.vehicleType);
    const rawVehicleType = normalizeImportName(row.vehicleType) || rawVehicleLabel;
    const normalizedVehicleType = normalizeVehicleTypeLabel(rawVehicleType, vehicleTypeCatalog) || normalizeVehicleTypeLabel(rawVehicleLabel, vehicleTypeCatalog);
    const vehicleTypeWarning = vehicleTypeCatalog.length > 0 && !normalizedVehicleType ? 'Vehicle type not found' : '';
    const minPaxPerUnit = Number(row.paxFrom || 1);
    const maxPaxPerUnit = Number(row.paxTo || row.maxPaxPerUnit || parseAlphaVehicleCapacity(rawVehicleLabel) || 1);

    return {
      supplierName: normalizeImportName(row.supplierName),
      supplierContactName: normalizeImportName(row.supplierContactName),
      supplierEmail: normalizeImportName(row.supplierEmail),
      supplierPhone: normalizeImportName(row.supplierPhone),
      supplierWebsite: normalizeImportName(row.supplierWebsite),
      contractName:
        normalizeImportName(row.contractName) ||
        normalizeImportName(`${row.supplierName} ${routeServiceArea} ${row.currency} ${row.contractValidFrom}`),
      contractValidFrom: new Date(row.contractValidFrom),
      contractValidTo: new Date(row.contractValidTo),
      country: normalizeImportName(row.country) || 'Jordan',
      serviceName: pricingMode,
      routeName: routeServiceArea || formatRouteName(origin, destination),
      origin,
      destination,
      vehicleLabel: rawVehicleLabel || normalizedVehicleType || rawVehicleType,
      vehicleType: normalizedVehicleType || rawVehicleType,
      vehicleTypeWarning,
      minPaxPerUnit: Number.isFinite(minPaxPerUnit) && minPaxPerUnit > 0 ? minPaxPerUnit : 1,
      maxPaxPerUnit: Number.isFinite(maxPaxPerUnit) && maxPaxPerUnit > 0 ? maxPaxPerUnit : 1,
      pricingMode: 'PER_GROUP' as const,
      cost: Number(row.cost),
      currency: row.currency.trim().toUpperCase(),
      active: parseImportBoolean(row.active),
      notes: normalizeImportName(row.notes),
      serviceCategory,
    };
  }

  private getTransportAddOnExportType(serviceName: string, routeName: string) {
    const normalized = `${serviceName} ${routeName}`.toLowerCase();

    if (normalized.includes('overnight')) return 'overnight';
    if (normalized.includes('stationary')) return 'stationary';
    if (normalized.includes('waiting')) return 'waiting';
    if (normalized.includes('daily charge')) return 'daily charge';

    return 'add-on';
  }

  private async findOrCreateTransportImportSupplier(row: NormalizedTransportContractImportRow) {
    const supplier = await this.findTransportImportSupplierMatch(row.supplierName);

    if (supplier) {
      return { supplier, created: false };
    }

    const notes = [
      row.contractName ? `Contract: ${row.contractName}` : null,
      row.supplierContactName ? `Contact: ${row.supplierContactName}` : null,
      row.supplierWebsite ? `Website: ${row.supplierWebsite}` : null,
      row.notes || null,
    ].filter(Boolean).join('\n');

    return {
      supplier: await this.prisma.supplier.create({
        data: {
          name: normalizeSupplierName(row.supplierName),
          type: 'transport',
          email: row.supplierEmail || null,
          phone: row.supplierPhone || null,
          notes: notes || null,
        },
      }),
      created: true,
    };
  }

  private async findTransportImportSupplierMatch(supplierName: string) {
    const normalizedName = normalizeSupplierName(supplierName);
    const normalizedKey = normalizeSupplierKey(normalizedName);

    if (!normalizedKey) {
      return null;
    }

    if (typeof this.prisma.supplier.findMany === 'function') {
      const suppliers = await this.prisma.supplier.findMany({
        where: {
          type: { equals: 'transport', mode: 'insensitive' },
        },
      });

      return suppliers.find((supplier: { name?: string | null }) => normalizeSupplierKey(supplier.name) === normalizedKey) || null;
    }

    return this.prisma.supplier.findFirst({
      where: {
        name: { equals: normalizedName, mode: 'insensitive' },
      },
    });
  }

  private async findOrCreateTransportImportService(
    supplier: { id: string; name: string },
    row: NormalizedTransportContractImportRow,
  ) {
    const existing = await this.prisma.supplierService.findFirst({
      where: {
        supplierId: supplier.id,
        name: { equals: row.serviceName, mode: 'insensitive' },
      },
    });

    if (existing) {
      return { service: existing, created: false };
    }

    const serviceType = await this.findOrCreateCatalogTransportServiceType();
    return {
      service: await this.prisma.supplierService.create({
        data: {
          supplierId: supplier.id,
          resolvedSupplierId: supplier.id,
          name: row.serviceName,
          category: 'Transport',
          serviceTypeId: serviceType.id,
          unitType: 'per_group',
          baseCost: row.cost,
          currency: row.currency,
          costBaseAmount: row.cost,
          costCurrency: row.currency,
        },
      }),
      created: true,
    };
  }

  private async findOrCreateCatalogTransportServiceType() {
    const existing = await this.prisma.serviceType.findFirst({
      where: {
        OR: [
          { code: { equals: 'TRANSPORT', mode: 'insensitive' } },
          { name: { equals: 'Transport', mode: 'insensitive' } },
        ],
      },
    });

    return existing || this.prisma.serviceType.create({ data: { name: 'Transport', code: 'TRANSPORT', isActive: true } });
  }

  private async findOrCreateQuoteTransportSupplierService(data: {
    supplierId?: string | null;
    serviceName: string;
    price: number;
    currency: string;
  }) {
    if (!data.supplierId) {
      return null;
    }

    const serviceName = normalizeTransportPricingMode(data.serviceName) || data.serviceName.trim();
    if (!serviceName) {
      return null;
    }

    const existing = await this.prisma.supplierService.findFirst({
      where: {
        supplierId: data.supplierId,
        name: { equals: serviceName, mode: 'insensitive' },
      },
    });

    if (existing) {
      return existing;
    }

    const serviceType = await this.findOrCreateCatalogTransportServiceType();
    const currency = data.currency.trim().toUpperCase();
    const cost = ensureValidNumber(data.price, 'price', { min: 0 });

    return this.prisma.supplierService.create({
      data: {
        supplierId: data.supplierId,
        resolvedSupplierId: data.supplierId,
        name: serviceName,
        category: 'Transport',
        serviceTypeId: serviceType.id,
        unitType: 'per_group',
        baseCost: cost,
        currency,
        costBaseAmount: cost,
        costCurrency: currency,
      },
    });
  }

  private async resolveCanonicalTransportPricingModeServiceType(serviceType: { id: string; name: string; code?: string | null }) {
    const pricingMode = normalizeTransportPricingMode(serviceType.name) || normalizeTransportPricingMode(serviceType.code);
    if (!pricingMode) {
      return null;
    }

    const code = normalizeCode(pricingMode);
    const classification = getServiceCategoryClassification('', pricingMode);
    const existing = await this.prisma.transportServiceType.findFirst({
      where: {
        OR: [
          { name: { equals: pricingMode, mode: 'insensitive' } },
          { code: { equals: code, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.transportServiceType.create({ data: { name: pricingMode, code, classification } as any });
  }

  private async findOrCreateTransportImportServiceType(serviceName: string, serviceCategory = '') {
    const code = normalizeCode(serviceName);
    const classification = getServiceCategoryClassification(serviceCategory, serviceName);
    const existing = await this.prisma.transportServiceType.findFirst({
      where: {
        OR: [
          { name: { equals: serviceName, mode: 'insensitive' } },
          { code: { equals: code, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      return this.prisma.transportServiceType.update({
        where: { id: existing.id },
        data: { classification } as any,
      });
    }

    return this.prisma.transportServiceType.create({ data: { name: serviceName, code, classification } as any });
  }

  private async findTransportImportServiceTypeMatch(serviceName: string) {
    const code = normalizeCode(serviceName);
    return this.prisma.transportServiceType.findFirst({
      where: {
        OR: [
          { name: { equals: serviceName, mode: 'insensitive' } },
          { code: { equals: code, mode: 'insensitive' } },
        ],
      },
    });
  }

  private async findTransportImportVehicleMatch(
    supplier: { id: string; name: string },
    row: NormalizedTransportContractImportRow,
  ) {
    return this.prisma.vehicle.findFirst({
      where: {
        name: { equals: row.vehicleLabel || row.vehicleType, mode: 'insensitive' },
        maxPax: row.maxPaxPerUnit,
        OR: [{ supplierId: supplier.id }, { resolvedSupplierId: supplier.id }, { supplierName: { equals: supplier.name, mode: 'insensitive' } }],
      } as any,
    });
  }

  private async findOrCreateTransportImportVehicle(
    supplier: { id: string; name: string },
    row: NormalizedTransportContractImportRow,
  ) {
    const existing = await this.findTransportImportVehicleMatch(supplier, row);

    if (existing) {
      return existing;
    }

    return this.prisma.vehicle.create({
      data: {
        supplierId: supplier.id,
        resolvedSupplierId: supplier.id,
        supplierName: supplier.name,
        name: row.vehicleLabel || row.vehicleType,
        vehicleType: row.vehicleType,
        maxPax: row.maxPaxPerUnit,
        luggageCapacity: 0,
      } as any,
    });
  }

  private async getExistingVehicleTypeCatalog() {
    if (typeof this.prisma.vehicle.findMany !== 'function') {
      return [];
    }

    const vehicles = await this.prisma.vehicle.findMany({
      select: {
        name: true,
        vehicleType: true,
      } as any,
    });

    return getVehicleTypeCatalogLabels(vehicles.flatMap((vehicle: any) => [vehicle.vehicleType, normalizeVehicleTypeLabel(vehicle.name)]));
  }

  private async findOrCreateTransportImportRoute(row: NormalizedTransportContractImportRow) {
    const existingRoute = await this.findTransportImportRouteMatch(row);

    if (existingRoute) {
      return { route: existingRoute, created: false };
    }

    const [fromPlace, toPlace] = await Promise.all([
      this.findOrCreateTransportImportPlace(row.origin, row.country),
      this.findOrCreateTransportImportPlace(row.destination, row.country),
    ]);
    const existingByPlaces = await this.prisma.route.findFirst({
      where: {
        fromPlaceId: fromPlace.id,
        toPlaceId: toPlace.id,
      },
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });

    if (existingByPlaces) {
      return { route: existingByPlaces, created: false };
    }

    const route = await this.prisma.route.create({
      data: {
        fromPlaceId: fromPlace.id,
        toPlaceId: toPlace.id,
        name: formatRouteName(fromPlace.name, toPlace.name),
        normalizedKey: buildRouteNormalizedKey(`${row.country} ${row.origin}`, `${row.country} ${row.destination}`),
        routeType: 'TRANSFER_ROUTE',
        notes: row.notes || null,
        isActive: true,
      },
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });

    return { route, created: true };
  }

  private async findTransportImportRouteMatch(row: NormalizedTransportContractImportRow) {
    const existingByName = await this.prisma.route.findFirst({
      where: {
        name: { equals: row.routeName, mode: 'insensitive' },
      },
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });

    if (existingByName) {
      return existingByName;
    }

    if (typeof this.prisma.route.findMany !== 'function') {
      return null;
    }

    const candidates = await this.prisma.route.findMany({
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });

    const normalizedImportedRouteName = normalizeRouteName(row.routeName);
    const existingByNormalizedName = candidates.find((route) => normalizeRouteName(route.name || '') === normalizedImportedRouteName);
    if (existingByNormalizedName) {
      return existingByNormalizedName;
    }

    return (
      candidates.find((route) =>
        routePairsMatch(
          { fromPlaceName: route.fromPlace.name, toPlaceName: route.toPlace.name },
          { fromPlaceName: row.origin, toPlaceName: row.destination },
        ),
      ) || null
    );
  }

  private async findOrCreateTransportImportPlace(name: string, country: string) {
    const existing = await this.findTransportImportPlaceMatch(name, country);

    return existing || this.prisma.place.create({
      data: {
        name: normalizeImportName(name),
        type: 'Transport hub',
        country: normalizeImportName(country),
        isActive: true,
      },
    });
  }

  private async findTransportImportPlaceMatch(name: string, country: string) {
    const normalizedName = normalizeImportName(name);
    const normalizedCountry = normalizeImportName(country);

    if (!normalizedName) {
      return null;
    }

    return this.prisma.place.findFirst({
      where: {
        name: { equals: normalizedName, mode: 'insensitive' },
        ...(normalizedCountry ? { country: { equals: normalizedCountry, mode: 'insensitive' } } : {}),
      },
    });
  }

  private async upsertTransportImportVehicleRate(data: {
    supplierId: string;
    serviceTypeId: string;
    vehicleId: string;
    routeId: string | null;
    fromPlaceId: string | null;
    toPlaceId: string | null;
    routeName: string;
    minPaxPerUnit: number;
    maxPaxPerUnit: number;
    cost: number;
    currency: string;
    validFrom: Date;
    validTo: Date;
    forceCreate?: boolean;
  }) {
    const existing = data.forceCreate
      ? null
      : await this.prisma.vehicleRate.findFirst({
          where: {
            supplierId: data.supplierId,
            serviceTypeId: data.serviceTypeId,
            routeId: data.routeId,
            ...(data.routeId ? {} : { routeName: data.routeName }),
            vehicleId: data.vehicleId,
            minPax: data.minPaxPerUnit,
            maxPax: data.maxPaxPerUnit,
            currency: data.currency,
            validFrom: data.validFrom,
            validTo: data.validTo,
          },
        });

    if (existing) {
      return {
        rate: await this.prisma.vehicleRate.update({
          where: { id: existing.id },
          data: {
            fromPlaceId: data.fromPlaceId,
            toPlaceId: data.toPlaceId,
            routeName: data.routeName,
            minPax: data.minPaxPerUnit,
            maxPax: data.maxPaxPerUnit,
            price: data.cost,
            currency: data.currency,
            active: true,
            validFrom: data.validFrom,
            validTo: data.validTo,
          },
        }),
        created: false,
      };
    }

    return {
      rate: await this.prisma.vehicleRate.create({
        data: {
          supplierId: data.supplierId,
          serviceTypeId: data.serviceTypeId,
          vehicleId: data.vehicleId,
          routeId: data.routeId,
          fromPlaceId: data.fromPlaceId,
          toPlaceId: data.toPlaceId,
          routeName: data.routeName,
          minPax: data.minPaxPerUnit,
          maxPax: data.maxPaxPerUnit,
          price: data.cost,
          currency: data.currency,
          active: true,
          validFrom: data.validFrom,
          validTo: data.validTo,
        },
      }),
      created: true,
    };
  }

  private async resolveTransportImportExistingRate(input: {
    supplier: { id: string; name?: string | null } | null;
    serviceType: { id: string; name?: string | null; code?: string | null } | null;
    vehicle: { id: string; name?: string | null; vehicleType?: string | null; maxPax?: number | null } | null;
    route: { id: string; name?: string | null } | null;
    normalized: NormalizedTransportContractImportRow;
  }): Promise<TransportImportResolution> {
    if (!input.supplier || !input.serviceType || !input.vehicle) {
      return {
        status: 'NEW',
        existingRate: null,
        changedFields: [],
        validityComparison: 'No matching existing supplier/route/pricing mode/vehicle rate was found.',
        allowedActions: ['CREATE_NEW_VALIDITY_VERSION', 'SKIP_IMPORTED_ROW'],
      };
    }

    const candidates = await this.prisma.vehicleRate.findMany({
      where: {
        supplierId: input.supplier.id,
        serviceTypeId: input.serviceType.id,
        routeId: input.route?.id || null,
        vehicleId: input.vehicle.id,
        currency: input.normalized.currency,
        minPax: input.normalized.minPaxPerUnit,
        maxPax: input.normalized.maxPaxPerUnit,
      } as any,
      include: {
        supplier: true,
        vehicle: true,
        serviceType: true,
        route: true,
      } as any,
    });
    const normalizedCandidates = (candidates || []).filter((candidate: TransportImportExistingRate) =>
      candidate.supplierId === input.supplier?.id &&
      candidate.serviceTypeId === input.serviceType?.id &&
      (input.route
        ? candidate.routeId === input.route.id
        : !candidate.routeId && normalizeRouteName(candidate.routeName || '') === normalizeRouteName(input.normalized.routeName)) &&
      candidate.vehicleId === input.vehicle?.id &&
      String(candidate.currency || '').toUpperCase() === input.normalized.currency &&
      candidate.minPax === input.normalized.minPaxPerUnit &&
      candidate.maxPax === input.normalized.maxPaxPerUnit,
    );
    const exact = normalizedCandidates.find((candidate: TransportImportExistingRate) =>
      this.transportValiditySame(candidate.validFrom, candidate.validTo, input.normalized.contractValidFrom, input.normalized.contractValidTo),
    );
    if (exact) {
      const changedFields = this.getTransportImportChangedFields(exact, input.normalized);
      return {
        status: changedFields.length > 0 ? 'UPDATED' : 'UNCHANGED',
        existingRate: exact,
        changedFields,
        validityComparison: 'Imported validity exactly matches an existing rate.',
        allowedActions: changedFields.length > 0 ? ['UPDATE_EXISTING', 'SKIP_IMPORTED_ROW'] : ['SKIP_IMPORTED_ROW'],
      };
    }

    const overlapping = normalizedCandidates.find((candidate: TransportImportExistingRate) =>
      this.transportValidityOverlaps(candidate.validFrom, candidate.validTo, input.normalized.contractValidFrom, input.normalized.contractValidTo),
    );
    if (overlapping) {
      return {
        status: 'VALIDITY_OVERLAP',
        existingRate: overlapping,
        changedFields: this.getTransportImportChangedFields(overlapping, input.normalized),
        validityComparison: 'Imported validity overlaps an existing rate with the same supplier, route/service area, pricing mode, and vehicle.',
        allowedActions: ['SKIP_IMPORTED_ROW', 'CREATE_NEW_VALIDITY_VERSION', 'ARCHIVE_OLD_VERSION'],
      };
    }

    const possibleDuplicate = normalizedCandidates[0] || null;
    if (possibleDuplicate) {
      return {
        status: 'POSSIBLE_DUPLICATE',
        existingRate: possibleDuplicate,
        changedFields: this.getTransportImportChangedFields(possibleDuplicate, input.normalized),
        validityComparison: 'Same supplier, route/service area, pricing mode, and vehicle exists with a non-overlapping validity period.',
        allowedActions: ['SKIP_IMPORTED_ROW', 'CREATE_NEW_VALIDITY_VERSION'],
      };
    }

    return {
      status: 'NEW',
      existingRate: null,
      changedFields: [],
      validityComparison: 'No matching existing supplier/route/pricing mode/vehicle rate was found.',
      allowedActions: ['CREATE_NEW_VALIDITY_VERSION', 'SKIP_IMPORTED_ROW'],
    };
  }

  private resolveTransportImportRowAction(rowNumber: number, resolution: TransportImportResolution, actions?: Record<number, TransportImportRowAction>) {
    const action = actions?.[rowNumber];
    if (action && resolution.allowedActions.includes(action)) {
      return action;
    }

    if (resolution.status === 'NEW') {
      return 'CREATE_NEW_VALIDITY_VERSION';
    }

    return 'SKIP_IMPORTED_ROW';
  }

  private getTransportImportChangedFields(existing: TransportImportExistingRate, imported: NormalizedTransportContractImportRow) {
    const changed: string[] = [];
    if (Number(existing.price) !== Number(imported.cost)) changed.push('cost');
    if (String(existing.currency || '').toUpperCase() !== imported.currency) changed.push('currency');
    if (Boolean(existing.active) !== Boolean(imported.active)) changed.push('active');
    if (Number(existing.minPax) !== Number(imported.minPaxPerUnit)) changed.push('paxFrom');
    if (Number(existing.maxPax) !== Number(imported.maxPaxPerUnit)) changed.push('paxTo');
    return changed;
  }

  private formatTransportImportExistingRate(rate: TransportImportExistingRate) {
    return {
      id: rate.id,
      supplier: rate.supplier?.name || rate.supplierId || null,
      route: rate.route?.name || rate.routeName || null,
      pricingMode: rate.serviceType?.name || rate.serviceTypeId,
      vehicle: rate.vehicle?.name || rate.vehicleId,
      pax: `${rate.minPax}-${rate.maxPax}`,
      cost: rate.price,
      currency: rate.currency,
      active: rate.active,
      validFrom: formatImportDate(rate.validFrom),
      validTo: formatImportDate(rate.validTo),
    };
  }

  private formatTransportImportImportedRate(row: NormalizedTransportContractImportRow) {
    return {
      supplier: row.supplierName,
      route: row.routeName,
      pricingMode: row.serviceName,
      vehicle: row.vehicleLabel || row.vehicleType,
      pax: `${row.minPaxPerUnit}-${row.maxPaxPerUnit}`,
      cost: row.cost,
      currency: row.currency,
      active: row.active,
      validFrom: formatImportDate(row.contractValidFrom),
      validTo: formatImportDate(row.contractValidTo),
    };
  }

  private transportValiditySame(leftFrom: Date | string, leftTo: Date | string, rightFrom: Date | string, rightTo: Date | string) {
    return formatImportDate(leftFrom) === formatImportDate(rightFrom) && formatImportDate(leftTo) === formatImportDate(rightTo);
  }

  private transportValidityOverlaps(leftFrom: Date | string, leftTo: Date | string, rightFrom: Date | string, rightTo: Date | string) {
    const leftStart = new Date(formatImportDate(leftFrom)).getTime();
    const leftEnd = new Date(formatImportDate(leftTo)).getTime();
    const rightStart = new Date(formatImportDate(rightFrom)).getTime();
    const rightEnd = new Date(formatImportDate(rightTo)).getTime();
    return leftStart <= rightEnd && rightStart <= leftEnd;
  }

  private async upsertTransportImportCapacityRule(data: {
    supplierId: string;
    serviceTypeId: string;
    vehicleId: string;
    routeId: string;
    minPaxPerUnit: number;
    maxPaxPerUnit: number;
    cost: number;
    currency: string;
  }) {
    return this.upsertCapacityPricingRuleForVehicleRate({
      supplierId: data.supplierId,
      serviceTypeId: data.serviceTypeId,
      routeId: data.routeId,
      vehicleId: data.vehicleId,
      minPax: data.minPaxPerUnit,
      maxPax: data.maxPaxPerUnit,
      price: data.cost,
      currency: data.currency,
      active: true,
    });
  }

  private toVehicleRatePricingSyncData(rate: {
    supplierId: string | null;
    serviceTypeId: string;
    routeId: string | null;
    vehicleId: string;
    minPax: number;
    maxPax: number;
    price: number;
    currency: string;
    active?: boolean | null;
  }): VehicleRatePricingSyncData {
    return {
      supplierId: rate.supplierId ?? null,
      serviceTypeId: rate.serviceTypeId,
      routeId: rate.routeId ?? null,
      vehicleId: rate.vehicleId,
      minPax: rate.minPax,
      maxPax: rate.maxPax,
      price: rate.price,
      currency: rate.currency,
      active: rate.active ?? true,
    };
  }

  private vehicleRatePricingKeysMatch(left: VehicleRatePricingSyncData, right: VehicleRatePricingSyncData) {
    return (
      left.supplierId === right.supplierId &&
      left.serviceTypeId === right.serviceTypeId &&
      left.routeId === right.routeId &&
      left.vehicleId === right.vehicleId &&
      left.maxPax === right.maxPax
    );
  }

  private capacityPricingRuleWhere(data: VehicleRatePricingSyncData) {
    if (!data.routeId) {
      return null;
    }

    return {
      supplierId: data.supplierId,
      transportServiceTypeId: data.serviceTypeId,
      routeId: data.routeId,
      vehicleId: data.vehicleId,
      pricingMode: 'capacity_unit' as const,
      unitCapacity: data.maxPax,
    };
  }

  private async findCapacityPricingRulesForVehicleRate(data: VehicleRatePricingSyncData) {
    const where = this.capacityPricingRuleWhere(data);

    if (!where) {
      return [];
    }

    return this.prisma.transportPricingRule.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  private async upsertCapacityPricingRuleForVehicleRate(data: VehicleRatePricingSyncData) {
    const where = this.capacityPricingRuleWhere(data);

    if (!where) {
      return null;
    }

    const routeId = data.routeId;
    if (!routeId) {
      return null;
    }

    const [primaryRule, ...duplicateRules] = await this.findCapacityPricingRulesForVehicleRate(data);
    const ruleData = {
      supplierId: data.supplierId,
      transportServiceTypeId: data.serviceTypeId,
      routeId,
      vehicleId: data.vehicleId,
      pricingMode: 'capacity_unit' as const,
      minPax: data.minPax ?? 1,
      maxPax: 999,
      unitCapacity: data.maxPax,
      baseCost: data.price,
      discountPercent: 0,
      currency: data.currency.trim().toUpperCase(),
      isActive: data.active,
    };

    await Promise.all(
      duplicateRules.map((rule) =>
        this.prisma.transportPricingRule.update({
          where: { id: rule.id },
          data: { isActive: false },
        }),
      ),
    );

    if (primaryRule) {
      return this.prisma.transportPricingRule.update({
        where: { id: primaryRule.id },
        data: ruleData,
      });
    }

    return this.prisma.transportPricingRule.create({ data: ruleData });
  }

  private async deactivateCapacityPricingRulesForVehicleRate(data: VehicleRatePricingSyncData) {
    const rules = await this.findCapacityPricingRulesForVehicleRate(data);

    await Promise.all(
      rules.map((rule) =>
        this.prisma.transportPricingRule.update({
          where: { id: rule.id },
          data: { isActive: false },
        }),
      ),
    );
  }

  private async syncCapacityPricingRuleForVehicleRate(
    vehicleRate: VehicleRatePricingSyncData,
    previous?: VehicleRatePricingSyncData,
  ) {
    if (previous && !this.vehicleRatePricingKeysMatch(previous, vehicleRate)) {
      await this.deactivateCapacityPricingRulesForVehicleRate(previous);
    }

    return this.upsertCapacityPricingRuleForVehicleRate(vehicleRate);
  }

  private resolveRouteFields(
    data: { routeId?: string | null; fromPlaceId?: string | null; toPlaceId?: string | null; routeName?: string },
    route:
      | {
          id: string;
          name: string;
          fromPlaceId: string;
          toPlaceId: string;
          fromPlace: { id: string; name: string };
          toPlace: { id: string; name: string };
        }
      | null,
    fromPlace: { id: string; name: string } | null,
    toPlace: { id: string; name: string } | null,
  ) {
    if (data.routeId) {
      if (!route) {
        throw new BadRequestException('Route not found');
      }

      return {
        routeId: route.id,
        fromPlaceId: route.fromPlaceId,
        toPlaceId: route.toPlaceId,
        routeName: route.name || buildRouteName(route.fromPlace.name, route.toPlace.name),
      };
    }

    const hasFromPlace = Boolean(data.fromPlaceId);
    const hasToPlace = Boolean(data.toPlaceId);

    if (hasFromPlace !== hasToPlace) {
      throw new BadRequestException('fromPlaceId and toPlaceId must be provided together');
    }

    if (hasFromPlace && hasToPlace) {
      if (!fromPlace) {
        throw new BadRequestException('From place not found');
      }

      if (!toPlace) {
        throw new BadRequestException('To place not found');
      }

      return {
        routeId: null,
        fromPlaceId: fromPlace.id,
        toPlaceId: toPlace.id,
        routeName: buildRouteName(fromPlace.name, toPlace.name),
      };
    }

    return {
      routeId: null,
      fromPlaceId: null,
      toPlaceId: null,
      routeName: requireTrimmedString(data.routeName || '', 'routeName'),
    };
  }
}
