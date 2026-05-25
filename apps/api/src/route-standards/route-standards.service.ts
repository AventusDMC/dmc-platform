import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// CRUD service for RouteStandard. Phase 1 = pure data layer; Phase 2 will
// add lookup helpers for quote/dispatch/voucher integration.

export type RouteStandardSource = 'AUTO_BOOTSTRAP' | 'IMPORTED' | 'MANUAL';

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
  return data;
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
  return {
    routeCode: code,
    routeName: route.name || code,
    fromCity: route.startCity || route.primaryOperatingCity || null,
    toCity: null,
    destinationArea: mainDestinations && mainDestinations.length > 0 ? mainDestinations.join(' → ') : null,
    standardDistanceKm: route.estimatedDistanceKm ?? route.includedKm ?? null,
    standardDurationHours: route.estimatedDriveHours ?? route.includedHours ?? null,
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
    for (const { source, input } of candidates) {
      try {
        await (this.prisma as any).routeStandard.create({ data: buildCreateData(input) });
        if (source === 'TOURING') createdFromTouring += 1;
        else createdFromTransfer += 1;
        const missing: string[] = [];
        if (input.standardDistanceKm === null || input.standardDistanceKm === undefined) missing.push('distance');
        if (input.standardDurationHours === null || input.standardDurationHours === undefined) missing.push('duration');
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
