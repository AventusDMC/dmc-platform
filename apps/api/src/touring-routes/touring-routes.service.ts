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
  days?: TouringRouteDayInput[];
};

type TouringRouteDayInput = {
  dayNumber?: number | null;
  title?: string | null;
  description?: string | null;
  distanceKm?: number | null;
  driveMinutes?: number | null;
  lunchIncluded?: boolean | null;
  dinnerIncluded?: boolean | null;
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

type AqabaExcursionTransportServiceTypeRepairInput = {
  confirm?: string | null;
};

type AqabaExcursionPricingImportInput = {
  confirm?: string | null;
};

type AqabaExcursionDuplicateVehicleRateRepairInput = {
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
const AQABA_EXCURSION_TRANSPORT_SERVICE_TYPE_REPAIR_CONFIRMATION = 'AQABA_EXCURSION_TRANSPORT_SERVICE_TYPE_REPAIR';
const AQABA_EXCURSION_PRICING_IMPORT_CONFIRMATION = 'AQABA_EXCURSION_PRICING_IMPORT';
const AQABA_EXCURSION_DUPLICATE_RATE_REPAIR_CONFIRMATION = 'AQABA_EXCURSION_DUPLICATE_RATE_REPAIR';
const AQABA_EXCURSION_PRICING_SUPPLIER_NAME = 'Almushtari Logistics Services';
const AQABA_EXCURSION_PRICING_FIT_VEHICLE_NAMES = ['Sedan 2', 'Mini Van 6', 'Van 9'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
const QUOTE_TRANSPORT_TAXONOMY_ARCHIVED_TOURING_ROUTE_CODES = [
  ...AQABA_ACTIVITY_BATCH_ALLOWED_CODES,
  'AQ_GLASS',
  ...AQABA_RT_CLEANUP_ALLOWED_CODES,
] as const;
const QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES = [
  'JOR-EXC-AQABA-BERENICE',
  'JOR-EXC-AQABA-DIVING',
  'JOR-EXC-AQABA-GLASS-BOAT',
  'JOR-EXC-AQABA-SNORKELING',
  'JOR-EXC-AQABA-SOUTH-BEACH',
  'JOR-EXC-AQABA-YACHT',
] as const;
const QUOTE_TRANSPORT_TAXONOMY_ACTIVITY_NAMES = [
  'Boat Trip Experience',
  'Private Yacht Charter',
  'Scuba Diving Experience',
  'Snorkeling Experience',
  'South Beach Day',
  'Submarine Experience',
  'Glass Boat Tour',
  'Berenice Beach Club',
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

  async dryRunAqabaExcursionTransportServiceTypeRepair() {
    const serviceType = await this.findCanonicalLocalTransferServiceType();
    const templates = await this.findAqabaExcursionTemplatesWithTransportComponents();
    const inspectedComponents = [];
    const blockingReasons = [];

    if (!serviceType) {
      blockingReasons.push('No canonical local/private transfer TransportServiceType was found.');
    }

    for (const code of QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES) {
      const template = templates.find((entry: any) => normalizeWorkbookText(entry.code) === code);
      if (!template) {
        blockingReasons.push(`Missing Aqaba Excursion Template: ${code}`);
        continue;
      }
      const transportComponents = (template.components || [])
        .filter((component: any) => component.active !== false && component.componentType === 'TRANSPORT')
        .sort((left: any, right: any) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));

      if (transportComponents.length !== 2) {
        blockingReasons.push(`${code} expected 2 active transport components, found ${transportComponents.length}.`);
      }

      for (const component of transportComponents) {
        const missingTransportServiceType = !normalizeWorkbookText(component.transportServiceTypeId);
        inspectedComponents.push({
          templateCode: code,
          templateId: template.id,
          componentId: component.id,
          label: component.label,
          sortOrder: component.sortOrder,
          routeId: component.routeId || null,
          currentTransportServiceTypeId: component.transportServiceTypeId || null,
          missingTransportServiceType,
          proposedServiceTypeId: missingTransportServiceType ? serviceType?.id || null : component.transportServiceTypeId,
          proposedServiceTypeName: missingTransportServiceType ? serviceType?.name || null : component.transportServiceType?.name || null,
          proposedServiceTypeCode: missingTransportServiceType ? serviceType?.code || null : component.transportServiceType?.code || null,
          willUpdate: Boolean(missingTransportServiceType && serviceType?.id),
        });
      }
    }

    return {
      success: true,
      mode: 'AQABA_EXCURSION_TRANSPORT_SERVICE_TYPE_REPAIR_DRY_RUN' as const,
      mutatesData: false,
      deletesData: false,
      changesPricing: false,
      changesTransferRoutes: false,
      changesActivities: false,
      changesTemplates: false,
      allowedTemplateCodes: QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES,
      inspectedComponentCount: inspectedComponents.length,
      missingTransportServiceTypeCount: inspectedComponents.filter((component) => component.missingTransportServiceType).length,
      proposedServiceType: serviceType
        ? { id: serviceType.id, name: serviceType.name, code: serviceType.code || null, classification: serviceType.classification || null }
        : null,
      components: inspectedComponents,
      safeToApply: inspectedComponents.length === 12 && blockingReasons.length === 0 && Boolean(serviceType?.id),
      blockingReasons,
    };
  }

  async applyAqabaExcursionTransportServiceTypeRepair(input: AqabaExcursionTransportServiceTypeRepairInput) {
    const confirm = normalizeWorkbookText(input.confirm);
    if (confirm !== AQABA_EXCURSION_TRANSPORT_SERVICE_TYPE_REPAIR_CONFIRMATION) {
      throw new BadRequestException(
        `Aqaba Excursion transport service type repair requires --confirm=${AQABA_EXCURSION_TRANSPORT_SERVICE_TYPE_REPAIR_CONFIRMATION}.`,
      );
    }

    const dryRun = await this.dryRunAqabaExcursionTransportServiceTypeRepair();
    if (!dryRun.safeToApply) {
      throw new BadRequestException(`Aqaba Excursion transport service type repair is blocked: ${dryRun.blockingReasons.join('; ')}`);
    }

    const updated = [];
    const skipped = [];
    for (const component of dryRun.components) {
      if (!component.missingTransportServiceType) {
        skipped.push({ componentId: component.componentId, templateCode: component.templateCode, reason: 'already has transportServiceTypeId' });
        continue;
      }

      const result = await (this.prisma as any).excursionTemplateComponent.update({
        where: { id: component.componentId },
        data: { transportServiceTypeId: component.proposedServiceTypeId },
        select: { id: true, templateId: true, label: true, sortOrder: true, transportServiceTypeId: true },
      });
      updated.push({
        templateCode: component.templateCode,
        componentId: result.id,
        transportServiceTypeId: result.transportServiceTypeId,
      });
    }

    return {
      success: true,
      mode: 'AQABA_EXCURSION_TRANSPORT_SERVICE_TYPE_REPAIR_APPLY' as const,
      mutatesData: updated.length > 0,
      deletesData: false,
      changesPricing: false,
      changesTransferRoutes: false,
      changesActivities: false,
      changesTemplates: false,
      updated,
      skipped,
      counts: {
        updated: updated.length,
        skipped: skipped.length,
      },
    };
  }

  async validateQuoteTransportTaxonomy() {
    const failedChecks: string[] = [];
    const archivedRouteLeaks = [];
    const templatesVerified = [];
    const componentIssues = [];
    const activityIssues = [];
    const transferIssues = [];

    const touringRoutes = await (this.prisma as any).touringRoute.findMany({
      where: { code: { in: QUOTE_TRANSPORT_TAXONOMY_ARCHIVED_TOURING_ROUTE_CODES as unknown as string[] } },
      select: { id: true, code: true, name: true, active: true },
      orderBy: [{ code: 'asc' }],
    });
    const touringByCode = new Map<string, any>((touringRoutes || []).map((route: any) => [normalizeWorkbookText(route.code), route]));

    for (const code of QUOTE_TRANSPORT_TAXONOMY_ARCHIVED_TOURING_ROUTE_CODES) {
      const route: any = touringByCode.get(code);
      if (!route) {
        archivedRouteLeaks.push({ code, issue: 'Touring Route not found for archive validation' });
        failedChecks.push(`Missing Touring Route archive target: ${code}`);
        continue;
      }
      if (route.active !== false) {
        archivedRouteLeaks.push({
          code,
          touringRouteId: route.id,
          name: route.name,
          active: route.active !== false,
          selectorEligible: route.active !== false,
          issue: 'Touring Route is still active/selector-visible',
        });
        failedChecks.push(`Touring Route still active: ${code}`);
      }
    }

    const templates = await (this.prisma as any).excursionTemplate.findMany({
      where: { code: { in: QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES as unknown as string[] } },
      include: {
        components: {
          include: {
            activity: true,
            route: true,
          },
          orderBy: [{ sortOrder: 'asc' }],
        },
      },
      orderBy: [{ code: 'asc' }],
    });
    const templateByCode = new Map<string, any>((templates || []).map((template: any) => [normalizeWorkbookText(template.code), template]));

    for (const code of QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES) {
      const template: any = templateByCode.get(code);
      if (!template) {
        componentIssues.push({ templateCode: code, issue: 'Excursion Template is missing' });
        failedChecks.push(`Missing Excursion Template: ${code}`);
        continue;
      }
      if (template.active === false) {
        componentIssues.push({ templateCode: code, templateId: template.id, issue: 'Excursion Template is inactive' });
        failedChecks.push(`Inactive Excursion Template: ${code}`);
      }

      const components = template.components || [];
      const expectedComponents = [
        { sortOrder: 1, componentType: 'TRANSPORT', dependency: 'OUTBOUND_LOCAL_TRANSFER' },
        { sortOrder: 2, componentType: 'ACTIVITY', dependency: 'ACTIVITY_MASTER' },
        { sortOrder: 3, componentType: 'TRANSPORT', dependency: 'RETURN_LOCAL_TRANSFER' },
      ];
      if (components.length !== 3) {
        componentIssues.push({ templateCode: code, templateId: template.id, issue: `Expected exactly 3 components, found ${components.length}` });
        failedChecks.push(`Wrong component count for ${code}`);
      }

      for (const expected of expectedComponents) {
        const component = components.find((entry: any) => Number(entry.sortOrder) === expected.sortOrder);
        if (!component) {
          componentIssues.push({ templateCode: code, templateId: template.id, sortOrder: expected.sortOrder, issue: 'Component is missing' });
          failedChecks.push(`Missing component ${expected.sortOrder} for ${code}`);
          continue;
        }
        if (component.componentType !== expected.componentType) {
          componentIssues.push({
            templateCode: code,
            templateId: template.id,
            componentId: component.id,
            sortOrder: expected.sortOrder,
            issue: `Expected ${expected.componentType}, found ${component.componentType}`,
          });
          failedChecks.push(`Wrong component type for ${code} #${expected.sortOrder}`);
        }
        if (expected.componentType === 'TRANSPORT' && (!component.routeId || !component.route || component.route?.isActive === false)) {
          componentIssues.push({
            templateCode: code,
            templateId: template.id,
            componentId: component.id,
            sortOrder: expected.sortOrder,
            routeId: component.routeId || null,
            issue: 'Transport component is not linked to an active route',
          });
          failedChecks.push(`Inactive/missing component route for ${code} #${expected.sortOrder}`);
        }
        if (expected.componentType === 'ACTIVITY' && (!component.activityId || !component.activity || component.activity?.active === false)) {
          componentIssues.push({
            templateCode: code,
            templateId: template.id,
            componentId: component.id,
            sortOrder: expected.sortOrder,
            activityId: component.activityId || null,
            issue: 'Activity component is not linked to an active Activity Master record',
          });
          failedChecks.push(`Inactive/missing component activity for ${code}`);
        }
      }

      if (!componentIssues.some((issue: any) => issue.templateCode === code)) {
        templatesVerified.push({
          code,
          id: template.id,
          name: template.name,
          active: template.active !== false,
          componentCount: components.length,
          componentIds: components.map((component: any) => ({
            sortOrder: component.sortOrder,
            componentType: component.componentType,
            routeId: component.routeId || null,
            activityId: component.activityId || null,
          })),
        });
      }
    }

    const activities = await (this.prisma as any).activity.findMany({
      where: {
        OR: QUOTE_TRANSPORT_TAXONOMY_ACTIVITY_NAMES.map((name) => ({
          name: { equals: name, mode: 'insensitive' },
        })),
      },
      select: { id: true, code: true, name: true, active: true },
      orderBy: [{ name: 'asc' }],
    });
    const activitiesByName = new Map<string, any>((activities || []).map((activity: any) => [normalizeWorkbookText(activity.name).toLowerCase(), activity]));
    for (const name of QUOTE_TRANSPORT_TAXONOMY_ACTIVITY_NAMES) {
      const activity: any = activitiesByName.get(normalizeWorkbookText(name).toLowerCase());
      if (!activity) {
        activityIssues.push({ name, issue: 'Activity Master record is missing' });
        failedChecks.push(`Missing Activity Master: ${name}`);
      } else if (activity.active === false) {
        activityIssues.push({ name, id: activity.id, code: activity.code || null, issue: 'Activity Master record is inactive' });
        failedChecks.push(`Inactive Activity Master: ${name}`);
      }
    }

    for (const [fromName, toName] of AQABA_RT_DEPENDENCY_ROUTE_PAIRS) {
      const normalizedKey = buildRouteNormalizedKey(fromName, toName);
      const routes = await this.findRoutesByNormalizedKey(normalizedKey);
      const activeRoutes = routes.filter((route: any) => route.isActive !== false);
      if (activeRoutes.length === 0) {
        transferIssues.push({ from: fromName, to: toName, normalizedKey, issue: 'Required local transfer route is missing or inactive' });
        failedChecks.push(`Missing/inactive transfer route: ${fromName} -> ${toName}`);
      }
    }

    return {
      passed: failedChecks.length === 0,
      failedChecks,
      archivedRouteLeaks,
      templatesVerified,
      componentIssues,
      activityIssues,
      transferIssues,
    };
  }

  async validateQuoteAqabaExcursionExpansion() {
    const failedChecks: string[] = [];
    const templatesChecked = [];
    const expansionIssues = [];
    const pricingIssues = [];
    const archivedRouteUsage = [];
    const missingComponents = [];

    const templates = await (this.prisma as any).excursionTemplate.findMany({
      where: { code: { in: QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES as unknown as string[] } },
      include: {
        components: {
          include: {
            activity: true,
            route: true,
            touringRoute: true,
            transportServiceType: true,
            supplierService: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ code: 'asc' }],
    });
    const templateByCode = new Map<string, any>((templates || []).map((template: any) => [normalizeWorkbookText(template.code), template]));

    for (const code of QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES) {
      const template: any = templateByCode.get(code);
      if (!template) {
        missingComponents.push({ templateCode: code, issue: 'Excursion Template is missing' });
        failedChecks.push(`Missing Aqaba Excursion Template: ${code}`);
        continue;
      }
      if (template.active === false) {
        expansionIssues.push({ templateCode: code, templateId: template.id, issue: 'Excursion Template is inactive' });
        failedChecks.push(`Inactive Aqaba Excursion Template: ${code}`);
      }

      const components = (template.components || []).filter((component: any) => component.active !== false);
      const expected = [
        { sortOrder: 1, role: 'outbound transport', componentType: 'TRANSPORT' },
        { sortOrder: 2, role: 'activity', componentType: 'ACTIVITY' },
        { sortOrder: 3, role: 'return transport', componentType: 'TRANSPORT' },
      ];
      if (components.length !== 3) {
        missingComponents.push({ templateCode: code, templateId: template.id, issue: `Expected exactly 3 active components, found ${components.length}` });
        failedChecks.push(`Wrong active component count for ${code}`);
      }

      const quoteServicePayloads = [];
      for (const expectation of expected) {
        const component = components.find((entry: any) => Number(entry.sortOrder) === expectation.sortOrder);
        if (!component) {
          missingComponents.push({ templateCode: code, templateId: template.id, sortOrder: expectation.sortOrder, role: expectation.role, issue: 'Component is missing' });
          failedChecks.push(`Missing ${expectation.role} component for ${code}`);
          continue;
        }
        if (component.componentType !== expectation.componentType) {
          expansionIssues.push({
            templateCode: code,
            templateId: template.id,
            componentId: component.id,
            sortOrder: component.sortOrder,
            issue: `Expected ${expectation.componentType}, found ${component.componentType}`,
          });
          failedChecks.push(`Wrong component type for ${code} #${expectation.sortOrder}`);
          continue;
        }

        if (component.componentType === 'TRANSPORT') {
          if (!component.routeId || !component.route || component.route.isActive === false) {
            expansionIssues.push({
              templateCode: code,
              templateId: template.id,
              componentId: component.id,
              sortOrder: component.sortOrder,
              issue: 'Transport component must link to an active transfer route',
            });
            failedChecks.push(`Transport component cannot expand for ${code} #${expectation.sortOrder}`);
            continue;
          }
          const transportServiceTypeId = this.getComponentTransportServiceTypeId(component);
          if (!transportServiceTypeId) {
            expansionIssues.push({
              templateCode: code,
              templateId: template.id,
              componentId: component.id,
              routeId: component.routeId,
              sortOrder: component.sortOrder,
              issue: 'Quote expansion requires transportServiceTypeId for route-based transport components',
            });
            failedChecks.push(`Transport component missing service type for ${code} #${expectation.sortOrder}`);
          }

          const activeVehicleRateCount = await this.safeCount('vehicleRate', {
            routeId: component.routeId,
            active: true,
          });
          if (activeVehicleRateCount === 0) {
            pricingIssues.push({
              templateCode: code,
              templateId: template.id,
              componentId: component.id,
              componentType: 'TRANSPORT',
              routeId: component.routeId,
              routeName: component.route?.name || null,
              pricingAvailable: false,
              issue: 'No active VehicleRate rows are available for this transfer route',
            });
          }

          const payload = {
            componentId: component.id,
            serviceLane: 'transport',
            routeId: component.routeId,
            transportServiceTypeId,
            touringRouteId: component.touringRouteId || null,
            excursionTemplateId: template.id,
            excursionTemplateComponentId: component.id,
          };
          quoteServicePayloads.push(payload);
          const legacyUsage = this.detectLegacyAqabaPayloadUsage(payload, component);
          if (legacyUsage.length > 0) {
            archivedRouteUsage.push({
              templateCode: code,
              templateId: template.id,
              componentId: component.id,
              sortOrder: component.sortOrder,
              issues: legacyUsage,
            });
            failedChecks.push(`Archived/legacy route usage in ${code} #${expectation.sortOrder}`);
          }
        }

        if (component.componentType === 'ACTIVITY') {
          if (!component.activityId || !component.activity || component.activity.active === false) {
            expansionIssues.push({
              templateCode: code,
              templateId: template.id,
              componentId: component.id,
              sortOrder: component.sortOrder,
              issue: 'Activity component must link to an active Activity Master record',
            });
            failedChecks.push(`Activity component cannot expand for ${code}`);
            continue;
          }

          const activeVariantCount = await this.safeCount('activityRateVariant', {
            activityId: component.activityId,
            active: true,
          });
          const basePriceAvailable = Number(component.activity.costPrice || 0) > 0 || Number(component.activity.sellPrice || 0) > 0;
          if (activeVariantCount === 0 && !basePriceAvailable) {
            pricingIssues.push({
              templateCode: code,
              templateId: template.id,
              componentId: component.id,
              componentType: 'ACTIVITY',
              activityId: component.activityId,
              activityName: component.activity.name,
              pricingAvailable: false,
              issue: 'No active ActivityRateVariant or base Activity price is available',
            });
          }

          quoteServicePayloads.push({
            componentId: component.id,
            serviceLane: 'activity',
            activityId: component.activityId,
            excursionTemplateId: template.id,
            excursionTemplateComponentId: component.id,
          });
        }
      }

      templatesChecked.push({
        code,
        id: template.id,
        name: template.name,
        active: template.active !== false,
        componentCount: components.length,
        quoteServicePayloads,
        canProduceQuoteServicePayloads:
          quoteServicePayloads.length === 3 &&
          !expansionIssues.some((issue: any) => issue.templateCode === code) &&
          !missingComponents.some((issue: any) => issue.templateCode === code) &&
          !archivedRouteUsage.some((issue: any) => issue.templateCode === code),
      });
    }

    return {
      passed: failedChecks.length === 0,
      failedChecks,
      templatesChecked,
      expansionIssues,
      pricingIssues,
      archivedRouteUsage,
      missingComponents,
    };
  }

  async dryRunAqabaExcursionPricingReadiness() {
    const templates = await (this.prisma as any).excursionTemplate.findMany({
      where: { code: { in: QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES as unknown as string[] } },
      include: {
        components: {
          include: {
            activity: {
              include: {
                rateVariants: {
                  where: { active: true },
                  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                },
              },
            },
            route: true,
            transportServiceType: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ code: 'asc' }],
    });
    const templateByCode = new Map<string, any>((templates || []).map((template: any) => [normalizeWorkbookText(template.code), template]));
    const rows = [];

    for (const code of QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES) {
      const template = templateByCode.get(code);
      if (!template) {
        rows.push({
          code,
          template: null,
          transportComponents: [],
          activityComponents: [],
          missingPricingRows: [{ componentType: 'TEMPLATE', issue: 'Template is missing' }],
          recommendedPricingAction: 'MANUAL_REVIEW',
          safeToPrice: false,
          blockingReasons: ['Template is missing'],
        });
        continue;
      }

      const missingPricingRows = [];
      const blockingReasons = [];
      const transportComponents = [];
      const activityComponents = [];

      for (const component of (template.components || []).filter((entry: any) => entry.active !== false)) {
        if (component.componentType === 'TRANSPORT') {
          const vehicleRates = component.routeId
            ? await (this.prisma as any).vehicleRate.findMany({
                where: { routeId: component.routeId, active: true },
                include: {
                  supplier: true,
                  vehicle: true,
                  serviceType: true,
                },
                orderBy: [{ minPax: 'asc' }, { maxPax: 'asc' }, { price: 'asc' }],
              })
            : [];
          const supplierCoverage = Array.from(new Set((vehicleRates || []).map((rate: any) => rate.supplier?.name || rate.supplierId || 'Unassigned supplier')));
          const vehicleCoverage = Array.from(new Set((vehicleRates || []).map((rate: any) => rate.vehicle?.name || rate.vehicleId).filter(Boolean)));
          const hasVehicleRate = vehicleRates.length > 0;

          if (!component.routeId || !component.route || component.route.isActive === false) {
            blockingReasons.push(`Transport component ${component.id} is missing an active transfer route`);
          }
          if (!hasVehicleRate) {
            missingPricingRows.push({
              componentId: component.id,
              componentType: 'TRANSPORT',
              routeId: component.routeId || null,
              routeName: component.route?.name || null,
              issue: 'No active VehicleRate rows found for this transfer route',
            });
          }

          transportComponents.push({
            componentId: component.id,
            label: component.label,
            sortOrder: component.sortOrder,
            routeId: component.routeId || null,
            routeName: component.route?.name || null,
            transportServiceTypeId: this.getComponentTransportServiceTypeId(component),
            transportServiceTypeName: component.transportServiceType?.name || null,
            vehicleRateExists: hasVehicleRate,
            vehicleRateCount: vehicleRates.length,
            supplierCoverage,
            vehicleCoverage,
            sampleRates: (vehicleRates || []).slice(0, 5).map((rate: any) => ({
              id: rate.id,
              supplier: rate.supplier?.name || rate.supplierId || null,
              vehicle: rate.vehicle?.name || rate.vehicleId || null,
              minPax: rate.minPax,
              maxPax: rate.maxPax,
              price: rate.price,
              currency: rate.currency,
              serviceType: rate.serviceType?.name || null,
            })),
          });
        }

        if (component.componentType === 'ACTIVITY') {
          const activity = component.activity || null;
          const activeVariants = activity?.rateVariants || [];
          const basePriceExists = Boolean(activity && (Number(activity.costPrice || 0) > 0 || Number(activity.sellPrice || 0) > 0));
          const hasActivityPricing = activeVariants.length > 0 || basePriceExists;

          if (!component.activityId || !activity || activity.active === false) {
            blockingReasons.push(`Activity component ${component.id} is missing an active Activity Master record`);
          }
          if (!hasActivityPricing) {
            missingPricingRows.push({
              componentId: component.id,
              componentType: 'ACTIVITY',
              activityId: component.activityId || null,
              activityName: activity?.name || null,
              issue: 'No active ActivityRateVariant or base Activity price found',
            });
          }

          activityComponents.push({
            componentId: component.id,
            label: component.label,
            sortOrder: component.sortOrder,
            activityId: component.activityId || null,
            activityName: activity?.name || null,
            activityActive: activity ? activity.active !== false : false,
            activityRateVariantExists: activeVariants.length > 0,
            activityRateVariantCount: activeVariants.length,
            basePriceExists,
            baseCostPrice: activity?.costPrice ?? null,
            baseSellPrice: activity?.sellPrice ?? null,
            sampleVariants: activeVariants.slice(0, 5).map((variant: any) => ({
              id: variant.id,
              label: variant.label,
              costPrice: variant.costPrice,
              sellPrice: variant.sellPrice,
              currency: variant.currency,
              active: variant.active !== false,
            })),
          });
        }
      }

      const safeToPrice = blockingReasons.length === 0;
      rows.push({
        template: {
          id: template.id,
          code: template.code,
          name: template.name,
          active: template.active !== false,
        },
        transportComponents,
        activityComponents,
        missingPricingRows,
        recommendedPricingAction:
          missingPricingRows.length === 0
            ? 'NO_ACTION_PRICING_READY'
            : safeToPrice
              ? 'ADD_MISSING_VEHICLE_AND_ACTIVITY_RATES'
              : 'FIX_COMPONENT_LINKS_BEFORE_PRICING',
        safeToPrice,
        blockingReasons,
      });
    }

    return {
      success: true,
      mode: 'AQABA_EXCURSION_PRICING_READINESS_DRY_RUN' as const,
      mutatesData: false,
      createsPricing: false,
      changesRoutes: false,
      changesActivities: false,
      changesTemplates: false,
      touchesHistoricalTouringRoutes: false,
      templatesChecked: rows.length,
      rows,
      summary: {
        safeToPrice: rows.filter((row) => row.safeToPrice).length,
        blocked: rows.filter((row) => !row.safeToPrice).length,
        missingPricingRows: rows.reduce((total, row) => total + row.missingPricingRows.length, 0),
      },
    };
  }

  async exportAqabaExcursionPricingWorkbook(outputPath: string) {
    const readiness = await this.dryRunAqabaExcursionPricingReadiness();
    const pricingCatalog = await this.resolveAqabaExcursionPricingCatalog();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DMC API';
    workbook.created = new Date();

    const transportSheet = workbook.addWorksheet('Transport Rates');
    transportSheet.columns = [
      { header: 'templateCode', key: 'templateCode', width: 30 },
      { header: 'templateName', key: 'templateName', width: 42 },
      { header: 'outboundRouteId', key: 'outboundRouteId', width: 38 },
      { header: 'outboundRouteName', key: 'outboundRouteName', width: 42 },
      { header: 'returnRouteId', key: 'returnRouteId', width: 38 },
      { header: 'returnRouteName', key: 'returnRouteName', width: 42 },
      { header: 'supplierName', key: 'supplierName', width: 34 },
      { header: 'supplierId', key: 'supplierId', width: 38 },
      { header: 'vehicleName', key: 'vehicleName', width: 28 },
      { header: 'vehicleId', key: 'vehicleId', width: 38 },
      { header: 'roundTripCostPrice', key: 'roundTripCostPrice', width: 20 },
      { header: 'roundTripSellPrice', key: 'roundTripSellPrice', width: 20 },
      { header: 'currency', key: 'currency', width: 12 },
      { header: 'pricingBasis', key: 'pricingBasis', width: 16 },
      { header: 'notes', key: 'notes', width: 50 },
    ];

    const activitySheet = workbook.addWorksheet('Activity Rates');
    activitySheet.columns = [
      { header: 'templateCode', key: 'templateCode', width: 30 },
      { header: 'templateName', key: 'templateName', width: 36 },
      { header: 'activityId', key: 'activityId', width: 38 },
      { header: 'activityName', key: 'activityName', width: 34 },
      { header: 'variantName', key: 'variantName', width: 30 },
      { header: 'costPrice', key: 'costPrice', width: 14 },
      { header: 'sellPrice', key: 'sellPrice', width: 14 },
      { header: 'currency', key: 'currency', width: 12 },
      { header: 'pricingBasis', key: 'pricingBasis', width: 16 },
      { header: 'notes', key: 'notes', width: 50 },
    ];

    for (const row of readiness.rows || []) {
      const templateCode = row.template?.code || row.code;
      const templateName = row.template?.name || '';
      const outboundComponent = (row.transportComponents || []).find((component: any) => Number(component.sortOrder) === 1);
      const returnComponent = (row.transportComponents || []).find((component: any) => Number(component.sortOrder) === 3);
      const hasMissingTransportPricing = (row.transportComponents || []).some((component: any) => !component.vehicleRateExists);
      if (hasMissingTransportPricing && outboundComponent?.routeId && returnComponent?.routeId) {
        for (const vehicleName of AQABA_EXCURSION_PRICING_FIT_VEHICLE_NAMES) {
          const vehicle = pricingCatalog.vehiclesByName.get(vehicleName);
          transportSheet.addRow({
            templateCode,
            templateName,
            outboundRouteId: outboundComponent.routeId || '',
            outboundRouteName: outboundComponent.routeName || '',
            returnRouteId: returnComponent.routeId || '',
            returnRouteName: returnComponent.routeName || '',
            supplierName: pricingCatalog.supplier?.name || AQABA_EXCURSION_PRICING_SUPPLIER_NAME,
            supplierId: pricingCatalog.supplier?.id || '',
            vehicleName,
            vehicleId: vehicle?.id || '',
            roundTripCostPrice: '',
            roundTripSellPrice: '',
            currency: 'JOD',
            pricingBasis: 'ROUND_TRIP_PER_VEHICLE',
            notes: '',
          });
        }
      }

      for (const component of row.activityComponents || []) {
        if (component.activityRateVariantExists || component.basePriceExists) continue;
        activitySheet.addRow({
          templateCode,
          templateName,
          activityId: component.activityId || '',
          activityName: component.activityName || '',
          variantName: '',
          costPrice: '',
          sellPrice: '',
          currency: 'JOD',
          pricingBasis: 'PER_PERSON',
          notes: '',
        });
      }
    }

    [transportSheet, activitySheet].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    await workbook.xlsx.writeFile(outputPath);

    return {
      success: true,
      mode: 'AQABA_EXCURSION_PRICING_WORKBOOK_EXPORT' as const,
      mutatesData: false,
      outputPath,
      sheets: {
        transportRates: Math.max(transportSheet.rowCount - 1, 0),
        activityRates: Math.max(activitySheet.rowCount - 1, 0),
      },
      allowedTemplateCodes: QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES,
    };
  }

  async previewAqabaExcursionPricingWorkbookImport(workbookPath: string) {
    return this.processAqabaExcursionPricingWorkbookImport(workbookPath, false);
  }

  async importAqabaExcursionPricingWorkbook(workbookPath: string, input: AqabaExcursionPricingImportInput) {
    const confirm = normalizeWorkbookText(input.confirm);
    if (confirm !== AQABA_EXCURSION_PRICING_IMPORT_CONFIRMATION) {
      throw new BadRequestException(`Aqaba excursion pricing import requires --confirm=${AQABA_EXCURSION_PRICING_IMPORT_CONFIRMATION}.`);
    }
    return this.processAqabaExcursionPricingWorkbookImport(workbookPath, true);
  }

  async dryRunAqabaExcursionDuplicateVehicleRateRepair() {
    const context = await this.buildAqabaExcursionPricingImportContext();
    const allowedRouteIds = Array.from(context.allowedRouteIds.keys());
    const supplierId = context.pricingCatalog.supplier.id;

    const rates = await (this.prisma as any).vehicleRate.findMany({
      where: {
        active: true,
        routeId: { in: allowedRouteIds },
        supplierId,
      },
      include: {
        supplier: true,
        vehicle: true,
        serviceType: true,
        route: true,
      },
      orderBy: [{ routeName: 'asc' }, { vehicleId: 'asc' }, { serviceTypeId: 'asc' }, { createdAt: 'asc' }],
    });

    const groups = new Map<string, any[]>();
    for (const rate of rates || []) {
      const key = [rate.routeId, rate.supplierId || 'NO_SUPPLIER', rate.vehicleId, rate.serviceTypeId].join('|');
      const existing = groups.get(key) || [];
      existing.push(rate);
      groups.set(key, existing);
    }

    const duplicateGroups = [];
    for (const groupRates of groups.values()) {
      if (groupRates.length <= 1) continue;
      const sorted = [...groupRates].sort((left: any, right: any) => {
        const leftTime = new Date(left.createdAt || 0).getTime();
        const rightTime = new Date(right.createdAt || 0).getTime();
        return leftTime - rightTime || String(left.id).localeCompare(String(right.id));
      });
      const keptRate = sorted[0];
      const duplicates = sorted.slice(1);
      const duplicateRateIds = duplicates.map((rate: any) => rate.id);
      const duplicatePrices = sorted.map((rate: any) => ({
        id: rate.id,
        price: rate.price,
        currency: rate.currency,
        createdAt: rate.createdAt || null,
      }));
      const priceKeys = new Set(sorted.map((rate: any) => `${Number(rate.price)}|${normalizeWorkbookText(rate.currency).toUpperCase()}`));
      const blockingReasons = [];

      if (priceKeys.size > 1) {
        blockingReasons.push('Duplicate active rates have conflicting price/currency values');
      }

      const duplicateQuoteReferences = [];
      for (const rate of duplicates) {
        const quoteReferences = await this.safeCount('quoteItem', { appliedVehicleRateId: rate.id });
        if (quoteReferences > 0) {
          duplicateQuoteReferences.push({ vehicleRateId: rate.id, quoteReferences });
        }
      }
      if (duplicateQuoteReferences.length > 0) {
        blockingReasons.push('One or more duplicate rates are referenced by quote items');
      }

      duplicateGroups.push({
        routeId: keptRate.routeId,
        routeName: keptRate.route?.name || keptRate.routeName,
        supplierId: keptRate.supplierId || null,
        supplierName: keptRate.supplier?.name || null,
        vehicleId: keptRate.vehicleId,
        vehicleName: keptRate.vehicle?.name || null,
        serviceTypeId: keptRate.serviceTypeId,
        serviceTypeName: keptRate.serviceType?.name || null,
        activeRateCount: sorted.length,
        duplicateRateIds,
        keptRateId: keptRate.id,
        duplicatePrices,
        duplicateQuoteReferences,
        safeToRepair: blockingReasons.length === 0,
        blockingReasons,
      });
    }

    return {
      success: true,
      mode: 'AQABA_EXCURSION_DUPLICATE_VEHICLE_RATE_REPAIR_DRY_RUN' as const,
      mutatesData: false,
      deletesData: false,
      touchesQuotesOrBookings: false,
      allowedTemplateCodes: QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES,
      allowedRouteIds,
      supplier: context.pricingCatalog.supplier,
      duplicateGroups,
      summary: {
        duplicateGroups: duplicateGroups.length,
        safeToRepair: duplicateGroups.filter((group) => group.safeToRepair).length,
        blocked: duplicateGroups.filter((group) => !group.safeToRepair).length,
        duplicateRates: duplicateGroups.reduce((total, group) => total + group.duplicateRateIds.length, 0),
      },
    };
  }

  async applyAqabaExcursionDuplicateVehicleRateRepair(input: AqabaExcursionDuplicateVehicleRateRepairInput) {
    const confirm = normalizeWorkbookText(input.confirm);
    if (confirm !== AQABA_EXCURSION_DUPLICATE_RATE_REPAIR_CONFIRMATION) {
      throw new BadRequestException(`Aqaba excursion duplicate VehicleRate repair requires --confirm=${AQABA_EXCURSION_DUPLICATE_RATE_REPAIR_CONFIRMATION}.`);
    }

    const dryRun = await this.dryRunAqabaExcursionDuplicateVehicleRateRepair();
    const repaired = [];
    const blocked = [];

    for (const group of dryRun.duplicateGroups) {
      if (!group.safeToRepair) {
        blocked.push(group);
        continue;
      }

      for (const duplicateRateId of group.duplicateRateIds) {
        const current = await (this.prisma as any).vehicleRate.findUnique({
          where: { id: duplicateRateId },
          select: { id: true, notes: true, active: true },
        });
        if (!current?.active) continue;
        const repairNote = `Archived by ${AQABA_EXCURSION_DUPLICATE_RATE_REPAIR_CONFIRMATION}; kept VehicleRate ${group.keptRateId}; scoped to Aqaba excursion duplicate cleanup.`;
        const notes = [normalizeWorkbookText(current.notes), repairNote].filter(Boolean).join(' | ');
        const updated = await (this.prisma as any).vehicleRate.update({
          where: { id: duplicateRateId },
          data: { active: false, notes },
          select: { id: true, active: true, routeId: true, supplierId: true, vehicleId: true, serviceTypeId: true },
        });
        repaired.push({
          archivedRateId: updated.id,
          keptRateId: group.keptRateId,
          routeId: updated.routeId,
          supplierId: updated.supplierId,
          vehicleId: updated.vehicleId,
          serviceTypeId: updated.serviceTypeId,
        });
      }
    }

    return {
      success: blocked.length === 0,
      mode: 'AQABA_EXCURSION_DUPLICATE_VEHICLE_RATE_REPAIR_APPLY' as const,
      mutatesData: repaired.length > 0,
      deletesData: false,
      touchesQuotesOrBookings: false,
      repaired,
      blocked,
      summary: {
        archivedDuplicateRates: repaired.length,
        blockedGroups: blocked.length,
      },
    };
  }

  private async processAqabaExcursionPricingWorkbookImport(workbookPath: string, apply: boolean) {
    const normalizedPath = normalizeWorkbookText(workbookPath);
    if (!normalizedPath) {
      throw new BadRequestException('Aqaba excursion pricing import requires a workbook path.');
    }

    const context = await this.buildAqabaExcursionPricingImportContext();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(normalizedPath);

    const transportRows = this.readPricingWorkbookSheet(workbook, 'Transport Rates');
    const activityRows = this.readPricingWorkbookSheet(workbook, 'Activity Rates');
    const rows: any[] = [];
    const duplicateKeys = new Map<string, number>();
    const failedChecks: string[] = [];
    const getDuplicateKeys = (parsed: any): string[] =>
      Array.isArray(parsed.duplicateKeys)
        ? parsed.duplicateKeys.map((key: unknown) => normalizeWorkbookText(key)).filter(Boolean)
        : [normalizeWorkbookText(parsed.duplicateKey)].filter(Boolean);

    for (const row of transportRows) {
      const parsed = await this.validateAqabaExcursionTransportPricingRow(row, context);
      rows.push(parsed);
      if (parsed.action !== 'SKIP_EMPTY') {
        for (const duplicateKey of getDuplicateKeys(parsed)) {
          duplicateKeys.set(duplicateKey, (duplicateKeys.get(duplicateKey) || 0) + 1);
        }
      }
    }

    for (const row of activityRows) {
      const parsed = await this.validateAqabaExcursionActivityPricingRow(row, context);
      rows.push(parsed);
      if (parsed.action !== 'SKIP_EMPTY') {
        for (const duplicateKey of getDuplicateKeys(parsed)) {
          duplicateKeys.set(duplicateKey, (duplicateKeys.get(duplicateKey) || 0) + 1);
        }
      }
    }

    for (const row of rows) {
      const rowDuplicateKeys = row.action === 'SKIP_EMPTY' ? [] : getDuplicateKeys(row);
      const duplicatedKeys = rowDuplicateKeys.filter((duplicateKey: string) => (duplicateKeys.get(duplicateKey) || 0) > 1);
      if (duplicatedKeys.length > 0) {
        row.blockingReasons.push(`Duplicate rate row in workbook: ${duplicatedKeys.join(', ')}`);
      }
      row.safeToApply = row.blockingReasons.length === 0 && row.action === 'CREATE';
      if (row.blockingReasons.length > 0) {
        failedChecks.push(`${row.sheet} row ${row.rowNumber}: ${row.blockingReasons.join('; ')}`);
      }
    }

    const applicableRows = rows.filter((row) => row.safeToApply);
    const skippedRows = rows.filter((row) => row.action !== 'CREATE' && row.blockingReasons.length === 0);
    const result: any = {
      success: failedChecks.length === 0,
      mode: apply ? 'AQABA_EXCURSION_PRICING_IMPORT' : 'AQABA_EXCURSION_PRICING_IMPORT_PREVIEW',
      mutatesData: apply,
      workbookPath: normalizedPath,
      allowedTemplateCodes: QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES,
      safeToApply: failedChecks.length === 0,
      failedChecks,
      summary: {
        workbookRows: rows.length,
        creatableRows: applicableRows.length,
        skippedRows: skippedRows.length,
        blockedRows: rows.filter((row) => row.blockingReasons.length > 0).length,
      },
      rows: rows.map(({ duplicateKey, duplicateKeys, data, ...row }) => row),
      created: {
        vehicleRates: [],
        activityRateVariants: [],
      },
    };

    if (!apply) return result;
    if (failedChecks.length > 0) {
      throw new BadRequestException(`Aqaba excursion pricing import is blocked: ${failedChecks.join(' | ')}`);
    }

    for (const row of applicableRows) {
      if (row.kind === 'TRANSPORT') {
        for (const rateData of row.data || []) {
          const created = await (this.prisma as any).vehicleRate.create({
            data: rateData,
            include: { supplier: true, vehicle: true, serviceType: true, route: true },
          });
          result.created.vehicleRates.push({
            id: created.id,
            templateCode: row.templateCode,
            routeId: created.routeId,
            routeName: created.routeName,
            supplierId: created.supplierId || null,
            supplierName: created.supplier?.name || null,
            vehicleId: created.vehicleId,
            vehicleName: created.vehicle?.name || null,
            price: created.price,
            roundTripSellPrice: row.roundTripSellPrice,
            currency: created.currency,
            pricingBasis: 'ROUND_TRIP_PER_VEHICLE_SPLIT_LEG',
          });
        }
      }

      if (row.kind === 'ACTIVITY') {
        const created = await (this.prisma as any).activityRateVariant.create({
          data: row.data,
        });
        result.created.activityRateVariants.push({
          id: created.id,
          activityId: created.activityId,
          name: created.name,
          costPrice: created.costPrice,
          sellPrice: created.sellPrice,
          currency: created.currency,
        });
      }
    }

    result.summary.createdVehicleRates = result.created.vehicleRates.length;
    result.summary.createdActivityRateVariants = result.created.activityRateVariants.length;
    return result;
  }

  private readPricingWorkbookSheet(workbook: ExcelJS.Workbook, sheetName: string) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return [];
    const headerRow = sheet.getRow(1);
    const headerByColumn = new Map<number, string>();
    headerRow.eachCell((cell, columnNumber) => {
      headerByColumn.set(columnNumber, normalizeWorkbookHeader(this.excelCellValue(cell.value)));
    });

    const rows: any[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const data: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        const header = headerByColumn.get(columnNumber);
        if (header) data[header] = normalizeWorkbookText(this.excelCellValue(cell.value));
      });
      if (Object.values(data).some((value) => normalizeWorkbookText(value))) {
        rows.push({ sheet: sheetName, rowNumber, data });
      }
    });
    return rows;
  }

  private excelCellValue(value: unknown): unknown {
    if (!value || value instanceof Date) return value;
    if (typeof value === 'object') {
      const objectValue = value as any;
      if (objectValue.text !== undefined) return objectValue.text;
      if (objectValue.result !== undefined) return objectValue.result;
      if (Array.isArray(objectValue.richText)) return objectValue.richText.map((entry: any) => entry.text || '').join('');
    }
    return value;
  }

  private async buildAqabaExcursionPricingImportContext() {
    const pricingCatalog = await this.resolveAqabaExcursionPricingCatalog();
    const templates = await (this.prisma as any).excursionTemplate.findMany({
      where: { code: { in: QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES as unknown as string[] } },
      include: {
        components: {
          include: { activity: true, route: true, transportServiceType: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ code: 'asc' }],
    });

    const templatesByCode = new Map<string, any>();
    const allowedRouteIds = new Map<string, any>();
    const allowedRouteKeys = new Map<string, any>();
    const transportPairsByTemplateCode = new Map<string, any>();
    const allowedActivityIds = new Map<string, any>();
    const allowedActivityKeys = new Map<string, any>();

    for (const template of templates || []) {
      const templateCode = normalizeWorkbookText(template.code);
      if (!QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES.includes(templateCode as any)) continue;
      templatesByCode.set(templateCode, template);
      const transportComponents = (template.components || [])
        .filter((entry: any) => entry.active !== false && entry.componentType === 'TRANSPORT')
        .sort((left: any, right: any) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
      const outboundComponent = transportComponents.find((entry: any) => Number(entry.sortOrder) === 1) || transportComponents[0] || null;
      const returnComponent = transportComponents.find((entry: any) => Number(entry.sortOrder) === 3) || transportComponents[1] || null;
      transportPairsByTemplateCode.set(templateCode, { template, outboundComponent, returnComponent });
      for (const component of (template.components || []).filter((entry: any) => entry.active !== false)) {
        if (component.componentType === 'TRANSPORT' && component.routeId) {
          const entry = { template, component, route: component.route };
          allowedRouteIds.set(component.routeId, entry);
          allowedRouteKeys.set(`${templateCode}|${component.routeId}`, entry);
        }
        if (component.componentType === 'ACTIVITY' && component.activityId) {
          const entry = { template, component, activity: component.activity };
          allowedActivityIds.set(component.activityId, entry);
          allowedActivityKeys.set(`${templateCode}|${component.activityId}`, entry);
        }
      }
    }

    return { templatesByCode, allowedRouteIds, allowedRouteKeys, transportPairsByTemplateCode, allowedActivityIds, allowedActivityKeys, pricingCatalog };
  }

  private async resolveAqabaExcursionPricingCatalog() {
    const supplier = await (this.prisma as any).supplier.findFirst({
      where: { name: { equals: AQABA_EXCURSION_PRICING_SUPPLIER_NAME, mode: 'insensitive' }, type: { equals: 'transport', mode: 'insensitive' } },
      select: { id: true, name: true, type: true },
    });
    const vehicles = await (this.prisma as any).vehicle.findMany({
      where: {
        OR: AQABA_EXCURSION_PRICING_FIT_VEHICLE_NAMES.map((name) => ({ name: { equals: name, mode: 'insensitive' } })),
      },
      select: { id: true, name: true, maxPax: true, vehicleType: true, supplierId: true, resolvedSupplierId: true, supplierName: true },
      orderBy: [{ maxPax: 'asc' }, { name: 'asc' }],
    });

    const vehiclesByName = new Map<string, any>();
    for (const name of AQABA_EXCURSION_PRICING_FIT_VEHICLE_NAMES) {
      const matches = (vehicles || []).filter((vehicle: any) => normalizeWorkbookText(vehicle.name).toLowerCase() === name.toLowerCase());
      const supplierSpecific =
        matches.find((vehicle: any) => supplier?.id && normalizeWorkbookText(vehicle.resolvedSupplierId) === supplier.id) ||
        matches.find((vehicle: any) => normalizeWorkbookText(vehicle.supplierName).toLowerCase() === AQABA_EXCURSION_PRICING_SUPPLIER_NAME.toLowerCase()) ||
        matches[0] ||
        null;
      if (supplierSpecific) vehiclesByName.set(name, supplierSpecific);
    }

    const missing: string[] = [];
    if (!supplier?.id) missing.push(`Missing transport supplier: ${AQABA_EXCURSION_PRICING_SUPPLIER_NAME}`);
    for (const name of AQABA_EXCURSION_PRICING_FIT_VEHICLE_NAMES) {
      if (!vehiclesByName.get(name)?.id) missing.push(`Missing FIT vehicle: ${name}`);
    }
    if (missing.length > 0) {
      throw new BadRequestException(`Aqaba excursion pricing workbook requires canonical catalog rows: ${missing.join('; ')}`);
    }

    return {
      supplier,
      vehiclesByName,
      allowedVehicleIds: new Set(Array.from(vehiclesByName.values()).map((vehicle: any) => vehicle.id)),
    };
  }

  private parseOptionalWorkbookMoney(value: unknown, label: string, blockingReasons: string[]) {
    const raw = normalizeWorkbookText(value);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      blockingReasons.push(`${label} must be a non-negative number`);
      return null;
    }
    return parsed;
  }

  private async validateAqabaExcursionTransportPricingRow(row: any, context: any) {
    const data = row.data;
    const blockingReasons: string[] = [];
    const templateCode = normalizeWorkbookText(data.templatecode);
    const outboundRouteId = normalizeWorkbookText(data.outboundrouteid);
    const returnRouteId = normalizeWorkbookText(data.returnrouteid);
    const supplierId = normalizeWorkbookText(data.supplierid);
    const vehicleId = normalizeWorkbookText(data.vehicleid);
    const currency = normalizeWorkbookText(data.currency || 'JOD').toUpperCase();
    const pricingBasis = normalizeWorkbookText(data.pricingbasis || 'ROUND_TRIP_PER_VEHICLE').toUpperCase();
    const roundTripCostPrice = this.parseOptionalWorkbookMoney(data.roundtripcostprice, 'roundTripCostPrice', blockingReasons);
    const roundTripSellPrice = this.parseOptionalWorkbookMoney(data.roundtripsellprice, 'roundTripSellPrice', blockingReasons);
    const isEmptyPricingRow = roundTripCostPrice === null && roundTripSellPrice === null;

    const template = context.templatesByCode.get(templateCode);
    const transportPair = context.transportPairsByTemplateCode.get(templateCode);
    if (!template || !QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES.includes(templateCode as any)) {
      blockingReasons.push('templateCode is not one of the allowed Aqaba Excursion Templates');
    }

    if (!outboundRouteId) {
      blockingReasons.push('outboundRouteId is required for transport pricing rows');
    } else if (!UUID_PATTERN.test(outboundRouteId)) {
      blockingReasons.push('outboundRouteId must be a UUID');
    }
    if (!returnRouteId) {
      blockingReasons.push('returnRouteId is required for transport pricing rows');
    } else if (!UUID_PATTERN.test(returnRouteId)) {
      blockingReasons.push('returnRouteId must be a UUID');
    }
    if (!supplierId) {
      blockingReasons.push('supplierId is required for transport pricing rows');
    } else if (!UUID_PATTERN.test(supplierId)) {
      blockingReasons.push('supplierId must be a UUID');
    }
    if (!vehicleId) {
      blockingReasons.push('vehicleId is required for transport pricing rows');
    } else if (!UUID_PATTERN.test(vehicleId)) {
      blockingReasons.push('vehicleId must be a UUID');
    }

    const outboundRouteContext = context.allowedRouteKeys.get(`${templateCode}|${outboundRouteId}`) || null;
    const returnRouteContext = context.allowedRouteKeys.get(`${templateCode}|${returnRouteId}`) || null;
    if (!outboundRouteContext) {
      blockingReasons.push('outboundRouteId is unknown or not linked to the allowed Aqaba excursion outbound component');
    }
    if (!returnRouteContext) {
      blockingReasons.push('returnRouteId is unknown or not linked to the allowed Aqaba excursion return component');
    }
    if (transportPair?.outboundComponent?.routeId && outboundRouteId !== transportPair.outboundComponent.routeId) {
      blockingReasons.push('outboundRouteId does not match the template outbound transport component');
    }
    if (transportPair?.returnComponent?.routeId && returnRouteId !== transportPair.returnComponent.routeId) {
      blockingReasons.push('returnRouteId does not match the template return transport component');
    }
    if (supplierId && supplierId !== context.pricingCatalog.supplier.id) {
      blockingReasons.push(`supplierId must be ${AQABA_EXCURSION_PRICING_SUPPLIER_NAME}; Alpha or other transport suppliers are not allowed`);
    }
    if (vehicleId && !context.pricingCatalog.allowedVehicleIds.has(vehicleId)) {
      blockingReasons.push('vehicleId is not one of the allowed FIT vehicles: Sedan 2, Mini Van 6, Van 9');
    }
    if (currency !== 'JOD') {
      blockingReasons.push('currency must be JOD');
    }
    if (pricingBasis !== 'ROUND_TRIP_PER_VEHICLE') {
      blockingReasons.push('Transport pricingBasis must be ROUND_TRIP_PER_VEHICLE');
    }

    if (isEmptyPricingRow) {
      return {
        kind: 'TRANSPORT',
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        templateCode,
        outboundRouteId,
        returnRouteId,
        supplierId: supplierId || null,
        vehicleId: vehicleId || null,
        action: 'SKIP_EMPTY',
        safeToApply: false,
        blockingReasons,
      };
    }

    if (roundTripSellPrice === null) blockingReasons.push('roundTripSellPrice is required for transport pricing rows');

    const [supplier, vehicle] = await Promise.all([
      supplierId && UUID_PATTERN.test(supplierId) ? (this.prisma as any).supplier.findUnique({ where: { id: supplierId } }) : Promise.resolve(null),
      vehicleId && UUID_PATTERN.test(vehicleId) ? (this.prisma as any).vehicle.findUnique({ where: { id: vehicleId } }) : Promise.resolve(null),
    ]);
    if (supplierId && UUID_PATTERN.test(supplierId) && !supplier) blockingReasons.push('supplierId is unknown');
    if (vehicleId && UUID_PATTERN.test(vehicleId) && !vehicle) blockingReasons.push('vehicleId is unknown');

    const outboundServiceTypeId = outboundRouteContext ? this.getComponentTransportServiceTypeId(outboundRouteContext.component) : null;
    const returnServiceTypeId = returnRouteContext ? this.getComponentTransportServiceTypeId(returnRouteContext.component) : null;
    const serviceTypeId = outboundServiceTypeId || returnServiceTypeId;
    if (!serviceTypeId) blockingReasons.push('Transport component is missing transportServiceTypeId');

    const [existingOutbound, existingReturn] =
      outboundRouteId && returnRouteId && vehicleId && serviceTypeId
        ? await Promise.all([
            (this.prisma as any).vehicleRate.findFirst({
              where: {
                routeId: outboundRouteId,
                vehicleId,
                serviceTypeId: outboundServiceTypeId || serviceTypeId,
                supplierId: supplierId || null,
                minPax: 1,
                maxPax: 99,
                active: true,
              },
              select: { id: true, price: true, currency: true },
            }),
            (this.prisma as any).vehicleRate.findFirst({
              where: {
                routeId: returnRouteId,
                vehicleId,
                serviceTypeId: returnServiceTypeId || serviceTypeId,
                supplierId: supplierId || null,
                minPax: 1,
                maxPax: 99,
                active: true,
              },
              select: { id: true, price: true, currency: true },
            }),
          ])
        : [null, null];
    const action = existingOutbound && existingReturn ? 'SKIP_EXISTING' : 'CREATE';
    const legSellPrice = roundTripSellPrice === null ? null : roundTripSellPrice / 2;
    const legCostPrice = roundTripCostPrice === null ? null : roundTripCostPrice / 2;
    if (
      existingOutbound &&
      legSellPrice !== null &&
      (Number(existingOutbound.price) !== legSellPrice || normalizeWorkbookText(existingOutbound.currency).toUpperCase() !== currency)
    ) {
      blockingReasons.push(`Existing outbound VehicleRate collision ${existingOutbound.id} has different split price or currency`);
    }
    if (
      existingReturn &&
      legSellPrice !== null &&
      (Number(existingReturn.price) !== legSellPrice || normalizeWorkbookText(existingReturn.currency).toUpperCase() !== currency)
    ) {
      blockingReasons.push(`Existing return VehicleRate collision ${existingReturn.id} has different split price or currency`);
    }

    const notes = [
      normalizeWorkbookText(data.notes),
      roundTripCostPrice !== null ? `Workbook roundTripCostPrice=${roundTripCostPrice}; split leg costPrice=${legCostPrice}` : '',
      roundTripSellPrice !== null ? `Workbook roundTripSellPrice=${roundTripSellPrice}; split leg sellPrice=${legSellPrice}` : '',
      `Aqaba excursion RT pricing import template=${templateCode}; generated split legs to prevent double charging`,
    ]
      .filter(Boolean)
      .join(' | ');

    return {
      kind: 'TRANSPORT',
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      templateCode,
      templateName: template?.name || normalizeWorkbookText(data.templatename),
      outboundRouteId,
      outboundRouteName: outboundRouteContext?.route?.name || normalizeWorkbookText(data.outboundroutename),
      returnRouteId,
      returnRouteName: returnRouteContext?.route?.name || normalizeWorkbookText(data.returnroutename),
      supplierId: supplierId || null,
      supplierName: supplier?.name || normalizeWorkbookText(data.suppliername) || null,
      vehicleId,
      vehicleName: vehicle?.name || normalizeWorkbookText(data.vehiclename) || null,
      roundTripCostPrice,
      roundTripSellPrice,
      splitLegCostPrice: legCostPrice,
      splitLegSellPrice: legSellPrice,
      currency,
      pricingBasis,
      existingOutboundRateId: existingOutbound?.id || null,
      existingReturnRateId: existingReturn?.id || null,
      action,
      duplicateKey: ['TRANSPORT_TEMPLATE', templateCode, supplierId || 'NO_SUPPLIER', vehicleId].join('|'),
      duplicateKeys: [
        ['TRANSPORT_TEMPLATE', templateCode, supplierId || 'NO_SUPPLIER', vehicleId].join('|'),
        ['TRANSPORT_LEG', outboundRouteId, supplierId || 'NO_SUPPLIER', vehicleId, outboundServiceTypeId || serviceTypeId || 'NO_SERVICE_TYPE'].join('|'),
        ['TRANSPORT_LEG', returnRouteId, supplierId || 'NO_SUPPLIER', vehicleId, returnServiceTypeId || serviceTypeId || 'NO_SERVICE_TYPE'].join('|'),
      ],
      safeToApply: false,
      blockingReasons,
      data: [
        existingOutbound
          ? null
          : {
              vehicleId,
              serviceTypeId: outboundServiceTypeId || serviceTypeId,
              supplierId: supplierId || null,
              routeId: outboundRouteId,
              fromPlaceId: outboundRouteContext?.route?.fromPlaceId || null,
              toPlaceId: outboundRouteContext?.route?.toPlaceId || null,
              routeName: outboundRouteContext?.route?.name || normalizeWorkbookText(data.outboundroutename),
              minPax: 1,
              maxPax: 99,
              price: legSellPrice,
              currency,
              notes: [notes, 'RT split leg=outbound'].filter(Boolean).join(' | '),
              active: true,
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
              validTo: new Date('2099-12-31T00:00:00.000Z'),
            },
        existingReturn
          ? null
          : {
              vehicleId,
              serviceTypeId: returnServiceTypeId || serviceTypeId,
              supplierId: supplierId || null,
              routeId: returnRouteId,
              fromPlaceId: returnRouteContext?.route?.fromPlaceId || null,
              toPlaceId: returnRouteContext?.route?.toPlaceId || null,
              routeName: returnRouteContext?.route?.name || normalizeWorkbookText(data.returnroutename),
              minPax: 1,
              maxPax: 99,
              price: legSellPrice,
              currency,
              notes: [notes, 'RT split leg=return'].filter(Boolean).join(' | '),
              active: true,
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
              validTo: new Date('2099-12-31T00:00:00.000Z'),
            },
      ].filter(Boolean),
    };
  }

  private async validateAqabaExcursionActivityPricingRow(row: any, context: any) {
    const data = row.data;
    const blockingReasons: string[] = [];
    const templateCode = normalizeWorkbookText(data.templatecode);
    const activityId = normalizeWorkbookText(data.activityid);
    const variantName = normalizeWorkbookText(data.variantname);
    const currency = normalizeWorkbookText(data.currency || 'JOD').toUpperCase();
    const pricingBasis = normalizeWorkbookText(data.pricingbasis || 'PER_PERSON').toUpperCase();
    const costPrice = this.parseOptionalWorkbookMoney(data.costprice, 'costPrice', blockingReasons);
    const sellPrice = this.parseOptionalWorkbookMoney(data.sellprice, 'sellPrice', blockingReasons);
    const isEmptyPricingRow = !variantName && costPrice === null && sellPrice === null;
    const template = context.templatesByCode.get(templateCode);
    const activityContext = context.allowedActivityKeys.get(`${templateCode}|${activityId}`) || null;

    if (!template || !QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES.includes(templateCode as any)) {
      blockingReasons.push('templateCode is not one of the allowed Aqaba Excursion Templates');
    }
    if (!activityContext) {
      blockingReasons.push('activityId is unknown or not linked to an allowed Aqaba excursion activity component');
    }
    if (currency !== 'JOD') {
      blockingReasons.push('currency must be JOD');
    }
    if (!['PER_PERSON', 'PER_GROUP'].includes(pricingBasis)) {
      blockingReasons.push('Activity pricingBasis must be PER_PERSON or PER_GROUP');
    }

    if (isEmptyPricingRow) {
      return {
        kind: 'ACTIVITY',
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        templateCode,
        activityId,
        action: 'SKIP_EMPTY',
        safeToApply: false,
        blockingReasons,
      };
    }

    if (!variantName) blockingReasons.push('variantName is required for activity pricing rows');
    if (costPrice === null) blockingReasons.push('costPrice is required for activity pricing rows');
    if (sellPrice === null) blockingReasons.push('sellPrice is required for activity pricing rows');

    const activity = activityId ? await (this.prisma as any).activity.findUnique({ where: { id: activityId } }) : null;
    if (!activity) blockingReasons.push('activityId is unknown');

    const existing =
      activityId && variantName
        ? await (this.prisma as any).activityRateVariant.findFirst({
            where: { activityId, name: { equals: variantName, mode: 'insensitive' }, active: true },
            select: { id: true, costPrice: true, sellPrice: true, currency: true, pricingBasis: true },
          })
        : null;
    const action = existing ? 'SKIP_EXISTING' : 'CREATE';
    if (
      existing &&
      (Number(existing.costPrice) !== costPrice ||
        Number(existing.sellPrice) !== sellPrice ||
        normalizeWorkbookText(existing.currency).toUpperCase() !== currency ||
        normalizeWorkbookText(existing.pricingBasis).toUpperCase() !== pricingBasis)
    ) {
      blockingReasons.push(`Existing ActivityRateVariant collision ${existing.id} has different pricing`);
    }

    const existingCount =
      activityId && typeof (this.prisma as any).activityRateVariant?.count === 'function'
        ? await (this.prisma as any).activityRateVariant.count({ where: { activityId } })
        : 0;

    return {
      kind: 'ACTIVITY',
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      templateCode,
      templateName: template?.name || normalizeWorkbookText(data.templatename),
      activityId,
      activityName: activity?.name || normalizeWorkbookText(data.activityname),
      variantName,
      costPrice,
      sellPrice,
      currency,
      pricingBasis,
      existingRateVariantId: existing?.id || null,
      action,
      duplicateKey: ['ACTIVITY', templateCode, activityId, normalizeWorkbookKey(variantName)].join('|'),
      safeToApply: false,
      blockingReasons,
      data: {
        activityId,
        name: variantName,
        pricingBasis,
        currency,
        costPrice,
        sellPrice,
        notes: normalizeWorkbookText(data.notes) || `Aqaba excursion pricing import template=${templateCode}`,
        active: true,
        sortOrder: existingCount + 1,
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

  private async findCanonicalLocalTransferServiceType() {
    const model = (this.prisma as any)?.transportServiceType;
    if (!model?.findFirst) return null;

    const exactCodeMatch = await model.findFirst({
      where: {
        code: { in: ['PRIVATE_TRANSFER', 'POINT_TO_POINT'] },
        classification: 'ROUTE_TRANSFER',
      },
      select: { id: true, name: true, code: true, classification: true },
      orderBy: [{ code: 'desc' }],
    });
    if (exactCodeMatch) return exactCodeMatch;

    return model.findFirst({
      where: {
        classification: 'ROUTE_TRANSFER',
        OR: [
          { name: { contains: 'Private', mode: 'insensitive' } },
          { name: { contains: 'Point', mode: 'insensitive' } },
          { name: { contains: 'Local', mode: 'insensitive' } },
          { code: { contains: 'TRANSFER', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, code: true, classification: true },
      orderBy: [{ name: 'asc' }],
    });
  }

  private async findAqabaExcursionTemplatesWithTransportComponents() {
    return (this.prisma as any).excursionTemplate.findMany({
      where: { code: { in: QUOTE_TRANSPORT_TAXONOMY_EXCURSION_TEMPLATE_CODES as unknown as string[] } },
      include: {
        components: {
          where: { componentType: 'TRANSPORT' },
          include: {
            route: true,
            transportServiceType: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ code: 'asc' }],
    });
  }

  private getComponentTransportServiceTypeId(component: any) {
    return (
      normalizeWorkbookText(component.transportServiceTypeId) ||
      normalizeWorkbookText(component.transportServiceType?.id) ||
      normalizeWorkbookText(component.transportServiceType?.transportServiceTypeId) ||
      null
    );
  }

  private detectLegacyAqabaPayloadUsage(payload: any, component: any) {
    const issues: string[] = [];
    if (payload.serviceLane !== 'transport') {
      return issues;
    }

    const touringRouteCode = normalizeWorkbookText(component.touringRoute?.code || component.touringRouteCode);

    if (payload.touringRouteId) {
      issues.push(`Component references TouringRoute ${touringRouteCode || component.touringRouteId}`);
      if (component.touringRoute?.active === false) {
        issues.push('Payload references an inactive TouringRoute');
      }
      if (/\bAQ_(BOAT|YACHT|DIVE|SNORK|BEACH|SUB|GLASS|BER)\b/.test(touringRouteCode)) {
        issues.push('Payload references old AQ_* code');
      }
      if (/JOR-TR-AQABA-[A-Z0-9-]+-RT/.test(touringRouteCode)) {
        issues.push('Payload references old JOR-TR-AQABA-*-RT Touring Route directly');
      }
    }

    return issues;
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
      days: { orderBy: { dayNumber: 'asc' } },
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
      days: this.buildNestedReplace(
        data.days,
        (day, index) => ({
          dayNumber:
            day.dayNumber === undefined || day.dayNumber === null ? index + 1 : Math.floor(Number(day.dayNumber)),
          title: normalizeOptionalString(day.title),
          description: normalizeOptionalString(day.description),
          distanceKm: normalizeOptionalNumber(day.distanceKm, `days[${index}].distanceKm`),
          driveMinutes:
            day.driveMinutes === undefined || day.driveMinutes === null || (day.driveMinutes as unknown) === ''
              ? null
              : Math.max(0, Math.floor(Number(day.driveMinutes))),
          lunchIncluded: Boolean(day.lunchIncluded),
          dinnerIncluded: Boolean(day.dinnerIncluded),
        }),
        partial,
      ),
    };
  }
}
