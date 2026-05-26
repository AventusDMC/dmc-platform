import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  PETRA: 'PET',
  WADI_MUSA: 'PET', // Wadi Musa is the town immediately adjacent to Petra
  WADI_RUM: 'WR',
  AQABA: 'AQJ',
  AQJ: 'AQJ',
  KING_HUSSEIN_INTERNATIONAL_AIRPORT: 'AQJ',
  AQABA_CITY: 'AQJ',
  AQABA_CITY_CENTER: 'AQJ',
  DEAD_SEA: 'DS',
  DEAD_SEA_RESORTS: 'DS',
  JERASH: 'JER',
  JERASH_ARCHAEOLOGICAL_SITE: 'JER',
  AJLOUN: 'AJL',
  IRBID: 'IRB',
  MADABA: 'MAD',
  KERAK: 'KRK',
  KARAK: 'KRK',
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
  WADI_ARABA: 'WAB',
  WADI_ARABA_BORDER: 'WAB',
};

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
  constructor(private readonly prisma: PrismaService) {}

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
        const existing = await (this.prisma as any).routeStandard.findUnique({ where: { routeCode: data.routeCode } });
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
