import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OperationalArea,
  pickAreaById,
  pickAreaByCode,
  mergeDefaultFlagsFor,
} from './operational-areas';
import { OperationalAreasService } from '../operational-areas/operational-areas.service';
import {
  classifyRouteStandard,
  suggestTimingForRoute,
  rowHasTiming,
  isProtectedRow,
  detectSuspiciousMovementDuration,
  RouteClassification,
} from './route-standards-cleanup';

// CRUD service for RouteStandard. Phase 1 = pure data layer; Phase 2 will
// add lookup helpers for quote/dispatch/voucher integration.

export type RouteStandardSource = 'AUTO_BOOTSTRAP' | 'IMPORTED' | 'MANUAL';

// Review workflow states. Cleanup Phase v1 — see the schema comment on
// RouteStandard.reviewStatus for the lifecycle. Backwards-compatible:
// null means "pre-cleanup row, untagged" and renders as "Unreviewed".
export type RouteStandardReviewStatus =
  | 'AUTO_BOOTSTRAP'
  | 'REVIEW_REQUIRED'
  | 'VERIFIED'
  | 'CANONICALIZED';

export type RouteStandardInput = {
  routeCode: string;
  routeName: string;
  fromCity?: string | null;
  toCity?: string | null;
  destinationArea?: string | null;
  standardDistanceKm?: number | null;
  standardDurationHours?: number | null;
  operationalBufferMinutes?: number | null;
  longDistanceFlag?: boolean;
  overnightRisk?: boolean;
  mountainRoadFlag?: boolean;
  borderCrossingFlag?: boolean;
  airportRouteFlag?: boolean;
  notes?: string | null;
  isActive?: boolean;
  source?: RouteStandardSource | null;
  canonicalRouteCode?: string | null;
  reviewStatus?: RouteStandardReviewStatus | null;
  suspiciousDurationFlag?: boolean;
};

function normalizeCode(value: string): string {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
}

function requireString(value: string | null | undefined, field: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new BadRequestException(`${field} is required`);
  }
  return trimmed;
}

function normalizeNumber(value: number | null | undefined, field: string, { allowNegative = false }: { allowNegative?: boolean } = {}): number | null {
  if (value === null || value === undefined || value === ('' as unknown as number)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(`${field} must be a number`);
  }
  if (!allowNegative && parsed < 0) {
    throw new BadRequestException(`${field} cannot be negative`);
  }
  return parsed;
}

function normalizeInt(value: number | null | undefined, field: string): number | null {
  const num = normalizeNumber(value, field);
  if (num === null) return null;
  return Math.floor(num);
}

function buildCreateData(input: RouteStandardInput) {
  return {
    routeCode: normalizeCode(requireString(input.routeCode, 'routeCode')),
    routeName: requireString(input.routeName, 'routeName'),
    fromCity: input.fromCity?.trim() || null,
    toCity: input.toCity?.trim() || null,
    destinationArea: input.destinationArea?.trim() || null,
    standardDistanceKm: normalizeNumber(input.standardDistanceKm, 'standardDistanceKm'),
    standardDurationHours: normalizeNumber(input.standardDurationHours, 'standardDurationHours'),
    operationalBufferMinutes: normalizeInt(input.operationalBufferMinutes, 'operationalBufferMinutes'),
    longDistanceFlag: Boolean(input.longDistanceFlag),
    overnightRisk: Boolean(input.overnightRisk),
    mountainRoadFlag: Boolean(input.mountainRoadFlag),
    borderCrossingFlag: Boolean(input.borderCrossingFlag),
    airportRouteFlag: Boolean(input.airportRouteFlag),
    notes: input.notes?.trim() || null,
    isActive: input.isActive === undefined ? true : Boolean(input.isActive),
    source: input.source ?? null,
    canonicalRouteCode: input.canonicalRouteCode ? normalizeCode(input.canonicalRouteCode) : null,
    reviewStatus: input.reviewStatus ?? null,
    suspiciousDurationFlag: Boolean(input.suspiciousDurationFlag),
  };
}

function buildUpdateData(input: Partial<RouteStandardInput>) {
  const data: Record<string, unknown> = {};
  if (input.routeCode !== undefined) data.routeCode = normalizeCode(requireString(input.routeCode, 'routeCode'));
  if (input.routeName !== undefined) data.routeName = requireString(input.routeName, 'routeName');
  if (input.fromCity !== undefined) data.fromCity = input.fromCity?.trim() || null;
  if (input.toCity !== undefined) data.toCity = input.toCity?.trim() || null;
  if (input.destinationArea !== undefined) data.destinationArea = input.destinationArea?.trim() || null;
  if (input.standardDistanceKm !== undefined) data.standardDistanceKm = normalizeNumber(input.standardDistanceKm, 'standardDistanceKm');
  if (input.standardDurationHours !== undefined) data.standardDurationHours = normalizeNumber(input.standardDurationHours, 'standardDurationHours');
  if (input.operationalBufferMinutes !== undefined) data.operationalBufferMinutes = normalizeInt(input.operationalBufferMinutes, 'operationalBufferMinutes');
  if (input.longDistanceFlag !== undefined) data.longDistanceFlag = Boolean(input.longDistanceFlag);
  if (input.overnightRisk !== undefined) data.overnightRisk = Boolean(input.overnightRisk);
  if (input.mountainRoadFlag !== undefined) data.mountainRoadFlag = Boolean(input.mountainRoadFlag);
  if (input.borderCrossingFlag !== undefined) data.borderCrossingFlag = Boolean(input.borderCrossingFlag);
  if (input.airportRouteFlag !== undefined) data.airportRouteFlag = Boolean(input.airportRouteFlag);
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  if (input.source !== undefined) data.source = input.source;
  if (input.canonicalRouteCode !== undefined) {
    data.canonicalRouteCode = input.canonicalRouteCode ? normalizeCode(input.canonicalRouteCode) : null;
  }
  if (input.reviewStatus !== undefined) data.reviewStatus = input.reviewStatus;
  if (input.suspiciousDurationFlag !== undefined) data.suspiciousDurationFlag = Boolean(input.suspiciousDurationFlag);
  return data;
}

// ---------------------------------------------------------------------------
// Cleanup Phase v1 — canonical operational route code derivation + sanity
// validation of inherited bootstrap durations.
//
// Canonical codes are short FROM_TO aliases (AMM_PET, PET_WR, WR_AQJ, DS_AMM,
// AMM_JER, ALLENBY_AMM) that are stable, operationally readable, and unique
// per direction. Built by mapping city names through CITY_ALIAS_MAP — the
// same alias table operators already use in tariff workbooks and route codes
// across the platform.
//
// The original routeCode column is left alone so legacy quote items /
// vouchers / dispatch references that captured a messy bootstrap code
// (JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT) still resolve. canonicalRouteCode
// becomes the operational truth layer the refinement dashboard surfaces.
// ---------------------------------------------------------------------------

// City name -> short canonical alias. Lookup is case- and punctuation-
// insensitive (see canonicalizeCityToken). The map covers every city the
// auto-bootstrap touched; unknown cities fall through to a sanitized
// UPPER_SNAKE token of the input so we never produce an empty code.
const CITY_ALIAS_MAP: Record<string, string> = {
  AMMAN: 'AMM',
  AMMAN_CITY: 'AMM',
  AMMAN_CITY_CENTER: 'AMM',
  JORDAN_AMMAN_CITY: 'AMM',
  JORDAN_AMMAN: 'AMM',
  PETRA: 'PET',
  PETRA_VISITOR_CENTER: 'PET',
  WADI_MUSA: 'PET', // Wadi Musa is the town immediately adjacent to Petra
  WADI_RUM: 'WR',
  WADI_RUM_CAMP_AREA: 'WR',
  AQABA: 'AQJ',
  AQJ: 'AQJ',
  KING_HUSSEIN_INTERNATIONAL_AIRPORT: 'AQJ',
  AQABA_CITY: 'AQJ',
  AQABA_CITY_CENTER: 'AQJ',
  DEAD_SEA: 'DS',
  DEAD_SEA_RESORTS: 'DS',
  DEAD_SEA_RESORT_AREA: 'DS',
  JERASH: 'JER',
  JERASH_ARCHAEOLOGICAL_SITE: 'JER',
  AJLOUN: 'AJL',
  AJLOUN_CASTLE: 'AJL',
  IRBID: 'IRB',
  IRBID_CITY: 'IRB',
  MADABA: 'MAD',
  MADABA_CITY: 'MAD',
  KERAK: 'KRK',
  KARAK: 'KRK',
  KERAK_CASTLE: 'KRK',
  QAIA: 'QAIA',
  QUEEN_ALIA_INTERNATIONAL_AIRPORT: 'QAIA',
  JORDAN_QAIA_AIRPORT: 'QAIA',
  // Borders — Jordan's two land crossings used by ops. Both normalize to
  // single-token aliases so the FROM_TO is readable.
  ALLENBY: 'ALLENBY',
  KING_HUSSEIN_BRIDGE: 'ALLENBY',
  ALLENBY_BRIDGE: 'ALLENBY',
  JORDAN_ALLENBY: 'ALLENBY',
  ALLENBY_SHEIKH_HUSSEIN_BORDER: 'ALLENBY',
  SHEIKH_HUSSEIN: 'SHB',
  SHEIKH_HUSSEIN_BORDER: 'SHB',
  JORDAN_SHEIKH_HUSSEIN_BORDER: 'SHB',
  WADI_ARABA: 'WAB',
  WADI_ARABA_BORDER: 'WAB',
};

// Refinement Assistant v1 — token forms that are NOT cities and should be
// skipped during the greedy parse. Examples: "RESORT", "AREA", "VISITOR",
// "CENTER", "ARCHAEOLOGICAL", "SITE" appear as filler tokens after the
// city name in the bootstrap codes. Treating them as no-match would still
// work, but explicitly listing them makes the parser deterministic and
// keeps the per-token advance fast.
const FILLER_TOKENS = new Set<string>([
  'RESORT',
  'AREA',
  'VISITOR',
  'CENTER',
  'ARCHAEOLOGICAL',
  'SITE',
  'CAMP',
  'INTERNATIONAL',
  'AIRPORT',
  'BRIDGE',
  'BORDER',
  'CITY',
  'JORDAN',
  // "ON_2", "ON_3" suffixes from "COPY_OF_..._ON_2" — strip silently.
  'ON',
  'COPY',
  'OF',
]);

function canonicalizeCityToken(value: string | null | undefined): string {
  // Normalize the city string into the same UPPER_SNAKE shape the alias
  // map keys use, then look up. Falls back to the sanitized token so
  // unknown cities still produce a deterministic, readable code.
  const cleaned = String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/&/g, 'AND')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return '';
  return CITY_ALIAS_MAP[cleaned] || cleaned;
}

/**
 * Build a canonical FROM_TO route code from the standard's fromCity/toCity
 * fields. Returns null when either side is missing — caller decides
 * whether to skip the row or fall back to the legacy routeCode.
 *
 * Examples:
 *   ('Amman', 'Petra')                 -> 'AMM_PET'
 *   ('Dead Sea', 'Amman')              -> 'DS_AMM'
 *   ('Wadi Rum', 'Aqaba')              -> 'WR_AQJ'
 *   ('King Hussein Bridge', 'Amman')   -> 'ALLENBY_AMM'
 *   ('Amman', null)                    -> null
 */
export function deriveCanonicalRouteCode(
  fromCity: string | null | undefined,
  toCity: string | null | undefined,
): string | null {
  const from = canonicalizeCityToken(fromCity);
  const to = canonicalizeCityToken(toCity);
  if (!from || !to) return null;
  if (from === to) return null; // same-city transfers don't get a FROM_TO code
  return `${from}_${to}`;
}

/**
 * Per-leg realistic transfer-duration ceiling (hours). When a bootstrap
 * row's inherited duration exceeds these caps, it was almost certainly
 * pulled from an excursion operational day length (sightseeing + drive)
 * rather than real transport movement timing.
 *
 * Tuned to Jordan ops baselines:
 *   - Jerash from Amman is ~1 h drive; > 3 h means an excursion day.
 *   - Petra is at most ~5 h from Amman; > 6 h is an excursion.
 *   - Wadi Rum is at most ~6 h from Amman; > 8 h is an excursion.
 *   - Dead Sea is ~1 h from Amman, ~3 h from Petra; > 4 h is an excursion.
 *   - Airport legs are ≤ 1.5 h anywhere in the country; > 2 h is wrong.
 */
const SUSPICIOUS_DURATION_CAPS_HOURS: Array<{ matches: (token: string) => boolean; capHours: number; reason: string }> = [
  { matches: (t) => t === 'QAIA' || t === 'AQJ', capHours: 2, reason: 'airport transfer > 2 h' },
  { matches: (t) => t === 'JER', capHours: 3, reason: 'Jerash transfer > 3 h' },
  { matches: (t) => t === 'DS', capHours: 4, reason: 'Dead Sea transfer > 4 h' },
  { matches: (t) => t === 'PET', capHours: 6, reason: 'Petra transfer > 6 h' },
  { matches: (t) => t === 'WR', capHours: 8, reason: 'Wadi Rum transfer > 8 h' },
];

/**
 * Sanity check inherited bootstrap durations against realistic transfer
 * timing. Returns true (= suspicious) when the duration looks like it was
 * pulled from an excursion operational day length rather than real
 * transport movement.
 *
 * Uses canonical tokens on EITHER side of the route — a Dead Sea-to-Petra
 * row triggers both the DS cap and the PET cap; we take the stricter
 * one. Anything over 12 h is unconditionally suspicious (no real transfer
 * in Jordan takes 12 h).
 */
export function detectSuspiciousDuration(
  fromCity: string | null | undefined,
  toCity: string | null | undefined,
  durationHours: number | null | undefined,
): { suspicious: boolean; reason: string | null } {
  if (durationHours === null || durationHours === undefined) {
    return { suspicious: false, reason: null };
  }
  const hours = Number(durationHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return { suspicious: false, reason: null };
  }
  if (hours > 12) {
    return { suspicious: true, reason: `inherited duration ${hours} h exceeds 12 h — no Jordan transfer takes that long` };
  }
  const tokens = [canonicalizeCityToken(fromCity), canonicalizeCityToken(toCity)].filter(Boolean);
  if (tokens.length === 0) return { suspicious: false, reason: null };
  // Strictest cap wins — the leg involving the most-constrained city
  // (e.g. Jerash 3 h) is what matters.
  let strictest: { cap: number; reason: string } | null = null;
  for (const token of tokens) {
    for (const rule of SUSPICIOUS_DURATION_CAPS_HOURS) {
      if (!rule.matches(token)) continue;
      if (!strictest || rule.capHours < strictest.cap) {
        strictest = { cap: rule.capHours, reason: rule.reason };
      }
    }
  }
  if (strictest && hours > strictest.cap) {
    return { suspicious: true, reason: `${strictest.reason} (got ${hours} h)` };
  }
  return { suspicious: false, reason: null };
}

// ---------------------------------------------------------------------------
// Refinement Assistant v1 — suggested canonical code from the legacy routeCode
// itself (separate from fromCity/toCity derivation).
//
// Some bootstrapped rows have garbage in fromCity/toCity but their routeCode
// still encodes the route ("JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT" — even
// without correct city fields, we can recover AMM_QAIA by parsing the code).
// This recovers signal from rows the city-field deriver would skip.
//
// Algorithm: greedy left-to-right scan, longest-prefix match (up to 5
// tokens) against CITY_ALIAS_MAP. Filler tokens advance one step without
// emitting an alias. Stops after collecting 2 aliases (FROM_TO). Returns
// null when fewer than 2 distinct aliases could be matched.
// ---------------------------------------------------------------------------
export function suggestCanonicalFromLegacyCode(legacyCode: string | null | undefined): string | null {
  if (!legacyCode) return null;
  const cleaned = String(legacyCode)
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return null;
  const tokens = cleaned.split('_').filter(Boolean);
  if (tokens.length === 0) return null;

  const aliases: string[] = [];
  let i = 0;
  while (i < tokens.length && aliases.length < 2) {
    let matched = false;
    // Try the longest prefix first so AMMAN_CITY_CENTER wins over AMMAN.
    const maxLen = Math.min(5, tokens.length - i);
    for (let len = maxLen; len >= 1; len--) {
      const slice = tokens.slice(i, i + len).join('_');
      const alias = CITY_ALIAS_MAP[slice];
      if (alias) {
        // Don't emit the same alias twice in a row (e.g.
        // "AMMAN_CITY_AMMAN_CENTER" duplicates would collapse to AMM_AMM,
        // which can't be a canonical FROM_TO).
        if (aliases.length === 0 || aliases[aliases.length - 1] !== alias) {
          aliases.push(alias);
        }
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Skip filler tokens silently; advance by one for any other unknown
      // token (which keeps the parser from getting stuck and lets the
      // next token try as the start of a new prefix).
      i += 1;
    }
  }
  if (aliases.length < 2) return null;
  if (aliases[0] === aliases[1]) return null;
  return `${aliases[0]}_${aliases[1]}`;
}

// ---------------------------------------------------------------------------
// Refinement Assistant v1 — find the reverse standard for a given row.
//
// Returns the "other direction" of the same physical route when one exists
// in the catalog. Used by the missing-duration/missing-distance assistants:
// if AMM_PET has 3.5h and PET_AMM has no duration, we suggest PET_AMM
// inherit 3.5h.
//
// Matching is on canonical code first (split on _, swap halves, look it
// up), and falls back to fromCity/toCity swap when canonicalRouteCode
// isn't set yet.
// ---------------------------------------------------------------------------
type ReverseLookupSource = { id: string; canonicalRouteCode: string | null; fromCity: string | null; toCity: string | null };

export function findReverseStandard<T extends ReverseLookupSource>(target: T, allStandards: T[]): T | null {
  const allByCanonical = new Map<string, T>();
  for (const s of allStandards) {
    if (s.canonicalRouteCode) allByCanonical.set(s.canonicalRouteCode, s);
  }
  // Canonical swap: AMM_PET -> PET_AMM
  if (target.canonicalRouteCode) {
    const parts = target.canonicalRouteCode.split('_');
    if (parts.length >= 2) {
      const reversed = `${parts.slice(1).join('_')}_${parts[0]}`;
      const found = allByCanonical.get(reversed);
      if (found && found.id !== target.id) return found;
    }
  }
  // City swap fallback
  const tf = canonicalizeCityToken(target.fromCity);
  const tt = canonicalizeCityToken(target.toCity);
  if (!tf || !tt) return null;
  for (const s of allStandards) {
    if (s.id === target.id) continue;
    const sf = canonicalizeCityToken(s.fromCity);
    const st = canonicalizeCityToken(s.toCity);
    if (sf === tt && st === tf) return s;
  }
  return null;
}

/**
 * Map a TouringRoute record (from the touring_routes table) to a draft
 * RouteStandardInput. Used by the bootstrap action to seed missing
 * standards from the existing catalog without manual entry.
 *
 * Distance/duration come from estimatedDistanceKm / estimatedDriveHours
 * (the canonical "I drove this" measurements) with includedKm /
 * includedHours as fallbacks. Risk flags map 1:1 where the touring
 * route already tracks them; borderCrossingFlag is heuristic on the
 * code/name since touring routes don't carry a dedicated border flag.
 */
function mapTouringRouteToStandardInput(route: any): RouteStandardInput {
  const code = String(route.code || '').trim();
  const haystack = `${code} ${route.name || ''}`.toUpperCase();
  const airportRoute =
    haystack.includes('AIRPORT') ||
    haystack.includes('QAIA') ||
    haystack.includes('AQJ') ||
    haystack.includes('LAYOVER');
  const borderCrossing =
    haystack.includes('BORDER') ||
    haystack.includes('ALLENBY') ||
    haystack.includes('SHEIKH HUSSEIN') ||
    haystack.includes('WADI ARABA');
  const mainDestinations = Array.isArray(route.mainDestinations) ? route.mainDestinations : null;
  // Cleanup Phase v1 — duration source preference. RouteStandard models
  // transport movement timing ONLY, not full excursion day length. So
  // we prefer estimatedDriveHours (the "real driving" measurement) and
  // ONLY fall back to includedHours when estimatedDriveHours is null.
  // includedHours often captures the whole operational day (drive +
  // sightseeing + meals), which is what produced the bloated 11-13h
  // bootstrap rows. The sanity validator in detectSuspiciousDuration
  // catches anything that slipped through and tags it REVIEW_REQUIRED.
  const realisticDuration =
    typeof route.estimatedDriveHours === 'number' ? route.estimatedDriveHours : null;
  const fallbackDuration =
    realisticDuration ?? (typeof route.includedHours === 'number' ? route.includedHours : null);
  return {
    routeCode: code,
    routeName: route.name || code,
    fromCity: route.startCity || route.primaryOperatingCity || null,
    toCity: null,
    destinationArea: mainDestinations && mainDestinations.length > 0 ? mainDestinations.join(' → ') : null,
    standardDistanceKm: route.estimatedDistanceKm ?? route.includedKm ?? null,
    standardDurationHours: fallbackDuration,
    operationalBufferMinutes: null,
    longDistanceFlag: Boolean(route.longDistance),
    overnightRisk: Boolean(route.overnightRisk || route.overnight),
    mountainRoadFlag: Boolean(route.mountainRoad),
    borderCrossingFlag: borderCrossing,
    airportRouteFlag: airportRoute,
    notes: route.reviewNotes || null,
    isActive: route.active !== false,
    source: 'AUTO_BOOTSTRAP',
  };
}

/**
 * Map a Route record (TRANSFER_ROUTE rows from the routes table) to a
 * draft RouteStandardInput. Route doesn't have a dedicated code column
 * so we normalize the normalizedKey into UPPER_SNAKE as the routeCode.
 */
function mapTransferRouteToStandardInput(route: any): RouteStandardInput {
  const code = normalizeCode(route.normalizedKey || route.name || '');
  const fromName = route.fromPlace?.name || '';
  const toName = route.toPlace?.name || '';
  const haystack = `${code} ${fromName} ${toName}`.toUpperCase();
  const airportRoute = haystack.includes('AIRPORT') || haystack.includes('QAIA') || haystack.includes('AQJ');
  const borderCrossing = haystack.includes('BORDER') || haystack.includes('ALLENBY');
  return {
    routeCode: code,
    routeName: route.name || `${fromName} → ${toName}`,
    fromCity: route.fromPlace?.city || fromName || null,
    toCity: route.toPlace?.city || toName || null,
    destinationArea: null,
    standardDistanceKm: route.distanceKm ?? null,
    standardDurationHours: typeof route.durationMinutes === 'number' ? Number((route.durationMinutes / 60).toFixed(2)) : null,
    operationalBufferMinutes: null,
    longDistanceFlag: typeof route.durationMinutes === 'number' && route.durationMinutes >= 300, // >= 5 hours
    overnightRisk: false,
    mountainRoadFlag: false,
    borderCrossingFlag: borderCrossing,
    airportRouteFlag: airportRoute,
    notes: route.notes || null,
    isActive: route.isActive !== false,
    source: 'AUTO_BOOTSTRAP',
  };
}

@Injectable()
export class RouteStandardsService {
  constructor(
    private readonly prisma: PrismaService,
    // OperationalAreasService is optional at the type level so existing
    // unit tests that only exercise non-area methods (CRUD, refinement,
    // cleanup, bulkUpsert) don't have to pass a fake. NestJS DI always
    // injects it at runtime, and the area-aware methods throw a clear
    // error if it's missing — see loadAreas() below.
    private readonly operationalAreasService?: OperationalAreasService,
  ) {}

  /** Helper used by all area-aware methods below. Loads the current
   *  catalog once per operation and lets the pure helpers in
   *  operational-areas.ts do the lookups on the in-memory list. */
  private async loadAreas(): Promise<OperationalArea[]> {
    if (!this.operationalAreasService) {
      throw new Error(
        'OperationalAreasService not injected — required for previewRouteCreation / createWithGeneration / createMultiStopRoute / listOperationalAreas',
      );
    }
    return (await this.operationalAreasService.findAll({ onlyActive: true })) as OperationalArea[];
  }

  findAll() {
    return (this.prisma as any).routeStandard.findMany({
      orderBy: [{ isActive: 'desc' }, { routeCode: 'asc' }],
    });
  }

  async findOne(id: string) {
    const row = await (this.prisma as any).routeStandard.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Route standard not found');
    return row;
  }

  async findByCode(routeCode: string) {
    const row = await (this.prisma as any).routeStandard.findUnique({ where: { routeCode: normalizeCode(routeCode) } });
    return row;
  }

  async create(input: RouteStandardInput) {
    try {
      return await (this.prisma as any).routeStandard.create({ data: buildCreateData(input) });
    } catch (error: any) {
      // Prisma P2002 = unique constraint violation. routeCode is the only
      // unique column on this table — surface a clean BadRequest.
      if (error?.code === 'P2002') {
        throw new BadRequestException(`Route code "${normalizeCode(input.routeCode)}" is already in use`);
      }
      throw error;
    }
  }

  async update(id: string, input: Partial<RouteStandardInput>) {
    await this.findOne(id);
    try {
      return await (this.prisma as any).routeStandard.update({
        where: { id },
        data: buildUpdateData(input),
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(`Route code "${normalizeCode(input.routeCode || '')}" is already in use`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await (this.prisma as any).routeStandard.delete({ where: { id } });
    return { id };
  }

  /**
   * Auto-bootstrap RouteStandard rows from existing operational route
   * catalogs (TouringRoute + Transfer Route). For every operational route
   * with no matching RouteStandard yet, create a draft tagged
   * source = 'AUTO_BOOTSTRAP'. Existing standards are NEVER overwritten —
   * operator-curated work is preserved.
   *
   * Returns a summary the admin UI surfaces to the operator:
   *   - touringRoutesScanned / transferRoutesScanned
   *   - createdFromTouring / createdFromTransfer
   *   - skippedExistingByCode (count of operational routes whose code
   *     already has a standard)
   *   - missingDataWarnings (routes that landed but with no distance OR
   *     duration — operator needs to fill these in before dispatch will
   *     pick up the standard's timing)
   *   - skippedWithoutCode (routes that couldn't be bootstrapped because
   *     they have no usable identifier — touring routes with empty code,
   *     transfer routes with empty normalizedKey)
   */
  async bootstrapFromExistingRoutes() {
    // Pull both catalogs in parallel.
    const [touringRoutes, transferRoutes, existingStandards] = await Promise.all([
      (this.prisma as any).touringRoute.findMany({
        // active === false routes still get bootstrapped — operator may
        // be paused on them temporarily; they keep their own active=false
        // and the standard mirrors it. Operator can flip active on either.
        select: {
          id: true,
          code: true,
          name: true,
          startCity: true,
          primaryOperatingCity: true,
          estimatedDistanceKm: true,
          estimatedDriveHours: true,
          includedKm: true,
          includedHours: true,
          mainDestinations: true,
          longDistance: true,
          mountainRoad: true,
          overnight: true,
          overnightRisk: true,
          reviewNotes: true,
          active: true,
        },
      }),
      (this.prisma as any).route.findMany({
        // Only scan TRANSFER_ROUTE (operational transfers). Touring
        // routes that happen to be stored in the Route table for legacy
        // reasons are excluded — they're already covered by the
        // TouringRoute scan above.
        where: { routeType: 'TRANSFER_ROUTE' },
        select: {
          id: true,
          name: true,
          normalizedKey: true,
          distanceKm: true,
          durationMinutes: true,
          notes: true,
          isActive: true,
          fromPlace: { select: { name: true, city: true } },
          toPlace: { select: { name: true, city: true } },
        },
      }),
      (this.prisma as any).routeStandard.findMany({ select: { routeCode: true } }),
    ]);

    const existingCodes = new Set<string>((existingStandards as any[]).map((s) => normalizeCode(s.routeCode)));

    let createdFromTouring = 0;
    let createdFromTransfer = 0;
    let skippedExistingByCode = 0;
    let skippedWithoutCode = 0;
    const missingDataWarnings: Array<{ routeCode: string; routeName: string; missing: string[] }> = [];

    const candidates: Array<{
      source: 'TOURING' | 'TRANSFER';
      input: RouteStandardInput;
    }> = [];

    for (const route of touringRoutes as any[]) {
      if (!route.code || !String(route.code).trim()) {
        skippedWithoutCode += 1;
        continue;
      }
      const input = mapTouringRouteToStandardInput(route);
      const normalized = normalizeCode(input.routeCode);
      if (existingCodes.has(normalized)) {
        skippedExistingByCode += 1;
        continue;
      }
      // Reserve so two source records with the same canonical code don't
      // both attempt to create (rare but possible if Route and TouringRoute
      // both reference the same code).
      existingCodes.add(normalized);
      candidates.push({ source: 'TOURING', input });
    }

    for (const route of transferRoutes as any[]) {
      if (!route.normalizedKey || !String(route.normalizedKey).trim()) {
        skippedWithoutCode += 1;
        continue;
      }
      const input = mapTransferRouteToStandardInput(route);
      const normalized = normalizeCode(input.routeCode);
      if (!normalized) {
        skippedWithoutCode += 1;
        continue;
      }
      if (existingCodes.has(normalized)) {
        skippedExistingByCode += 1;
        continue;
      }
      existingCodes.add(normalized);
      candidates.push({ source: 'TRANSFER', input });
    }

    // Create in serial — these are individual writes, not bulk, so we
    // can surface per-row errors without blowing up the whole batch.
    let suspiciousDurationCount = 0;
    for (const { source, input } of candidates) {
      try {
        // Cleanup Phase v1 — auto-detect canonical code + sanity-flag
        // suspicious inherited durations DURING bootstrap so the
        // refinement dashboard shows real coverage on first paint.
        const canonical = deriveCanonicalRouteCode(input.fromCity, input.toCity);
        const suspicious = detectSuspiciousDuration(
          input.fromCity,
          input.toCity,
          input.standardDurationHours ?? null,
        );
        const missing: string[] = [];
        if (input.standardDistanceKm === null || input.standardDistanceKm === undefined) missing.push('distance');
        if (input.standardDurationHours === null || input.standardDurationHours === undefined) missing.push('duration');

        const enrichedInput: RouteStandardInput = {
          ...input,
          canonicalRouteCode: canonical,
          suspiciousDurationFlag: suspicious.suspicious,
          // Initial status reflects sanity: clean rows get AUTO_BOOTSTRAP
          // (operator can promote to VERIFIED), suspicious or
          // missing-data rows get REVIEW_REQUIRED immediately so the
          // refinement dashboard surfaces them on first paint.
          reviewStatus: suspicious.suspicious || missing.length > 0 ? 'REVIEW_REQUIRED' : 'AUTO_BOOTSTRAP',
        };
        await (this.prisma as any).routeStandard.create({ data: buildCreateData(enrichedInput) });
        if (source === 'TOURING') createdFromTouring += 1;
        else createdFromTransfer += 1;
        if (suspicious.suspicious) suspiciousDurationCount += 1;
        if (missing.length > 0) {
          missingDataWarnings.push({ routeCode: input.routeCode, routeName: input.routeName, missing });
        }
      } catch (error) {
        // Skip duplicates that slipped past the existence check (race
        // condition possible if another operator triggers bootstrap
        // concurrently). Log to console and continue.
        console.warn(`[route-standards-bootstrap] failed to create ${input.routeCode}:`, error);
        skippedExistingByCode += 1;
      }
    }

    return {
      touringRoutesScanned: (touringRoutes as any[]).length,
      transferRoutesScanned: (transferRoutes as any[]).length,
      createdFromTouring,
      createdFromTransfer,
      createdTotal: createdFromTouring + createdFromTransfer,
      skippedExistingByCode,
      skippedWithoutCode,
      missingDataWarnings,
      suspiciousDurationCount,
    };
  }

  // -------------------------------------------------------------------------
  // Cleanup Phase v1 — canonicalization, merge, sanity flagging.
  // -------------------------------------------------------------------------

  /**
   * Compute a non-destructive preview of canonicalization. Returns:
   *   - rows: every active standard + its proposed canonicalRouteCode
   *           (derived from fromCity/toCity) + any sanity flag detected
   *   - duplicateGroups: canonical codes that map to >1 standard — these
   *     are the candidates for mergeDuplicates
   *   - suspiciousDurationCount / missingCanonicalCount / missingDataCount
   *     counters for the refinement dashboard
   *
   * No DB writes. Operator reviews the preview, then calls
   * applyCanonicalization() to commit the canonicalRouteCode + reviewStatus
   * updates, and mergeDuplicates() per group to consolidate.
   */
  async previewCanonicalization() {
    const standards = await (this.prisma as any).routeStandard.findMany({
      orderBy: [{ isActive: 'desc' }, { routeCode: 'asc' }],
    });

    type PreviewRow = {
      id: string;
      routeCode: string;
      currentCanonicalRouteCode: string | null;
      proposedCanonicalRouteCode: string | null;
      routeName: string;
      fromCity: string | null;
      toCity: string | null;
      standardDurationHours: number | null;
      standardDistanceKm: number | null;
      suspiciousDuration: boolean;
      suspiciousReason: string | null;
      missingDistance: boolean;
      missingDuration: boolean;
      isActive: boolean;
      reviewStatus: string | null;
      isMessyCode: boolean;
    };

    const rows: PreviewRow[] = (standards as any[]).map((s) => {
      const proposed = deriveCanonicalRouteCode(s.fromCity, s.toCity);
      const suspicious = detectSuspiciousDuration(s.fromCity, s.toCity, s.standardDurationHours);
      // A code is "messy" when it's long, contains JORDAN_/COPY_OF_ prefixes,
      // or uses raw place-name tokens instead of short aliases. Heuristic —
      // operator confirms via the dashboard before applying.
      const code = String(s.routeCode || '');
      const isMessyCode =
        code.length > 14 ||
        /^JORDAN_/.test(code) ||
        /^COPY_OF_/i.test(code) ||
        /_CITY_|_CENTER_|_AIRPORT_|_SITE_|_BORDER_/i.test(code) ||
        code.split('_').length > 4;
      return {
        id: s.id,
        routeCode: s.routeCode,
        currentCanonicalRouteCode: s.canonicalRouteCode ?? null,
        proposedCanonicalRouteCode: proposed,
        routeName: s.routeName,
        fromCity: s.fromCity ?? null,
        toCity: s.toCity ?? null,
        standardDurationHours: s.standardDurationHours ?? null,
        standardDistanceKm: s.standardDistanceKm ?? null,
        suspiciousDuration: suspicious.suspicious,
        suspiciousReason: suspicious.reason,
        missingDistance: s.standardDistanceKm === null || s.standardDistanceKm === undefined,
        missingDuration: s.standardDurationHours === null || s.standardDurationHours === undefined,
        isActive: s.isActive !== false,
        reviewStatus: s.reviewStatus ?? null,
        isMessyCode,
      };
    });

    // Group by proposed canonical code to find duplicates.
    const groups = new Map<string, PreviewRow[]>();
    for (const row of rows) {
      if (!row.proposedCanonicalRouteCode) continue;
      const list = groups.get(row.proposedCanonicalRouteCode) || [];
      list.push(row);
      groups.set(row.proposedCanonicalRouteCode, list);
    }
    const duplicateGroups = [...groups.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([canonicalRouteCode, members]) => ({
        canonicalRouteCode,
        members: members.map((m) => ({
          id: m.id,
          routeCode: m.routeCode,
          routeName: m.routeName,
          standardDurationHours: m.standardDurationHours,
          standardDistanceKm: m.standardDistanceKm,
          isActive: m.isActive,
          suspiciousDuration: m.suspiciousDuration,
        })),
      }));

    return {
      totalRows: rows.length,
      rows,
      duplicateGroups,
      counters: {
        suspiciousDuration: rows.filter((r) => r.suspiciousDuration && r.isActive).length,
        missingDistance: rows.filter((r) => r.missingDistance && r.isActive).length,
        missingDuration: rows.filter((r) => r.missingDuration && r.isActive).length,
        missingCanonical: rows.filter((r) => !r.proposedCanonicalRouteCode && r.isActive).length,
        messyCode: rows.filter((r) => r.isMessyCode && r.isActive).length,
        duplicateCanonicalCodes: duplicateGroups.length,
        pendingReview: rows.filter((r) => r.reviewStatus === 'REVIEW_REQUIRED' && r.isActive).length,
      },
    };
  }

  /**
   * Apply canonicalization to the route standards table. Writes
   * canonicalRouteCode (derived from fromCity/toCity) + reviewStatus
   * (CANONICALIZED when canonical assigned + not suspicious, REVIEW_REQUIRED
   * when suspicious duration or missing data is detected). Never modifies
   * routeCode — legacy lookups stay intact.
   *
   * Returns counts of what changed so the admin UI can show a summary.
   */
  async applyCanonicalization() {
    const preview = await this.previewCanonicalization();
    let assignedCanonical = 0;
    let flaggedReview = 0;
    let markedCanonicalized = 0;
    let skippedNoCanonical = 0;

    for (const row of preview.rows) {
      const updates: Record<string, unknown> = {};
      if (row.proposedCanonicalRouteCode) {
        if (row.currentCanonicalRouteCode !== row.proposedCanonicalRouteCode) {
          updates.canonicalRouteCode = row.proposedCanonicalRouteCode;
          assignedCanonical += 1;
        }
      } else {
        skippedNoCanonical += 1;
      }
      // Always recompute suspicious flag — operator may have edited the
      // duration since the last bootstrap, and we want the flag to track
      // the current state.
      updates.suspiciousDurationFlag = row.suspiciousDuration;

      // reviewStatus precedence:
      //   - VERIFIED rows are NEVER auto-downgraded (operator signoff sticks)
      //   - suspicious / missing-data -> REVIEW_REQUIRED
      //   - otherwise, when canonical assigned -> CANONICALIZED
      //   - otherwise leave alone (preserves AUTO_BOOTSTRAP for rows we
      //     couldn't canonicalize)
      const currentStatus = row.reviewStatus;
      if (currentStatus !== 'VERIFIED') {
        if (row.suspiciousDuration || row.missingDistance || row.missingDuration) {
          if (currentStatus !== 'REVIEW_REQUIRED') {
            updates.reviewStatus = 'REVIEW_REQUIRED';
            flaggedReview += 1;
          }
        } else if (row.proposedCanonicalRouteCode) {
          if (currentStatus !== 'CANONICALIZED') {
            updates.reviewStatus = 'CANONICALIZED';
            markedCanonicalized += 1;
          }
        }
      }

      if (Object.keys(updates).length === 0) continue;
      await (this.prisma as any).routeStandard.update({ where: { id: row.id }, data: updates });
    }

    return {
      scanned: preview.totalRows,
      assignedCanonical,
      flaggedReview,
      markedCanonicalized,
      skippedNoCanonical,
      duplicateCanonicalCodes: preview.duplicateGroups.length,
    };
  }

  /**
   * Soft-merge duplicate route standards into one canonical row.
   *
   * "Soft" because we never DELETE the duplicate rows — operational
   * history (quote items, vouchers, dispatch references) may still point
   * to them by routeCode. Instead we:
   *   1. Verify the target is one of the members.
   *   2. Optionally copy any non-null distance/duration/buffer from the
   *      duplicates onto the target IF the target has a null value
   *      (best-effort data preservation).
   *   3. Deactivate the duplicates (isActive=false) and tag their
   *      reviewStatus as CANONICALIZED so they stop showing up in the
   *      dashboard as duplicates but stay queryable.
   *   4. Force the target's canonicalRouteCode + reviewStatus=VERIFIED.
   *
   * Lookup helper (route-standard-lookup.ts) handles the resolution —
   * deactivated rows are excluded from findMany({ isActive: true }), so
   * a quote item that previously resolved to a duplicate code now finds
   * no standard. The legacy-resolution test verifies the routeCode-based
   * lookup STILL hits a row when the original is the target.
   */
  async mergeDuplicates(targetId: string, mergedIds: string[]) {
    if (!targetId || !Array.isArray(mergedIds) || mergedIds.length === 0) {
      throw new BadRequestException('mergeDuplicates requires a target id and at least one merged id');
    }
    if (mergedIds.includes(targetId)) {
      throw new BadRequestException('Target cannot also be in the merged list');
    }
    const allIds = [targetId, ...mergedIds];
    const rows = await (this.prisma as any).routeStandard.findMany({ where: { id: { in: allIds } } });
    if (rows.length !== allIds.length) {
      throw new NotFoundException('One or more route standards were not found');
    }
    const target = rows.find((r: any) => r.id === targetId);
    const duplicates = rows.filter((r: any) => r.id !== targetId);
    // Best-effort backfill: pull non-null distance/duration/buffer from
    // duplicates into the target when the target's slot is empty.
    const fillIn: Record<string, unknown> = {};
    if (target.standardDistanceKm == null) {
      const found = duplicates.find((d: any) => d.standardDistanceKm != null);
      if (found) fillIn.standardDistanceKm = found.standardDistanceKm;
    }
    if (target.standardDurationHours == null) {
      const found = duplicates.find((d: any) => d.standardDurationHours != null);
      if (found) fillIn.standardDurationHours = found.standardDurationHours;
    }
    if (target.operationalBufferMinutes == null) {
      const found = duplicates.find((d: any) => d.operationalBufferMinutes != null);
      if (found) fillIn.operationalBufferMinutes = found.operationalBufferMinutes;
    }
    if (!target.canonicalRouteCode) {
      const derived = deriveCanonicalRouteCode(target.fromCity, target.toCity);
      if (derived) fillIn.canonicalRouteCode = derived;
    }
    fillIn.reviewStatus = 'VERIFIED';
    fillIn.isActive = true;
    fillIn.suspiciousDurationFlag = detectSuspiciousDuration(
      target.fromCity,
      target.toCity,
      (fillIn.standardDurationHours as number | undefined) ?? target.standardDurationHours,
    ).suspicious;

    await (this.prisma as any).routeStandard.update({ where: { id: targetId }, data: fillIn });
    for (const dup of duplicates) {
      await (this.prisma as any).routeStandard.update({
        where: { id: dup.id },
        data: {
          isActive: false,
          reviewStatus: 'CANONICALIZED',
          // Tag the duplicate with the same canonical code so audit
          // queries can trace the merge.
          canonicalRouteCode: (fillIn.canonicalRouteCode as string | undefined) ?? target.canonicalRouteCode ?? null,
        },
      });
    }

    return {
      targetId,
      mergedCount: duplicates.length,
      canonicalRouteCode: (fillIn.canonicalRouteCode as string | undefined) ?? target.canonicalRouteCode ?? null,
      filledFields: Object.keys(fillIn).filter((k) => !['reviewStatus', 'isActive', 'suspiciousDurationFlag'].includes(k)),
    };
  }

  /**
   * Refinement summary — counters the admin dashboard renders to drive the
   * operator's attention. Powered by previewCanonicalization, so the
   * numbers always reflect the current canonical/sanity state.
   */
  async refinementSummary() {
    const preview = await this.previewCanonicalization();
    return {
      ...preview.counters,
      totalActive: preview.rows.filter((r) => r.isActive).length,
      totalRows: preview.totalRows,
      duplicateGroups: preview.duplicateGroups,
    };
  }

  // -------------------------------------------------------------------------
  // Refinement Assistant v1 — one-click suggestions to accelerate operator
  // cleanup without manual row-by-row editing.
  // -------------------------------------------------------------------------

  /**
   * Build the prioritized refinement queue. Returns a flat list of
   * "suggestion tasks", each describing ONE actionable change an operator
   * can approve (suggested canonical code, suggested duration from reverse,
   * suggested distance from reverse).
   *
   * Each task includes:
   *   - rowId, currentCode, fromCity, toCity
   *   - field: 'canonicalRouteCode' | 'standardDurationHours' | 'standardDistanceKm'
   *   - currentValue, suggestedValue
   *   - suggestionSource: 'legacy_code_parse' | 'reverse_route' | 'city_fields'
   *   - category: 'AIRPORT' | 'PETRA' | 'WADI_RUM' | 'DEAD_SEA' | 'AQABA' | 'BORDER' | 'OTHER'
   *   - reviewBucket: 'SUSPICIOUS_DURATION' | 'MISSING_DISTANCE' | 'MISSING_DURATION' |
   *                   'UNRESOLVED_LEGACY_CODE' | 'AIRPORT_ROUTE' | 'BORDER_ROUTE'
   *   - isProtected: true when row is VERIFIED or source=MANUAL (no apply allowed)
   *
   * Skips VERIFIED and source=MANUAL rows entirely — those represent
   * operator signoff and the assistant must not contradict them.
   */
  async buildRefinementQueue() {
    const standards: any[] = await (this.prisma as any).routeStandard.findMany({
      where: { isActive: true },
      orderBy: [{ routeCode: 'asc' }],
    });

    type Task = {
      rowId: string;
      routeCode: string;
      routeName: string;
      fromCity: string | null;
      toCity: string | null;
      canonicalRouteCode: string | null;
      field: 'canonicalRouteCode' | 'standardDurationHours' | 'standardDistanceKm';
      currentValue: string | number | null;
      suggestedValue: string | number;
      suggestionSource: 'legacy_code_parse' | 'reverse_route' | 'city_fields';
      reviewBucket: string;
      category: 'AIRPORT' | 'PETRA' | 'WADI_RUM' | 'DEAD_SEA' | 'AQABA' | 'BORDER' | 'OTHER';
      isProtected: boolean;
    };

    const isProtected = (row: any): boolean =>
      row.reviewStatus === 'VERIFIED' || row.source === 'MANUAL';

    const categoryFor = (row: any): Task['category'] => {
      // Priority order matches the spec: airport > petra > wadi rum > dead
      // sea > aqaba > border > other.
      const text = `${row.routeCode || ''} ${row.canonicalRouteCode || ''} ${row.fromCity || ''} ${row.toCity || ''} ${row.routeName || ''}`.toUpperCase();
      if (row.airportRouteFlag || /QAIA|AQJ|AIRPORT/.test(text)) return 'AIRPORT';
      if (/PETRA|PET_|_PET/.test(text)) return 'PETRA';
      if (/WADI_RUM|\bWR_|_WR\b|WADI RUM/.test(text)) return 'WADI_RUM';
      if (/DEAD_SEA|\bDS_|_DS\b|DEAD SEA/.test(text)) return 'DEAD_SEA';
      if (/AQABA|AQJ_|_AQJ/.test(text)) return 'AQABA';
      if (row.borderCrossingFlag || /BORDER|ALLENBY|SHEIKH_HUSSEIN|WADI_ARABA/.test(text)) return 'BORDER';
      return 'OTHER';
    };

    const tasks: Task[] = [];

    for (const row of standards) {
      const protectedRow = isProtected(row);
      const category = categoryFor(row);

      // ----- Suggestion 1: canonical code -----
      // Two sources of canonical suggestion:
      //   a. fromCity/toCity (deriveCanonicalRouteCode) — already used by
      //      Apply canonical codes; we only re-suggest here when the row
      //      doesn't HAVE a canonicalRouteCode yet AND city fields are
      //      complete enough to derive one. Surface the "would-set" value
      //      so the operator can approve per-row instead of bulk.
      //   b. Legacy routeCode parsing — recovers signal from rows where
      //      city fields are missing/wrong but the legacy code itself
      //      encodes the route (e.g. JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT).
      if (!row.canonicalRouteCode) {
        const fromCityDerived = deriveCanonicalRouteCode(row.fromCity, row.toCity);
        const fromLegacy = suggestCanonicalFromLegacyCode(row.routeCode);
        // Prefer city-fields when both agree; legacy-parse when it produces
        // something city-fields doesn't.
        const suggested = fromCityDerived || fromLegacy;
        const source: Task['suggestionSource'] = fromCityDerived ? 'city_fields' : 'legacy_code_parse';
        if (suggested) {
          tasks.push({
            rowId: row.id,
            routeCode: row.routeCode,
            routeName: row.routeName,
            fromCity: row.fromCity,
            toCity: row.toCity,
            canonicalRouteCode: row.canonicalRouteCode,
            field: 'canonicalRouteCode',
            currentValue: row.canonicalRouteCode ?? null,
            suggestedValue: suggested,
            suggestionSource: source,
            reviewBucket: 'UNRESOLVED_LEGACY_CODE',
            category,
            isProtected: protectedRow,
          });
        }
      }
    }

    // ----- Suggestion 2 + 3: duration / distance from reverse route -----
    // Pre-compute the city-token lookup once for reverse matching.
    for (const row of standards) {
      const protectedRow = isProtected(row);
      const category = categoryFor(row);
      const reverse = findReverseStandard(row as any, standards as any);
      if (!reverse) continue;
      if ((row.standardDurationHours == null || row.standardDurationHours === 0) && reverse.standardDurationHours != null) {
        tasks.push({
          rowId: row.id,
          routeCode: row.routeCode,
          routeName: row.routeName,
          fromCity: row.fromCity,
          toCity: row.toCity,
          canonicalRouteCode: row.canonicalRouteCode,
          field: 'standardDurationHours',
          currentValue: null,
          suggestedValue: reverse.standardDurationHours,
          suggestionSource: 'reverse_route',
          reviewBucket: 'MISSING_DURATION',
          category,
          isProtected: protectedRow,
        });
      }
      if ((row.standardDistanceKm == null || row.standardDistanceKm === 0) && reverse.standardDistanceKm != null) {
        tasks.push({
          rowId: row.id,
          routeCode: row.routeCode,
          routeName: row.routeName,
          fromCity: row.fromCity,
          toCity: row.toCity,
          canonicalRouteCode: row.canonicalRouteCode,
          field: 'standardDistanceKm',
          currentValue: null,
          suggestedValue: reverse.standardDistanceKm,
          suggestionSource: 'reverse_route',
          reviewBucket: 'MISSING_DISTANCE',
          category,
          isProtected: protectedRow,
        });
      }
    }

    // Priority ordering for the queue: AIRPORT first, then the four major
    // tourism hubs, then BORDER, then OTHER. Within each category, sort
    // by routeCode for stable rendering.
    const CATEGORY_PRIORITY: Record<Task['category'], number> = {
      AIRPORT: 0,
      PETRA: 1,
      WADI_RUM: 2,
      DEAD_SEA: 3,
      AQABA: 4,
      BORDER: 5,
      OTHER: 6,
    };
    tasks.sort((a, b) => {
      const pa = CATEGORY_PRIORITY[a.category];
      const pb = CATEGORY_PRIORITY[b.category];
      if (pa !== pb) return pa - pb;
      return a.routeCode.localeCompare(b.routeCode);
    });

    // Bucket counts for the dashboard header.
    const counters = {
      total: tasks.length,
      unresolvedLegacyCodes: tasks.filter((t) => t.reviewBucket === 'UNRESOLVED_LEGACY_CODE').length,
      missingDuration: tasks.filter((t) => t.reviewBucket === 'MISSING_DURATION').length,
      missingDistance: tasks.filter((t) => t.reviewBucket === 'MISSING_DISTANCE').length,
      protectedRows: tasks.filter((t) => t.isProtected).length,
      airportPriority: tasks.filter((t) => t.category === 'AIRPORT').length,
    };

    return { tasks, counters };
  }

  /**
   * Apply ONE refinement suggestion. The operator approves a specific
   * (rowId, field, value) tuple from the queue; we write only that field.
   *
   * Safety guards (the spec's "preserve" + "no destructive" requirements):
   *   - Never modifies routeCode (legacy identifier preserved).
   *   - Refuses to write to VERIFIED rows.
   *   - Refuses to write to source='MANUAL' rows (operator-curated).
   *   - For duration writes, recomputes suspiciousDurationFlag honestly
   *     so an inherited reverse-route value that happens to be wrong
   *     still surfaces in the dashboard.
   */
  async applyRefinementSuggestion(input: {
    rowId: string;
    field: 'canonicalRouteCode' | 'standardDurationHours' | 'standardDistanceKm';
    value: string | number;
  }) {
    if (!input?.rowId || !input?.field) {
      throw new BadRequestException('rowId and field are required');
    }
    const row = await (this.prisma as any).routeStandard.findUnique({ where: { id: input.rowId } });
    if (!row) throw new NotFoundException('Route standard not found');

    if (row.reviewStatus === 'VERIFIED') {
      throw new BadRequestException(`Cannot apply suggestion: ${row.routeCode} is VERIFIED (operator signoff is sticky)`);
    }
    if (row.source === 'MANUAL') {
      throw new BadRequestException(`Cannot apply suggestion: ${row.routeCode} is MANUAL (operator-curated, never auto-modified)`);
    }

    const data: Record<string, unknown> = {};
    if (input.field === 'canonicalRouteCode') {
      const normalized = normalizeCode(String(input.value));
      if (!normalized) throw new BadRequestException('Suggested canonical code is empty');
      data.canonicalRouteCode = normalized;
    } else if (input.field === 'standardDurationHours') {
      const num = Number(input.value);
      if (!Number.isFinite(num) || num < 0) throw new BadRequestException('Suggested duration must be a non-negative number');
      data.standardDurationHours = num;
      // Recompute suspicious flag against the new duration honestly.
      const suspicious = detectSuspiciousDuration(row.fromCity, row.toCity, num);
      data.suspiciousDurationFlag = suspicious.suspicious;
    } else if (input.field === 'standardDistanceKm') {
      const num = Number(input.value);
      if (!Number.isFinite(num) || num < 0) throw new BadRequestException('Suggested distance must be a non-negative number');
      data.standardDistanceKm = num;
    } else {
      throw new BadRequestException(`Unsupported field: ${input.field}`);
    }

    const updated = await (this.prisma as any).routeStandard.update({
      where: { id: input.rowId },
      data,
    });
    return { ok: true, updatedField: input.field, row: updated };
  }

  /**
   * Bulk-apply. Returns per-item result so the operator sees exactly which
   * suggestions landed and which were rejected by the safety guards.
   * Never throws on a single failure — failures are reported in the
   * `results` array.
   */
  async applyBulkRefinementSuggestions(items: Array<{ rowId: string; field: 'canonicalRouteCode' | 'standardDurationHours' | 'standardDistanceKm'; value: string | number }>) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('items must be a non-empty array');
    }
    const results: Array<{ rowId: string; field: string; ok: boolean; error?: string }> = [];
    let appliedCount = 0;
    let skippedCount = 0;
    for (const item of items) {
      try {
        await this.applyRefinementSuggestion(item);
        results.push({ rowId: item.rowId, field: item.field, ok: true });
        appliedCount += 1;
      } catch (error: any) {
        results.push({ rowId: item.rowId, field: item.field, ok: false, error: error?.message || 'apply failed' });
        skippedCount += 1;
      }
    }
    return { appliedCount, skippedCount, results };
  }

  /**
   * Bulk upsert — used by Excel import. Returns counts of created/updated/
   * skipped rows so the operator gets a meaningful import summary.
   */
  async bulkUpsert(rows: RouteStandardInput[]) {
    let created = 0;
    let updated = 0;
    const errors: Array<{ routeCode: string; message: string }> = [];

    // Surface duplicate routeCodes WITHIN the upload as errors before any DB
    // writes — prevents a half-applied import where the second occurrence
    // silently overwrites the first.
    const seenCodes = new Set<string>();
    const duplicateCodes = new Set<string>();
    for (const row of rows) {
      const code = normalizeCode(row.routeCode || '');
      if (!code) continue;
      if (seenCodes.has(code)) duplicateCodes.add(code);
      seenCodes.add(code);
    }
    if (duplicateCodes.size > 0) {
      throw new BadRequestException(
        `Duplicate route codes in upload: ${[...duplicateCodes].join(', ')}. Each route code must appear at most once per import.`,
      );
    }

    for (const row of rows) {
      try {
        // Excel import always tags rows as IMPORTED unless the spreadsheet
        // explicitly carries another source — auto-bootstrapped rows that
        // get re-imported via Excel correctly transition to IMPORTED.
        const data = buildCreateData({ ...row, source: row.source ?? 'IMPORTED' });
        // Route Code Generator v1 — dedupe in priority order:
        //   1. exact routeCode match (existing behaviour)
        //   2. canonicalRouteCode match against incoming routeCode
        //      (covers re-importing an old workbook whose code is the
        //      legacy long form; matches the canonicalized row)
        //   3. canonicalRouteCode match against incoming canonicalRouteCode
        //      (covers fresh workbooks that carry the FROM_TO short form)
        //   4. routeCode match against incoming canonicalRouteCode
        // First hit wins → update; nothing → create.
        let existing = await (this.prisma as any).routeStandard.findUnique({ where: { routeCode: data.routeCode } });
        if (!existing) {
          existing = await (this.prisma as any).routeStandard.findFirst({
            where: { canonicalRouteCode: data.routeCode },
          });
        }
        if (!existing && data.canonicalRouteCode) {
          existing = await (this.prisma as any).routeStandard.findFirst({
            where: {
              OR: [
                { canonicalRouteCode: data.canonicalRouteCode },
                { routeCode: data.canonicalRouteCode },
              ],
            },
          });
        }
        if (existing) {
          await (this.prisma as any).routeStandard.update({ where: { id: existing.id }, data });
          updated += 1;
        } else {
          await (this.prisma as any).routeStandard.create({ data });
          created += 1;
        }
      } catch (error: any) {
        errors.push({ routeCode: row.routeCode || '<empty>', message: error?.message || 'Unknown error' });
      }
    }

    return { created, updated, errors, total: rows.length };
  }

  // -------------------------------------------------------------------------
  // Route Code Generator + Duplicate Protection v1
  //
  // The Route Builder UI calls these to: (a) populate the From/To dropdowns
  // with the canonical Operational Area dictionary, (b) preview what a
  // single-leg / round-trip / multi-stop creation will produce before
  // writing, and (c) atomically create the route(s) with auto-generated
  // canonical codes + duplicate detection.
  // -------------------------------------------------------------------------

  /** Return the operational-area dictionary the Route Builder dropdowns
   *  render. Now sourced from the DB-backed OperationalAreasService
   *  (Operational Areas Catalog v1). Kept as an alias under
   *  /route-standards/areas so existing UI consumers don't need to
   *  switch endpoints — the dedicated /operational-areas endpoint is
   *  available for new consumers. */
  async listOperationalAreas() {
    return this.loadAreas();
  }

  /**
   * Preview what a single-leg creation will produce.
   *
   * Returns:
   *   - suggestedCode: the auto-generated FROM_TO canonical code
   *   - suggestedRouteName: "fromArea → toArea" pre-filled name
   *   - existingMatch: any existing standard that would conflict —
   *       matched in priority order:
   *         1. canonicalRouteCode == suggestedCode
   *         2. routeCode == suggestedCode (legacy override)
   *         3. fromCity + toCity matches the area cities
   *   - action: 'create' | 'use-existing' (recommendation)
   *   - defaultFlags: smart defaults from the area dictionary (airport
   *       leg → airportRouteFlag, border crossing → borderCrossingFlag, etc.)
   *
   * Pure read — never writes. Operator inspects + clicks Confirm to commit.
   */
  async previewRouteCreation(input: { fromAreaId?: string; toAreaId?: string; fromAreaCode?: string; toAreaCode?: string }) {
    const areas = await this.loadAreas();
    const fromArea = input.fromAreaId
      ? pickAreaById(areas, input.fromAreaId)
      : input.fromAreaCode
        ? pickAreaByCode(areas, input.fromAreaCode)
        : null;
    const toArea = input.toAreaId
      ? pickAreaById(areas, input.toAreaId)
      : input.toAreaCode
        ? pickAreaByCode(areas, input.toAreaCode)
        : null;
    if (!fromArea || !toArea) {
      throw new BadRequestException('Both fromArea and toArea are required (by id or code)');
    }
    if (fromArea.code === toArea.code) {
      throw new BadRequestException('From and To areas cannot be the same — same-area transfers are not modelled as route standards');
    }
    const suggestedCode = `${fromArea.code}_${toArea.code}`;
    // Operational Areas Catalog v1 — `name` replaces `displayName` from
    // the old in-file dictionary. Build the same "From → To" label.
    const suggestedRouteName = `${fromArea.name} → ${toArea.name}`;

    // Three-pass match — canonical first, then legacy routeCode, then city pair.
    let existingMatch: any = await (this.prisma as any).routeStandard.findFirst({
      where: { canonicalRouteCode: suggestedCode },
    });
    let matchReason: 'canonical_code' | 'legacy_code' | 'city_pair' | null = existingMatch ? 'canonical_code' : null;

    if (!existingMatch) {
      existingMatch = await (this.prisma as any).routeStandard.findFirst({
        where: { routeCode: suggestedCode },
      });
      if (existingMatch) matchReason = 'legacy_code';
    }
    if (!existingMatch) {
      existingMatch = await (this.prisma as any).routeStandard.findFirst({
        where: { fromCity: fromArea.city, toCity: toArea.city, isActive: true },
      });
      if (existingMatch) matchReason = 'city_pair';
    }

    return {
      fromArea,
      toArea,
      suggestedCode,
      suggestedRouteName,
      existingMatch: existingMatch
        ? {
            id: existingMatch.id,
            routeCode: existingMatch.routeCode,
            canonicalRouteCode: existingMatch.canonicalRouteCode,
            routeName: existingMatch.routeName,
            standardDistanceKm: existingMatch.standardDistanceKm,
            standardDurationHours: existingMatch.standardDurationHours,
            isActive: existingMatch.isActive,
            reviewStatus: existingMatch.reviewStatus,
            matchReason,
          }
        : null,
      action: existingMatch ? 'use-existing' : 'create',
      defaultFlags: mergeDefaultFlagsFor(fromArea, toArea),
    };
  }

  /**
   * Create a single leg with auto-generated canonical code + duplicate
   * detection. If a match is found AND options.forceCreate is false (the
   * default), refuses to create and returns the existing row so the
   * operator can decide via the UI. Pass forceCreate=true after the
   * operator confirms "create anyway" in the preview dialog.
   *
   * options.alsoCreateReverse: if true, also creates the reverse leg
   * (toArea → fromArea) using the same numeric values (distance, duration,
   * buffer) and a mirrored route name. Useful for symmetric transfers.
   */
  async createWithGeneration(
    input: {
      fromAreaId?: string;
      toAreaId?: string;
      fromAreaCode?: string;
      toAreaCode?: string;
      standardDistanceKm?: number | null;
      standardDurationHours?: number | null;
      operationalBufferMinutes?: number | null;
      notes?: string | null;
      longDistanceFlag?: boolean;
      overnightRisk?: boolean;
      mountainRoadFlag?: boolean;
      borderCrossingFlag?: boolean;
      airportRouteFlag?: boolean;
    },
    options: { forceCreate?: boolean; alsoCreateReverse?: boolean } = {},
  ) {
    const preview = await this.previewRouteCreation(input);
    if (preview.existingMatch && !options.forceCreate) {
      return {
        action: 'use-existing',
        existingMatch: preview.existingMatch,
        message: `Route ${preview.suggestedCode} already exists — pass forceCreate=true to override, or open the existing row to refine.`,
      };
    }

    const flags = {
      longDistanceFlag: input.longDistanceFlag ?? preview.defaultFlags.airportRouteFlag === false ? Boolean(input.longDistanceFlag) : Boolean(input.longDistanceFlag),
      overnightRisk: Boolean(input.overnightRisk ?? preview.defaultFlags.overnightRisk),
      mountainRoadFlag: Boolean(input.mountainRoadFlag ?? preview.defaultFlags.mountainRoadFlag),
      borderCrossingFlag: Boolean(input.borderCrossingFlag ?? preview.defaultFlags.borderCrossingFlag),
      airportRouteFlag: Boolean(input.airportRouteFlag ?? preview.defaultFlags.airportRouteFlag),
    };

    const primary = await this.create({
      routeCode: preview.suggestedCode,
      routeName: preview.suggestedRouteName,
      fromCity: preview.fromArea.city,
      toCity: preview.toArea.city,
      standardDistanceKm: input.standardDistanceKm ?? null,
      standardDurationHours: input.standardDurationHours ?? null,
      operationalBufferMinutes: input.operationalBufferMinutes ?? null,
      notes: input.notes ?? null,
      canonicalRouteCode: preview.suggestedCode,
      reviewStatus: 'CANONICALIZED',
      source: 'MANUAL',
      ...flags,
    });

    let reverse: any = null;
    if (options.alsoCreateReverse) {
      const reversePreview = await this.previewRouteCreation({
        fromAreaCode: preview.toArea.code,
        toAreaCode: preview.fromArea.code,
      });
      if (!reversePreview.existingMatch) {
        reverse = await this.create({
          routeCode: reversePreview.suggestedCode,
          routeName: reversePreview.suggestedRouteName,
          fromCity: preview.toArea.city,
          toCity: preview.fromArea.city,
          standardDistanceKm: input.standardDistanceKm ?? null,
          standardDurationHours: input.standardDurationHours ?? null,
          operationalBufferMinutes: input.operationalBufferMinutes ?? null,
          notes: input.notes ?? null,
          canonicalRouteCode: reversePreview.suggestedCode,
          reviewStatus: 'CANONICALIZED',
          source: 'MANUAL',
          ...flags,
        });
      } else {
        reverse = { skipped: true, reason: 'reverse_already_exists', existingId: reversePreview.existingMatch.id };
      }
    }

    return { action: 'created', primary, reverse };
  }

  /**
   * Multi-stop touring helper. Input is an ordered list of area codes
   * (or ids) — e.g. ['AMM', 'MAD', 'NEB', 'PET']. Generates N-1 legs
   * (AMM_MAD, MAD_NEB, NEB_PET) using previewRouteCreation per pair,
   * creating the new ones and skipping any that already exist (the
   * touring route is a composition of legs; existing legs stay intact).
   *
   * Returns per-leg result so the operator sees which legs were
   * created vs reused.
   */
  async createMultiStopRoute(input: {
    stops: Array<{ areaId?: string; areaCode?: string }>;
    sharedFields?: {
      operationalBufferMinutes?: number | null;
      notes?: string | null;
    };
  }) {
    const stops = Array.isArray(input.stops) ? input.stops : [];
    if (stops.length < 3) {
      throw new BadRequestException('Multi-stop route requires at least 3 stops — for 2 stops, use the single-leg builder');
    }
    const areas = await this.loadAreas();
    const resolved: OperationalArea[] = [];
    for (const stop of stops) {
      const area = stop.areaId ? pickAreaById(areas, stop.areaId) : pickAreaByCode(areas, stop.areaCode);
      if (!area) {
        throw new BadRequestException(`Unknown stop: ${stop.areaId || stop.areaCode}`);
      }
      resolved.push(area);
    }

    const results: Array<{
      legNumber: number;
      fromCode: string;
      toCode: string;
      suggestedCode: string;
      action: 'created' | 'reused';
      rowId: string;
    }> = [];

    for (let i = 0; i < resolved.length - 1; i++) {
      const fromArea = resolved[i];
      const toArea = resolved[i + 1];
      if (fromArea.code === toArea.code) {
        // Skip identical-area legs silently — common when a multi-stop has
        // repeats like AMM → AMM city walking tours that aren't real
        // transfer legs.
        continue;
      }
      const legPreview = await this.previewRouteCreation({
        fromAreaCode: fromArea.code,
        toAreaCode: toArea.code,
      });
      if (legPreview.existingMatch) {
        results.push({
          legNumber: i + 1,
          fromCode: fromArea.code,
          toCode: toArea.code,
          suggestedCode: legPreview.suggestedCode,
          action: 'reused',
          rowId: legPreview.existingMatch.id,
        });
        continue;
      }
      const flags = mergeDefaultFlagsFor(fromArea, toArea);
      const created = await this.create({
        routeCode: legPreview.suggestedCode,
        routeName: legPreview.suggestedRouteName,
        fromCity: fromArea.city,
        toCity: toArea.city,
        operationalBufferMinutes: input.sharedFields?.operationalBufferMinutes ?? null,
        notes: input.sharedFields?.notes ?? null,
        canonicalRouteCode: legPreview.suggestedCode,
        reviewStatus: 'CANONICALIZED',
        source: 'MANUAL',
        longDistanceFlag: false,
        overnightRisk: flags.overnightRisk,
        mountainRoadFlag: flags.mountainRoadFlag,
        borderCrossingFlag: flags.borderCrossingFlag,
        airportRouteFlag: flags.airportRouteFlag,
      });
      results.push({
        legNumber: i + 1,
        fromCode: fromArea.code,
        toCode: toArea.code,
        suggestedCode: legPreview.suggestedCode,
        action: 'created',
        rowId: created.id,
      });
    }

    return {
      stopCount: resolved.length,
      legCount: results.length,
      createdCount: results.filter((r) => r.action === 'created').length,
      reusedCount: results.filter((r) => r.action === 'reused').length,
      legs: results,
      message:
        'This is a Touring Route made from multiple legs. Each leg is a standalone Route Standard the operator can refine independently.',
    };
  }

  // -------------------------------------------------------------------------
  // Route Standards Auto-Cleanup Assistant v1
  //
  // Classifies every Route Standard, surfaces non-movement rows for
  // cleanup, and suggests timing for true MOVEMENT_LEG rows that are
  // missing distance / duration.
  //
  // Everything is soft: bulk-deactivate sets isActive=false, never
  // deletes; bulk-apply-timing only fills empty cells on unprotected
  // MOVEMENT_LEG rows.
  // -------------------------------------------------------------------------

  /**
   * Return every active+inactive Route Standard tagged with its
   * classification, suspicious-timing flag, recommended action, and a
   * timing suggestion when relevant. Drives the cleanup dashboard.
   */
  async getCleanupClassification() {
    const rows: any[] = await (this.prisma as any).routeStandard.findMany({
      orderBy: [{ isActive: 'desc' }, { routeCode: 'asc' }],
    });

    const enriched = rows.map((row) => {
      const classification = classifyRouteStandard(row);
      const suspicious = detectSuspiciousMovementDuration({
        ...row,
        classification: classification.classification,
      });
      const protectedRow = isProtectedRow(row);
      const hasTiming = rowHasTiming(row);
      // Only compute a timing suggestion for movement legs that need it.
      // Skip for protected rows + rows that already have full timing.
      let suggestion = null as ReturnType<typeof suggestTimingForRoute> | null;
      if (
        classification.classification === 'MOVEMENT_LEG' &&
        !protectedRow &&
        !hasTiming
      ) {
        suggestion = suggestTimingForRoute(row, rows as any);
      }
      return {
        id: row.id,
        routeCode: row.routeCode,
        canonicalRouteCode: row.canonicalRouteCode ?? null,
        routeName: row.routeName,
        fromCity: row.fromCity ?? null,
        toCity: row.toCity ?? null,
        standardDistanceKm: row.standardDistanceKm ?? null,
        standardDurationHours: row.standardDurationHours ?? null,
        operationalBufferMinutes: row.operationalBufferMinutes ?? null,
        isActive: Boolean(row.isActive),
        reviewStatus: row.reviewStatus ?? null,
        source: row.source ?? null,
        suspicious: suspicious.suspicious,
        suspiciousReason: suspicious.reason,
        isProtected: protectedRow,
        hasTiming,
        classification: classification.classification,
        recommendedAction: classification.recommendedAction,
        classificationReason: classification.reason,
        classificationConfidence: classification.confidence,
        timingSuggestion: suggestion,
      };
    });

    const counters = {
      total: enriched.length,
      active: enriched.filter((r) => r.isActive).length,
      movementLegs: enriched.filter((r) => r.classification === 'MOVEMENT_LEG').length,
      touringPrograms: enriched.filter((r) => r.classification === 'TOURING_PROGRAM').length,
      activities: enriched.filter((r) => r.classification === 'ACTIVITY_EXPERIENCE').length,
      roundTripPrograms: enriched.filter((r) => r.classification === 'ROUND_TRIP_PROGRAM').length,
      multiStopFlows: enriched.filter((r) => r.classification === 'MULTI_STOP_FLOW').length,
      unknownReview: enriched.filter((r) => r.classification === 'UNKNOWN_REVIEW').length,
      suspiciousMovement: enriched.filter((r) => r.suspicious).length,
      movementMissingTiming: enriched.filter(
        (r) => r.classification === 'MOVEMENT_LEG' && r.isActive && !r.hasTiming,
      ).length,
      timingSuggestionsHighConfidence: enriched.filter(
        (r) => r.timingSuggestion?.confidence === 'high',
      ).length,
      timingSuggestionsReverse: enriched.filter(
        (r) => r.timingSuggestion?.confidence === 'reverse_inherited',
      ).length,
    };

    return { rows: enriched, counters };
  }

  /**
   * Bulk-deactivate clearly non-movement rows. Only touches:
   *   - TOURING_PROGRAM
   *   - ACTIVITY_EXPERIENCE
   *   - ROUND_TRIP_PROGRAM
   *   - MULTI_STOP_FLOW
   *
   * Never touches: MOVEMENT_LEG, UNKNOWN_REVIEW, VERIFIED, MANUAL,
   * already-deactivated rows.
   *
   * Soft only — sets isActive=false. Audit trail (createdAt/updatedAt)
   * stays intact, the row can be reactivated, and legacy lookups still
   * resolve the routeCode → row.
   */
  async bulkDeactivateNonMovementRows() {
    const { rows } = await this.getCleanupClassification();
    const candidates = rows.filter(
      (r) =>
        r.isActive &&
        !r.isProtected &&
        (r.classification === 'TOURING_PROGRAM' ||
          r.classification === 'ACTIVITY_EXPERIENCE' ||
          r.classification === 'ROUND_TRIP_PROGRAM' ||
          r.classification === 'MULTI_STOP_FLOW') &&
        // High/medium confidence only — UNKNOWN can't slip into the
        // first filter anyway, but be explicit.
        (r.classificationConfidence === 'high' ||
          r.classificationConfidence === 'medium'),
    );

    const results: Array<{
      id: string;
      routeCode: string;
      classification: RouteClassification;
      deactivated: boolean;
    }> = [];
    for (const row of candidates) {
      await (this.prisma as any).routeStandard.update({
        where: { id: row.id },
        data: { isActive: false },
      });
      results.push({
        id: row.id,
        routeCode: row.routeCode,
        classification: row.classification,
        deactivated: true,
      });
    }
    return {
      deactivatedCount: results.length,
      skippedProtectedCount: rows.filter(
        (r) =>
          r.isActive &&
          r.isProtected &&
          (r.classification === 'TOURING_PROGRAM' ||
            r.classification === 'ACTIVITY_EXPERIENCE' ||
            r.classification === 'ROUND_TRIP_PROGRAM' ||
            r.classification === 'MULTI_STOP_FLOW'),
      ).length,
      results,
    };
  }

  /**
   * Bulk-apply high-confidence timing suggestions. Touches only:
   *   - classification === 'MOVEMENT_LEG'
   *   - !isProtected (not VERIFIED, not source=MANUAL)
   *   - !hasTiming (don't overwrite operator's existing numbers)
   *   - suggestion.confidence === 'high' OR 'reverse_inherited'
   */
  async bulkApplyHighConfidenceTiming() {
    const { rows } = await this.getCleanupClassification();
    const applyable = rows.filter(
      (r) =>
        r.classification === 'MOVEMENT_LEG' &&
        !r.isProtected &&
        !r.hasTiming &&
        r.timingSuggestion &&
        (r.timingSuggestion.confidence === 'high' ||
          r.timingSuggestion.confidence === 'reverse_inherited'),
    );

    const results: Array<{
      id: string;
      routeCode: string;
      appliedSource: string;
      distanceKm: number | null;
      durationHours: number | null;
      bufferMinutes: number | null;
    }> = [];
    for (const row of applyable) {
      const s = row.timingSuggestion!;
      await (this.prisma as any).routeStandard.update({
        where: { id: row.id },
        data: {
          standardDistanceKm: s.distanceKm,
          standardDurationHours: s.durationHours,
          operationalBufferMinutes: s.bufferMinutes,
          longDistanceFlag: s.flags.longDistanceFlag,
          mountainRoadFlag: s.flags.mountainRoadFlag,
          borderCrossingFlag: s.flags.borderCrossingFlag,
          airportRouteFlag: s.flags.airportRouteFlag,
          overnightRisk: s.flags.overnightRisk,
          // Recompute suspicious flag honestly with the new duration.
          suspiciousDurationFlag: detectSuspiciousMovementDuration({
            canonicalRouteCode: row.canonicalRouteCode,
            routeCode: row.routeCode,
            standardDurationHours: s.durationHours,
            classification: 'MOVEMENT_LEG',
          }).suspicious,
        },
      });
      results.push({
        id: row.id,
        routeCode: row.routeCode,
        appliedSource: s.source,
        distanceKm: s.distanceKm,
        durationHours: s.durationHours,
        bufferMinutes: s.bufferMinutes,
      });
    }
    return {
      appliedCount: results.length,
      results,
    };
  }

  /**
   * Export the cleanup classification as an .xlsx workbook with one
   * row per Route Standard + the spec's columns.
   */
  async exportCleanupReport(): Promise<{ fileName: string; buffer: Buffer }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const { rows } = await this.getCleanupClassification();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cleanup Report');
    sheet.addRow([
      'routeCode',
      'canonicalRouteCode',
      'name',
      'from',
      'to',
      'classification',
      'reason',
      'recommendedAction',
      'confidence',
      'active',
      'reviewStatus',
      'source',
      'suspicious',
      'suspiciousReason',
      'standardDistanceKm',
      'standardDurationHours',
      'operationalBufferMinutes',
      'timingSuggestionSource',
      'timingSuggestionConfidence',
      'timingSuggestionDistanceKm',
      'timingSuggestionDurationHours',
      'timingSuggestionBufferMinutes',
    ]);
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow([
        row.routeCode,
        row.canonicalRouteCode ?? '',
        row.routeName,
        row.fromCity ?? '',
        row.toCity ?? '',
        row.classification,
        row.classificationReason,
        row.recommendedAction,
        row.classificationConfidence,
        row.isActive ? 'Yes' : 'No',
        row.reviewStatus ?? '',
        row.source ?? '',
        row.suspicious ? 'Yes' : 'No',
        row.suspiciousReason ?? '',
        row.standardDistanceKm ?? '',
        row.standardDurationHours ?? '',
        row.operationalBufferMinutes ?? '',
        row.timingSuggestion?.source ?? '',
        row.timingSuggestion?.confidence ?? '',
        row.timingSuggestion?.distanceKm ?? '',
        row.timingSuggestion?.durationHours ?? '',
        row.timingSuggestion?.bufferMinutes ?? '',
      ]);
    }
    sheet.columns.forEach((column: any) => {
      column.width = 22;
    });
    const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;
    return { fileName: 'route-standards-cleanup-report.xlsx', buffer };
  }
}

/**
 * Route timing confidence label — derived from the standard's risk flags
 * and operational characteristics. Used by quote/dispatch/voucher rendering
 * (Phase 2) to show operators what kind of delay risk to plan for.
 *
 * Exported so admin pages can render it next to the standard's stored
 * numbers. Pure function — no DB access.
 */
export type RouteTimingConfidence =
  | 'Normal Traffic'
  | 'Heavy Traffic Risk'
  | 'Mountain Road Delay Risk'
  | 'Border Delay Risk'
  | 'Long Distance Drive';

export function computeRouteTimingConfidence(input: {
  longDistanceFlag?: boolean | null;
  overnightRisk?: boolean | null;
  mountainRoadFlag?: boolean | null;
  borderCrossingFlag?: boolean | null;
  airportRouteFlag?: boolean | null;
  standardDurationHours?: number | null;
}): RouteTimingConfidence {
  // Order matters — border > mountain > long > airport (heavy traffic).
  // Airport routes are the most common "heavy traffic" case in DMC ops.
  if (input.borderCrossingFlag) return 'Border Delay Risk';
  if (input.mountainRoadFlag) return 'Mountain Road Delay Risk';
  if (input.longDistanceFlag || (input.standardDurationHours ?? 0) >= 5) return 'Long Distance Drive';
  if (input.airportRouteFlag) return 'Heavy Traffic Risk';
  return 'Normal Traffic';
}
