import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import ExcelJS = require('exceljs');
import * as XLSX from 'xlsx';
import { AuthenticatedActor } from '../auth/auth.types';
import { requireActorCompanyId } from '../auth/company-scope';
import { normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { buildRouteNormalizedKey, formatRouteName } from '../routes/route-normalization';

type TouringRouteStopInput = {
  order?: number | null;
  city: string;
  location?: string | null;
  notes?: string | null;
};

type TouringRoutePricingInput = {
  id?: string | null;
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

type TouringRouteAuditClassification =
  | 'TOURING_ROUTE'
  | 'ACTIVITY_CANDIDATE'
  | 'EXCURSION_TEMPLATE_CANDIDATE'
  | 'TRANSFER_ROUTE_CANDIDATE'
  | 'REVIEW';

type TouringRouteCleanupRecommendation =
  | 'KEEP_AS_TOURING_ROUTE'
  | 'MOVE_TO_ACTIVITY_MASTER'
  | 'CONVERT_TO_EXCURSION_TEMPLATE'
  | 'MOVE_TO_TRANSFER_ROUTE'
  | 'MANUAL_REVIEW';

type TouringRouteCleanupPreviewActionName =
  | 'convertToActivityMasterPreview'
  | 'convertToExcursionTemplatePreview'
  | 'convertToTransferRoutePreview'
  | 'archiveTouringRoutePreview';

type TouringRouteCleanupDryRunActionName =
  | 'executeConvertToActivityMasterDryRun'
  | 'executeConvertToExcursionTemplateDryRun'
  | 'executeConvertToTransferRouteDryRun'
  | 'executeArchiveTouringRouteDryRun';

type ExecuteConvertToActivityMasterInput = {
  dryRunAction?: string | null;
  dryRunConfirmed?: boolean | null;
  confirmationText?: string | null;
};

type AqabaActivityCleanupApplyInput = {
  companyId: string;
  userId?: string | null;
};

type AqabaActivityCleanupBatchApplyInput = AqabaActivityCleanupApplyInput & {
  confirm?: string | null;
};

type AqabaRtDependenciesApplyInput = {
  confirm?: string | null;
};

type AqabaRtExcursionConversionApplyInput = {
  companyId: string;
  userId?: string | null;
  confirm?: string | null;
};

type RollbackConvertToActivityMasterInput = {
  activityId?: string | null;
  confirmationText?: string | null;
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

const AQABA_ACTIVITY_BATCH_ALLOWED_CODES = ['AQ_BOAT', 'AQ_YACHT', 'AQ_DIVE', 'AQ_SNORK', 'AQ_BEACH', 'AQ_SUB'] as const;
const AQABA_ACTIVITY_BATCH_CONFIRMATION = 'AQABA_ACTIVITY_BATCH_CLEANUP';
const AQABA_ACTIVITY_BATCH_ALLOWED_CODE_SET = new Set<string>(AQABA_ACTIVITY_BATCH_ALLOWED_CODES);
const AQABA_RT_CLEANUP_ALLOWED_CODES = [
  'JOR-TR-AQABA-BERENICE-RT',
  'JOR-TR-AQABA-DIVING-RT',
  'JOR-TR-AQABA-GLASS-BOAT-RT',
  'JOR-TR-AQABA-YACHT-RT',
  'JOR-TR-AQABA-SNORKELING-RT',
  'JOR-TR-AQABA-SOUTH-BEACH-RT',
] as const;
const AQABA_RT_CLEANUP_ALLOWED_CODE_SET = new Set<string>(AQABA_RT_CLEANUP_ALLOWED_CODES);
const AQABA_RT_ACTIVITY_SITES: Record<string, { expectedActivityCode?: string; expectedActivityName: string; siteName: string; siteTerms: string[] }> = {
  'JOR-TR-AQABA-BERENICE-RT': {
    expectedActivityName: 'Berenice Beach Club',
    siteName: 'Berenice Beach Club',
    siteTerms: ['berenice', 'beach club'],
  },
  'JOR-TR-AQABA-DIVING-RT': {
    expectedActivityCode: 'JOR-ACT-SOUTH-SCUBA-DIVING-EXPERIENCE',
    expectedActivityName: 'Scuba Diving Experience',
    siteName: 'Aqaba Diving Site',
    siteTerms: ['diving', 'dive', 'south beach'],
  },
  'JOR-TR-AQABA-GLASS-BOAT-RT': {
    expectedActivityCode: 'JOR-ACT-SOUTH-GLASS-BOAT-TOUR',
    expectedActivityName: 'Glass Boat Tour',
    siteName: 'Aqaba Glass Boat Pier',
    siteTerms: ['glass boat', 'marina', 'pier'],
  },
  'JOR-TR-AQABA-YACHT-RT': {
    expectedActivityCode: 'JOR-ACT-SOUTH-PRIVATE-YACHT-CHARTER',
    expectedActivityName: 'Private Yacht Charter',
    siteName: 'Aqaba Marina',
    siteTerms: ['yacht', 'marina'],
  },
  'JOR-TR-AQABA-SNORKELING-RT': {
    expectedActivityCode: 'JOR-ACT-SOUTH-SNORKELING-EXPERIENCE',
    expectedActivityName: 'Snorkeling Experience',
    siteName: 'Aqaba Snorkeling Site',
    siteTerms: ['snorkeling', 'snorkel', 'south beach'],
  },
  'JOR-TR-AQABA-SOUTH-BEACH-RT': {
    expectedActivityCode: 'JOR-ACT-SOUTH-SOUTH-BEACH-DAY',
    expectedActivityName: 'South Beach Day',
    siteName: 'South Beach Aqaba',
    siteTerms: ['south beach', 'beach'],
  },
};
const AQABA_RT_DEPENDENCIES_CONFIRMATION = 'AQABA_RT_DEPENDENCIES';
const AQABA_RT_EXCURSION_CONVERSION_CONFIRMATION = 'AQABA_RT_EXCURSION_CONVERSION';
const AQABA_RT_DEPENDENCY_PLACE_NAMES = ['Berenice Beach Club', 'Aqaba Glass Boat Pier', 'Aqaba Marina'] as const;
const AQABA_RT_DEPENDENCY_ROUTE_PAIRS = [
  ['Aqaba', 'Berenice Beach Club'],
  ['Berenice Beach Club', 'Aqaba'],
  ['Aqaba', 'Aqaba South Beach'],
  ['Aqaba South Beach', 'Aqaba'],
  ['Aqaba', 'Aqaba Glass Boat Pier'],
  ['Aqaba Glass Boat Pier', 'Aqaba'],
  ['Aqaba', 'Aqaba Marina'],
  ['Aqaba Marina', 'Aqaba'],
] as const;

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
  const raw = value.trim().toUpperCase();
  if (/^JOR[\s_-]+TR(?:[\s_-]|$)/.test(raw)) {
    return (
      raw
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'TOURING-ROUTE'
    );
  }

  return (
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'TOURING_ROUTE'
  );
}

function normalizeCanonicalCodePart(value: string | null | undefined) {
  return normalizeWorkbookText(value)
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\bRT\b/g, 'ROUND TRIP')
    .replace(/\bON\b/g, 'OVERNIGHT')
    .replace(/\bOW\b/g, 'ONE WAY')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function buildActivityMasterCodeFromTouringRoute(route: {
  name?: string | null;
  code?: string | null;
  region?: string | null;
  startCity?: string | null;
  mainDestinations?: unknown;
}) {
  return buildCanonicalTouringRouteCode(route).replace(/^JOR-TR-/, 'JOR-ACT-').slice(0, 120);
}

export function buildCanonicalTouringRouteCode(route: {
  name?: string | null;
  region?: string | null;
  startCity?: string | null;
  mainDestinations?: unknown;
}) {
  const region = normalizeCanonicalCodePart(route.region || deriveTouringRouteRegion(route));
  const routeName = normalizeCanonicalCodePart(route.name || [route.startCity, ...getTouringRouteDestinations(route)].filter(Boolean).join(' '));
  return `JOR-TR-${region || 'GENERAL'}-${routeName || 'TOURING-ROUTE'}`.slice(0, 120);
}

function getTouringRouteDestinations(route: { mainDestinations?: unknown }) {
  return Array.isArray(route.mainDestinations) ? route.mainDestinations.map((entry) => normalizeWorkbookText(entry)).filter(Boolean) : [];
}

function getTouringRouteText(route: {
  code?: string | null;
  name?: string | null;
  startCity?: string | null;
  routeDescription?: string | null;
  region?: string | null;
  reviewNotes?: string | null;
  mainDestinations?: unknown;
  stops?: Array<{ city?: string | null; location?: string | null; notes?: string | null }> | null;
}) {
  return [
    route.code,
    route.name,
    route.startCity,
    route.routeDescription,
    route.region,
    route.reviewNotes,
    ...getTouringRouteDestinations(route),
    ...(route.stops || []).flatMap((stop) => [stop.city, stop.location, stop.notes]),
  ]
    .filter(Boolean)
    .join(' ');
}

function deriveTouringRouteRegion(route: { region?: string | null; startCity?: string | null; mainDestinations?: unknown; stops?: Array<{ city?: string | null; location?: string | null }> | null }) {
  if (normalizeWorkbookText(route.region)) return normalizeWorkbookText(route.region);
  const text = getTouringRouteText(route).toLowerCase();
  if (/aqaba|wadi rum|petra|dana|kerak|karak|little petra/.test(text)) return 'South';
  if (/jerash|ajloun|umm qais|pella|salt/.test(text)) return 'North';
  if (/madaba|nebo|dead sea|bethany|desert castles|amman/.test(text)) return 'Central';
  if (/muta|blessed tree|islamic/.test(text)) return 'Islamic';
  return 'General';
}

function classifyTouringRouteAudit(route: {
  code?: string | null;
  name?: string | null;
  durationDays?: number | null;
  routeDescription?: string | null;
  mainDestinations?: unknown;
  overnightRisk?: boolean | null;
  overnight?: boolean | null;
  stops?: Array<{ city?: string | null; location?: string | null; notes?: string | null }> | null;
}) {
  const text = getTouringRouteText(route).toLowerCase();
  const destinations = getTouringRouteDestinations(route);
  const stopCount = route.stops?.length || 0;
  const overnight = Boolean(route.overnight || route.overnightRisk || /\bon\b|overnight/.test(text));
  const oneWay = /\bow\b|one way|one-way/.test(text);
  const legacyAqabaActivityCode = AQABA_ACTIVITY_BATCH_ALLOWED_CODE_SET.has(normalizeWorkbookText(route.code));
  const aqabaExperience =
    (/aqaba/.test(text) || legacyAqabaActivityCode) &&
    /boat|glass boat|snorkel|snorkeling|diving|dive|yacht|submarine|\bsub\b|berenice|south beach|marina|beach club|beach/.test(text);
  const simpleExcursion =
    !overnight &&
    Number(route.durationDays || 1) <= 1 &&
    /day tour|full day|half day|city tour|visit|sightseeing/.test(text) &&
    destinations.length <= 2;
  const transferLike = oneWay && !/via|tour|visit|sightseeing|castle|nebo|madaba|jerash|ajloun|bethany|desert/.test(text) && stopCount <= 2;

  if (aqabaExperience) return 'ACTIVITY_CANDIDATE' as const;
  if (simpleExcursion) return 'EXCURSION_TEMPLATE_CANDIDATE' as const;
  if (transferLike) return 'TRANSFER_ROUTE_CANDIDATE' as const;
  if (!normalizeWorkbookText(route.name)) return 'REVIEW' as const;
  return 'TOURING_ROUTE' as const;
}

function recommendTouringRouteCleanup(
  route: {
    code?: string | null;
    name?: string | null;
    durationDays?: number | null;
    routeDescription?: string | null;
    mainDestinations?: unknown;
    overnightRisk?: boolean | null;
    overnight?: boolean | null;
    stops?: Array<{ city?: string | null; location?: string | null; notes?: string | null }> | null;
  },
  classification: TouringRouteAuditClassification,
): TouringRouteCleanupRecommendation {
  const text = getTouringRouteText(route).toLowerCase();
  const stopCount = route.stops?.length || 0;

  if (classification === 'ACTIVITY_CANDIDATE') return 'MOVE_TO_ACTIVITY_MASTER';
  if (classification === 'EXCURSION_TEMPLATE_CANDIDATE') return 'CONVERT_TO_EXCURSION_TEMPLATE';
  if (classification === 'REVIEW') return 'MANUAL_REVIEW';
  if (classification === 'TRANSFER_ROUTE_CANDIDATE') {
    return /camp|campsite|camp area|disi/.test(text) && stopCount > 1 ? 'MANUAL_REVIEW' : 'MOVE_TO_TRANSFER_ROUTE';
  }

  return 'KEEP_AS_TOURING_ROUTE';
}

function hasRoundTripOrMovementStyleName(route: { name?: string | null; code?: string | null; routeDescription?: string | null }) {
  const name = normalizeWorkbookText(route.name).toUpperCase();
  const code = normalizeWorkbookText(route.code).toUpperCase();
  const description = normalizeWorkbookText(route.routeDescription).toUpperCase();
  const text = [name, code, description].filter(Boolean).join(' ');

  return (
    /\bRT\b|ROUND[\s-]?TRIP|RETURN TRANSFER|ONE[\s-]?WAY|\bOW\b|TRANSFER/.test(text) ||
    /->|↔|→| TO /.test(name) ||
    /^JOR-TR-/.test(code)
  );
}

function deriveOperationalComplexity(route: { durationDays?: number | null; overnightRisk?: boolean | null; overnight?: boolean | null; stops?: unknown[] | null; estimatedDriveHours?: number | null; estimatedDistanceKm?: number | null }) {
  if (route.overnight || route.overnightRisk || Number(route.durationDays || 1) > 1) return 'HIGH';
  if ((route.stops?.length || 0) >= 3 || Number(route.estimatedDriveHours || 0) >= 4 || Number(route.estimatedDistanceKm || 0) >= 180) return 'MEDIUM';
  return 'LOW';
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
    const existing = await (this.prisma as any).touringRoute.findUnique({
      where: { code: normalized.code },
      select: { id: true, code: true, name: true },
    });

    if (existing) {
      throw new BadRequestException(`Touring route code ${normalized.code} already exists.`);
    }

    return (this.prisma as any).touringRoute.create({
      data: normalized,
      include: this.include(),
    });
  }

  async update(id: string, data: Partial<TouringRouteInput>) {
    await this.findOne(id);
    const normalized = this.normalizeRouteData({ ...data, pricings: undefined }, true);
    if (normalized.code) {
      const duplicate = await (this.prisma as any).touringRoute.findUnique({
        where: { code: normalized.code },
        select: { id: true, code: true, name: true },
      });

      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException(`Touring route code ${normalized.code} already exists.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await (tx as any).touringRoute.update({
        where: { id },
        data: normalized,
      });

      if (data.pricings !== undefined) {
        await this.syncTouringRoutePricings(tx, id, data.pricings);
      }

      return (tx as any).touringRoute.findUnique({
        where: { id },
        include: this.include(),
      });
    });
  }

  async duplicate(id: string) {
    const source = await this.findOne(id);
    const copyName = `Copy of ${source.name}`;
    const copyCode = await this.buildUniqueDuplicateCode(source.code || source.name);

    return (this.prisma as any).touringRoute.create({
      data: {
        code: copyCode,
        name: copyName,
        startCity: source.startCity,
        durationDays: source.durationDays,
        routeDescription: source.routeDescription || null,
        mainDestinations: Array.isArray(source.mainDestinations) ? source.mainDestinations : [],
        includedKm: source.includedKm ?? null,
        includedHours: source.includedHours ?? null,
        estimatedDistanceKm: source.estimatedDistanceKm ?? null,
        estimatedDriveHours: source.estimatedDriveHours ?? null,
        region: source.region || null,
        longDistance: Boolean(source.longDistance),
        desertRoad: Boolean(source.desertRoad),
        mountainRoad: Boolean(source.mountainRoad),
        seasonalHeatRisk: Boolean(source.seasonalHeatRisk),
        sicPossible: Boolean(source.sicPossible),
        overnightRisk: Boolean(source.overnightRisk),
        reviewNotes: source.reviewNotes || null,
        active: false,
        stops: {
          create: (source.stops || []).map((stop: any, index: number) => ({
            order: stop.order ?? index + 1,
            city: stop.city,
            location: stop.location || null,
            notes: stop.notes || null,
          })),
        },
      },
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

  async previewOperationalAudit() {
    const routes = await (this.prisma as any).touringRoute.findMany({
      include: this.include(),
      orderBy: [{ active: 'desc' }, { region: 'asc' }, { name: 'asc' }],
    });
    const rows = await Promise.all((routes || []).map((route: any) => this.buildOperationalAuditRow(route)));
    const counts = rows.reduce(
      (summary: Record<string, number>, row) => {
        summary.total += 1;
        summary[row.classification] = (summary[row.classification] || 0) + 1;
        summary[`recommendation:${row.cleanupRecommendation}`] = (summary[`recommendation:${row.cleanupRecommendation}`] || 0) + 1;
        if (row.selectorEligible) summary.selectorEligible += 1;
        return summary;
      },
      {
        total: 0,
        selectorEligible: 0,
      } as Record<string, number>,
    );
    const recommendationCounts = rows.reduce(
      (summary: Record<string, number>, row) => {
        summary[row.cleanupRecommendation] = (summary[row.cleanupRecommendation] || 0) + 1;
        return summary;
      },
      {} as Record<string, number>,
    );

    return {
      success: true,
      mode: 'preview' as const,
      mutatesData: false,
      canonicalCodeFormat: 'JOR-TR-{REGION}-{ROUTE-NAME}',
      workbookLogic: {
        normalizedWorkbookImport: 'TOURING_ROUTES / TOURING_ROUTE_STOPS / TOURING_ROUTE_RATES / VEHICLE_TYPES',
        legacyMatrixPreview: LEGACY_MATRIX_SHEETS.join(', '),
        tariffMatrixExport: 'VehicleRatesService.exportTouringRouteTariffMatrix uses Touring Route Code from touring_routes.code',
      },
      counts,
      recommendationCounts,
      rows,
    };
  }

  async dryRunAqabaActivityCleanup(input: { id?: string | null } = {}) {
    const id = normalizeWorkbookText(input.id);
    const routes = await (this.prisma as any).touringRoute.findMany({
      where: id ? { id } : undefined,
      include: this.include(),
      orderBy: [{ active: 'desc' }, { region: 'asc' }, { name: 'asc' }],
    });
    const candidates = [];

    for (const route of routes || []) {
      const auditRow = await this.buildOperationalAuditRow(route);
      if (auditRow.classification !== 'ACTIVITY_CANDIDATE' || auditRow.cleanupRecommendation !== 'MOVE_TO_ACTIVITY_MASTER') {
        continue;
      }

      const proposedActivityCode = buildActivityMasterCodeFromTouringRoute(route);
      const duplicateActivities = await this.findDuplicateActivitiesForTouringRoute(route, proposedActivityCode);
      const impact = auditRow.cleanupPreview.impact;
      const dryRun = (auditRow.cleanupPreview.executionDryRuns || []).find(
        (entry: any) => entry.action === 'executeConvertToActivityMasterDryRun',
      );
      const blockingReasons = [
        route.active === false ? 'Touring route is already inactive/archived' : '',
        hasRoundTripOrMovementStyleName(route) ? 'Round-trip or movement-style route names are excluded from Activity Master cleanup' : '',
        duplicateActivities.length > 0 ? 'Duplicate Activity Master record already exists' : '',
        impact.affectedQuotes.total > 0 ? 'Quote references exist' : '',
        impact.affectedBookings.total > 0 ? 'Booking references exist' : '',
        impact.affectedTemplates.active > 0 ? 'Active excursion/template references exist' : '',
        impact.affectedDepartures.total > 0 ? 'Departure references exist' : '',
        dryRun && Number(dryRun.safeExecutionScore || 0) < 80 ? 'Safe execution score is below 80' : '',
      ].filter(Boolean);

      candidates.push({
        code: normalizeWorkbookText(route.code),
        touringRouteId: route.id,
        name: route.name,
        currentCode: normalizeWorkbookText(route.code),
        proposedActivity: {
          name: route.name,
          code: proposedActivityCode,
        },
        existingDuplicateActivityCheck: {
          duplicateCount: duplicateActivities.length,
          duplicates: duplicateActivities,
        },
        quoteReferences: impact.affectedQuotes,
        bookingReferences: impact.affectedBookings,
        excursionTemplateReferences: impact.affectedTemplates,
        safeExecutionScore: dryRun?.safeExecutionScore ?? null,
        safeToConvert: blockingReasons.length === 0,
        blockingReasons,
      });
    }

    return {
      success: true,
      mode: 'DRY_RUN' as const,
      mutatesData: false,
      deletesData: false,
      category: 'Aqaba activity-like Touring Routes',
      supportedApplyAction: 'MOVE_TO_ACTIVITY_MASTER',
      totalCandidates: candidates.length,
      candidates,
    };
  }

  async dryRunAqabaActivityCleanupBatch() {
    const routes = await (this.prisma as any).touringRoute.findMany({
      where: { code: { in: AQABA_ACTIVITY_BATCH_ALLOWED_CODES as unknown as string[] } },
      include: this.include(),
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    });
    const candidates = [];

    for (const route of routes || []) {
      const code = normalizeWorkbookText(route.code);
      if (!AQABA_ACTIVITY_BATCH_ALLOWED_CODE_SET.has(code)) continue;

      const dryRun = await this.dryRunAqabaActivityCleanup({ id: route.id });
      const candidate = dryRun.candidates.find((entry: any) => entry.touringRouteId === route.id);

      if (candidate) {
        candidates.push(candidate);
        continue;
      }

      const duplicateActivities = await this.findDuplicateActivitiesForTouringRoute(route, buildActivityMasterCodeFromTouringRoute(route));
      candidates.push({
        code,
        touringRouteId: route.id,
        name: route.name,
        currentCode: code,
        proposedActivity: {
          name: route.name,
          code: buildActivityMasterCodeFromTouringRoute(route),
        },
        existingDuplicateActivityCheck: {
          duplicateCount: duplicateActivities.length,
          duplicates: duplicateActivities,
        },
        quoteReferences: { total: 0, active: 0 },
        bookingReferences: { total: 0, active: 0 },
        excursionTemplateReferences: { total: 0, active: 0, excursionTemplateComponents: 0, packageTemplateComponents: 0 },
        safeExecutionScore: null,
        safeToConvert: false,
        blockingReasons: ['Allowed legacy code did not classify as an Aqaba activity cleanup candidate'],
      });
    }

    return {
      success: true,
      mode: 'BATCH_DRY_RUN' as const,
      mutatesData: false,
      deletesData: false,
      allowedCodes: AQABA_ACTIVITY_BATCH_ALLOWED_CODES,
      explicitlyExcludedCodes: ['AQ_GLASS', 'AQ_BER'],
      excludedRoutePatterns: ['JOR-TR-AQABA-*-RT', 'JOR-TR-SOUTH-PETRA-AQABA-RT', 'round-trip or movement-style names'],
      totalCandidates: candidates.length,
      candidates,
    };
  }

  async dryRunAqabaRoundTripCleanup() {
    const routes = await (this.prisma as any).touringRoute.findMany({
      where: { code: { in: AQABA_RT_CLEANUP_ALLOWED_CODES as unknown as string[] } },
      include: this.include(),
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    });
    const candidates = [];

    for (const route of routes || []) {
      const code = normalizeWorkbookText(route.code);
      if (!AQABA_RT_CLEANUP_ALLOWED_CODE_SET.has(code)) continue;

      const siteConfig = AQABA_RT_ACTIVITY_SITES[code];
      const auditRow = await this.buildOperationalAuditRow(route);
      const impact = auditRow.cleanupPreview.impact;
      const activity = await this.findExpectedAqabaRtActivityMaster(siteConfig);
      const basePlace = await this.findCanonicalPlaceByTerms(['aqaba hotel', 'aqaba base', 'aqaba city', 'aqaba']);
      const sitePlace = await this.findCanonicalPlaceByTerms(siteConfig.siteTerms);
      const outboundRoute = await this.findExistingTransferRoute(basePlace, sitePlace);
      const returnRoute = await this.findExistingTransferRoute(sitePlace, basePlace);
      const excursionCode = code.replace(/^JOR-TR-/, 'JOR-EXC-').replace(/-RT$/, '');
      const blockingReasons = [
        !activity ? 'Matching Activity Master record is missing' : '',
        !basePlace ? 'Canonical Aqaba base/hotel/city place is missing' : '',
        !sitePlace ? `Canonical activity site place is missing for ${siteConfig.siteName}` : '',
        basePlace && sitePlace && !outboundRoute ? 'Outbound local transfer route is missing' : '',
        basePlace && sitePlace && !returnRoute ? 'Return local transfer route is missing' : '',
        impact.affectedQuotes.total > 0 ? 'Quote references exist' : '',
        impact.affectedBookings.total > 0 ? 'Booking references exist' : '',
        impact.affectedTemplates.total > 0 ? 'Package/excursion template references exist' : '',
      ].filter(Boolean);

      candidates.push({
        touringRouteId: route.id,
        currentCode: code,
        name: route.name,
        proposedExcursionTemplate: {
          name: `${route.name.replace(/\s+RT\b/i, '').trim()} Excursion`,
          code: excursionCode,
          components: ['OUTBOUND_LOCAL_TRANSFER', 'ACTIVITY_MASTER', 'RETURN_LOCAL_TRANSFER'],
        },
        matchedActivityMaster: activity
          ? {
              id: activity.id,
              code: activity.code || null,
              name: activity.name,
              active: activity.active !== false,
            }
          : null,
        expectedActivityMaster: {
          code: siteConfig.expectedActivityCode || null,
          name: siteConfig.expectedActivityName,
        },
        missingActivityMasterWarning: activity
          ? null
          : `Expected Activity Master missing: ${siteConfig.expectedActivityCode || siteConfig.expectedActivityName}`,
        proposedOutboundTransferRoute: {
          from: basePlace?.name || 'Aqaba base/hotel/city',
          to: sitePlace?.name || siteConfig.siteName,
          existingRoute: outboundRoute
            ? {
                id: outboundRoute.id,
                name: outboundRoute.name,
                normalizedKey: outboundRoute.normalizedKey || null,
                isActive: outboundRoute.isActive !== false,
              }
            : null,
        },
        proposedReturnTransferRoute: {
          from: sitePlace?.name || siteConfig.siteName,
          to: basePlace?.name || 'Aqaba base/hotel/city',
          existingRoute: returnRoute
            ? {
                id: returnRoute.id,
                name: returnRoute.name,
                normalizedKey: returnRoute.normalizedKey || null,
                isActive: returnRoute.isActive !== false,
              }
            : null,
        },
        requiredCanonicalPlaces: {
          aqabaBaseExists: Boolean(basePlace),
          activitySiteExists: Boolean(sitePlace),
          aqabaBase: basePlace ? { id: basePlace.id, name: basePlace.name, active: basePlace.isActive !== false } : null,
          activitySite: sitePlace ? { id: sitePlace.id, name: sitePlace.name, active: sitePlace.isActive !== false } : null,
        },
        requiredTransferRoutes: {
          outboundExists: Boolean(outboundRoute),
          returnExists: Boolean(returnRoute),
        },
        quoteReferences: impact.affectedQuotes,
        bookingReferences: impact.affectedBookings,
        packageExcursionTemplateReferences: impact.affectedTemplates,
        safeToConvert: blockingReasons.length === 0,
        blockingReasons,
        recommendedAction: blockingReasons.length === 0 ? 'CONVERT_TO_EXCURSION_TEMPLATE_WITH_TRANSFERS' : 'MANUAL_REVIEW',
      });
    }

    return {
      success: true,
      mode: 'AQABA_RT_DRY_RUN' as const,
      mutatesData: false,
      deletesData: false,
      allowedCodes: AQABA_RT_CLEANUP_ALLOWED_CODES,
      explicitlyExcludedCodes: ['AQ_* legacy activity rows', 'JOR-TR-SOUTH-PETRA-AQABA-RT'],
      transportPricingLogicChanged: false,
      totalCandidates: candidates.length,
      candidates,
    };
  }

  async dryRunAqabaRoundTripDependencies() {
    const existingPlaces = await this.resolveAqabaRtDependencyPlaces();
    const placePlans = AQABA_RT_DEPENDENCY_PLACE_NAMES.map((name) => {
      const matches = existingPlaces.byName.get(normalizeWorkbookText(name).toLowerCase()) || [];
      return {
        name,
        exists: matches.length > 0,
        existing: matches,
        willCreate: matches.length === 0,
        duplicateCollisionCount: Math.max(0, matches.length - 1),
        safe: matches.length <= 1,
      };
    });

    const routePlans = [];
    for (const [fromName, toName] of AQABA_RT_DEPENDENCY_ROUTE_PAIRS) {
      const fromPlace = existingPlaces.primaryByName.get(normalizeWorkbookText(fromName).toLowerCase()) || null;
      const toPlace = existingPlaces.primaryByName.get(normalizeWorkbookText(toName).toLowerCase()) || null;
      const normalizedKey = buildRouteNormalizedKey(fromName, toName);
      const matches = await this.findRoutesByNormalizedKey(normalizedKey);
      const fromWillExist = Boolean(fromPlace || AQABA_RT_DEPENDENCY_PLACE_NAMES.includes(fromName as any));
      const toWillExist = Boolean(toPlace || AQABA_RT_DEPENDENCY_PLACE_NAMES.includes(toName as any));
      routePlans.push({
        from: fromName,
        to: toName,
        proposedRouteCode: this.buildAqabaRtDependencyRouteCode(fromName, toName),
        proposedRouteName: formatRouteName(fromName, toName),
        normalizedKey,
        fromPlaceExists: Boolean(fromPlace),
        toPlaceExists: Boolean(toPlace),
        fromPlaceWillExistAfterApply: fromWillExist,
        toPlaceWillExistAfterApply: toWillExist,
        exists: matches.length > 0,
        existing: matches,
        willCreate: Boolean(fromWillExist && toWillExist && matches.length === 0),
        duplicateCollisionCount: Math.max(0, matches.length - 1),
        safe: Boolean(fromWillExist && toWillExist && matches.length <= 1),
        blockingReasons: [
          !fromWillExist ? `Missing from place: ${fromName}` : '',
          !toWillExist ? `Missing to place: ${toName}` : '',
          matches.length > 1 ? `Route normalizedKey collision: ${normalizedKey}` : '',
        ].filter(Boolean),
      });
    }

    const missingPlaces = placePlans.filter((entry) => !entry.exists);
    const existingPlaceRows = placePlans.filter((entry) => entry.exists);
    const missingTransferRoutes = routePlans.filter((entry) => !entry.exists);
    const existingTransferRoutes = routePlans.filter((entry) => entry.exists);
    const safeToApply =
      placePlans.every((entry) => entry.safe) &&
      routePlans.every((entry) => entry.safe);

    return {
      success: true,
      mode: 'AQABA_RT_DEPENDENCIES_DRY_RUN' as const,
      mutatesData: false,
      deletesData: false,
      createsPricing: false,
      importsTariffs: false,
      affectsQuotesOrBookings: false,
      allowedPlacesToCreate: AQABA_RT_DEPENDENCY_PLACE_NAMES,
      allowedTransferRoutePairs: AQABA_RT_DEPENDENCY_ROUTE_PAIRS.map(([from, to]) => ({ from, to })),
      missingPlaces,
      existingPlaces: existingPlaceRows,
      missingTransferRoutes,
      existingTransferRoutes,
      duplicateCollisionChecks: {
        placeCollisions: placePlans.filter((entry) => entry.duplicateCollisionCount > 0),
        routeCollisions: routePlans.filter((entry) => entry.duplicateCollisionCount > 0),
      },
      safeToApply,
      blockingReasons: [
        ...placePlans.flatMap((entry) => (entry.duplicateCollisionCount > 0 ? [`Place duplicate collision: ${entry.name}`] : [])),
        ...routePlans.flatMap((entry) => entry.blockingReasons),
      ],
    };
  }

  async applyAqabaRoundTripDependencies(input: AqabaRtDependenciesApplyInput) {
    const confirm = normalizeWorkbookText(input.confirm);
    if (confirm !== AQABA_RT_DEPENDENCIES_CONFIRMATION) {
      throw new BadRequestException(`Aqaba RT dependency setup requires --confirm=${AQABA_RT_DEPENDENCIES_CONFIRMATION}.`);
    }

    const before = await this.dryRunAqabaRoundTripDependencies();
    if (before.duplicateCollisionChecks.placeCollisions.length > 0 || before.duplicateCollisionChecks.routeCollisions.length > 0) {
      throw new BadRequestException('Aqaba RT dependency setup is blocked by duplicate/collision checks.');
    }

    const createdPlaces = [];
    for (const place of before.missingPlaces) {
      if (!AQABA_RT_DEPENDENCY_PLACE_NAMES.includes(place.name as any)) continue;
      const created = await (this.prisma as any).place.create({
        data: {
          name: place.name,
          type: 'ATTRACTION',
          city: 'Aqaba',
          country: 'Jordan',
          isActive: true,
        },
        select: { id: true, name: true, city: true, type: true, isActive: true },
      });
      createdPlaces.push(created);
    }

    const afterPlaces = await this.resolveAqabaRtDependencyPlaces();
    const createdTransferRoutes = [];
    const skippedTransferRoutes = [];
    for (const [fromName, toName] of AQABA_RT_DEPENDENCY_ROUTE_PAIRS) {
      const normalizedKey = buildRouteNormalizedKey(fromName, toName);
      const existingRoutes = await this.findRoutesByNormalizedKey(normalizedKey);
      if (existingRoutes.length > 0) {
        skippedTransferRoutes.push({ from: fromName, to: toName, normalizedKey, reason: 'already exists' });
        continue;
      }

      const fromPlace = afterPlaces.primaryByName.get(normalizeWorkbookText(fromName).toLowerCase()) || null;
      const toPlace = afterPlaces.primaryByName.get(normalizeWorkbookText(toName).toLowerCase()) || null;
      if (!fromPlace || !toPlace) {
        skippedTransferRoutes.push({ from: fromName, to: toName, normalizedKey, reason: 'endpoint place missing' });
        continue;
      }

      const created = await (this.prisma as any).route.create({
        data: {
          fromPlaceId: fromPlace.id,
          toPlaceId: toPlace.id,
          name: formatRouteName(fromName, toName),
          normalizedKey,
          routeType: 'TRANSFER_ROUTE',
          notes: `Aqaba RT dependency setup route code: ${this.buildAqabaRtDependencyRouteCode(fromName, toName)}. No pricing/rates created.`,
          isActive: true,
        },
        select: { id: true, name: true, normalizedKey: true, routeType: true, isActive: true },
      });
      createdTransferRoutes.push(created);
    }

    return {
      success: true,
      mode: 'AQABA_RT_DEPENDENCIES_APPLY' as const,
      mutatesData: true,
      deletesData: false,
      createsPricing: false,
      importsTariffs: false,
      affectsQuotesOrBookings: false,
      createdPlaces,
      createdTransferRoutes,
      skippedTransferRoutes,
      counts: {
        createdPlaces: createdPlaces.length,
        createdTransferRoutes: createdTransferRoutes.length,
        skippedTransferRoutes: skippedTransferRoutes.length,
      },
    };
  }

  async dryRunAqabaRoundTripExcursionConversion() {
    const baseDryRun = await this.dryRunAqabaRoundTripCleanup();
    const candidates = [];

    for (const candidate of baseDryRun.candidates as any[]) {
      const duplicateTemplate = await this.findDuplicateExcursionTemplateForAqabaRt(candidate.proposedExcursionTemplate);
      const outboundRouteId = candidate.proposedOutboundTransferRoute?.existingRoute?.id || null;
      const activityMasterId = candidate.matchedActivityMaster?.id || null;
      const returnRouteId = candidate.proposedReturnTransferRoute?.existingRoute?.id || null;
      const blockingReasons = [
        ...(candidate.blockingReasons || []),
        duplicateTemplate ? 'Duplicate Excursion Template already exists' : '',
        !outboundRouteId ? 'Outbound transfer route id is missing' : '',
        !activityMasterId ? 'Activity Master id is missing' : '',
        !returnRouteId ? 'Return transfer route id is missing' : '',
      ].filter(Boolean);

      candidates.push({
        touringRouteId: candidate.touringRouteId,
        currentCode: candidate.currentCode,
        name: candidate.name,
        proposedExcursionTemplate: candidate.proposedExcursionTemplate,
        outboundTransferRouteId: outboundRouteId,
        activityMasterId,
        returnTransferRouteId: returnRouteId,
        matchedActivityMaster: candidate.matchedActivityMaster,
        duplicateExcursionTemplateCheck: {
          duplicateFound: Boolean(duplicateTemplate),
          duplicate: duplicateTemplate,
        },
        quoteReferences: candidate.quoteReferences,
        bookingReferences: candidate.bookingReferences,
        packageExcursionTemplateReferences: candidate.packageExcursionTemplateReferences,
        safeToConvert: blockingReasons.length === 0,
        blockingReasons,
      });
    }

    return {
      success: true,
      mode: 'AQABA_RT_EXCURSION_CONVERSION_DRY_RUN' as const,
      mutatesData: false,
      deletesData: false,
      createsPricing: false,
      importsTariffs: false,
      allowedCodes: AQABA_RT_CLEANUP_ALLOWED_CODES,
      explicitlyExcludedCodes: ['AQ_* legacy activity rows', 'JOR-TR-SOUTH-PETRA-AQABA-RT'],
      totalCandidates: candidates.length,
      candidates,
    };
  }

  async applyAqabaRoundTripExcursionConversion(input: AqabaRtExcursionConversionApplyInput) {
    const companyId = normalizeWorkbookText(input.companyId);
    const confirm = normalizeWorkbookText(input.confirm);

    if (!companyId) {
      throw new BadRequestException('Aqaba RT excursion conversion requires DMC_CLEANUP_COMPANY_ID.');
    }
    if (confirm !== AQABA_RT_EXCURSION_CONVERSION_CONFIRMATION) {
      throw new BadRequestException(`Aqaba RT excursion conversion requires --confirm=${AQABA_RT_EXCURSION_CONVERSION_CONFIRMATION}.`);
    }

    const dryRun = await this.dryRunAqabaRoundTripExcursionConversion();
    const summary: {
      converted: any[];
      skipped: any[];
      blocked: any[];
      errors: any[];
    } = {
      converted: [],
      skipped: [],
      blocked: [],
      errors: [],
    };

    for (const candidate of dryRun.candidates as any[]) {
      if (candidate.duplicateExcursionTemplateCheck?.duplicateFound) {
        summary.skipped.push({
          currentCode: candidate.currentCode,
          touringRouteId: candidate.touringRouteId,
          reason: 'duplicate excursion template exists',
          duplicate: candidate.duplicateExcursionTemplateCheck.duplicate,
        });
        continue;
      }
      if (!candidate.safeToConvert) {
        summary.blocked.push({
          currentCode: candidate.currentCode,
          touringRouteId: candidate.touringRouteId,
          blockingReasons: candidate.blockingReasons,
        });
        continue;
      }

      try {
        const result = await this.convertOneAqabaRtToExcursionTemplate(candidate, {
          companyId,
          userId: normalizeWorkbookText(input.userId) || '00000000-0000-0000-0000-000000000000',
        });
        summary.converted.push(result);
      } catch (error) {
        summary.errors.push({
          currentCode: candidate.currentCode,
          touringRouteId: candidate.touringRouteId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: true,
      mode: 'AQABA_RT_EXCURSION_CONVERSION_APPLY' as const,
      mutatesData: true,
      deletesData: false,
      createsPricing: false,
      importsTariffs: false,
      allowedCodes: AQABA_RT_CLEANUP_ALLOWED_CODES,
      converted: summary.converted,
      skipped: summary.skipped,
      blocked: summary.blocked,
      errors: summary.errors,
      counts: {
        converted: summary.converted.length,
        skipped: summary.skipped.length,
        blocked: summary.blocked.length,
        errors: summary.errors.length,
      },
    };
  }

  async applyAqabaActivityCleanup(id: string, input: AqabaActivityCleanupApplyInput) {
    const routeId = normalizeWorkbookText(id);
    const companyId = normalizeWorkbookText(input.companyId);

    if (!routeId) {
      throw new BadRequestException('Aqaba activity cleanup apply requires --id=<touringRouteId>.');
    }
    if (!companyId) {
      throw new BadRequestException('Aqaba activity cleanup apply requires DMC_CLEANUP_COMPANY_ID for the Activity Master owner and audit log.');
    }

    const dryRun = await this.dryRunAqabaActivityCleanup({ id: routeId });
    const candidate = dryRun.candidates.find((entry: any) => entry.touringRouteId === routeId);
    if (!candidate) {
      throw new BadRequestException('Only Aqaba activity-like Touring Routes can be converted by this cleanup command.');
    }
    if (!candidate.safeToConvert) {
      throw new BadRequestException(`Aqaba activity cleanup is blocked: ${candidate.blockingReasons.join('; ')}`);
    }

    return this.executeConvertToActivityMaster(
      routeId,
      {
        dryRunAction: 'executeConvertToActivityMasterDryRun',
        dryRunConfirmed: true,
        confirmationText: 'I understand this affects operational taxonomy',
      },
      {
        id: normalizeWorkbookText(input.userId) || '00000000-0000-0000-0000-000000000000',
        email: 'system@dmc.local',
        role: 'admin',
        firstName: 'System',
        lastName: 'Cleanup',
        name: 'System Cleanup',
        auditLabel: 'System Cleanup CLI',
        companyId,
      },
    );
  }

  async applyAqabaActivityCleanupBatch(input: AqabaActivityCleanupBatchApplyInput) {
    const companyId = normalizeWorkbookText(input.companyId);
    const confirm = normalizeWorkbookText(input.confirm);

    if (!companyId) {
      throw new BadRequestException('Aqaba activity batch cleanup requires DMC_CLEANUP_COMPANY_ID.');
    }
    if (confirm !== AQABA_ACTIVITY_BATCH_CONFIRMATION) {
      throw new BadRequestException(`Aqaba activity batch cleanup requires --confirm=${AQABA_ACTIVITY_BATCH_CONFIRMATION}.`);
    }

    const dryRun = await this.dryRunAqabaActivityCleanupBatch();
    const summary: {
      converted: any[];
      skipped: any[];
      blocked: any[];
      errors: any[];
    } = {
      converted: [],
      skipped: [],
      blocked: [],
      errors: [],
    };

    for (const candidate of dryRun.candidates as any[]) {
      if (candidate.blockingReasons.includes('Touring route is already inactive/archived')) {
        summary.skipped.push({
          code: candidate.code,
          touringRouteId: candidate.touringRouteId,
          name: candidate.name,
          reason: 'already archived',
        });
        continue;
      }
      if (!candidate.safeToConvert) {
        summary.blocked.push({
          code: candidate.code,
          touringRouteId: candidate.touringRouteId,
          name: candidate.name,
          blockingReasons: candidate.blockingReasons,
        });
        continue;
      }

      try {
        const result = await this.applyAqabaActivityCleanup(candidate.touringRouteId, {
          companyId,
          userId: input.userId,
        });
        summary.converted.push({
          code: candidate.code,
          touringRouteId: candidate.touringRouteId,
          activity: result.activity,
          touringRoute: result.touringRoute,
        });
      } catch (error) {
        summary.errors.push({
          code: candidate.code,
          touringRouteId: candidate.touringRouteId,
          name: candidate.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: true,
      mode: 'BATCH_APPLY' as const,
      supportedApplyAction: 'MOVE_TO_ACTIVITY_MASTER',
      allowedCodes: AQABA_ACTIVITY_BATCH_ALLOWED_CODES,
      converted: summary.converted,
      skipped: summary.skipped,
      blocked: summary.blocked,
      errors: summary.errors,
      counts: {
        converted: summary.converted.length,
        skipped: summary.skipped.length,
        blocked: summary.blocked.length,
        errors: summary.errors.length,
      },
    };
  }

  async executeConvertToActivityMaster(id: string, input: ExecuteConvertToActivityMasterInput, actor: AuthenticatedActor) {
    const companyId = requireActorCompanyId(actor);
    const confirmationText = normalizeWorkbookText(input?.confirmationText);
    const requiredConfirmation = 'I understand this affects operational taxonomy';

    if (confirmationText !== requiredConfirmation) {
      throw new BadRequestException(`Confirmation text must exactly match: ${requiredConfirmation}`);
    }
    if (!input?.dryRunConfirmed || input?.dryRunAction !== 'executeConvertToActivityMasterDryRun') {
      throw new BadRequestException('Activity Master conversion requires the matching dry-run preview first.');
    }

    const route = await this.findOne(id);
    const auditRow = await this.buildOperationalAuditRow(route);
    const activityDryRun = (auditRow.cleanupPreview.executionDryRuns || []).find(
      (dryRun: any) => dryRun.action === 'executeConvertToActivityMasterDryRun',
    );

    if (auditRow.cleanupRecommendation !== 'MOVE_TO_ACTIVITY_MASTER' || auditRow.classification !== 'ACTIVITY_CANDIDATE') {
      throw new BadRequestException('Only low-risk Activity Master candidates can be executed by this action.');
    }
    if (!activityDryRun || activityDryRun.mode !== 'DRY_RUN_ONLY') {
      throw new BadRequestException('Activity Master dry-run preview is unavailable for this touring route.');
    }
    if (!activityDryRun.safeToExecute || Number(activityDryRun.safeExecutionScore || 0) < 80) {
      throw new BadRequestException('Activity Master conversion is blocked by safe execution score.');
    }
    if (activityDryRun.conflicts?.existingActivityDuplicates > 0 || activityDryRun.conflicts?.hasConflicts) {
      throw new BadRequestException('Activity Master conversion is blocked by cleanup conflicts.');
    }
    if (auditRow.cleanupPreview.impact.affectedBookings.active > 0) {
      throw new BadRequestException('Activity Master conversion is blocked by active booking conflicts.');
    }
    if (route.active === false) {
      throw new BadRequestException('Archived touring routes cannot be converted.');
    }

    const activityCode = buildActivityMasterCodeFromTouringRoute(route);
    const duplicateActivity = await (this.prisma as any).activity.findFirst({
      where: {
        OR: [
          { code: { equals: activityCode, mode: 'insensitive' } },
          { name: { equals: normalizeWorkbookText(route.name), mode: 'insensitive' } },
        ],
      },
      select: { id: true, code: true, name: true },
    });

    if (duplicateActivity) {
      throw new BadRequestException(`Activity Master duplicate detected for ${duplicateActivity.code || duplicateActivity.name}.`);
    }

    const executedAt = new Date();
    const legacyAliases = auditRow.legacyAliases || [];
    const rollbackSnapshot = activityDryRun.rollbackSnapshotPreview;
    const routeHistoryNote = [
      `[${executedAt.toISOString()}] Converted to Activity Master ${activityCode}.`,
      'Original touring route archived and hidden from selectors via active=false.',
      `Historical aliases preserved: ${legacyAliases.length > 0 ? legacyAliases.join(', ') : 'none'}.`,
      `Rollback snapshot: ${JSON.stringify({
        routeId: route.id,
        routeCode: route.code,
        routeName: route.name,
        active: route.active !== false,
        activityCode,
      })}`,
    ].join(' ');
    const reviewNotes = [normalizeWorkbookText(route.reviewNotes), routeHistoryNote].filter(Boolean).join('\n');
    const routeStops = route.stops || [];
    const firstStop = routeStops[0];
    const lastStop = routeStops[routeStops.length - 1];

    const result = await this.prisma.$transaction(async (tx) => {
      const activity = await (tx as any).activity.create({
        data: {
          code: activityCode,
          name: route.name,
          description: route.routeDescription || `Converted from touring route ${route.code}.`,
          category: 'Activity / Experience',
          city: auditRow.safeFields.primaryOperatingCity || route.startCity || 'Aqaba',
          region: auditRow.region || route.region || 'Aqaba',
          supplierCompanyId: companyId,
          pricingBasis: 'PER_GROUP',
          costPrice: 0,
          sellPrice: 0,
          durationHours: route.includedHours ?? null,
          guideRequired: Boolean(auditRow.safeFields.guideRequired),
          sicPossible: Boolean(route.sicPossible),
          familyFriendly: false,
          startPoint: firstStop?.location || firstStop?.city || route.startCity || null,
          endPoint: lastStop?.location || lastStop?.city || route.startCity || null,
          operationalNotes: [
            `Created by Touring Route cleanup executor from route ${route.code} (${route.id}).`,
            'Tariffs/pricing intentionally initialized to zero for Activity Master review.',
          ].join(' '),
          categoryTags: ['Touring Route Cleanup', 'Activity Master', 'Aqaba'],
          reviewNotes: [
            `Source touring route id: ${route.id}`,
            `Source touring route code: ${route.code}`,
            `Historical aliases preserved: ${legacyAliases.length > 0 ? legacyAliases.join(', ') : 'none'}`,
          ].join('\n'),
          active: true,
        },
      });

      const archivedRoute = await (tx as any).touringRoute.update({
        where: { id: route.id },
        data: {
          active: false,
          reviewNotes,
        },
        include: this.include(),
      });

      await (tx as any).auditLog.create({
        data: {
          companyId,
          userId: actor.id,
          action: 'touring_route.convert_to_activity_master',
          entity: 'TouringRoute',
          entityId: route.id,
          metadata: {
            mode: 'EXECUTE_ONE_ROW',
            supportedRecommendation: 'MOVE_TO_ACTIVITY_MASTER',
            activityId: activity.id,
            activityCode: activity.code,
            dryRunAction: input.dryRunAction,
            safeExecutionScore: activityDryRun.safeExecutionScore,
            rollbackSnapshot,
            referenceMigrationPreview: activityDryRun.referenceMigrationPreview,
            preservesHistoricalAliases: true,
            deletesOriginalTouringRoute: false,
            archivedOriginalTouringRoute: true,
            hiddenFromSelectors: true,
          },
        },
      });

      return { activity, archivedRoute };
    });

    return {
      success: true,
      action: 'executeConvertToActivityMaster',
      mode: 'EXECUTE_ONE_ROW',
      supportedRecommendation: 'MOVE_TO_ACTIVITY_MASTER',
      activity: {
        id: result.activity.id,
        code: result.activity.code,
        name: result.activity.name,
        active: result.activity.active,
      },
      touringRoute: {
        id: result.archivedRoute.id,
        code: result.archivedRoute.code,
        name: result.archivedRoute.name,
        active: result.archivedRoute.active,
        hiddenFromSelectors: result.archivedRoute.active === false,
        preservedHistorically: true,
      },
      rollbackSupport: {
        supported: true,
        snapshot: rollbackSnapshot,
        restorePlan: [
          'Deactivate or review the linked Activity Master record.',
          'Restore the original touring route active state from the audit log snapshot.',
          'Keep historical aliases and review notes intact.',
        ],
      },
      auditTrail: {
        action: 'touring_route.convert_to_activity_master',
        logged: true,
      },
    };
  }

  async rollbackConvertToActivityMaster(id: string, input: RollbackConvertToActivityMasterInput, actor: AuthenticatedActor) {
    const companyId = requireActorCompanyId(actor);
    const confirmationText = normalizeWorkbookText(input?.confirmationText);
    const activityId = normalizeWorkbookText(input?.activityId);
    const requiredConfirmation = 'I understand this affects operational taxonomy';

    if (confirmationText !== requiredConfirmation) {
      throw new BadRequestException(`Confirmation text must exactly match: ${requiredConfirmation}`);
    }
    if (!activityId) {
      throw new BadRequestException('Linked Activity Master id is required for rollback.');
    }

    const route = await this.findOne(id);
    const activity = await (this.prisma as any).activity.findUnique({
      where: { id: activityId },
      select: { id: true, code: true, name: true, active: true, reviewNotes: true },
    });

    if (!activity) {
      throw new BadRequestException('Linked Activity Master record was not found.');
    }
    if (!normalizeWorkbookText(activity.reviewNotes).includes(`Source touring route id: ${route.id}`)) {
      throw new BadRequestException('Activity Master record is not linked to this touring route cleanup conversion.');
    }

    const executedAt = new Date();
    const rollbackNote = `[${executedAt.toISOString()}] Rolled back Activity Master conversion ${activity.code || activity.id}. Activity deactivated; touring route restored for selectors.`;
    const reviewNotes = [normalizeWorkbookText(route.reviewNotes), rollbackNote].filter(Boolean).join('\n');

    const result = await this.prisma.$transaction(async (tx) => {
      const restoredRoute = await (tx as any).touringRoute.update({
        where: { id: route.id },
        data: {
          active: true,
          reviewNotes,
        },
        include: this.include(),
      });
      const deactivatedActivity = await (tx as any).activity.update({
        where: { id: activity.id },
        data: {
          active: false,
          reviewNotes: [normalizeWorkbookText(activity.reviewNotes), rollbackNote].filter(Boolean).join('\n'),
        },
      });

      await (tx as any).auditLog.create({
        data: {
          companyId,
          userId: actor.id,
          action: 'touring_route.rollback_activity_master_conversion',
          entity: 'TouringRoute',
          entityId: route.id,
          metadata: {
            mode: 'ROLLBACK_ONE_ROW',
            activityId: activity.id,
            activityCode: activity.code,
            restoresTouringRouteSelectorVisibility: true,
            deletesData: false,
          },
        },
      });

      return { restoredRoute, deactivatedActivity };
    });

    return {
      success: true,
      action: 'rollbackConvertToActivityMaster',
      mode: 'ROLLBACK_ONE_ROW',
      activity: {
        id: result.deactivatedActivity.id,
        code: result.deactivatedActivity.code,
        active: result.deactivatedActivity.active,
      },
      touringRoute: {
        id: result.restoredRoute.id,
        code: result.restoredRoute.code,
        active: result.restoredRoute.active,
        selectorVisible: result.restoredRoute.active !== false,
      },
      auditTrail: {
        action: 'touring_route.rollback_activity_master_conversion',
        logged: true,
      },
    };
  }

  async exportOperationalAuditWorkbook() {
    const audit = await this.previewOperationalAudit();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Touring Route Audit', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const rows = audit.rows.map((row: any) => ({
      Id: row.id,
      'Current Code': row.currentCode,
      'Suggested Canonical Code': row.suggestedCanonicalCode,
      'Legacy Aliases': row.legacyAliases.join(', '),
      Name: row.name,
      Region: row.region,
      Classification: row.classification,
      'Cleanup Recommendation': row.cleanupRecommendation,
      'Selector Eligible': row.selectorEligible ? 'Yes' : 'No',
      'Candidate Target': row.candidateTarget,
      'Operational Type': row.safeFields.operationalType,
      'Route Category': row.safeFields.routeCategory,
      'Guide Required': row.safeFields.guideRequired ? 'Yes' : 'No',
      Overnight: row.safeFields.overnight ? 'Yes' : 'No',
      'SIC Possible': row.safeFields.sicPossible ? 'Yes' : 'No',
      'Departure Capable': row.safeFields.departureCapable ? 'Yes' : 'No',
      'Capacity Based': row.safeFields.capacityBased ? 'Yes' : 'No',
      'Primary Operating City': row.safeFields.primaryOperatingCity,
      Complexity: row.safeFields.operationalComplexity,
      Warnings: row.warnings.join(' | '),
    }));
    worksheet.columns = Object.keys(rows[0] || { Id: '' }).map((key) => ({ header: key, key, width: Math.max(16, key.length + 2) }));
    worksheet.getRow(1).font = { bold: true };
    rows.forEach((row: Record<string, unknown>) => worksheet.addRow(row));

    return {
      buffer: Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer),
      fileName: 'touring-route-operational-audit.xlsx',
    };
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

  private async buildOperationalAuditRow(route: any) {
    const classification = classifyTouringRouteAudit(route);
    const cleanupRecommendation = recommendTouringRouteCleanup(route, classification);
    const suggestedCanonicalCode = buildCanonicalTouringRouteCode(route);
    const currentCode = normalizeWorkbookText(route.code);
    const region = deriveTouringRouteRegion(route);
    const selectorEligible = classification === 'TOURING_ROUTE' && Boolean(route.active !== false);
    const overnight = Boolean(route.overnight || route.overnightRisk || Number(route.durationDays || 1) > 1);
    const stopCount = route.stops?.length || 0;
    const legacyAliases = currentCode && currentCode !== suggestedCanonicalCode ? [currentCode] : [];
    const cleanupImpact = await this.buildCleanupImpactPreview(route, legacyAliases);
    const cleanupWarnings = this.buildCleanupPreviewWarnings(cleanupImpact);
    const warnings = [
      currentCode && currentCode !== suggestedCanonicalCode ? 'Current code should be preserved as alias/history only' : '',
      classification === 'ACTIVITY_CANDIDATE' ? 'Aqaba experience should be reviewed for Activity inventory' : '',
      classification === 'EXCURSION_TEMPLATE_CANDIDATE' ? 'Simple day tour should be reviewed for Excursion Template inventory' : '',
      classification === 'TRANSFER_ROUTE_CANDIDATE' ? 'One-way operational movement should be reviewed outside Touring Routes' : '',
      ...cleanupWarnings,
    ].filter(Boolean);
    const safeToConvert =
      cleanupRecommendation !== 'MANUAL_REVIEW' &&
      cleanupImpact.affectedQuotes.active === 0 &&
      cleanupImpact.affectedBookings.active === 0 &&
      cleanupImpact.affectedDepartures.total === 0;

    return {
      id: route.id,
      currentCode,
      suggestedCanonicalCode,
      legacyAliases,
      name: route.name,
      active: route.active !== false,
      region,
      classification: classification as TouringRouteAuditClassification,
      cleanupRecommendation: cleanupRecommendation as TouringRouteCleanupRecommendation,
      cleanupPreview: {
        mutatesData: false,
        safeToConvert,
        impact: cleanupImpact,
        actions: this.buildCleanupPreviewActions(cleanupRecommendation, cleanupImpact, safeToConvert),
        executionDryRuns: await this.buildCleanupExecutionDryRuns(route, cleanupRecommendation, cleanupImpact, safeToConvert, {
          currentCode,
          suggestedCanonicalCode,
          legacyAliases,
        }),
      },
      selectorEligible,
      candidateTarget:
        classification === 'ACTIVITY_CANDIDATE'
          ? 'ACTIVITY'
          : classification === 'EXCURSION_TEMPLATE_CANDIDATE'
            ? 'EXCURSION_TEMPLATE'
            : classification === 'TRANSFER_ROUTE_CANDIDATE'
              ? 'OPERATIONAL_TRANSFER'
              : 'TOURING_ROUTE',
      safeFields: {
        region,
        operationalType: 'ROUTING_SKELETON',
        routeCategory:
          classification === 'TOURING_ROUTE'
            ? overnight
              ? 'MULTI_DAY_OR_OVERNIGHT'
              : 'TOURING_ROUTE'
            : classification,
        guideRequired: classification === 'TOURING_ROUTE',
        overnight,
        sicPossible: Boolean(route.sicPossible),
        departureCapable: classification === 'TOURING_ROUTE' && Boolean(route.sicPossible),
        capacityBased: Boolean((route.pricings || []).some((pricing: any) => pricing.pricingBasis === 'PER_VEHICLE' && Number(pricing.maxPax || 0) > 0)),
        primaryOperatingCity: normalizeWorkbookText(route.primaryOperatingCity || route.startCity),
        operationalComplexity: deriveOperationalComplexity(route),
      },
      metrics: {
        durationDays: route.durationDays || 1,
        stopCount,
        pricingCount: route.pricings?.length || 0,
      },
      warnings,
    };
  }

  private async buildCleanupImpactPreview(route: any, legacyAliases: string[]) {
    const id = route.id;
    const quoteItems = await this.safeCount('quoteItem', { touringRouteId: id });
    const activeQuoteItems = await this.safeCount('quoteItem', {
      touringRouteId: id,
      quote: { status: { in: ['DRAFT', 'READY', 'SENT', 'ACCEPTED', 'CONFIRMED', 'REVISION_REQUESTED'] } },
    });
    const excursionTemplateComponents = await this.safeCount('excursionTemplateComponent', { touringRouteId: id });
    const activeExcursionTemplateComponents = await this.safeCount('excursionTemplateComponent', { touringRouteId: id, active: true });
    const packageTemplateComponents = await this.safeCount('packageTemplateComponent', { touringRouteId: id });
    const activePackageTemplateComponents = await this.safeCount('packageTemplateComponent', { touringRouteId: id, active: true });
    const bookingServices = await this.safeCount('bookingService', { touringRouteId: id });
    const activeBookingServices = await this.safeCount('bookingService', {
      touringRouteId: id,
      booking: { status: { in: ['draft', 'confirmed', 'in_progress'] } },
    });
    const departureServices = await this.safeCount('bookingService', {
      touringRouteId: id,
      booking: { seriesDeparture: { isNot: null } },
    });

    return {
      affectedQuotes: {
        total: quoteItems,
        active: activeQuoteItems,
      },
      affectedTemplates: {
        total: excursionTemplateComponents + packageTemplateComponents,
        active: activeExcursionTemplateComponents + activePackageTemplateComponents,
        excursionTemplateComponents,
        packageTemplateComponents,
      },
      affectedBookings: {
        total: bookingServices,
        active: activeBookingServices,
      },
      affectedSelectorReferences: {
        total: activeQuoteItems + activeExcursionTemplateComponents + activePackageTemplateComponents + activeBookingServices,
        quoteItems: activeQuoteItems,
        excursionTemplateComponents: activeExcursionTemplateComponents,
        packageTemplateComponents: activePackageTemplateComponents,
        bookingServices: activeBookingServices,
      },
      affectedRouteAliases: {
        total: legacyAliases.length,
        aliases: legacyAliases,
        preserved: true,
      },
      affectedDepartures: {
        total: departureServices,
      },
    };
  }

  private async safeCount(modelName: string, where: Record<string, unknown>) {
    const model = (this.prisma as any)?.[modelName];
    if (!model?.count) return 0;
    try {
      return await model.count({ where });
    } catch {
      return 0;
    }
  }

  private async buildCleanupExecutionDryRuns(
    route: any,
    recommendation: TouringRouteCleanupRecommendation,
    impact: Awaited<ReturnType<TouringRoutesService['buildCleanupImpactPreview']>>,
    safeToConvert: boolean,
    codes: { currentCode: string; suggestedCanonicalCode: string; legacyAliases: string[] },
  ) {
    const actionForRecommendation: Partial<Record<TouringRouteCleanupRecommendation, TouringRouteCleanupDryRunActionName>> = {
      MOVE_TO_ACTIVITY_MASTER: 'executeConvertToActivityMasterDryRun',
      CONVERT_TO_EXCURSION_TEMPLATE: 'executeConvertToExcursionTemplateDryRun',
      MOVE_TO_TRANSFER_ROUTE: 'executeConvertToTransferRouteDryRun',
    };
    const actions: TouringRouteCleanupDryRunActionName[] = [];
    const primaryAction = actionForRecommendation[recommendation];
    if (primaryAction) actions.push(primaryAction);
    if (recommendation !== 'KEEP_AS_TOURING_ROUTE') actions.push('executeArchiveTouringRouteDryRun');

    const conflicts = await this.buildCleanupConflictPreview(route, codes.suggestedCanonicalCode, impact);
    const warnings = this.buildCleanupPreviewWarnings(impact);
    const safeExecutionScore = this.calculateSafeExecutionScore(impact, conflicts, recommendation);

    return actions.map((action) => ({
      action,
      mode: 'DRY_RUN_ONLY' as const,
      mutatesData: false,
      deletesData: false,
      safeExecutionScore,
      safeToExecute: safeToConvert && safeExecutionScore >= 80,
      preservesHistoricalAliases: true,
      rollbackSnapshotPreview: {
        touringRoute: {
          id: route.id,
          code: codes.currentCode,
          name: route.name,
          active: route.active !== false,
          suggestedCanonicalCode: codes.suggestedCanonicalCode,
          legacyAliases: codes.legacyAliases,
        },
        stops: (route.stops || []).map((stop: any) => ({
          order: stop.order,
          city: stop.city,
          location: stop.location || null,
          notes: stop.notes || null,
        })),
        pricings: (route.pricings || []).map((pricing: any) => ({
          id: pricing.id,
          pricingBasis: pricing.pricingBasis,
          supplierId: pricing.supplierId || null,
          vehicleId: pricing.vehicleId || null,
          active: pricing.active !== false,
        })),
      },
      referenceMigrationPreview: {
        quotes: impact.affectedQuotes,
        bookings: impact.affectedBookings,
        templates: impact.affectedTemplates,
        selectorReferences: impact.affectedSelectorReferences,
        aliases: impact.affectedRouteAliases,
      },
      conflicts,
      warnings,
    }));
  }

  private async buildCleanupConflictPreview(
    route: any,
    suggestedCanonicalCode: string,
    impact: Awaited<ReturnType<TouringRoutesService['buildCleanupImpactPreview']>>,
  ) {
    const normalizedName = normalizeWorkbookText(route.name);
    const currentCode = normalizeWorkbookText(route.code);
    const existingActivityDuplicates = await this.safeCount('activity', {
      OR: [{ name: { equals: normalizedName, mode: 'insensitive' } }, { code: { equals: currentCode, mode: 'insensitive' } }],
    });
    const existingExcursionTemplateDuplicates = await this.safeCount('excursionTemplate', {
      OR: [{ name: { equals: normalizedName, mode: 'insensitive' } }, { code: { equals: currentCode, mode: 'insensitive' } }],
    });
    const canonicalCodeConflicts = await this.safeCount('touringRoute', {
      code: suggestedCanonicalCode,
      id: { not: route.id },
    });

    return {
      existingActivityDuplicates,
      existingExcursionTemplateDuplicates,
      canonicalCodeConflicts,
      activeDepartureConflicts: impact.affectedDepartures.total,
      hasConflicts:
        existingActivityDuplicates > 0 ||
        existingExcursionTemplateDuplicates > 0 ||
        canonicalCodeConflicts > 0 ||
        impact.affectedDepartures.total > 0,
    };
  }

  private async findDuplicateActivitiesForTouringRoute(route: any, proposedActivityCode: string) {
    const normalizedName = normalizeWorkbookText(route.name);
    const currentCode = normalizeWorkbookText(route.code);
    const filters = [
      proposedActivityCode ? { code: { equals: proposedActivityCode, mode: 'insensitive' } } : null,
      currentCode ? { code: { equals: currentCode, mode: 'insensitive' } } : null,
      normalizedName ? { name: { equals: normalizedName, mode: 'insensitive' } } : null,
    ].filter(Boolean);
    const model = (this.prisma as any)?.activity;

    if (!model?.findMany || filters.length === 0) return [];

    return model.findMany({
      where: { OR: filters },
      select: { id: true, code: true, name: true, active: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      take: 20,
    });
  }

  private async findExpectedAqabaRtActivityMaster(siteConfig: { expectedActivityCode?: string; expectedActivityName: string }) {
    const model = (this.prisma as any)?.activity;
    if (!model?.findFirst) return null;

    const expectedCode = normalizeWorkbookText(siteConfig.expectedActivityCode);
    const expectedName = normalizeWorkbookText(siteConfig.expectedActivityName);

    if (expectedCode) {
      const codeMatch = await model.findFirst({
        where: { active: true, code: { equals: expectedCode, mode: 'insensitive' } },
        select: { id: true, code: true, name: true, active: true },
      });
      if (codeMatch) return codeMatch;
    }

    if (!expectedName) return null;

    return model.findFirst({
      where: {
        active: true,
        name: { equals: expectedName, mode: 'insensitive' },
        OR: [{ code: null }, { code: '' }],
      },
      select: { id: true, code: true, name: true, active: true },
    });
  }

  private async findCanonicalPlaceByTerms(terms: string[]) {
    const model = (this.prisma as any)?.place;
    if (!model?.findMany) return null;

    const filters = terms
      .map((term) => normalizeWorkbookText(term))
      .filter(Boolean)
      .map((term) => ({ name: { contains: term, mode: 'insensitive' } }));
    if (filters.length === 0) return null;

    const places = await model.findMany({
      where: { isActive: true, OR: filters },
      select: { id: true, name: true, city: true, type: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      take: 5,
    });

    return places?.[0] || null;
  }

  private async findExistingTransferRoute(fromPlace: any, toPlace: any) {
    const model = (this.prisma as any)?.route;
    if (!model?.findMany || !fromPlace?.id || !toPlace?.id) return null;

    const routes = await model.findMany({
      where: {
        fromPlaceId: fromPlace.id,
        toPlaceId: toPlace.id,
        isActive: true,
      },
      select: { id: true, name: true, normalizedKey: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      take: 5,
    });

    return routes?.[0] || null;
  }

  private async resolveAqabaRtDependencyPlaces() {
    const names = Array.from(
      new Set([
        ...AQABA_RT_DEPENDENCY_PLACE_NAMES,
        ...AQABA_RT_DEPENDENCY_ROUTE_PAIRS.flatMap(([from, to]) => [from, to]),
      ]),
    );
    const byName = new Map<string, any[]>();
    const primaryByName = new Map<string, any>();

    for (const name of names) {
      const matches = await this.findPlacesByExactName(name);
      const key = normalizeWorkbookText(name).toLowerCase();
      byName.set(key, matches);
      if (matches[0]) primaryByName.set(key, matches[0]);
    }

    return { byName, primaryByName };
  }

  private async findPlacesByExactName(name: string) {
    const model = (this.prisma as any)?.place;
    if (!model?.findMany) return [];

    return model.findMany({
      where: { name: { equals: name, mode: 'insensitive' }, isActive: true },
      select: { id: true, name: true, city: true, type: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  private async findRoutesByNormalizedKey(normalizedKey: string) {
    const model = (this.prisma as any)?.route;
    if (!model?.findMany) return [];

    return model.findMany({
      where: { normalizedKey },
      select: { id: true, name: true, normalizedKey: true, routeType: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  private async findDuplicateExcursionTemplateForAqabaRt(template: { code?: string | null; name?: string | null }) {
    const model = (this.prisma as any)?.excursionTemplate;
    if (!model?.findFirst) return null;
    const code = normalizeWorkbookText(template.code);
    const name = normalizeWorkbookText(template.name);

    return model.findFirst({
      where: {
        OR: [
          code ? { code: { equals: code, mode: 'insensitive' } } : null,
          name ? { name: { equals: name, mode: 'insensitive' } } : null,
        ].filter(Boolean),
      },
      select: { id: true, code: true, name: true, active: true },
    });
  }

  private async convertOneAqabaRtToExcursionTemplate(
    candidate: {
      touringRouteId: string;
      currentCode: string;
      name: string;
      proposedExcursionTemplate: { name: string; code: string };
      outboundTransferRouteId: string;
      activityMasterId: string;
      returnTransferRouteId: string;
    },
    actor: { companyId: string; userId: string },
  ) {
    const route = await this.findOne(candidate.touringRouteId);
    if (!AQABA_RT_CLEANUP_ALLOWED_CODE_SET.has(normalizeWorkbookText(route.code))) {
      throw new BadRequestException('Only allowlisted Aqaba RT Touring Routes can be converted.');
    }
    if (route.active === false) {
      throw new BadRequestException('Archived touring routes cannot be converted.');
    }

    const duplicateTemplate = await this.findDuplicateExcursionTemplateForAqabaRt(candidate.proposedExcursionTemplate);
    if (duplicateTemplate) {
      throw new BadRequestException(`Duplicate Excursion Template already exists: ${duplicateTemplate.code || duplicateTemplate.name}.`);
    }

    const executedAt = new Date();
    const legacyAliases = [normalizeWorkbookText(route.code)].filter(Boolean);
    const reviewNotes = [
      normalizeWorkbookText(route.reviewNotes),
      `[${executedAt.toISOString()}] Converted to Excursion Template ${candidate.proposedExcursionTemplate.code}.`,
      `Original Aqaba RT Touring Route archived and hidden from selectors via active=false.`,
      `Historical aliases preserved: ${legacyAliases.length > 0 ? legacyAliases.join(', ') : 'none'}.`,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.prisma.$transaction(async (tx) => {
      const template = await (tx as any).excursionTemplate.create({
        data: {
          code: candidate.proposedExcursionTemplate.code,
          name: candidate.proposedExcursionTemplate.name,
          description: route.routeDescription || `Converted from Aqaba RT touring route ${route.code}.`,
          defaultDepartureCity: 'Aqaba',
          region: 'Aqaba',
          categoryTags: ['Touring Route Cleanup', 'Aqaba RT', 'Excursion Template'],
          sicPossible: Boolean(route.sicPossible),
          familyFriendly: false,
          durationMinutes: route.includedHours ? Math.round(Number(route.includedHours) * 60) : null,
          operationalNotes: [
            `Created by Aqaba RT cleanup executor from touring route ${route.code} (${route.id}).`,
            'Components are operational skeleton only: outbound local transfer, Activity Master, return local transfer.',
            'Pricing/rates/tariffs intentionally not created or imported.',
            `Historical aliases preserved: ${legacyAliases.length > 0 ? legacyAliases.join(', ') : 'none'}.`,
          ].join(' '),
          active: true,
          components: {
            create: [
              {
                componentType: 'TRANSPORT',
                label: 'Outbound local transfer',
                sortOrder: 1,
                routeId: candidate.outboundTransferRouteId,
                suggestedDepartureCity: 'Aqaba',
                suggestedArrivalCity: 'Activity site',
                operationalDependency: 'OUTBOUND_LOCAL_TRANSFER',
                operationalNotes: `Created from touring route ${route.code}; no pricing created.`,
              },
              {
                componentType: 'ACTIVITY',
                label: 'Activity Master',
                sortOrder: 2,
                activityId: candidate.activityMasterId,
                operationalDependency: 'ACTIVITY_MASTER',
                operationalNotes: `Linked existing Activity Master during touring route cleanup for ${route.code}.`,
              },
              {
                componentType: 'TRANSPORT',
                label: 'Return local transfer',
                sortOrder: 3,
                routeId: candidate.returnTransferRouteId,
                suggestedDepartureCity: 'Activity site',
                suggestedArrivalCity: 'Aqaba',
                operationalDependency: 'RETURN_LOCAL_TRANSFER',
                operationalNotes: `Created from touring route ${route.code}; no pricing created.`,
              },
            ],
          },
        },
        include: { components: true },
      });

      const archivedRoute = await (tx as any).touringRoute.update({
        where: { id: route.id },
        data: { active: false, reviewNotes },
        include: this.include(),
      });

      await (tx as any).auditLog.create({
        data: {
          companyId: actor.companyId,
          userId: actor.userId,
          action: 'touring_route.aqaba_rt.convert_to_excursion_template',
          entity: 'TouringRoute',
          entityId: route.id,
          metadata: {
            mode: 'AQABA_RT_EXCURSION_CONVERSION',
            templateId: template.id,
            templateCode: template.code,
            sourceTouringRouteCode: route.code,
            legacyAliases,
            outboundTransferRouteId: candidate.outboundTransferRouteId,
            activityMasterId: candidate.activityMasterId,
            returnTransferRouteId: candidate.returnTransferRouteId,
            deletesOriginalTouringRoute: false,
            archivedOriginalTouringRoute: true,
            hiddenFromSelectors: true,
            createsPricing: false,
            importsTariffs: false,
          },
        },
      });

      return { template, archivedRoute };
    });

    return {
      currentCode: candidate.currentCode,
      touringRouteId: result.archivedRoute.id,
      excursionTemplate: {
        id: result.template.id,
        code: result.template.code,
        name: result.template.name,
        active: result.template.active,
        componentCount: result.template.components?.length || 0,
      },
      touringRoute: {
        id: result.archivedRoute.id,
        code: result.archivedRoute.code,
        active: result.archivedRoute.active,
        hiddenFromSelectors: result.archivedRoute.active === false,
        preservedHistorically: true,
      },
    };
  }

  private buildAqabaRtDependencyRouteCode(fromName: string, toName: string) {
    const codePart = (value: string) =>
      normalizeWorkbookText(value)
        .toUpperCase()
        .replace(/&/g, ' AND ')
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
    return `JOR-TRF-${codePart(fromName)}-${codePart(toName)}`.slice(0, 120);
  }

  private calculateSafeExecutionScore(
    impact: Awaited<ReturnType<TouringRoutesService['buildCleanupImpactPreview']>>,
    conflicts: {
      existingActivityDuplicates: number;
      existingExcursionTemplateDuplicates: number;
      canonicalCodeConflicts: number;
      activeDepartureConflicts: number;
    },
    recommendation: TouringRouteCleanupRecommendation,
  ) {
    let score = recommendation === 'MANUAL_REVIEW' ? 40 : 100;
    score -= Math.min(30, impact.affectedQuotes.active * 10);
    score -= Math.min(30, impact.affectedBookings.active * 15);
    score -= Math.min(20, impact.affectedTemplates.active * 5);
    score -= Math.min(30, conflicts.activeDepartureConflicts * 15);
    score -= Math.min(20, (conflicts.existingActivityDuplicates + conflicts.existingExcursionTemplateDuplicates) * 10);
    score -= conflicts.canonicalCodeConflicts > 0 ? 25 : 0;
    return Math.max(0, Math.min(100, score));
  }

  private buildCleanupPreviewWarnings(impact: Awaited<ReturnType<TouringRoutesService['buildCleanupImpactPreview']>>) {
    return [
      impact.affectedQuotes.total > 0 || impact.affectedBookings.total > 0 || impact.affectedTemplates.total > 0
        ? 'Production usage detected; cleanup must remain preview-only until explicitly approved'
        : '',
      impact.affectedQuotes.active > 0 ? 'Active quote references detected' : '',
      impact.affectedBookings.active > 0 ? 'Active booking references detected' : '',
      impact.affectedDepartures.total > 0 ? 'Departure references detected' : '',
    ].filter(Boolean);
  }

  private buildCleanupPreviewActions(
    recommendation: TouringRouteCleanupRecommendation,
    impact: Awaited<ReturnType<TouringRoutesService['buildCleanupImpactPreview']>>,
    safeToConvert: boolean,
  ) {
    const actionForRecommendation: Partial<Record<TouringRouteCleanupRecommendation, TouringRouteCleanupPreviewActionName>> = {
      MOVE_TO_ACTIVITY_MASTER: 'convertToActivityMasterPreview',
      CONVERT_TO_EXCURSION_TEMPLATE: 'convertToExcursionTemplatePreview',
      MOVE_TO_TRANSFER_ROUTE: 'convertToTransferRoutePreview',
    };
    const primaryAction = actionForRecommendation[recommendation];
    const actions: Array<{
      action: TouringRouteCleanupPreviewActionName;
      available: boolean;
      safeToConvert: boolean;
      mutatesData: false;
      preservesHistoricalAliases: true;
      impact: typeof impact;
      warnings: string[];
    }> = [];
    const warnings = this.buildCleanupPreviewWarnings(impact);

    if (primaryAction) {
      actions.push({
        action: primaryAction,
        available: true,
        safeToConvert,
        mutatesData: false,
        preservesHistoricalAliases: true,
        impact,
        warnings,
      });
    }

    if (recommendation !== 'KEEP_AS_TOURING_ROUTE') {
      actions.push({
        action: 'archiveTouringRoutePreview',
        available: true,
        safeToConvert,
        mutatesData: false,
        preservesHistoricalAliases: true,
        impact,
        warnings,
      });
    }

    return actions;
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

  private async buildUniqueDuplicateCode(sourceCode: string) {
    const baseCode = normalizeCode(`COPY_OF_${sourceCode}`);
    const candidates = Array.from({ length: 20 }, (_, index) => {
      if (index === 0) return baseCode;
      const suffix = `_${index + 1}`;
      return `${baseCode.slice(0, 40 - suffix.length)}${suffix}`;
    });
    const existing = await (this.prisma as any).touringRoute.findMany({
      where: { code: { in: candidates } },
      select: { code: true },
    });
    const existingCodes = new Set((existing || []).map((route: { code?: string | null }) => route.code).filter(Boolean));

    const fallbackSuffix = `_${Date.now().toString(36).toUpperCase()}`;
    return candidates.find((candidate) => !existingCodes.has(candidate)) || `${baseCode.slice(0, 40 - fallbackSuffix.length)}${fallbackSuffix}`;
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

  private buildNestedReplace<T>(items: T[] | undefined, create: (item: T, index: number) => Record<string, unknown>, partial: boolean) {
    if (items === undefined) return undefined;
    const createItems = items.map(create);
    return partial ? { deleteMany: {}, create: createItems } : { create: createItems };
  }

  private normalizePricingForWrite(pricing: TouringRoutePricingInput, index: number) {
    return {
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
    };
  }

  private async syncTouringRoutePricings(tx: any, touringRouteId: string, pricings: TouringRoutePricingInput[]) {
    const existingPricings = await tx.touringRoutePricing.findMany({
      where: { touringRouteId },
      select: { id: true },
    });
    const existingIds = new Set(existingPricings.map((pricing: { id: string }) => pricing.id));
    const retainedIds: string[] = [];
    const newPricings: Array<Record<string, unknown>> = [];

    for (const [index, pricing] of pricings.entries()) {
      const data = this.normalizePricingForWrite(pricing, index);
      const pricingId = normalizeOptionalString(pricing.id);

      if (pricingId && existingIds.has(pricingId)) {
        retainedIds.push(pricingId);
        await tx.touringRoutePricing.update({
          where: { id: pricingId },
          data,
        });
        continue;
      }

      newPricings.push(data);
    }

    await tx.touringRoutePricing.deleteMany({
      where: {
        touringRouteId,
        ...(retainedIds.length > 0 ? { id: { notIn: retainedIds } } : {}),
      },
    });

    for (const data of newPricings) {
      await tx.touringRoutePricing.create({
        data: {
          touringRouteId,
          ...data,
        },
      });
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
      stops: this.buildNestedReplace(
        data.stops,
        (stop, index) => ({
          order: stop.order === undefined || stop.order === null ? index + 1 : Math.floor(Number(stop.order)),
          city: requireTrimmedString(stop.city, `stops[${index}].city`),
          location: normalizeOptionalString(stop.location),
          notes: normalizeOptionalString(stop.notes),
        }),
        partial,
      ),
      pricings: this.buildNestedReplace(
        data.pricings,
        (pricing, index) => this.normalizePricingForWrite(pricing, index),
        partial,
      ),
    };
  }
}
