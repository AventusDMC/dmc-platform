import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Touring Route Legs v1 — CRUD + summary computation.
//
// Legs are ordered Route Standard movements that compose the operational
// flow of a Touring Route. Pricing is UNCHANGED — TouringRoutePricing
// remains the pricing authority; these legs only model the movement,
// timing, and risk profile used by quote display + dispatch feasibility.

export type LegType = 'DRIVE' | 'STOP' | 'WAIT' | 'ACTIVITY_ANCHOR';

export const LEG_TYPES: LegType[] = ['DRIVE', 'STOP', 'WAIT', 'ACTIVITY_ANCHOR'];

export type CreateLegInput = {
  touringRouteId: string;
  legType?: LegType | string;
  fromAreaId?: string | null;
  toAreaId?: string | null;
  routeStandardId?: string | null;
  notes?: string | null;
  estimatedStopMinutes?: number | null;
  // Optional explicit sequence; defaults to next-in-sequence on create.
  sequence?: number | null;
};

export type UpdateLegInput = Partial<Omit<CreateLegInput, 'touringRouteId'>>;

function requireString(value: string | null | undefined, field: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new BadRequestException(`${field} is required`);
  return trimmed;
}

function requireValidLegType(value: string | null | undefined): LegType {
  const v = String(value || 'DRIVE').toUpperCase();
  if (!LEG_TYPES.includes(v as LegType)) {
    throw new BadRequestException(`legType must be one of: ${LEG_TYPES.join(', ')}`);
  }
  return v as LegType;
}

@Injectable()
export class TouringRouteLegsService {
  constructor(private readonly prisma: PrismaService) {}

  /** List legs for a touring route in sequence order. Includes the
   *  resolved RouteStandard + from/to OperationalArea so the UI can
   *  render the full leg card without extra hops. */
  async listForTouringRoute(touringRouteId: string) {
    requireString(touringRouteId, 'touringRouteId');
    return (this.prisma as any).touringRouteLeg.findMany({
      where: { touringRouteId },
      include: {
        routeStandard: true,
        fromArea: true,
        toArea: true,
      },
      orderBy: { sequence: 'asc' },
    });
  }

  async findOne(id: string) {
    const row = await (this.prisma as any).touringRouteLeg.findUnique({
      where: { id },
      include: { routeStandard: true, fromArea: true, toArea: true },
    });
    if (!row) throw new NotFoundException('Touring route leg not found');
    return row;
  }

  /**
   * Auto-resolve the RouteStandard for a from/to area pair using the
   * canonical FROM_TO code. Returns null when no matching standard
   * exists — the UI surfaces this as "Create missing route standard".
   * Never creates standards (that's the Route Builder's job).
   */
  async resolveRouteStandard(fromAreaId: string | null | undefined, toAreaId: string | null | undefined) {
    if (!fromAreaId || !toAreaId) return null;
    const [fromArea, toArea] = await Promise.all([
      (this.prisma as any).operationalArea.findUnique({ where: { id: fromAreaId } }),
      (this.prisma as any).operationalArea.findUnique({ where: { id: toAreaId } }),
    ]);
    if (!fromArea || !toArea) return null;
    if (fromArea.code === toArea.code) return null;
    const canonical = `${fromArea.code}_${toArea.code}`;
    // Try canonicalRouteCode first; fall back to legacy routeCode for
    // pre-canonicalization rows.
    return (this.prisma as any).routeStandard.findFirst({
      where: {
        OR: [{ canonicalRouteCode: canonical }, { routeCode: canonical }],
        isActive: true,
      },
    });
  }

  async create(input: CreateLegInput) {
    const touringRouteId = requireString(input.touringRouteId, 'touringRouteId');
    const legType = requireValidLegType(input.legType);

    // For DRIVE legs, auto-resolve the RouteStandard from areas when the
    // caller didn't supply one explicitly. STOP/WAIT/ACTIVITY_ANCHOR
    // legs don't need a standard — they're not movement.
    let routeStandardId: string | null = input.routeStandardId ?? null;
    if (legType === 'DRIVE' && !routeStandardId && input.fromAreaId && input.toAreaId) {
      const resolved = await this.resolveRouteStandard(input.fromAreaId, input.toAreaId);
      if (resolved) routeStandardId = resolved.id;
    }

    // Next sequence: max(existing) + 1. If caller passed an explicit
    // sequence, honour it (but the unique constraint will reject
    // collisions).
    let sequence = input.sequence;
    if (sequence == null) {
      const last = await (this.prisma as any).touringRouteLeg.findFirst({
        where: { touringRouteId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      sequence = (last?.sequence ?? 0) + 1;
    }

    try {
      return await (this.prisma as any).touringRouteLeg.create({
        data: {
          touringRouteId,
          sequence,
          legType,
          routeStandardId,
          fromAreaId: input.fromAreaId ?? null,
          toAreaId: input.toAreaId ?? null,
          notes: input.notes?.trim() || null,
          estimatedStopMinutes:
            input.estimatedStopMinutes != null && Number.isFinite(Number(input.estimatedStopMinutes))
              ? Math.max(0, Math.floor(Number(input.estimatedStopMinutes)))
              : null,
        },
        include: { routeStandard: true, fromArea: true, toArea: true },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(
          `A leg with sequence ${sequence} already exists on this touring route. Reorder or use a different sequence.`,
        );
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateLegInput) {
    const existing = await this.findOne(id);
    const data: Record<string, unknown> = {};
    if (input.legType !== undefined) data.legType = requireValidLegType(input.legType);
    if (input.fromAreaId !== undefined) data.fromAreaId = input.fromAreaId || null;
    if (input.toAreaId !== undefined) data.toAreaId = input.toAreaId || null;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
    if (input.estimatedStopMinutes !== undefined) {
      data.estimatedStopMinutes =
        input.estimatedStopMinutes != null && Number.isFinite(Number(input.estimatedStopMinutes))
          ? Math.max(0, Math.floor(Number(input.estimatedStopMinutes)))
          : null;
    }
    if (input.sequence !== undefined && input.sequence != null) data.sequence = input.sequence;

    // Re-resolve the RouteStandard when from/to or legType change AND
    // the caller didn't explicitly pass routeStandardId.
    if (input.routeStandardId !== undefined) {
      data.routeStandardId = input.routeStandardId || null;
    } else if (
      (input.fromAreaId !== undefined || input.toAreaId !== undefined || input.legType !== undefined) &&
      (data.legType ?? existing.legType) === 'DRIVE'
    ) {
      const fromAreaId = (data.fromAreaId as string) ?? existing.fromAreaId;
      const toAreaId = (data.toAreaId as string) ?? existing.toAreaId;
      const resolved = await this.resolveRouteStandard(fromAreaId, toAreaId);
      data.routeStandardId = resolved?.id ?? null;
    }

    try {
      return await (this.prisma as any).touringRouteLeg.update({
        where: { id },
        data,
        include: { routeStandard: true, fromArea: true, toArea: true },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('Sequence collision — another leg already uses that position.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return (this.prisma as any).touringRouteLeg.delete({ where: { id } });
  }

  /**
   * Reorder legs by passing an ordered array of leg ids. Sequences are
   * reassigned 1..N. Done in a transaction so partial reorders never
   * leave the table in an inconsistent state.
   *
   * Two-pass write to dodge the unique constraint: first push every
   * leg to a temporary high-number sequence, then assign the final
   * 1..N positions.
   */
  async reorder(touringRouteId: string, orderedIds: string[]) {
    requireString(touringRouteId, 'touringRouteId');
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw new BadRequestException('orderedIds must be a non-empty array');
    }
    return (this.prisma as any).$transaction(async (tx: any) => {
      // Verify every leg belongs to this touring route.
      const existing = await tx.touringRouteLeg.findMany({
        where: { id: { in: orderedIds }, touringRouteId },
        select: { id: true },
      });
      const found = new Set(existing.map((l: any) => l.id));
      const missing = orderedIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Legs not found on this touring route: ${missing.join(', ')}`);
      }
      // Pass 1: park everything at sequence 10000+i to avoid colliding
      // with the final positions.
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.touringRouteLeg.update({
          where: { id: orderedIds[i] },
          data: { sequence: 10000 + i },
        });
      }
      // Pass 2: assign final 1..N positions.
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.touringRouteLeg.update({
          where: { id: orderedIds[i] },
          data: { sequence: i + 1 },
        });
      }
      return tx.touringRouteLeg.findMany({
        where: { touringRouteId },
        include: { routeStandard: true, fromArea: true, toArea: true },
        orderBy: { sequence: 'asc' },
      });
    });
  }

  /**
   * Compute the touring-route operational summary from its legs.
   *
   * Drive metrics (distance, duration, buffer) sum ONLY DRIVE legs that
   * have a resolved RouteStandard. STOP/WAIT/ACTIVITY_ANCHOR legs
   * contribute to estimatedStopMinutes but not to drive totals.
   *
   * Risk flags OR across all DRIVE legs' standards (one mountainRoadFlag
   * anywhere in the flow makes the whole touring route mountain-road).
   *
   * Flow string: "From1 → To1 → To2 → ..." using area names.
   *
   * Returns an explicit `missingRouteStandardCount` so the UI can flag
   * legs needing a Route Standard.
   */
  async computeSummary(touringRouteId: string) {
    const legs = await this.listForTouringRoute(touringRouteId);
    let totalDriveDistanceKm = 0;
    let totalDriveDurationHours = 0;
    let totalBufferMinutes = 0;
    let totalEstimatedStopMinutes = 0;
    let missingRouteStandardCount = 0;
    let driveLegsWithDistance = 0;
    let driveLegsWithDuration = 0;
    const riskFlags = {
      longDistanceFlag: false,
      overnightRisk: false,
      mountainRoadFlag: false,
      borderCrossingFlag: false,
      airportRouteFlag: false,
    };
    const flowAreaNames: string[] = [];

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const isDrive = leg.legType === 'DRIVE';
      const std = leg.routeStandard;
      if (isDrive) {
        if (!std) {
          missingRouteStandardCount += 1;
        } else {
          if (std.standardDistanceKm != null) {
            totalDriveDistanceKm += Number(std.standardDistanceKm);
            driveLegsWithDistance += 1;
          }
          if (std.standardDurationHours != null) {
            totalDriveDurationHours += Number(std.standardDurationHours);
            driveLegsWithDuration += 1;
          }
          if (std.operationalBufferMinutes != null) {
            totalBufferMinutes += Number(std.operationalBufferMinutes);
          }
          // OR-merge the risk flags across DRIVE legs only.
          riskFlags.longDistanceFlag = riskFlags.longDistanceFlag || Boolean(std.longDistanceFlag);
          riskFlags.overnightRisk = riskFlags.overnightRisk || Boolean(std.overnightRisk);
          riskFlags.mountainRoadFlag = riskFlags.mountainRoadFlag || Boolean(std.mountainRoadFlag);
          riskFlags.borderCrossingFlag = riskFlags.borderCrossingFlag || Boolean(std.borderCrossingFlag);
          riskFlags.airportRouteFlag = riskFlags.airportRouteFlag || Boolean(std.airportRouteFlag);
        }
      }
      if (leg.estimatedStopMinutes != null) {
        totalEstimatedStopMinutes += Number(leg.estimatedStopMinutes);
      }
      // Flow string — push the FROM of the first leg, then each TO.
      if (i === 0 && leg.fromArea?.name) flowAreaNames.push(leg.fromArea.name);
      if (leg.toArea?.name) flowAreaNames.push(leg.toArea.name);
    }

    // Total operational duration = drive duration + buffer + stop time,
    // expressed in minutes.
    const totalOperationalDurationMinutes =
      totalDriveDurationHours * 60 + totalBufferMinutes + totalEstimatedStopMinutes;

    return {
      touringRouteId,
      legCount: legs.length,
      driveLegCount: legs.filter((l: any) => l.legType === 'DRIVE').length,
      stopLegCount: legs.filter((l: any) => l.legType !== 'DRIVE').length,
      missingRouteStandardCount,
      driveLegsWithDistance,
      driveLegsWithDuration,
      totalDriveDistanceKm: Number(totalDriveDistanceKm.toFixed(2)),
      totalDriveDurationHours: Number(totalDriveDurationHours.toFixed(2)),
      totalBufferMinutes,
      totalEstimatedStopMinutes,
      totalOperationalDurationMinutes: Math.round(totalOperationalDurationMinutes),
      totalOperationalDurationHours: Number((totalOperationalDurationMinutes / 60).toFixed(2)),
      riskFlags,
      // "Amman City → Madaba → Mount Nebo → Petra Visitor Center"
      flow: flowAreaNames.join(' → '),
    };
  }
}
