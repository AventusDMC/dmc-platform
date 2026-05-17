import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import ExcelJS = require('exceljs');
import * as XLSX from 'xlsx';
import { normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type TouringRouteStopInput = {
  order?: number | null;
  city: string;
  location?: string | null;
  notes?: string | null;
};

type TouringRoutePricingInput = {
  supplierId?: string | null;
  vehicleId?: string | null;
  transportServiceTypeId?: string | null;
  pricingBasis?: 'PER_VEHICLE' | 'PER_DAY' | null;
  minPax?: number | null;
  maxPax?: number | null;
  currency?: string | null;
  baseCost: number;
  costPerDay?: number | null;
  includedKm?: number | null;
  includedHours?: number | null;
  extraKmRate?: number | null;
  extraHourRate?: number | null;
  validFrom?: string | Date | null;
  validTo?: string | Date | null;
  active?: boolean;
  notes?: string | null;
};

type TouringRouteInput = {
  code?: string | null;
  name: string;
  startCity: string;
  durationDays?: number | null;
  routeDescription?: string | null;
  mainDestinations?: string[] | null;
  includedKm?: number | null;
  includedHours?: number | null;
  estimatedDistanceKm?: number | null;
  estimatedDriveHours?: number | null;
  region?: string | null;
  longDistance?: boolean | null;
  desertRoad?: boolean | null;
  mountainRoad?: boolean | null;
  seasonalHeatRisk?: boolean | null;
  sicPossible?: boolean | null;
  overnightRisk?: boolean | null;
  reviewNotes?: string | null;
  active?: boolean;
  stops?: TouringRouteStopInput[];
  pricings?: TouringRoutePricingInput[];
};

type FindTouringRoutesInput = {
  search?: string;
  active?: boolean;
  transportType?: string;
  limit?: number;
};

type TouringWorkbookMode = 'preview' | 'import';
type TouringWorkbookStatus = 'NEW' | 'UPDATED' | 'UNCHANGED' | 'OVERLAP' | 'SKIPPED';
type TouringWorkbookDecompressionError = {
  success: false;
  stage: 'workbook decompression';
  message: 'Unsupported workbook compression format';
  details?: string;
};
type TouringWorkbookIssue = { sheet?: string; row?: number; stage?: string; message: string };

type TouringWorkbookRouteRow = {
  tourCode: string;
  tourName: string;
  startCity: string;
  returnCity: string;
  durationHours: string;
  durationDays: string;
  routeDescription: string;
  mainDestinations: string;
  includedKm: string;
  includedHours: string;
  active: string;
};

type TouringWorkbookStopRow = {
  tourCode: string;
  stopOrder: string;
  city: string;
  stopName: string;
  stopType: string;
  region: string;
  location: string;
  overnight: string;
  notes: string;
};

type TouringWorkbookRateRow = {
  tourCode: string;
  supplierName: string;
  vehicleCode: string;
  vehicleName: string;
  vehicleType: string;
  pricingBasis: string;
  paxFrom: string;
  paxTo: string;
  currency: string;
  baseCost: string;
  costPerDay: string;
  includedKm: string;
  includedHours: string;
  extraKmRate: string;
  extraHourRate: string;
  validFrom: string;
  validTo: string;
  active: string;
  notes: string;
};

type TouringWorkbookVehicleTypeRow = {
  vehicleCode: string;
  vehicleName: string;
  vehicleCategory: string;
  minPax: string;
  maxPax: string;
  notes: string;
};

type ParsedTouringWorkbookRate = {
  row: number;
  tourCode: string;
  supplierName: string;
  vehicleCode: string;
  vehicleName: string;
  vehicleType: string;
  supplierId: string | null;
  vehicleId: string | null;
  pricingBasis: 'PER_VEHICLE' | 'PER_DAY';
  minPax: number;
  maxPax: number;
  currency: string;
  baseCost: number;
  costPerDay: number | null;
  includedKm: number | null;
  includedHours: number | null;
  extraKmRate: number | null;
  extraHourRate: number | null;
  validFrom: Date | null;
  validTo: Date | null;
  active: boolean;
  notes: string;
  importDecision: TouringWorkbookStatus;
  existingPricingId: string | null;
  warnings: string[];
};

type ParsedLegacyMatrixRate = ParsedTouringWorkbookRate & {
  sourceColumn: string;
  skipReason?: string | null;
};

type LegacyMatrixPaxColumn = {
  key: string;
  label: string;
  minPax: number;
  maxPax: number;
  vehicleType?: string;
};

const TOURING_WORKBOOK_SHEETS = ['TOURING_ROUTES', 'TOURING_ROUTE_STOPS', 'TOURING_ROUTE_RATES', 'VEHICLE_TYPES'] as const;
const LEGACY_MATRIX_SHEETS = ['TOURING_ROUTE_MATRIX', 'TOURING_ROUTE_RATES', 'LEGACY_TOURING_ROUTE_MATRIX', 'TRANSPORT_MATRIX'] as const;

function normalizeCode(value: string) {
  return (
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'TOURING_ROUTE'
  );
}

function normalizeOptionalNumber(value: number | null | undefined, fieldLabel: string) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new BadRequestException(`${fieldLabel} must be zero or greater`);
  }
  return numberValue;
}

function normalizeOptionalPositiveInteger(value: number | null | undefined, fieldLabel: string, fallback: number) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1) {
    throw new BadRequestException(`${fieldLabel} must be one or greater`);
  }
  return Math.floor(numberValue);
}

function normalizeWorkbookText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeWorkbookKey(value: unknown) {
  return normalizeWorkbookText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeWorkbookHeader(value: unknown) {
  return normalizeWorkbookText(value).replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
}

function parseWorkbookBoolean(value: unknown, fallback = true) {
  const normalized = normalizeWorkbookText(value).toLowerCase();
  if (!normalized) return fallback;
  return !['false', 'no', 'n', '0', 'inactive'].includes(normalized);
}

function parseWorkbookNumber(value: unknown, fieldLabel: string, errors: string[], options: { required?: boolean; min?: number } = {}) {
  const raw = normalizeWorkbookText(value);
  if (!raw) {
    if (options.required) errors.push(`${fieldLabel} is required`);
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || (options.min !== undefined && parsed < options.min)) {
    errors.push(`${fieldLabel} must be ${options.min === undefined ? 'numeric' : `${options.min} or greater`}`);
    return null;
  }
  return parsed;
}

function parseWorkbookInteger(value: unknown, fieldLabel: string, errors: string[], options: { required?: boolean; min?: number } = {}) {
  const parsed = parseWorkbookNumber(value, fieldLabel, errors, options);
  return parsed === null ? null : Math.floor(parsed);
}

function parseWorkbookDate(value: unknown, fieldLabel: string, errors: string[], warnings?: string[]) {
  const raw = value instanceof Date ? value : normalizeWorkbookText(value);
  if (!raw) {
    warnings?.push(`${fieldLabel} is missing; importing without ${fieldLabel}`);
    return null;
  }
  const parsed = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(`${fieldLabel} must be a valid date`);
    return null;
  }
  return parsed;
}

function formatWorkbookDate(value: Date | string | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function dateRangesOverlap(
  leftFrom: Date | null,
  leftTo: Date | null,
  rightFrom: Date | string | null | undefined,
  rightTo: Date | string | null | undefined,
) {
  if (!leftFrom || !leftTo || !rightFrom || !rightTo) return false;
  const from = new Date(rightFrom);
  const to = new Date(rightTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
  return leftFrom <= to && from <= leftTo;
}

@Injectable()
export class TouringRoutesService {
  private readonly logger = new Logger(TouringRoutesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FindTouringRoutesInput = {}) {
    const search = filters.search?.trim();
    const limit =
      filters.limit === undefined ? undefined : Math.min(Math.max(Math.trunc(Number(filters.limit) || 1), 1), 500);

    return (this.prisma as any).touringRoute.findMany({
      where: {
        ...(filters.active === undefined ? {} : { active: filters.active }),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { startCity: { contains: search, mode: 'insensitive' } },
                { routeDescription: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: this.include(),
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      ...(limit === undefined ? {} : { take: limit }),
    });
  }

  async findOne(id: string) {
    const route = await (this.prisma as any).touringRoute.findUnique({
      where: { id },
      include: this.include(),
    });

    return throwIfNotFound(route, 'Touring route');
  }

  async create(data: TouringRouteInput) {
    const normalized = this.normalizeRouteData(data);
    return (this.prisma as any).touringRoute.create({
      data: normalized,
      include: this.include(),
    });
  }

  async update(id: string, data: Partial<TouringRouteInput>) {
    await this.findOne(id);
    const normalized = this.normalizeRouteData(data, true);

    return (this.prisma as any).touringRoute.update({
      where: { id },
      data: normalized,
      include: this.include(),
    });
  }

  async previewWorkbookImport(file: { buffer?: Buffer; path?: string; originalname?: string }) {
    try {
      return await this.processWorkbookImport(file, 'preview');
    } catch (error) {
      return this.buildWorkbookFailureResponse(file, 'WORKBOOK_PREVIEW', error);
    }
  }

  async importWorkbook(file: { buffer?: Buffer; path?: string; originalname?: string }) {
    return this.processWorkbookImport(file, 'import');
  }

  async previewTransportPricingRuleNormalization() {
    return this.processTransportPricingRuleNormalization('preview');
  }

  async importTransportPricingRuleNormalization() {
    return this.processTransportPricingRuleNormalization('import');
  }

  private async processWorkbookImport(file: { buffer?: Buffer; path?: string; originalname?: string }, mode: TouringWorkbookMode) {
    let stage = 'workbook read';
    let sheet: string | undefined;
    let activeRow: number | undefined;
    try {
    this.logWorkbookStage(mode, stage, { fileName: file.originalname || file.path || 'uploaded workbook' });
    const workbook = await this.readWorkbook(file);
    const errors: TouringWorkbookIssue[] = [];
    const warnings: TouringWorkbookIssue[] = [];
    stage = 'workbook tab detection';
    this.logWorkbookStage(mode, stage, { sheets: workbook.SheetNames });
    const hasUsableNormalizedWorkbook = this.hasUsableNormalizedWorkbook(workbook);
    const legacyMatrixSheet = hasUsableNormalizedWorkbook ? null : this.findLegacyMatrixSheet(workbook);
    if (legacyMatrixSheet) {
      return this.processLegacyMatrixWorkbook(file, workbook, legacyMatrixSheet, mode);
    }
    this.validateWorkbookSheets(workbook, errors);

    stage = 'worksheet parsing';
    sheet = 'TOURING_ROUTES';
    const routes = this.readSheetRows<TouringWorkbookRouteRow>(workbook, 'TOURING_ROUTES');
    sheet = 'TOURING_ROUTE_STOPS';
    const stops = this.readSheetRows<TouringWorkbookStopRow>(workbook, 'TOURING_ROUTE_STOPS');
    sheet = 'TOURING_ROUTE_RATES';
    const rates = this.readSheetRows<TouringWorkbookRateRow>(workbook, 'TOURING_ROUTE_RATES');
    sheet = 'VEHICLE_TYPES';
    const vehicleTypes = this.readSheetRows<TouringWorkbookVehicleTypeRow>(workbook, 'VEHICLE_TYPES');
    this.logWorkbookStage(mode, stage, { routes: routes.length, stops: stops.length, rates: rates.length, vehicleTypes: vehicleTypes.length });
    if (routes.length === 0) {
      errors.push({ sheet: 'TOURING_ROUTES', stage: 'worksheet parsing', message: 'TOURING_ROUTES has no data rows after workbook parsing' });
    }

    stage = 'TOURING_ROUTES validation';
    sheet = 'TOURING_ROUTES';
    const routeCodes = new Set<string>();
    const duplicateRouteCodes = new Set<string>();
    for (const entry of routes) {
      activeRow = entry.rowNumber;
      const code = normalizeCode(entry.row.tourCode || '');
      if (!code || code === 'TOURING_ROUTE') {
        errors.push({ sheet: 'TOURING_ROUTES', row: entry.rowNumber, message: 'TourCode is required' });
        continue;
      }
      if (routeCodes.has(code)) duplicateRouteCodes.add(code);
      routeCodes.add(code);
    }
    for (const code of duplicateRouteCodes) {
      errors.push({ sheet: 'TOURING_ROUTES', message: `Duplicate TourCode ${code}` });
    }

    stage = 'master inventory lookup';
    activeRow = undefined;
    sheet = undefined;
    this.logWorkbookStage(mode, stage, { routeCodes: routeCodes.size });
    const existingRoutes = await (this.prisma as any).touringRoute.findMany({
      where: { code: { in: Array.from(routeCodes) } },
      include: this.include(),
    });
    const routesByCode = new Map<string, any>(existingRoutes.map((route: any) => [route.code, route]));
    const suppliers = await this.prisma.supplier.findMany({ where: { type: { equals: 'transport', mode: 'insensitive' } } });
    const vehicles = await (this.prisma as any).vehicle.findMany();
    const suppliersByName = new Map<string, any>(suppliers.map((supplier: any) => [normalizeWorkbookKey(supplier.name), supplier]));
    const vehiclesByName = new Map<string, any>(vehicles.map((vehicle: any) => [normalizeWorkbookKey(vehicle.name), vehicle]));
    const vehiclesByType = new Map<string, any[]>();
    for (const vehicle of vehicles) {
      const key = normalizeWorkbookKey(vehicle.vehicleType || vehicle.name);
      if (!vehiclesByType.has(key)) vehiclesByType.set(key, []);
      vehiclesByType.get(key)?.push(vehicle);
    }
    const workbookVehicleTypesByCode = new Map<string, TouringWorkbookVehicleTypeRow>();
    const workbookVehicleTypesByName = new Map<string, TouringWorkbookVehicleTypeRow>();
    for (const { row } of vehicleTypes) {
      if (row.vehicleCode) workbookVehicleTypesByCode.set(normalizeWorkbookKey(row.vehicleCode), row);
      if (row.vehicleName) workbookVehicleTypesByName.set(normalizeWorkbookKey(row.vehicleName), row);
    }

    stage = 'TOURING_ROUTES normalization';
    sheet = 'TOURING_ROUTES';
    const parsedRoutes = routes.map(({ row, rowNumber }) => {
      activeRow = rowNumber;
      this.logWorkbookStage(mode, stage, { row: rowNumber }, 'debug');
      const rowErrors: string[] = [];
      const code = normalizeCode(row.tourCode || '');
      const durationDaysValue = parseWorkbookInteger(row.durationDays, 'DurationDays', rowErrors, { min: 1 });
      const durationHoursValue = parseWorkbookInteger(row.durationHours, 'DurationHours', rowErrors, { min: 1 });
      if (durationDaysValue === null && durationHoursValue === null) rowErrors.push('DurationDays or DurationHours is required');
      const durationDays = durationDaysValue ?? Math.max(1, Math.ceil((durationHoursValue ?? 24) / 24));
      const includedKm = parseWorkbookNumber(row.includedKm, 'IncludedKM', rowErrors, { min: 0 });
      const includedHours = parseWorkbookNumber(row.includedHours || row.durationHours, 'IncludedHours', rowErrors, { min: 0 });
      if (!normalizeWorkbookText(row.tourName)) rowErrors.push('TourName is required');
      if (!normalizeWorkbookText(row.startCity)) rowErrors.push('StartCity is required');
      for (const message of rowErrors) errors.push({ sheet: 'TOURING_ROUTES', row: rowNumber, message });

      const existing = routesByCode.get(code) as any;
      const mainDestinations = normalizeWorkbookText(row.mainDestinations || row.returnCity)
        .split(/\s*(?:,|\/|;|\||->|→)\s*/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      const routeWarnings: string[] = [];
      if (includedKm === null) routeWarnings.push('Missing included KM');
      if (includedHours === null) routeWarnings.push('Missing included hours');

      return {
        row: rowNumber,
        code,
        name: normalizeWorkbookText(row.tourName),
        startCity: normalizeWorkbookText(row.startCity),
        durationDays,
        routeDescription: normalizeWorkbookText(row.routeDescription),
        mainDestinations,
        includedKm,
        includedHours,
        active: parseWorkbookBoolean(row.active, true),
        importDecision: existing
          ? existing.name === normalizeWorkbookText(row.tourName) &&
            existing.startCity === normalizeWorkbookText(row.startCity) &&
            existing.durationDays === durationDays
            ? 'UNCHANGED'
            : 'UPDATED'
          : 'NEW',
        warnings: routeWarnings,
      };
    });

    stage = 'TOURING_ROUTE_STOPS parsing';
    sheet = 'TOURING_ROUTE_STOPS';
    const stopsByCode = new Map<string, Array<{ row: number; order: number; city: string; location: string; overnight: boolean; notes: string }>>();
    for (const { row, rowNumber } of stops) {
      activeRow = rowNumber;
      this.logWorkbookStage(mode, stage, { row: rowNumber }, 'debug');
      const rowErrors: string[] = [];
      const code = normalizeCode(row.tourCode || '');
      if (!routeCodes.has(code)) rowErrors.push(`TourCode ${code || '(blank)'} does not reference a route in TOURING_ROUTES`);
      const order = parseWorkbookInteger(row.stopOrder, 'StopOrder', rowErrors, { min: 1 }) ?? (stopsByCode.get(code)?.length ?? 0) + 1;
      const stopName = normalizeWorkbookText(row.stopName || row.location || row.city);
      const city = normalizeWorkbookText(row.city || row.region || stopName);
      if (!stopName && !city) rowErrors.push('StopName or City is required');
      for (const message of rowErrors) errors.push({ sheet: 'TOURING_ROUTE_STOPS', row: rowNumber, message });
      if (!stopsByCode.has(code)) stopsByCode.set(code, []);
      stopsByCode.get(code)?.push({
        row: rowNumber,
        order,
        city,
        location: stopName,
        overnight: parseWorkbookBoolean(row.overnight, false),
        notes: [normalizeWorkbookText(row.stopType), normalizeWorkbookText(row.notes)].filter(Boolean).join(' | '),
      });
    }

    for (const route of parsedRoutes) {
      const routeStops = stopsByCode.get(route.code) || [];
      if (route.durationDays > 1 && !routeStops.some((stop) => stop.overnight)) {
        warnings.push({ sheet: 'TOURING_ROUTE_STOPS', message: `${route.code} has multi-day duration but no overnight stop marker` });
      }
    }

    stage = 'TOURING_ROUTE_RATES parsing';
    sheet = 'TOURING_ROUTE_RATES';
    const existingPricings = await (this.prisma as any).touringRoutePricing.findMany({
      where: { touringRoute: { code: { in: Array.from(routeCodes) } } },
      include: {
        touringRoute: true,
        supplier: true,
        vehicle: true,
      },
    });
    const parsedRates: ParsedTouringWorkbookRate[] = [];
    const seenRateKeys = new Set<string>();
    for (const { row, rowNumber } of rates) {
      activeRow = rowNumber;
      this.logWorkbookStage(mode, stage, { row: rowNumber }, 'debug');
      const rowErrors: string[] = [];
      const rateWarnings: string[] = [];
      const code = normalizeCode(row.tourCode || '');
      if (!routeCodes.has(code)) rowErrors.push(`TourCode ${code || '(blank)'} does not reference a route in TOURING_ROUTES`);
      const supplierName = normalizeWorkbookText(row.supplierName);
      const supplier = suppliersByName.get(normalizeWorkbookKey(supplierName)) || null;
      if (!supplierName) rowErrors.push('SupplierName is required');
      if (!supplier) rateWarnings.push(`Supplier mapping missing for ${supplierName || '(blank)'}`);
      const vehicleCode = normalizeWorkbookText(row.vehicleCode);
      const vehicleName = normalizeWorkbookText(row.vehicleName);
      const vehicleType = normalizeWorkbookText(row.vehicleType);
      const workbookVehicleType =
        (vehicleCode ? workbookVehicleTypesByCode.get(normalizeWorkbookKey(vehicleCode)) : null) ||
        (vehicleName ? workbookVehicleTypesByName.get(normalizeWorkbookKey(vehicleName)) : null) ||
        (vehicleType ? workbookVehicleTypesByName.get(normalizeWorkbookKey(vehicleType)) : null) ||
        null;
      const vehicle =
        (vehicleCode ? vehiclesByName.get(normalizeWorkbookKey(vehicleCode)) : null) ||
        (vehicleName ? vehiclesByName.get(normalizeWorkbookKey(vehicleName)) : null) ||
        (vehicleType ? (vehiclesByType.get(normalizeWorkbookKey(vehicleType)) || [])[0] : null) ||
        (workbookVehicleType?.vehicleName ? vehiclesByName.get(normalizeWorkbookKey(workbookVehicleType.vehicleName)) : null) ||
        null;
      if (!vehicleCode && !vehicleType && !vehicleName) rowErrors.push('VehicleCode or VehicleName is required');
      if (!vehicle) rowErrors.push(`Vehicle mapping missing for ${vehicleCode || vehicleName || vehicleType || '(blank)'}`);
      const workbookMinPax = workbookVehicleType ? parseWorkbookInteger(workbookVehicleType.minPax, 'VEHICLE_TYPES.MinPax', rowErrors, { min: 1 }) : null;
      const workbookMaxPax = workbookVehicleType ? parseWorkbookInteger(workbookVehicleType.maxPax, 'VEHICLE_TYPES.MaxPax', rowErrors, { min: workbookMinPax ?? 1 }) : null;
      const minPax = parseWorkbookInteger(row.paxFrom, 'PaxFrom', rowErrors, { min: 1 }) ?? workbookMinPax ?? 1;
      const maxPax = parseWorkbookInteger(row.paxTo, 'PaxTo', rowErrors, { min: minPax }) ?? workbookMaxPax ?? vehicle?.maxPax ?? minPax;
      const baseCost = parseWorkbookNumber(row.baseCost, 'BaseCost', rowErrors, { required: true, min: 0 }) ?? 0;
      const validFrom = parseWorkbookDate(row.validFrom, 'ValidFrom', rowErrors, rateWarnings);
      const validTo = parseWorkbookDate(row.validTo, 'ValidTo', rowErrors, rateWarnings);
      if (validFrom && validTo && validFrom > validTo) rowErrors.push('ValidFrom cannot be after ValidTo');
      const pricingBasis = normalizeWorkbookText(row.pricingBasis).toUpperCase() === 'PER_DAY' ? 'PER_DAY' : 'PER_VEHICLE';
      const currency = normalizeWorkbookText(row.currency).toUpperCase();
      if (!['USD', 'EUR', 'JOD'].includes(currency)) rowErrors.push('Currency must be USD, EUR, or JOD');
      const rateKey = [code, supplier?.id || supplierName, vehicle?.id || vehicleCode || vehicleName || vehicleType, pricingBasis, minPax, maxPax, currency, formatWorkbookDate(validFrom), formatWorkbookDate(validTo)].join('|');
      if (seenRateKeys.has(rateKey)) {
        rowErrors.push('Duplicate pricing row in workbook');
      }
      seenRateKeys.add(rateKey);
      for (const message of rowErrors) errors.push({ sheet: 'TOURING_ROUTE_RATES', row: rowNumber, message });

      const matchingPricings = existingPricings.filter(
        (pricing: any) =>
          pricing.touringRoute?.code === code &&
          (pricing.supplierId || null) === (supplier?.id || null) &&
          (pricing.vehicleId || null) === (vehicle?.id || null) &&
          pricing.pricingBasis === pricingBasis &&
          pricing.minPax === minPax &&
          pricing.maxPax === maxPax &&
          pricing.currency === currency,
      );
      const exact = matchingPricings.find((pricing: any) => formatWorkbookDate(pricing.validFrom) === formatWorkbookDate(validFrom) && formatWorkbookDate(pricing.validTo) === formatWorkbookDate(validTo));
      const overlap = !exact && matchingPricings.some((pricing: any) => dateRangesOverlap(validFrom, validTo, pricing.validFrom, pricing.validTo));
      const decision: TouringWorkbookStatus = overlap
        ? 'OVERLAP'
        : exact
          ? Number(exact.baseCost) === baseCost && Number(exact.extraKmRate || 0) === Number(row.extraKmRate || 0)
            ? 'UNCHANGED'
            : 'UPDATED'
          : 'NEW';

      parsedRates.push({
        row: rowNumber,
        tourCode: code,
        supplierName,
        vehicleCode,
        vehicleName,
        vehicleType: vehicleType || workbookVehicleType?.vehicleCategory || workbookVehicleType?.vehicleName || vehicleCode,
        supplierId: supplier?.id || null,
        vehicleId: vehicle?.id || null,
        pricingBasis,
        minPax,
        maxPax,
        currency,
        baseCost,
        costPerDay: parseWorkbookNumber(row.costPerDay, 'CostPerDay', rowErrors, { min: 0 }),
        includedKm: parseWorkbookNumber(row.includedKm, 'IncludedKM', rowErrors, { min: 0 }),
        includedHours: parseWorkbookNumber(row.includedHours, 'IncludedHours', rowErrors, { min: 0 }),
        extraKmRate: parseWorkbookNumber(row.extraKmRate, 'ExtraKMRate', rowErrors, { min: 0 }),
        extraHourRate: parseWorkbookNumber(row.extraHourRate, 'ExtraHourRate', rowErrors, { min: 0 }),
        validFrom,
        validTo,
        active: parseWorkbookBoolean(row.active, true),
        notes: normalizeWorkbookText(row.notes),
        importDecision: decision,
        existingPricingId: exact?.id || null,
        warnings: rateWarnings,
      });
      for (const message of rateWarnings) warnings.push({ sheet: 'TOURING_ROUTE_RATES', row: rowNumber, message });
    }

    for (const route of parsedRoutes) {
      if (!parsedRates.some((rate) => rate.tourCode === route.code)) {
        warnings.push({ sheet: 'TOURING_ROUTE_RATES', message: `${route.code} has no pricing rows` });
      }
    }

    stage = 'preview response build';
    sheet = undefined;
    activeRow = undefined;
    this.logWorkbookStage(mode, stage, { routeCount: parsedRoutes.length, stopCount: Array.from(stopsByCode.values()).reduce((total, entries) => total + entries.length, 0), pricingCount: parsedRates.length, errors: errors.length, warnings: warnings.length });
    const summary = {
      success: errors.length === 0,
      mode,
      importer: 'NORMALIZED_TOURING_ROUTE_WORKBOOK',
      workbookMode: 'Normalized Workbook Mode',
      sourceFileName: file.originalname || 'touring-workbook.xlsx',
      routeCount: parsedRoutes.length,
      stopCount: Array.from(stopsByCode.values()).reduce((total, entries) => total + entries.length, 0),
      pricingCount: parsedRates.length,
      supplierMapping: {
        mapped: parsedRates.filter((rate) => rate.supplierId).length,
        missing: parsedRates.filter((rate) => !rate.supplierId).length,
      },
      routes: parsedRoutes,
      stops: Array.from(stopsByCode.entries()).flatMap(([tourCode, entries]) => entries.map((entry) => ({ tourCode, ...entry }))),
      pricings: parsedRates.map((rate) => ({
        ...rate,
        validFrom: formatWorkbookDate(rate.validFrom),
        validTo: formatWorkbookDate(rate.validTo),
      })),
      errors,
      warnings,
      skippedRows: [] as TouringWorkbookIssue[],
      rowErrors: [] as TouringWorkbookIssue[],
      imported: {
        routes: 0,
        stops: 0,
        pricings: 0,
        updatedRoutes: 0,
        updatedPricings: 0,
        skippedOverlaps: 0,
        skippedDuplicates: 0,
        skippedRows: 0,
        rowErrors: 0,
      },
    };

    if (mode === 'preview') return summary;
    if (errors.length > 0) {
      throw new BadRequestException(errors.map((error) => `${error.sheet || 'WORKBOOK'}${error.row ? ` row ${error.row}` : ''}: ${error.message}`).join('; '));
    }

    const recordSkippedRow = (issue: TouringWorkbookIssue) => {
      summary.skippedRows.push(issue);
      summary.imported.skippedRows += 1;
    };
    const recordRowError = (issue: TouringWorkbookIssue) => {
      summary.rowErrors.push(issue);
      summary.imported.rowErrors += 1;
      summary.success = false;
    };
    const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

    for (const route of parsedRoutes) {
      try {
        const existing = routesByCode.get(route.code) as any;
        const routeData = {
          name: route.name,
          startCity: route.startCity,
          durationDays: route.durationDays,
          routeDescription: route.routeDescription || null,
          mainDestinations: route.mainDestinations,
          includedKm: route.includedKm,
          includedHours: route.includedHours,
          active: route.active,
        };
        const saved = existing
          ? await (this.prisma as any).touringRoute.update({ where: { id: existing.id }, data: routeData })
          : await (this.prisma as any).touringRoute.create({ data: { code: route.code, ...routeData } });
        if (existing) summary.imported.updatedRoutes += 1;
        else summary.imported.routes += 1;

        await (this.prisma as any).touringRouteStop.deleteMany({ where: { touringRouteId: saved.id } });
        const routeStops = stopsByCode.get(route.code) || [];
        if (routeStops.length > 0) {
          await (this.prisma as any).touringRouteStop.createMany({
            data: routeStops.map((stop) => ({
              touringRouteId: saved.id,
              order: stop.order,
              city: stop.city,
              location: stop.location || null,
              notes: [stop.overnight ? 'Overnight stop' : null, stop.notes].filter(Boolean).join(' | ') || null,
            })),
          });
          summary.imported.stops += routeStops.length;
        }
        routesByCode.set(route.code, saved);
      } catch (error) {
        routesByCode.delete(route.code);
        recordRowError({ sheet: 'TOURING_ROUTES', row: route.row, message: `${route.code}: ${errorMessage(error)}` });
      }
    }

    const rateBatches = this.chunk(parsedRates, 25);
    for (const batch of rateBatches) {
      for (const rate of batch) {
        try {
          const route = routesByCode.get(rate.tourCode) as any;
          if (!route) {
            recordSkippedRow({ sheet: 'TOURING_ROUTE_RATES', row: rate.row, message: `${rate.tourCode}: route was not imported or found` });
            continue;
          }
          if (!rate.vehicleId) {
            recordSkippedRow({ sheet: 'TOURING_ROUTE_RATES', row: rate.row, message: `${rate.tourCode}: vehicle mapping missing` });
            continue;
          }
          if (rate.importDecision === 'UNCHANGED') {
            summary.imported.skippedDuplicates += 1;
            recordSkippedRow({ sheet: 'TOURING_ROUTE_RATES', row: rate.row, message: `${rate.tourCode}: duplicate unchanged pricing already exists` });
            continue;
          }
          if (rate.importDecision === 'OVERLAP') {
            summary.imported.skippedOverlaps += 1;
            recordSkippedRow({ sheet: 'TOURING_ROUTE_RATES', row: rate.row, message: `${rate.tourCode}: overlapping pricing window skipped` });
            continue;
          }
          const data = {
            touringRouteId: route.id,
            supplierId: rate.supplierId,
            vehicleId: rate.vehicleId,
            pricingBasis: rate.pricingBasis,
            minPax: rate.minPax,
            maxPax: rate.maxPax,
            currency: rate.currency,
            baseCost: rate.baseCost,
            costPerDay: rate.costPerDay,
            includedKm: rate.includedKm,
            includedHours: rate.includedHours,
            extraKmRate: rate.extraKmRate,
            extraHourRate: rate.extraHourRate,
            validFrom: rate.validFrom ?? null,
            validTo: rate.validTo ?? null,
            active: rate.active,
            notes: this.buildTouringRoutePricingNotes(rate),
          };
          const duplicate = await (this.prisma as any).touringRoutePricing.findFirst({
            where: {
              touringRouteId: route.id,
              supplierId: rate.supplierId,
              vehicleId: rate.vehicleId,
              pricingBasis: rate.pricingBasis,
              minPax: rate.minPax,
              maxPax: rate.maxPax,
              currency: rate.currency,
              validFrom: rate.validFrom ?? null,
              validTo: rate.validTo ?? null,
            },
          });
          if (rate.existingPricingId) {
            await (this.prisma as any).touringRoutePricing.update({ where: { id: rate.existingPricingId }, data });
            summary.imported.updatedPricings += 1;
          } else if (duplicate) {
            if (
              Number(duplicate.baseCost) === Number(rate.baseCost) &&
              Number(duplicate.extraKmRate || 0) === Number(rate.extraKmRate || 0) &&
              Number(duplicate.extraHourRate || 0) === Number(rate.extraHourRate || 0)
            ) {
              summary.imported.skippedDuplicates += 1;
              recordSkippedRow({ sheet: 'TOURING_ROUTE_RATES', row: rate.row, message: `${rate.tourCode}: duplicate existing pricing row skipped` });
            } else {
              await (this.prisma as any).touringRoutePricing.update({ where: { id: duplicate.id }, data });
              summary.imported.updatedPricings += 1;
            }
          } else {
            await (this.prisma as any).touringRoutePricing.create({ data });
            summary.imported.pricings += 1;
          }
        } catch (error) {
          recordRowError({ sheet: 'TOURING_ROUTE_RATES', row: rate.row, message: `${rate.tourCode}: ${errorMessage(error)}` });
        }
      }
    }

    return summary;
    } catch (error) {
      this.logger.error(
        `[touring-workbook] ${mode} failed at ${stage}`,
        error instanceof Error ? error.stack : String(error),
      );
      if (this.isUnsupportedWorkbookCompressionError(error)) {
        return this.buildWorkbookDecompressionFailure(file, error);
      }
      if (mode === 'preview') {
        return this.buildWorkbookFailureResponse(file, stage, error, sheet, activeRow);
      }
      throw error;
    }
  }

  private chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private include() {
    return {
      stops: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      pricings: {
        include: {
          supplier: true,
          vehicle: true,
          transportServiceType: true,
        },
        orderBy: [{ active: 'desc' }, { minPax: 'asc' }, { createdAt: 'asc' }],
      },
    };
  }

  private async processTransportPricingRuleNormalization(mode: TouringWorkbookMode) {
    const [touringRoutes, transportRules, existingPricings] = await Promise.all([
      (this.prisma as any).touringRoute.findMany({ include: this.include() }),
      (this.prisma as any).transportPricingRule.findMany({
        where: { isActive: true },
        include: {
          route: true,
          supplier: true,
          vehicle: true,
          transportServiceType: true,
        },
      }),
      (this.prisma as any).touringRoutePricing.findMany({
        include: {
          touringRoute: true,
          supplier: true,
          vehicle: true,
        },
      }),
    ]);
    const skippedRows: Array<{ ruleId: string; routeName?: string | null; reason: string }> = [];
    const rowsToCreate: any[] = [];
    const seenKeys = new Set<string>();

    for (const rule of transportRules || []) {
      const touringRoute = this.matchTouringRouteForTransportRule(rule, touringRoutes || []);
      const duplicateKey = [
        touringRoute?.id || '',
        rule.supplierId || '',
        rule.vehicleId || '',
        rule.transportServiceTypeId || '',
        'PER_VEHICLE',
        rule.minPax,
        rule.maxPax,
        rule.currency,
        '',
        '',
      ].join('|');
      const existing = existingPricings.some(
        (pricing: any) =>
          pricing.touringRouteId === touringRoute?.id &&
          (pricing.supplierId || null) === (rule.supplierId || null) &&
          (pricing.vehicleId || null) === (rule.vehicleId || null) &&
          (pricing.transportServiceTypeId || null) === (rule.transportServiceTypeId || null) &&
          pricing.pricingBasis === 'PER_VEHICLE' &&
          pricing.minPax === rule.minPax &&
          pricing.maxPax === rule.maxPax &&
          pricing.currency === rule.currency &&
          !pricing.validFrom &&
          !pricing.validTo,
      );
      const skipReason =
        !touringRoute
          ? `No touring route match for transport route ${rule.route?.name || rule.routeId}`
          : !rule.vehicleId
            ? 'Vehicle type cannot be mapped'
            : Number(rule.baseCost || 0) <= 0
              ? 'Price is empty or zero'
              : seenKeys.has(duplicateKey)
                ? 'Duplicate pricing row in transport rules'
                : existing
                  ? 'Duplicate existing pricing row'
                  : null;

      if (skipReason) {
        skippedRows.push({ ruleId: rule.id, routeName: rule.route?.name || null, reason: skipReason });
        continue;
      }

      seenKeys.add(duplicateKey);
      rowsToCreate.push({
        sourceRuleId: rule.id,
        touringRouteId: touringRoute.id,
        tourCode: touringRoute.code,
        routeName: rule.route?.name || null,
        supplierId: rule.supplierId || null,
        supplierName: rule.supplier?.name || '',
        vehicleId: rule.vehicleId,
        vehicleName: rule.vehicle?.name || '',
        transportServiceTypeId: rule.transportServiceTypeId || null,
        pricingBasis: 'PER_VEHICLE',
        minPax: rule.minPax,
        maxPax: rule.maxPax,
        currency: rule.currency,
        baseCost: Number(rule.baseCost || 0),
        active: true,
        notes: `Normalized from transport pricing rule ${rule.id}`,
      });
    }

    const summary = {
      success: true,
      mode,
      importer: 'TRANSPORT_PRICING_RULE_TO_TOURING_ROUTE_PRICING',
      pricingCount: rowsToCreate.length,
      rowsToCreate,
      skippedRows,
      imported: { pricings: 0, skippedRows: skippedRows.length },
    };

    if (mode === 'preview') return summary;

    return this.prisma.$transaction(async (tx) => {
      for (const row of rowsToCreate) {
        await (tx as any).touringRoutePricing.create({
          data: {
            touringRouteId: row.touringRouteId,
            supplierId: row.supplierId,
            vehicleId: row.vehicleId,
            transportServiceTypeId: row.transportServiceTypeId,
            pricingBasis: row.pricingBasis,
            minPax: row.minPax,
            maxPax: row.maxPax,
            currency: row.currency,
            baseCost: row.baseCost,
            validFrom: null,
            validTo: null,
            active: true,
            notes: row.notes,
          },
        });
        summary.imported.pricings += 1;
      }
      return summary;
    });
  }

  private matchTouringRouteForTransportRule(rule: any, touringRoutes: any[]) {
    const routeTexts = [rule.route?.normalizedKey, rule.route?.name].filter(Boolean).map((value) => normalizeWorkbookKey(value));
    return (
      touringRoutes.find((route) => routeTexts.includes(normalizeWorkbookKey(route.code))) ||
      touringRoutes.find((route) => routeTexts.some((text) => text && normalizeWorkbookKey(route.name).includes(text))) ||
      touringRoutes.find((route) => routeTexts.some((text) => text && normalizeWorkbookKey(route.routeDescription).includes(text))) ||
      null
    );
  }

  private findLegacyMatrixSheet(workbook: XLSX.WorkBook) {
    for (const preferredName of LEGACY_MATRIX_SHEETS) {
      const actualName = workbook.SheetNames.find((name) => name.trim().toUpperCase() === preferredName);
      if (actualName && this.getLegacyMatrixPriceColumns(workbook.Sheets[actualName]).length > 0) {
        return actualName;
      }
    }

    return workbook.SheetNames.find((sheetName) => this.getLegacyMatrixPriceColumns(workbook.Sheets[sheetName]).length > 0) || null;
  }

  private hasUsableNormalizedWorkbook(workbook: XLSX.WorkBook) {
    const sheetNames = new Set(workbook.SheetNames.map((name) => name.trim().toUpperCase()));
    if (!TOURING_WORKBOOK_SHEETS.every((sheetName) => sheetNames.has(sheetName))) return false;

    const routes = this.readSheetRows<TouringWorkbookRouteRow>(workbook, 'TOURING_ROUTES');
    const rates = this.readSheetRows<TouringWorkbookRateRow>(workbook, 'TOURING_ROUTE_RATES');
    return routes.some(({ row }) => this.isUsableNormalizedRouteRow(row)) && rates.some(({ row }) => this.isUsableNormalizedRateRow(row));
  }

  private isUsableNormalizedRouteRow(row: TouringWorkbookRouteRow) {
    const code = normalizeCode(row.tourCode || '');
    return (
      Boolean(code && code !== 'TOURING_ROUTE' && code !== 'TOURCODE' && code !== 'ROUTECODE' && code !== 'VARIANTCODE') &&
      Boolean(normalizeWorkbookText(row.tourName)) &&
      normalizeWorkbookKey(row.tourName) !== 'tourname' &&
      Boolean(normalizeWorkbookText(row.startCity)) &&
      normalizeWorkbookKey(row.startCity) !== 'startcity'
    );
  }

  private isUsableNormalizedRateRow(row: TouringWorkbookRateRow) {
    const code = normalizeCode(row.tourCode || '');
    const paxFrom = Number(normalizeWorkbookText(row.paxFrom));
    const paxTo = Number(normalizeWorkbookText(row.paxTo));
    const baseCost = Number(normalizeWorkbookText(row.baseCost));
    return (
      Boolean(code && code !== 'TOURING_ROUTE' && code !== 'TOURCODE' && code !== 'ROUTECODE' && code !== 'VARIANTCODE') &&
      Number.isFinite(paxFrom) &&
      paxFrom >= 1 &&
      Number.isFinite(paxTo) &&
      paxTo >= paxFrom &&
      Number.isFinite(baseCost) &&
      baseCost > 0
    );
  }

  private getLegacyMatrixPaxColumns(sheet?: XLSX.WorkSheet): LegacyMatrixPaxColumn[] {
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    const firstRow = rows[0] || {};
    return Object.keys(firstRow)
      .map((header) => {
        const match = normalizeWorkbookText(header).match(/(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*pax/i);
        if (!match) return null;
        const minPax = Number(match[1]);
        const maxPax = Number(match[2]);
        if (!Number.isInteger(minPax) || !Number.isInteger(maxPax) || minPax < 1 || maxPax < minPax) return null;
        return { key: header, label: normalizeWorkbookText(header), minPax, maxPax };
      })
      .filter((entry): entry is LegacyMatrixPaxColumn => entry !== null);
  }

  private getLegacyMatrixPriceColumns(sheet?: XLSX.WorkSheet): LegacyMatrixPaxColumn[] {
    const paxColumns = this.getLegacyMatrixPaxColumns(sheet);
    if (!sheet) return paxColumns;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    const firstRow = rows[0] || {};
    const vehicleColumns = Object.keys(firstRow)
      .map((header) => this.getLegacyMatrixVehicleRateColumn(header))
      .filter((entry): entry is LegacyMatrixPaxColumn => entry !== null);
    return [...paxColumns, ...vehicleColumns.filter((column) => !paxColumns.some((paxColumn) => paxColumn.key === column.key))];
  }

  private getLegacyMatrixVehicleRateColumn(header: string): LegacyMatrixPaxColumn | null {
    const normalized = normalizeWorkbookHeader(header);
    const columns: Array<{ aliases: string[]; vehicleType: string; minPax: number; maxPax: number }> = [
      { aliases: ['sedanrate', 'sedanratejod', 'sedan'], vehicleType: 'Sedan', minPax: 1, maxPax: 2 },
      { aliases: ['vanrate', 'vanratejod', 'van'], vehicleType: 'Van', minPax: 3, maxPax: 6 },
      { aliases: ['minibusrate', 'minibusratejod', 'minibus'], vehicleType: 'Mini Bus', minPax: 7, maxPax: 20 },
      { aliases: ['busrate', 'busratejod', 'bus'], vehicleType: 'Bus', minPax: 21, maxPax: 999 },
    ];
    const match = columns.find((column) => column.aliases.includes(normalized));
    if (!match) return null;
    return {
      key: header,
      label: normalizeWorkbookText(header),
      minPax: match.minPax,
      maxPax: match.maxPax,
      vehicleType: match.vehicleType,
    };
  }

  private async processLegacyMatrixWorkbook(
    file: { buffer?: Buffer; path?: string; originalname?: string },
    workbook: XLSX.WorkBook,
    sheetName: string,
    mode: TouringWorkbookMode,
  ) {
    const sheet = workbook.Sheets[sheetName];
    const paxColumns = this.getLegacyMatrixPriceColumns(sheet);
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    const warnings: TouringWorkbookIssue[] = [];
    const errors: TouringWorkbookIssue[] = [];
    const normalizedRows = rawRows.map((row, index) => ({ raw: row, normalized: this.normalizeRawWorkbookRow(row), rowNumber: index + 2 }));
    const routeCodes = Array.from(
      new Set(
        normalizedRows
          .map(({ normalized }) => normalizeCode(normalized.routecode || normalized.tourcode || normalized.variantcode || normalized.code || ''))
          .filter((code) => code && code !== 'TOURING_ROUTE'),
      ),
    );
    const existingRoutes = await (this.prisma as any).touringRoute.findMany({
      where: { code: { in: routeCodes } },
      include: this.include(),
    });
    const routesByCode = new Map<string, any>(existingRoutes.map((route: any) => [route.code, route]));
    const suppliers = await this.prisma.supplier.findMany({ where: { type: { equals: 'transport', mode: 'insensitive' } } });
    const vehicles = await (this.prisma as any).vehicle.findMany();
    const suppliersByName = new Map<string, any>(suppliers.map((supplier: any) => [normalizeWorkbookKey(supplier.name), supplier]));
    const vehiclesByName = new Map<string, any>(vehicles.map((vehicle: any) => [normalizeWorkbookKey(vehicle.name), vehicle]));
    const vehiclesByType = new Map<string, any[]>();
    for (const vehicle of vehicles) {
      const key = normalizeWorkbookKey(vehicle.vehicleType || vehicle.name);
      if (!vehiclesByType.has(key)) vehiclesByType.set(key, []);
      vehiclesByType.get(key)?.push(vehicle);
    }
    for (const entries of vehiclesByType.values()) {
      entries.sort((left: any, right: any) => Number(left.maxPax || 999) - Number(right.maxPax || 999));
    }
    const existingPricings = await (this.prisma as any).touringRoutePricing.findMany({
      where: { touringRoute: { code: { in: routeCodes } } },
      include: { touringRoute: true, supplier: true, vehicle: true },
    });
    const parsedRates: ParsedLegacyMatrixRate[] = [];
    const skippedRows: Array<{ sheet: string; row: number; routeCode: string; sourceColumn?: string; reason: string }> = [];
    const seenRateKeys = new Set<string>();

    for (const { raw, normalized, rowNumber } of normalizedRows) {
      const code = normalizeCode(normalized.routecode || normalized.tourcode || normalized.variantcode || normalized.code || '');
      const route = routesByCode.get(code) as any;
      const supplierName = normalizeWorkbookText(normalized.suppliername || normalized.supplier || normalized.operator || '');
      const supplier = (supplierName ? suppliersByName.get(normalizeWorkbookKey(supplierName)) : null) || (suppliers.length === 1 ? suppliers[0] : null);
      const vehicleCode = normalizeWorkbookText(normalized.vehiclecode || '');
      const vehicleName = normalizeWorkbookText(normalized.vehiclename || normalized.vehicle || '');
      const vehicleType = normalizeWorkbookText(normalized.vehicletype || normalized.vehiclecategory || '');
      const currency = normalizeWorkbookText(normalized.currency || 'JOD').toUpperCase();
      const pricingBasis = normalizeWorkbookText(normalized.pricingbasis || '').toUpperCase() === 'PER_DAY' ? 'PER_DAY' : 'PER_VEHICLE';
      const active = parseWorkbookBoolean(normalized.active || normalized.status, true);
      const notes = normalizeWorkbookText(normalized.notes || 'Legacy touring route matrix import');
      const validFrom = this.parseOptionalWorkbookDate(normalized.validfrom || normalized.from, 'ValidFrom', warnings, sheetName, rowNumber);
      const validTo = this.parseOptionalWorkbookDate(normalized.validto || normalized.to, 'ValidTo', warnings, sheetName, rowNumber);

      for (const paxColumn of paxColumns) {
        const priceErrors: string[] = [];
        const baseCost = parseWorkbookNumber(raw[paxColumn.key], paxColumn.label, priceErrors, { min: 0 });
        const columnVehicleType = paxColumn.vehicleType || vehicleType;
        const vehicle = this.resolveLegacyMatrixVehicle({ vehicleCode, vehicleName, vehicleType: columnVehicleType, minPax: paxColumn.minPax, maxPax: paxColumn.maxPax, vehiclesByName, vehiclesByType, vehicles });
        const minPax = paxColumn.vehicleType === 'Bus' && vehicle?.minPax ? Number(vehicle.minPax) : paxColumn.minPax;
        const maxPax = paxColumn.vehicleType === 'Bus' && vehicle?.maxPax ? Number(vehicle.maxPax) : paxColumn.maxPax;
        const skipReason =
          !code || code === 'TOURING_ROUTE'
            ? 'Route code is required'
            : !route
              ? `Route code ${code} does not exist`
              : baseCost === null || baseCost <= 0
                ? `Price is empty or zero for ${paxColumn.label}`
                : !vehicle
                  ? `Vehicle type cannot be mapped for ${vehicleCode || vehicleName || columnVehicleType || `${paxColumn.minPax}-${paxColumn.maxPax} pax`}`
                  : !['USD', 'EUR', 'JOD'].includes(currency)
                    ? 'Currency must be USD, EUR, or JOD'
                    : null;
        const rateKey = [code, supplier?.id || supplierName || 'DEFAULT', vehicle?.id || '', pricingBasis, minPax, maxPax, currency, formatWorkbookDate(validFrom), formatWorkbookDate(validTo)].join('|');
        const duplicateInWorkbook = !skipReason && seenRateKeys.has(rateKey);
        if (!skipReason) seenRateKeys.add(rateKey);
        const exact = existingPricings.find(
          (pricing: any) =>
            pricing.touringRoute?.code === code &&
            (pricing.supplierId || null) === (supplier?.id || null) &&
            (pricing.vehicleId || null) === (vehicle?.id || null) &&
            pricing.pricingBasis === pricingBasis &&
            pricing.minPax === minPax &&
            pricing.maxPax === maxPax &&
            pricing.currency === currency &&
            formatWorkbookDate(pricing.validFrom ? new Date(pricing.validFrom) : null) === formatWorkbookDate(validFrom) &&
            formatWorkbookDate(pricing.validTo ? new Date(pricing.validTo) : null) === formatWorkbookDate(validTo),
        );
        const finalSkipReason = skipReason || (duplicateInWorkbook ? 'Duplicate pricing row in workbook' : null) || (exact ? 'Duplicate existing pricing row' : null);
        if (finalSkipReason) {
          skippedRows.push({ sheet: sheetName, row: rowNumber, routeCode: code, sourceColumn: paxColumn.label, reason: finalSkipReason });
          warnings.push({ sheet: sheetName, row: rowNumber, message: finalSkipReason });
        }
        parsedRates.push({
          row: rowNumber,
          sourceColumn: paxColumn.label,
          tourCode: code,
          supplierName: supplier?.name || supplierName,
          vehicleCode,
          vehicleName: vehicle?.name || vehicleName || columnVehicleType,
          vehicleType: vehicle?.vehicleType || columnVehicleType,
          supplierId: supplier?.id || null,
          vehicleId: vehicle?.id || null,
          pricingBasis,
          minPax,
          maxPax,
          currency,
          baseCost: baseCost || 0,
          costPerDay: null,
          includedKm: null,
          includedHours: null,
          extraKmRate: null,
          extraHourRate: null,
          validFrom,
          validTo,
          active,
          notes,
          importDecision: finalSkipReason ? 'SKIPPED' : 'NEW',
          existingPricingId: exact?.id || null,
          warnings: finalSkipReason ? [finalSkipReason] : [],
          skipReason: finalSkipReason,
        });
      }
    }

    const creatableRates = parsedRates.filter((rate) => rate.importDecision === 'NEW');
    const summary = {
      success: true,
      mode,
      importer: 'LEGACY_TOURING_ROUTE_MATRIX',
      workbookMode: 'Legacy Matrix Mode',
      sourceFileName: file.originalname || 'touring-route-matrix.xlsx',
      routeCount: 0,
      stopCount: 0,
      pricingCount: creatableRates.length,
      rowsToCreate: creatableRates.map((rate) => ({ ...rate, validFrom: formatWorkbookDate(rate.validFrom), validTo: formatWorkbookDate(rate.validTo) })),
      skippedRows,
      supplierMapping: { mapped: parsedRates.filter((rate) => rate.supplierId).length, missing: parsedRates.filter((rate) => !rate.supplierId).length },
      routes: [],
      stops: [],
      pricings: parsedRates.map((rate) => ({ ...rate, validFrom: formatWorkbookDate(rate.validFrom), validTo: formatWorkbookDate(rate.validTo) })),
      errors,
      warnings,
      imported: { routes: 0, stops: 0, pricings: 0, updatedRoutes: 0, updatedPricings: 0, skippedOverlaps: 0, skippedRows: skippedRows.length },
    };

    if (mode === 'preview') return summary;

    return this.prisma.$transaction(async (tx) => {
      for (const rate of creatableRates) {
        const route = routesByCode.get(rate.tourCode) as any;
        if (!route || !rate.vehicleId) continue;
        await (tx as any).touringRoutePricing.create({
          data: {
            touringRouteId: route.id,
            supplierId: rate.supplierId,
            vehicleId: rate.vehicleId,
            pricingBasis: rate.pricingBasis,
            minPax: rate.minPax,
            maxPax: rate.maxPax,
            currency: rate.currency,
            baseCost: rate.baseCost,
            costPerDay: null,
            includedKm: null,
            includedHours: null,
            extraKmRate: null,
            extraHourRate: null,
            validFrom: rate.validFrom,
            validTo: rate.validTo,
            active: rate.active,
            notes: this.buildTouringRoutePricingNotes(rate),
          },
        });
        summary.imported.pricings += 1;
      }
      return summary;
    });
  }

  private normalizeRawWorkbookRow(row: Record<string, unknown>) {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[normalizeWorkbookHeader(key)] = normalizeWorkbookText(value);
    }
    return normalized;
  }

  private parseOptionalWorkbookDate(value: unknown, fieldLabel: string, warnings: TouringWorkbookIssue[], sheet: string, row: number) {
    const raw = value instanceof Date ? value : normalizeWorkbookText(value);
    if (!raw) return null;
    const parsed = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      warnings.push({ sheet, row, message: `${fieldLabel} must be a valid date; importing without ${fieldLabel}` });
      return null;
    }
    return parsed;
  }

  private resolveLegacyMatrixVehicle(values: {
    vehicleCode: string;
    vehicleName: string;
    vehicleType: string;
    minPax: number;
    maxPax: number;
    vehiclesByName: Map<string, any>;
    vehiclesByType: Map<string, any[]>;
    vehicles: any[];
  }) {
    const explicitVehicle =
      (values.vehicleCode ? values.vehiclesByName.get(normalizeWorkbookKey(values.vehicleCode)) : null) ||
      (values.vehicleName ? values.vehiclesByName.get(normalizeWorkbookKey(values.vehicleName)) : null) ||
      (values.vehicleType ? (values.vehiclesByType.get(normalizeWorkbookKey(values.vehicleType)) || [])[0] : null);
    if (values.vehicleCode || values.vehicleName || values.vehicleType) return explicitVehicle || null;

    return (
      values.vehicles
        .slice()
        .sort((left: any, right: any) => Number(left.maxPax || 999) - Number(right.maxPax || 999))
        .find((vehicle: any) => Number(vehicle.maxPax || 0) >= values.maxPax && Number(vehicle.minPax || 1) <= values.minPax) ||
      null
    );
  }

  private buildTouringRoutePricingNotes(rate: ParsedTouringWorkbookRate | ParsedLegacyMatrixRate) {
    const notes = normalizeWorkbookText(rate.notes);
    if (rate.supplierId || !normalizeWorkbookText(rate.supplierName)) return notes || null;
    const supplierNote = `SupplierName: ${normalizeWorkbookText(rate.supplierName)}`;
    return [notes, supplierNote].filter(Boolean).join(' | ') || null;
  }

  private async readWorkbook(file: { buffer?: Buffer; path?: string }) {
    const buffer = file.buffer || (file.path ? readFileSync(file.path) : null);
    if (!buffer) {
      throw new BadRequestException('Touring workbook file is required');
    }
    try {
      return XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch (error) {
      if (!this.isUnsupportedWorkbookCompressionError(error)) {
        throw error;
      }
      this.logger.warn(`[touring-workbook] SheetJS could not decompress workbook, retrying with ExcelJS: ${error instanceof Error ? error.message : String(error)}`);
      return this.readWorkbookWithExcelJs(buffer);
    }
  }

  private async readWorkbookWithExcelJs(buffer: Buffer) {
    try {
      const excelWorkbook = new ExcelJS.Workbook();
      await excelWorkbook.xlsx.load(buffer as any);
      const sheetJsWorkbook = XLSX.utils.book_new();
      excelWorkbook.eachSheet((worksheet) => {
        const rows: unknown[][] = [];
        worksheet.eachRow({ includeEmpty: true }, (row) => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          rows.push(values.map((value) => this.normalizeExcelJsCellValue(value)));
        });
        XLSX.utils.book_append_sheet(sheetJsWorkbook, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), worksheet.name);
      });
      return sheetJsWorkbook;
    } catch (error) {
      if (this.isUnsupportedWorkbookCompressionError(error)) {
        throw error;
      }
      throw new BadRequestException(`Could not read touring workbook: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private normalizeExcelJsCellValue(value: unknown): unknown {
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (record.result !== undefined) return record.result;
      if (record.text !== undefined) return record.text;
      if (Array.isArray(record.richText)) {
        return record.richText.map((entry: any) => entry?.text || '').join('');
      }
      if (record.hyperlink && record.text) return record.text;
    }
    return value;
  }

  private isUnsupportedWorkbookCompressionError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    return /unsupported\s+zip\s+compression|compression\s+method|unsupported.*compression/i.test(message);
  }

  private buildWorkbookDecompressionFailure(file: { originalname?: string }, error: unknown): TouringWorkbookDecompressionError & Record<string, unknown> {
    const details = error instanceof Error ? error.message : String(error || '');
    return {
      success: false,
      stage: 'workbook decompression',
      message: 'Unsupported workbook compression format',
      details,
      mode: 'preview',
      sourceFileName: file.originalname || 'touring-workbook.xlsx',
      routeCount: 0,
      stopCount: 0,
      pricingCount: 0,
      supplierMapping: { mapped: 0, missing: 0 },
      routes: [],
      stops: [],
      pricings: [],
      errors: [{ stage: 'workbook decompression', message: 'Unsupported workbook compression format' }],
      warnings: [],
      imported: { routes: 0, stops: 0, pricings: 0, updatedRoutes: 0, updatedPricings: 0, skippedOverlaps: 0 },
    };
  }

  private buildWorkbookFailureResponse(
    file: { originalname?: string },
    stage: string,
    error: unknown,
    sheet?: string,
    row?: number,
  ) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown touring workbook preview error');
    this.logger.error(
      `[touring-workbook] preview structured failure at ${stage}${sheet ? ` sheet ${sheet}` : ''}${row ? ` row ${row}` : ''}: ${message}`,
      error instanceof Error ? error.stack : undefined,
    );

    return {
      success: false,
      mode: 'preview' as const,
      sourceFileName: file.originalname || 'touring-workbook.xlsx',
      routeCount: 0,
      stopCount: 0,
      pricingCount: 0,
      supplierMapping: { mapped: 0, missing: 0 },
      routes: [],
      stops: [],
      pricings: [],
      errors: [
        {
          sheet,
          row,
          stage,
          message,
        },
      ].filter((entry) => entry.message),
      warnings: [],
      imported: { routes: 0, stops: 0, pricings: 0, updatedRoutes: 0, updatedPricings: 0, skippedOverlaps: 0 },
    };
  }

  private logWorkbookStage(
    mode: TouringWorkbookMode,
    stage: string,
    details: Record<string, unknown>,
    level: 'log' | 'debug' = 'log',
  ) {
    const message = `[touring-workbook] ${mode} ${stage} ${JSON.stringify(details)}`;
    if (level === 'debug') {
      this.logger.debug(message);
      return;
    }
    this.logger.log(message);
  }

  private validateWorkbookSheets(workbook: XLSX.WorkBook, errors: Array<{ sheet?: string; row?: number; message: string }>) {
    const sheetNames = new Set(workbook.SheetNames.map((name) => name.trim().toUpperCase()));
    for (const sheetName of TOURING_WORKBOOK_SHEETS) {
      if (!sheetNames.has(sheetName)) {
        errors.push({ sheet: sheetName, message: `Missing required sheet ${sheetName}` });
      }
    }
  }

  private getSheet(workbook: XLSX.WorkBook, sheetName: string) {
    const actualName = workbook.SheetNames.find((name) => name.trim().toUpperCase() === sheetName);
    return actualName ? workbook.Sheets[actualName] : null;
  }

  private readSheetRows<T extends Record<string, string>>(workbook: XLSX.WorkBook, sheetName: string) {
    const sheet = this.getSheet(workbook, sheetName);
    if (!sheet) return [] as Array<{ row: T; rowNumber: number }>;
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    return rawRows.map((row, index) => ({
      row: this.normalizeSheetRow<T>(row),
      rowNumber: index + 2,
    }));
  }

  private normalizeSheetRow<T extends Record<string, string>>(row: Record<string, unknown>) {
    const normalized = {} as Record<string, string>;
    for (const [key, value] of Object.entries(row)) {
      normalized[normalizeWorkbookHeader(key)] = normalizeWorkbookText(value);
    }
    return {
      tourCode: normalized.tourcode || normalized.routecode || normalized.variantcode || '',
      tourName: normalized.tourname || normalized.name || '',
      startCity: normalized.startcity || '',
      returnCity: normalized.returncity || normalized.endcity || '',
      durationHours: normalized.durationhours || normalized.hours || '',
      durationDays: normalized.durationdays || normalized.days || '',
      routeDescription: normalized.routedescription || normalized.mainroute || normalized.description || '',
      mainDestinations: normalized.maindestinations || normalized.destinations || '',
      includedKm: normalized.includedkm || normalized.includedkilometers || '',
      includedHours: normalized.includedhours || '',
      active: normalized.active || normalized.status || '',
      stopOrder: normalized.stoporder || normalized.order || '',
      city: normalized.city || '',
      stopName: normalized.stopname || '',
      stopType: normalized.stoptype || '',
      region: normalized.region || '',
      location: normalized.location || normalized.stopname || '',
      overnight: normalized.overnight || '',
      notes: normalized.notes || '',
      supplierName: normalized.suppliername || normalized.supplier || '',
      vehicleCode: normalized.vehiclecode || '',
      vehicleName: normalized.vehiclename || normalized.vehicle || '',
      vehicleCategory: normalized.vehiclecategory || normalized.vehicletype || '',
      vehicleType: normalized.vehicletype || normalized.vehiclecategory || '',
      pricingBasis: normalized.pricingbasis || '',
      minPax: normalized.minpax || normalized.paxfrom || '',
      maxPax: normalized.maxpax || normalized.paxto || '',
      paxFrom: normalized.paxfrom || normalized.minpax || '',
      paxTo: normalized.paxto || normalized.maxpax || '',
      currency: normalized.currency || '',
      baseCost: normalized.basecost || normalized.baseprice || normalized.cost || normalized.rate || '',
      costPerDay: normalized.costperday || '',
      extraKmRate: normalized.extrakmrate || normalized.extrakm || '',
      extraHourRate: normalized.extrahourrate || normalized.extrahour || '',
      validFrom: normalized.validfrom || normalized.from || '',
      validTo: normalized.validto || normalized.to || '',
    } as unknown as T;
  }

  private normalizeRouteData(data: Partial<TouringRouteInput>, partial = false) {
    const name = data.name === undefined && partial ? undefined : requireTrimmedString(String(data.name || ''), 'name');
    const codeSource = data.code || name || '';
    return {
      code: data.code === undefined && partial ? undefined : normalizeCode(codeSource),
      name,
      startCity: data.startCity === undefined && partial ? undefined : requireTrimmedString(String(data.startCity || ''), 'startCity'),
      durationDays:
        data.durationDays === undefined && partial ? undefined : normalizeOptionalPositiveInteger(data.durationDays, 'durationDays', 1),
      routeDescription: data.routeDescription === undefined && partial ? undefined : normalizeOptionalString(data.routeDescription),
      mainDestinations:
        data.mainDestinations === undefined && partial
          ? undefined
          : Array.isArray(data.mainDestinations)
            ? data.mainDestinations.map(String).map((entry) => entry.trim()).filter(Boolean)
            : [],
      includedKm: data.includedKm === undefined && partial ? undefined : normalizeOptionalNumber(data.includedKm, 'includedKm'),
      includedHours:
        data.includedHours === undefined && partial ? undefined : normalizeOptionalNumber(data.includedHours, 'includedHours'),
      estimatedDistanceKm:
        data.estimatedDistanceKm === undefined && partial ? undefined : normalizeOptionalNumber(data.estimatedDistanceKm, 'estimatedDistanceKm'),
      estimatedDriveHours:
        data.estimatedDriveHours === undefined && partial ? undefined : normalizeOptionalNumber(data.estimatedDriveHours, 'estimatedDriveHours'),
      region: data.region === undefined && partial ? undefined : normalizeOptionalString(data.region),
      longDistance: data.longDistance === undefined ? undefined : Boolean(data.longDistance),
      desertRoad: data.desertRoad === undefined ? undefined : Boolean(data.desertRoad),
      mountainRoad: data.mountainRoad === undefined ? undefined : Boolean(data.mountainRoad),
      seasonalHeatRisk: data.seasonalHeatRisk === undefined ? undefined : Boolean(data.seasonalHeatRisk),
      sicPossible: data.sicPossible === undefined ? undefined : Boolean(data.sicPossible),
      overnightRisk: data.overnightRisk === undefined ? undefined : Boolean(data.overnightRisk),
      reviewNotes: data.reviewNotes === undefined && partial ? undefined : normalizeOptionalString(data.reviewNotes),
      active: data.active === undefined ? undefined : Boolean(data.active),
      stops:
        data.stops === undefined
          ? undefined
          : {
              deleteMany: {},
              create: data.stops.map((stop, index) => ({
                order: stop.order === undefined || stop.order === null ? index + 1 : Math.floor(Number(stop.order)),
                city: requireTrimmedString(stop.city, `stops[${index}].city`),
                location: normalizeOptionalString(stop.location),
                notes: normalizeOptionalString(stop.notes),
              })),
            },
      pricings:
        data.pricings === undefined
          ? undefined
          : {
              deleteMany: {},
              create: data.pricings.map((pricing, index) => ({
                supplierId: normalizeOptionalString(pricing.supplierId),
                vehicleId: normalizeOptionalString(pricing.vehicleId),
                transportServiceTypeId: normalizeOptionalString(pricing.transportServiceTypeId),
                pricingBasis: pricing.pricingBasis || 'PER_VEHICLE',
                minPax: normalizeOptionalPositiveInteger(pricing.minPax, `pricings[${index}].minPax`, 1),
                maxPax: normalizeOptionalPositiveInteger(pricing.maxPax, `pricings[${index}].maxPax`, 99),
                currency: normalizeOptionalString(pricing.currency) || 'USD',
                baseCost: normalizeOptionalNumber(pricing.baseCost, `pricings[${index}].baseCost`) ?? 0,
                costPerDay: normalizeOptionalNumber(pricing.costPerDay, `pricings[${index}].costPerDay`),
                includedKm: normalizeOptionalNumber(pricing.includedKm, `pricings[${index}].includedKm`),
                includedHours: normalizeOptionalNumber(pricing.includedHours, `pricings[${index}].includedHours`),
                extraKmRate: normalizeOptionalNumber(pricing.extraKmRate, `pricings[${index}].extraKmRate`),
                extraHourRate: normalizeOptionalNumber(pricing.extraHourRate, `pricings[${index}].extraHourRate`),
                validFrom: pricing.validFrom ? new Date(pricing.validFrom) : null,
                validTo: pricing.validTo ? new Date(pricing.validTo) : null,
                active: pricing.active === undefined ? true : Boolean(pricing.active),
                notes: normalizeOptionalString(pricing.notes),
              })),
            },
    };
  }
}
