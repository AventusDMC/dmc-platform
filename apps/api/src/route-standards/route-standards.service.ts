import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// CRUD service for RouteStandard. Phase 1 = pure data layer; Phase 2 will
// add lookup helpers for quote/dispatch/voucher integration.

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
  return data;
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
        const data = buildCreateData(row);
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
