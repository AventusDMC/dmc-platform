import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RouteStandardLookupValue,
  bufferMinutesFor,
  durationMsFor,
  loadRouteStandardsForBookingServices,
} from '../route-standards/route-standard-lookup';

// v1 occupancy heuristics — fallback when no RouteStandard is available
// for a service's route. Phase 2B prefers RouteStandard.standardDurationHours
// when present; these per-type defaults only kick in for services without
// a matched canonical route standard.
const DURATION_HOURS_BY_TYPE: Record<string, number> = {
  TRANSPORT: 1.5,
  TRANSFER: 1.5,
  HOTEL: 12,
  ACCOMMODATION: 12,
  GUIDE: 4,
  GUIDING: 4,
  ACTIVITY: 3,
  EXCURSION: 3,
  TICKET: 1.5,
};
// Fallback turnaround threshold when a service has no RouteStandard.
// Phase 2B reads operationalBufferMinutes from the standard when available.
const FALLBACK_TURNAROUND_MIN = 30;

type ResourceKind = 'DRIVER' | 'VEHICLE' | 'GUIDE';

type ServiceWindow = {
  bookingServiceId: string;
  bookingId: string;
  bookingRef: string | null;
  description: string;
  operationType: string;
  serviceType: string;
  serviceDate: string | null;
  startTime: string | null;
  executionStatus: string;
  start: Date;
  end: Date;
  // Phase 2B — canonical route standard for this service (when available).
  // Drives end-time computation, turnaround threshold, and risk-flag
  // annotations on conflict reasons. Null = no standard available, fall
  // back to DURATION_HOURS_BY_TYPE + FALLBACK_TURNAROUND_MIN.
  routeStandard?: RouteStandardLookupValue | null;
};

export type ResourceConflict = {
  resourceType: ResourceKind;
  resourceId: string;
  resourceName: string;
  severity: 'WARNING' | 'BLOCKING' | 'CRITICAL';
  reason: string;
  services: Array<{
    bookingServiceId: string;
    bookingId: string;
    bookingRef: string | null;
    description: string;
    operationType: string;
    serviceDate: string | null;
    startTime: string | null;
    executionStatus: string;
  }>;
};

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  // Conflict detection across drivers, vehicles, guides. Window-bound by
  // rangeDays from today forward (default 14). Activity capacity + hotel
  // allotment conflicts defer to v2 (need capacity/allotment schema).
  async findConflicts(input: { rangeDays?: number } = {}) {
    const rangeDays = Math.max(1, Math.min(Number(input.rangeDays) || 14, 60));
    const since = this.startOfUtcDay(new Date());
    const until = new Date(since.getTime() + rangeDays * 24 * 60 * 60 * 1000);

    const services = await (this.prisma.bookingService as any).findMany({
      where: {
        OR: [
          { serviceDate: { gte: since, lt: until } },
          { operationalDate: { gte: since, lt: until } },
        ],
        // Exclude services that no longer compete for the resource.
        executionStatus: { notIn: ['COMPLETED', 'CANCELLED'] as any },
      },
      select: {
        id: true,
        bookingId: true,
        description: true,
        serviceType: true,
        operationType: true,
        serviceDate: true,
        operationalDate: true,
        startTime: true,
        pickupTime: true,
        operationalTime: true,
        executionStatus: true,
        driverId: true,
        vehicleId: true,
        guideId: true,
        sourceQuoteItemId: true,
        touringRoute: { select: { code: true } },
        booking: { select: { bookingRef: true } },
      },
    });

    // Phase 2B — batch-load RouteStandards for the whole result set so the
    // per-service window calculations and turnaround thresholds can use
    // canonical duration/buffer values instead of the per-type heuristic.
    const standardLookup = await loadRouteStandardsForBookingServices(this.prisma, services as any);

    const windows: ServiceWindow[] = services
      .map((s: any) => this.toWindow(s, standardLookup.get(s.id) || null))
      .filter((w: ServiceWindow | null): w is ServiceWindow => w !== null);

    const [drivers, vehicles, guides] = await Promise.all([
      (this.prisma as any).driver.findMany({ select: { id: true, fullName: true } }),
      (this.prisma as any).vehicle.findMany({ select: { id: true, name: true, plateNumber: true } }),
      (this.prisma.guide as any).findMany({ select: { id: true, fullName: true } }),
    ]);
    const driverName = new Map<string, string>(drivers.map((d: any) => [d.id, d.fullName] as const));
    const vehicleLabel = new Map<string, string>(
      vehicles.map((v: any) => [v.id, `${v.name}${v.plateNumber ? ` · ${v.plateNumber}` : ''}`] as const),
    );
    const guideName = new Map<string, string>(guides.map((g: any) => [g.id, g.fullName] as const));

    const driverConflicts = this.detectConflicts(
      windows.filter((w) => services.find((s: any) => s.id === w.bookingServiceId)?.driverId),
      services,
      'driverId',
      'DRIVER',
      driverName,
    );
    const vehicleConflicts = this.detectConflicts(
      windows.filter((w) => services.find((s: any) => s.id === w.bookingServiceId)?.vehicleId),
      services,
      'vehicleId',
      'VEHICLE',
      vehicleLabel,
    );
    const guideConflicts = this.detectConflicts(
      windows.filter((w) => services.find((s: any) => s.id === w.bookingServiceId)?.guideId),
      services,
      'guideId',
      'GUIDE',
      guideName,
    );

    const all = [...driverConflicts, ...vehicleConflicts, ...guideConflicts];
    return {
      rangeDays,
      counts: {
        total: all.length,
        warning: all.filter((c) => c.severity === 'WARNING').length,
        blocking: all.filter((c) => c.severity === 'BLOCKING').length,
        critical: all.filter((c) => c.severity === 'CRITICAL').length,
        driver: driverConflicts.length,
        vehicle: vehicleConflicts.length,
        guide: guideConflicts.length,
        // Hotel + activity capacity conflict tracking deferred to v2.
        hotelAllotment: 0,
        activityCapacity: 0,
      },
      driver: driverConflicts,
      vehicle: vehicleConflicts,
      guide: guideConflicts,
      hotelAllotment: [] as ResourceConflict[],
      activityCapacity: [] as ResourceConflict[],
    };
  }

  // Per-resource chronological timeline — drives the "Driver Ahmed: 08:00
  // Airport / 11:00 Petra / 14:00 Dead Sea" visualization. Pulls every
  // non-cancelled service the resource is assigned to in the window, plus
  // marks the impossible overlaps inline.
  async getTimeline(input: {
    type: 'driver' | 'vehicle' | 'guide';
    id: string;
    rangeDays?: number;
  }) {
    const rangeDays = Math.max(1, Math.min(Number(input.rangeDays) || 14, 60));
    const since = this.startOfUtcDay(new Date());
    const until = new Date(since.getTime() + rangeDays * 24 * 60 * 60 * 1000);
    const fkField = input.type === 'driver' ? 'driverId' : input.type === 'vehicle' ? 'vehicleId' : 'guideId';

    const services = await (this.prisma.bookingService as any).findMany({
      where: {
        [fkField]: input.id,
        OR: [
          { serviceDate: { gte: since, lt: until } },
          { operationalDate: { gte: since, lt: until } },
        ],
        executionStatus: { notIn: ['CANCELLED'] as any },
      },
      select: {
        id: true,
        bookingId: true,
        description: true,
        serviceType: true,
        operationType: true,
        serviceDate: true,
        operationalDate: true,
        startTime: true,
        pickupTime: true,
        operationalTime: true,
        executionStatus: true,
        sourceQuoteItemId: true,
        touringRoute: { select: { code: true } },
        booking: { select: { bookingRef: true } },
      },
    });

    const standardLookup = await loadRouteStandardsForBookingServices(this.prisma, services as any);

    const windows = services
      .map((s: any) => this.toWindow(s, standardLookup.get(s.id) || null))
      .filter((w: ServiceWindow | null): w is ServiceWindow => w !== null)
      .sort((a: ServiceWindow, b: ServiceWindow) => a.start.getTime() - b.start.getTime());

    // Mark overlaps — for each window, is there a NEXT window whose start <
    // this window's end? Use the FIRST window's route-standard buffer for
    // the TIGHT threshold (Phase 2B) so a long-distance / border / mountain
    // route gets the wider buffer it actually needs.
    const items = windows.map((w: ServiceWindow, i: number) => {
      const next: ServiceWindow | undefined = windows[i + 1];
      let conflict: 'OVERLAP' | 'TIGHT' | 'OK' = 'OK';
      let gapMinutes = 0;
      let requiredBuffer = FALLBACK_TURNAROUND_MIN;
      if (next) {
        gapMinutes = Math.round((next.start.getTime() - w.end.getTime()) / 60000);
        requiredBuffer = bufferMinutesFor(w.routeStandard, FALLBACK_TURNAROUND_MIN);
        if (gapMinutes < 0) conflict = 'OVERLAP';
        else if (gapMinutes < requiredBuffer) conflict = 'TIGHT';
      }
      return {
        bookingServiceId: w.bookingServiceId,
        bookingId: w.bookingId,
        bookingRef: w.bookingRef,
        description: w.description,
        operationType: w.operationType,
        serviceDate: w.serviceDate,
        startTime: w.startTime,
        executionStatus: w.executionStatus,
        windowStart: w.start.toISOString(),
        windowEnd: w.end.toISOString(),
        gapToNextMinutes: next ? gapMinutes : null,
        conflictWithNext: conflict,
        // Phase 2B annotations — exposed so the timeline UI can render a
        // confidence badge per stop and explain why a TIGHT gap is tight.
        routeCode: w.routeStandard?.routeCode || null,
        confidenceLabel: w.routeStandard?.confidenceLabel || null,
        requiredBufferMinutes: next ? requiredBuffer : null,
        riskFlags: w.routeStandard
          ? {
              longDistance: w.routeStandard.longDistanceFlag,
              overnight: w.routeStandard.overnightRisk,
              mountainRoad: w.routeStandard.mountainRoadFlag,
              borderCrossing: w.routeStandard.borderCrossingFlag,
              airportRoute: w.routeStandard.airportRouteFlag,
            }
          : null,
      };
    });

    return { type: input.type, resourceId: input.id, rangeDays, items };
  }

  // Utilization metrics — what % of available operating hours are each
  // resource type committed to in the window. "Available" defined as
  // `rangeDays * 10` hours per resource (a 10-hour operational day, no
  // per-resource roster yet — defer to v2 once we have one).
  async getUtilization(input: { rangeDays?: number } = {}) {
    const rangeDays = Math.max(1, Math.min(Number(input.rangeDays) || 7, 60));
    const since = this.startOfUtcDay(new Date());
    const until = new Date(since.getTime() + rangeDays * 24 * 60 * 60 * 1000);
    const operatingDayHours = 10;

    const [activeDrivers, activeVehicles, activeGuides, services] = await Promise.all([
      (this.prisma as any).driver.count({ where: { active: true } }),
      (this.prisma as any).vehicle.count({}),
      (this.prisma.guide as any).count({ where: { active: true } }),
      (this.prisma.bookingService as any).findMany({
        where: {
          OR: [
            { serviceDate: { gte: since, lt: until } },
            { operationalDate: { gte: since, lt: until } },
          ],
          executionStatus: { notIn: ['CANCELLED'] as any },
        },
        select: {
          id: true,
          serviceType: true,
          operationType: true,
          serviceDate: true,
          operationalDate: true,
          startTime: true,
          pickupTime: true,
          operationalTime: true,
          driverId: true,
          vehicleId: true,
          guideId: true,
          sourceQuoteItemId: true,
          touringRoute: { select: { code: true } },
        },
      }),
    ]);

    // Phase 2B — use Route Standards for accurate utilization. A 6h Aqaba
    // run committed to a driver is meaningfully different from a 1.5h
    // city transfer; the per-type default would understate that load.
    const standardLookup = await loadRouteStandardsForBookingServices(this.prisma, services as any);

    let driverHours = 0;
    let vehicleHours = 0;
    let guideHours = 0;
    for (const s of services) {
      const w = this.toWindow(s, standardLookup.get(s.id) || null);
      if (!w) continue;
      const hours = (w.end.getTime() - w.start.getTime()) / 3_600_000;
      if (s.driverId) driverHours += hours;
      if (s.vehicleId) vehicleHours += hours;
      if (s.guideId) guideHours += hours;
    }

    const denom = (count: number) => Math.max(1, count) * rangeDays * operatingDayHours;
    return {
      rangeDays,
      operatingDayHours,
      drivers: {
        active: Number(activeDrivers) || 0,
        committedHours: Math.round(driverHours * 10) / 10,
        availableHours: denom(activeDrivers),
        utilizationPct: Math.round((driverHours / denom(activeDrivers)) * 100),
      },
      vehicles: {
        active: Number(activeVehicles) || 0,
        committedHours: Math.round(vehicleHours * 10) / 10,
        availableHours: denom(activeVehicles),
        utilizationPct: Math.round((vehicleHours / denom(activeVehicles)) * 100),
      },
      guides: {
        active: Number(activeGuides) || 0,
        committedHours: Math.round(guideHours * 10) / 10,
        availableHours: denom(activeGuides),
        utilizationPct: Math.round((guideHours / denom(activeGuides)) * 100),
      },
    };
  }

  // ---- Internals ---------------------------------------------------------

  private toWindow(service: any, routeStandard?: RouteStandardLookupValue | null): ServiceWindow | null {
    const serviceDate = service.serviceDate || service.operationalDate;
    if (!serviceDate) return null;
    const timeStr = service.startTime || service.pickupTime || service.operationalTime || null;
    if (!timeStr) return null;
    const match = String(timeStr).match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

    const start = new Date(serviceDate);
    start.setUTCHours(hours, minutes, 0, 0);
    const opType = String(service.operationType || service.serviceType || '').toUpperCase();
    // Phase 2B: prefer RouteStandard.standardDurationHours when available;
    // fall back to the per-type heuristic for services without a standard
    // (or non-transport types where a route standard wouldn't apply).
    const fallbackHours = DURATION_HOURS_BY_TYPE[opType] || 2;
    const durationMs = durationMsFor(routeStandard, fallbackHours);
    const end = new Date(start.getTime() + durationMs);

    return {
      bookingServiceId: service.id,
      bookingId: service.bookingId,
      bookingRef: service.booking?.bookingRef || null,
      description: service.description || opType || 'Service',
      operationType: opType || 'OTHER',
      serviceType: String(service.serviceType || '').toUpperCase(),
      serviceDate: serviceDate ? new Date(serviceDate).toISOString() : null,
      startTime: timeStr,
      executionStatus: String(service.executionStatus || 'READY').toUpperCase(),
      start,
      end,
      routeStandard: routeStandard ?? null,
    };
  }

  private detectConflicts(
    windows: ServiceWindow[],
    services: any[],
    fkField: 'driverId' | 'vehicleId' | 'guideId',
    resourceType: ResourceKind,
    nameMap: Map<string, string>,
  ): ResourceConflict[] {
    // Group windows by resource id.
    const serviceById = new Map<string, any>(services.map((s) => [s.id, s] as const));
    const groups = new Map<string, ServiceWindow[]>();
    for (const w of windows) {
      const svc = serviceById.get(w.bookingServiceId);
      const rid = svc?.[fkField];
      if (!rid) continue;
      const list = groups.get(rid) || [];
      list.push(w);
      groups.set(rid, list);
    }

    const conflicts: ResourceConflict[] = [];
    for (const [resourceId, list] of groups.entries()) {
      if (list.length < 2) continue;
      // Sort by start.
      list.sort((a, b) => a.start.getTime() - b.start.getTime());
      // Pairwise sweep — collect every overlapping or tight cluster.
      for (let i = 0; i < list.length; i++) {
        const cluster: ServiceWindow[] = [list[i]];
        let worstSev: ResourceConflict['severity'] = 'WARNING';
        let worstReason = '';
        for (let j = i + 1; j < list.length; j++) {
          // Only consider same-day overlap — different days never conflict.
          if (list[j].start.toDateString() !== list[i].start.toDateString()) break;
          const overlap = list[j].start.getTime() < list[i].end.getTime();
          const gapMin = Math.round((list[j].start.getTime() - list[i].end.getTime()) / 60000);
          if (overlap) {
            cluster.push(list[j]);
            // CRITICAL if either side is already IN_PROGRESS or DISPATCHED.
            const live = [list[i].executionStatus, list[j].executionStatus].some((s) =>
              ['IN_PROGRESS', 'DISPATCHED'].includes(s),
            );
            worstSev = live ? 'CRITICAL' : 'BLOCKING';
            worstReason = live ? 'Overlapping windows; resource is actively committed' : 'Overlapping time windows';
          } else {
            // Phase 2B — use the FIRST window's route-standard buffer (the
            // window the resource is finishing). That route's flagged risk
            // dictates how much breathing room is appropriate before the
            // next pickup. Falls back to the global 30-min threshold when
            // no standard is attached.
            const requiredBuffer = bufferMinutesFor(list[i].routeStandard, FALLBACK_TURNAROUND_MIN);
            if (gapMin >= 0 && gapMin < requiredBuffer) {
              cluster.push(list[j]);
              if (worstSev === 'WARNING') {
                const standard = list[i].routeStandard;
                const flagNote = standard
                  ? standard.borderCrossingFlag
                    ? ' (border crossing — wider buffer required)'
                    : standard.mountainRoadFlag
                      ? ' (mountain road — weather-sensitive)'
                      : standard.longDistanceFlag
                        ? ' (long-distance route — driver fatigue risk)'
                        : standard.airportRouteFlag
                          ? ' (airport route — peak-hour traffic risk)'
                          : ''
                  : '';
                worstReason = `Tight turnaround — ${gapMin} min gap (< ${requiredBuffer} required${flagNote})`;
              }
            } else {
              break;
            }
          }
        }
        if (cluster.length > 1) {
          conflicts.push({
            resourceType,
            resourceId,
            resourceName: nameMap.get(resourceId) || resourceId.slice(0, 8),
            severity: worstSev,
            reason: worstReason || 'Same-resource scheduling conflict',
            services: cluster.map((c) => ({
              bookingServiceId: c.bookingServiceId,
              bookingId: c.bookingId,
              bookingRef: c.bookingRef,
              description: c.description,
              operationType: c.operationType,
              serviceDate: c.serviceDate,
              startTime: c.startTime,
              executionStatus: c.executionStatus,
            })),
          });
          // Skip ahead past this cluster to avoid re-reporting overlapping
          // pairs as separate conflicts.
          i = i + cluster.length - 1;
        }
      }
    }
    return conflicts;
  }

  private startOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}
