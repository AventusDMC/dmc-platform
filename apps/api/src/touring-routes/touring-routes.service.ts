import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
  active?: boolean;
  stops?: TouringRouteStopInput[];
  pricings?: TouringRoutePricingInput[];
};

type FindTouringRoutesInput = {
  search?: string;
  active?: boolean;
  limit?: number;
};

type TouringWorkbookMode = 'preview' | 'import';
type TouringWorkbookStatus = 'NEW' | 'UPDATED' | 'UNCHANGED' | 'OVERLAP';
type TouringWorkbookIssue = { sheet?: string; row?: number; stage?: string; message: string };

type TouringWorkbookRouteRow = {
  tourCode: string;
  tourName: string;
  startCity: string;
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
  location: string;
  overnight: string;
  notes: string;
};

type TouringWorkbookRateRow = {
  tourCode: string;
  supplierName: string;
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

type ParsedTouringWorkbookRate = {
  row: number;
  tourCode: string;
  supplierName: string;
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

const TOURING_WORKBOOK_SHEETS = ['TOURING_ROUTES', 'TOURING_ROUTE_STOPS', 'TOURING_ROUTE_RATES', 'VEHICLE_TYPES'] as const;
const TOURING_ROUTE_COLUMNS = ['TourCode', 'TourName', 'StartCity', 'DurationDays'] as const;
const TOURING_STOP_COLUMNS = ['TourCode', 'StopOrder', 'City'] as const;
const TOURING_RATE_COLUMNS = ['TourCode', 'SupplierName', 'VehicleType', 'PaxFrom', 'PaxTo', 'Currency', 'BaseCost', 'ValidFrom', 'ValidTo'] as const;

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

function parseWorkbookDate(value: unknown, fieldLabel: string, errors: string[]) {
  const raw = value instanceof Date ? value : normalizeWorkbookText(value);
  if (!raw) {
    errors.push(`${fieldLabel} is required`);
    return null;
  }
  const parsed = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(`${fieldLabel} must be a valid date`);
    return null;
  }
  return parsed;
}

function formatWorkbookDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : '';
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

  private async processWorkbookImport(file: { buffer?: Buffer; path?: string; originalname?: string }, mode: TouringWorkbookMode) {
    let stage = 'workbook read';
    let sheet: string | undefined;
    let activeRow: number | undefined;
    try {
    this.logWorkbookStage(mode, stage, { fileName: file.originalname || file.path || 'uploaded workbook' });
    const workbook = this.readWorkbook(file);
    const errors: TouringWorkbookIssue[] = [];
    const warnings: TouringWorkbookIssue[] = [];
    stage = 'workbook tab detection';
    this.logWorkbookStage(mode, stage, { sheets: workbook.SheetNames });
    this.validateWorkbookSheets(workbook, errors);

    stage = 'worksheet parsing';
    sheet = 'TOURING_ROUTES';
    const routes = this.readSheetRows<TouringWorkbookRouteRow>(workbook, 'TOURING_ROUTES');
    sheet = 'TOURING_ROUTE_STOPS';
    const stops = this.readSheetRows<TouringWorkbookStopRow>(workbook, 'TOURING_ROUTE_STOPS');
    sheet = 'TOURING_ROUTE_RATES';
    const rates = this.readSheetRows<TouringWorkbookRateRow>(workbook, 'TOURING_ROUTE_RATES');
    this.logWorkbookStage(mode, stage, { routes: routes.length, stops: stops.length, rates: rates.length });
    stage = 'column validation';
    this.validateSheetColumns(workbook, 'TOURING_ROUTES', TOURING_ROUTE_COLUMNS, errors);
    this.validateSheetColumns(workbook, 'TOURING_ROUTE_STOPS', TOURING_STOP_COLUMNS, errors);
    this.validateSheetColumns(workbook, 'TOURING_ROUTE_RATES', TOURING_RATE_COLUMNS, errors);

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
    const routesByCode = new Map(existingRoutes.map((route: any) => [route.code, route]));
    const suppliers = await this.prisma.supplier.findMany({ where: { type: { equals: 'transport', mode: 'insensitive' } } });
    const vehicles = await (this.prisma as any).vehicle.findMany();
    const suppliersByName = new Map(suppliers.map((supplier: any) => [normalizeWorkbookKey(supplier.name), supplier]));
    const vehiclesByName = new Map(vehicles.map((vehicle: any) => [normalizeWorkbookKey(vehicle.name), vehicle]));
    const vehiclesByType = new Map<string, any[]>();
    for (const vehicle of vehicles) {
      const key = normalizeWorkbookKey(vehicle.vehicleType || vehicle.name);
      if (!vehiclesByType.has(key)) vehiclesByType.set(key, []);
      vehiclesByType.get(key)?.push(vehicle);
    }

    stage = 'TOURING_ROUTES normalization';
    sheet = 'TOURING_ROUTES';
    const parsedRoutes = routes.map(({ row, rowNumber }) => {
      activeRow = rowNumber;
      this.logWorkbookStage(mode, stage, { row: rowNumber }, 'debug');
      const rowErrors: string[] = [];
      const code = normalizeCode(row.tourCode || '');
      const durationDays = parseWorkbookInteger(row.durationDays, 'DurationDays', rowErrors, { required: true, min: 1 }) ?? 1;
      const includedKm = parseWorkbookNumber(row.includedKm, 'IncludedKM', rowErrors, { min: 0 });
      const includedHours = parseWorkbookNumber(row.includedHours, 'IncludedHours', rowErrors, { min: 0 });
      if (!normalizeWorkbookText(row.tourName)) rowErrors.push('TourName is required');
      if (!normalizeWorkbookText(row.startCity)) rowErrors.push('StartCity is required');
      for (const message of rowErrors) errors.push({ sheet: 'TOURING_ROUTES', row: rowNumber, message });

      const existing = routesByCode.get(code) as any;
      const mainDestinations = normalizeWorkbookText(row.mainDestinations)
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
      const order = parseWorkbookInteger(row.stopOrder, 'StopOrder', rowErrors, { required: true, min: 1 }) ?? 1;
      const city = normalizeWorkbookText(row.city);
      if (!city) rowErrors.push('City is required');
      for (const message of rowErrors) errors.push({ sheet: 'TOURING_ROUTE_STOPS', row: rowNumber, message });
      if (!stopsByCode.has(code)) stopsByCode.set(code, []);
      stopsByCode.get(code)?.push({
        row: rowNumber,
        order,
        city,
        location: normalizeWorkbookText(row.location),
        overnight: parseWorkbookBoolean(row.overnight, false),
        notes: normalizeWorkbookText(row.notes),
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
      const vehicleName = normalizeWorkbookText(row.vehicleName);
      const vehicleType = normalizeWorkbookText(row.vehicleType);
      const vehicle =
        (vehicleName ? vehiclesByName.get(normalizeWorkbookKey(vehicleName)) : null) ||
        (vehicleType ? (vehiclesByType.get(normalizeWorkbookKey(vehicleType)) || [])[0] : null) ||
        null;
      if (!vehicleType && !vehicleName) rowErrors.push('VehicleType or VehicleName is required');
      if (!vehicle) rowErrors.push(`Vehicle reference not found for ${vehicleName || vehicleType || '(blank)'}`);
      const minPax = parseWorkbookInteger(row.paxFrom, 'PaxFrom', rowErrors, { required: true, min: 1 }) ?? 1;
      const maxPax = parseWorkbookInteger(row.paxTo, 'PaxTo', rowErrors, { required: true, min: minPax }) ?? minPax;
      const baseCost = parseWorkbookNumber(row.baseCost, 'BaseCost', rowErrors, { required: true, min: 0 }) ?? 0;
      const validFrom = parseWorkbookDate(row.validFrom, 'ValidFrom', rowErrors);
      const validTo = parseWorkbookDate(row.validTo, 'ValidTo', rowErrors);
      if (validFrom && validTo && validFrom > validTo) rowErrors.push('ValidFrom cannot be after ValidTo');
      const pricingBasis = normalizeWorkbookText(row.pricingBasis).toUpperCase() === 'PER_DAY' ? 'PER_DAY' : 'PER_VEHICLE';
      const currency = normalizeWorkbookText(row.currency).toUpperCase();
      if (!['USD', 'EUR', 'JOD'].includes(currency)) rowErrors.push('Currency must be USD, EUR, or JOD');
      const rateKey = [code, supplier?.id || supplierName, vehicle?.id || vehicleName || vehicleType, pricingBasis, minPax, maxPax, currency, formatWorkbookDate(validFrom), formatWorkbookDate(validTo)].join('|');
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
      const exact = matchingPricings.find((pricing: any) => formatWorkbookDate(new Date(pricing.validFrom)) === formatWorkbookDate(validFrom) && formatWorkbookDate(new Date(pricing.validTo)) === formatWorkbookDate(validTo));
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
        vehicleName,
        vehicleType,
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
      imported: { routes: 0, stops: 0, pricings: 0, updatedRoutes: 0, updatedPricings: 0, skippedOverlaps: 0 },
    };

    if (mode === 'preview') return summary;
    if (errors.length > 0) {
      throw new BadRequestException(errors.map((error) => `${error.sheet || 'WORKBOOK'}${error.row ? ` row ${error.row}` : ''}: ${error.message}`).join('; '));
    }

    return this.prisma.$transaction(async (tx) => {
      for (const route of parsedRoutes) {
        const existing = routesByCode.get(route.code) as any;
        const saved = existing
          ? await (tx as any).touringRoute.update({
              where: { id: existing.id },
              data: {
                name: route.name,
                startCity: route.startCity,
                durationDays: route.durationDays,
                routeDescription: route.routeDescription || null,
                mainDestinations: route.mainDestinations,
                includedKm: route.includedKm,
                includedHours: route.includedHours,
                active: route.active,
              },
            })
          : await (tx as any).touringRoute.create({
              data: {
                code: route.code,
                name: route.name,
                startCity: route.startCity,
                durationDays: route.durationDays,
                routeDescription: route.routeDescription || null,
                mainDestinations: route.mainDestinations,
                includedKm: route.includedKm,
                includedHours: route.includedHours,
                active: route.active,
              },
            });
        if (existing) summary.imported.updatedRoutes += 1;
        else summary.imported.routes += 1;
        await (tx as any).touringRouteStop.deleteMany({ where: { touringRouteId: saved.id } });
        const routeStops = stopsByCode.get(route.code) || [];
        if (routeStops.length > 0) {
          await (tx as any).touringRouteStop.createMany({
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
      }

      for (const rate of parsedRates) {
        const route = routesByCode.get(rate.tourCode) as any;
        if (!route || !rate.vehicleId || !rate.validFrom || !rate.validTo || rate.importDecision === 'UNCHANGED') continue;
        if (rate.importDecision === 'OVERLAP') {
          summary.imported.skippedOverlaps += 1;
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
          validFrom: rate.validFrom,
          validTo: rate.validTo,
          active: rate.active,
          notes: rate.notes || null,
        };
        if (rate.existingPricingId) {
          await (tx as any).touringRoutePricing.update({ where: { id: rate.existingPricingId }, data });
          summary.imported.updatedPricings += 1;
        } else {
          await (tx as any).touringRoutePricing.create({ data });
          summary.imported.pricings += 1;
        }
      }
      return summary;
    });
    } catch (error) {
      this.logger.error(
        `[touring-workbook] ${mode} failed at ${stage}`,
        error instanceof Error ? error.stack : String(error),
      );
      if (mode === 'preview') {
        return this.buildWorkbookFailureResponse(file, stage, error, sheet, activeRow);
      }
      throw error;
    }
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

  private readWorkbook(file: { buffer?: Buffer; path?: string }) {
    if (file.buffer) {
      return XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    }
    if (file.path) {
      return XLSX.readFile(file.path, { cellDates: true });
    }
    throw new BadRequestException('Touring workbook file is required');
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
      tourCode: normalized.tourcode || '',
      tourName: normalized.tourname || normalized.name || '',
      startCity: normalized.startcity || '',
      durationDays: normalized.durationdays || normalized.days || '',
      routeDescription: normalized.routedescription || normalized.description || '',
      mainDestinations: normalized.maindestinations || normalized.destinations || '',
      includedKm: normalized.includedkm || normalized.includedkilometers || '',
      includedHours: normalized.includedhours || '',
      active: normalized.active || normalized.status || '',
      stopOrder: normalized.stoporder || normalized.order || '',
      city: normalized.city || '',
      location: normalized.location || '',
      overnight: normalized.overnight || '',
      notes: normalized.notes || '',
      supplierName: normalized.suppliername || normalized.supplier || '',
      vehicleName: normalized.vehiclename || normalized.vehicle || '',
      vehicleType: normalized.vehicletype || '',
      pricingBasis: normalized.pricingbasis || '',
      paxFrom: normalized.paxfrom || normalized.minpax || '',
      paxTo: normalized.paxto || normalized.maxpax || '',
      currency: normalized.currency || '',
      baseCost: normalized.basecost || normalized.cost || normalized.rate || '',
      costPerDay: normalized.costperday || '',
      extraKmRate: normalized.extrakmrate || normalized.extrakm || '',
      extraHourRate: normalized.extrahourrate || normalized.extrahour || '',
      validFrom: normalized.validfrom || normalized.from || '',
      validTo: normalized.validto || normalized.to || '',
    } as unknown as T;
  }

  private validateSheetColumns(
    workbook: XLSX.WorkBook,
    sheetName: string,
    requiredColumns: readonly string[],
    errors: Array<{ sheet?: string; row?: number; message: string }>,
  ) {
    const sheet = this.getSheet(workbook, sheetName);
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown as unknown[][];
    const headers = new Set((rows[0] || []).map(normalizeWorkbookHeader));
    for (const column of requiredColumns) {
      if (!headers.has(normalizeWorkbookHeader(column))) {
        errors.push({ sheet: sheetName, message: `Missing required column ${column}` });
      }
    }
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
