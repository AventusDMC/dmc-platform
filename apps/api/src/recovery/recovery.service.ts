import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchEventsService } from '../dispatch-events/dispatch-events.service';

type SeverityKey = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DispatchEventsService,
  ) {}

  // Replacement suggestions — operationally the simplest version: list every
  // candidate of the right type that *could* be assigned. Bias toward the
  // currently-assigned supplier when filtering driver/vehicle pools. The UI
  // groups "Same supplier" first.
  async getSuggestions(bookingServiceId: string) {
    const service = await (this.prisma.bookingService as any).findUnique({
      where: { id: bookingServiceId },
      include: { supplier: true, assignedSupplier: true, vehicle: true, driver: true, guide: true },
    });
    if (!service) throw new NotFoundException('Service not found');

    const type = String(service.operationType || service.serviceType || '').toUpperCase();
    const isTransport = type === 'TRANSPORT' || /TRANSFER|TRANSPORT/.test(type);
    const isHotel = type === 'HOTEL' || /ACCOMMODATION|LODGING/.test(type);
    const isGuide = type === 'GUIDE' || /GUIDE/.test(type);
    const isActivity = ['ACTIVITY', 'EXCURSION', 'TICKET'].includes(type) || /ACTIVITY|EXCURSION|TICKET/.test(type);

    const currentSupplierId = service.assignedSupplierId || service.supplierId || null;

    // Suppliers — match the row's operational type from name/type free-text.
    const allSuppliers = await (this.prisma.supplier as any).findMany({});
    const supplierMatches = (s: any) => {
      const blob = `${s.type || ''} ${s.name || ''}`.toUpperCase();
      if (isTransport) return /(TRANSPORT|TRANSFER|LOGISTIC|VEHICLE|FLEET)/.test(blob);
      if (isHotel) return /(HOTEL|ACCOMMODATION|LODGING)/.test(blob);
      if (isGuide) return /(GUIDE|GUIDING)/.test(blob);
      if (isActivity) return /(ACTIVITY|EXCURSION|TOUR|ATTRACTION|EXPERIENCE)/.test(blob);
      return true;
    };
    const suppliers = allSuppliers
      .filter(supplierMatches)
      .filter((s: any) => s.id !== currentSupplierId)
      .slice(0, 8);

    // Drivers + vehicles only meaningful for transport.
    const drivers = isTransport
      ? await (this.prisma as any).driver.findMany({
          where: { active: true, id: service.driverId ? { not: service.driverId } : undefined },
          take: 8,
          orderBy: [{ fullName: 'asc' }],
        })
      : [];
    const vehicles = isTransport
      ? await (this.prisma as any).vehicle.findMany({
          where: { id: service.vehicleId ? { not: service.vehicleId } : undefined },
          take: 8,
          orderBy: [{ name: 'asc' }],
        })
      : [];
    // Guides only meaningful for guide ops.
    const guides = isGuide
      ? await (this.prisma as any).guide.findMany({
          where: { active: true, id: service.guideId ? { not: service.guideId } : undefined },
          take: 8,
          orderBy: [{ fullName: 'asc' }],
        })
      : [];

    return {
      service: {
        id: service.id,
        type,
        currentSupplierId,
        currentSupplierName: service.assignedSupplier?.name || service.supplier?.name || null,
        currentDriverId: service.driverId || null,
        currentDriverName: service.driver?.fullName || service.assignedTo || null,
        currentVehicleId: service.vehicleId || null,
        currentVehicleName: service.vehicle?.name || null,
        currentGuideId: service.guideId || null,
        currentGuideName: service.guide?.fullName || null,
      },
      suppliers: suppliers.map((s: any) => ({ id: s.id, name: s.name, type: s.type, phone: s.phone })),
      drivers: drivers.map((d: any) => ({ id: d.id, fullName: d.fullName, phone: d.phone, supplierId: d.supplierId })),
      vehicles: vehicles.map((v: any) => ({ id: v.id, name: v.name, vehicleType: v.vehicleType, plateNumber: v.plateNumber, supplierId: v.supplierId })),
      guides: guides.map((g: any) => ({ id: g.id, fullName: g.fullName, phone: g.phone, languages: g.languages })),
    };
  }

  // Cascading impact — for a given service in an issue/delayed state, what
  // else in the same booking is operationally downstream of it? v1 keeps
  // this simple: same booking, later in the schedule by date+time, plus
  // counts of affected pax / rooms / vouchers.
  async getImpact(bookingServiceId: string) {
    const service = await (this.prisma.bookingService as any).findUnique({
      where: { id: bookingServiceId },
      include: {
        booking: {
          select: {
            id: true,
            bookingRef: true,
            pax: true,
            roomingEntries: { select: { id: true, assignments: { select: { id: true } } } },
            services: {
              orderBy: [{ serviceDate: 'asc' }, { startTime: 'asc' }],
              include: { vouchers: { select: { id: true, status: true } } },
            },
          },
        },
      },
    });
    if (!service) throw new NotFoundException('Service not found');

    const all = (service.booking?.services || []) as any[];
    const thisIdx = all.findIndex((s) => s.id === bookingServiceId);
    const downstream = thisIdx >= 0 ? all.slice(thisIdx + 1) : [];

    // Pull a single downstream slice scoped to the same trip date when
    // possible — services on later days are technically "downstream" but
    // operationally less likely to be cascade-affected by a 90-min slip.
    const sameDay = downstream.filter((d) => {
      if (!service.serviceDate || !d.serviceDate) return true;
      return new Date(d.serviceDate).toDateString() === new Date(service.serviceDate).toDateString();
    });

    const passengerCount = Number(service.booking?.pax || 0);
    const roomingCount = (service.booking?.roomingEntries || []).length;
    const voucherIssuesCount = downstream.reduce((sum, d) => {
      const vs = (d.vouchers || []) as Array<{ status: string | null }>;
      const pending = vs.filter((v) => !['GENERATED', 'SENT', 'ISSUED', 'READY'].includes(String(v.status || '').toUpperCase())).length;
      return sum + (vs.length === 0 ? 1 : pending);
    }, 0);

    return {
      bookingId: service.bookingId,
      bookingRef: service.booking?.bookingRef || null,
      affectedSameDay: sameDay.map((d) => ({
        id: d.id,
        time: d.startTime || d.pickupTime || null,
        description: d.description || d.operationType || d.serviceType || 'Service',
        operationType: d.operationType || d.serviceType || null,
        executionStatus: d.executionStatus || 'READY',
      })),
      affectedDownstream: downstream.length,
      affectedPassengers: passengerCount,
      affectedRoomingGroups: roomingCount,
      affectedVouchersPending: voucherIssuesCount,
    };
  }

  // Recovery action: explicit delay. Shifts startTime/pickupTime, records the
  // delay in delayMinutes, and emits a DELAYED event.
  async delayService(
    bookingServiceId: string,
    data: { minutes: number; reason?: string | null; actor?: any },
  ) {
    if (!Number.isFinite(data.minutes) || data.minutes <= 0) {
      throw new BadRequestException('minutes must be a positive number');
    }
    const service = await (this.prisma.bookingService as any).findUnique({ where: { id: bookingServiceId } });
    if (!service) throw new NotFoundException('Service not found');

    const newPickup = this.shiftHhmm(service.pickupTime || service.startTime || '00:00', data.minutes);
    const existingDelay = Number(service.delayMinutes || 0);
    const updated = await (this.prisma.bookingService as any).update({
      where: { id: bookingServiceId },
      data: {
        delayMinutes: existingDelay + data.minutes,
        startTime: service.startTime ? newPickup : undefined,
        pickupTime: service.pickupTime ? newPickup : undefined,
      },
    });
    await this.events.log({
      bookingId: service.bookingId,
      bookingServiceId,
      eventType: 'DELAYED',
      severity: data.minutes >= 30 ? 'WARNING' : 'INFO',
      actor: this.actorLabel(data.actor),
      notes: data.reason || `Delayed by ${data.minutes} min`,
      payload: { addedMinutes: data.minutes, totalDelayMinutes: existingDelay + data.minutes, newPickupTime: newPickup },
    });
    return updated;
  }

  // Recovery action: bump severity manually (operator decided this needs to
  // escalate beyond what the SLA timer would do).
  async escalateOps(
    bookingServiceId: string,
    data: { severity: SeverityKey; notes?: string | null; actor?: any },
  ) {
    const sev = String(data.severity || '').toUpperCase() as SeverityKey;
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(sev)) {
      throw new BadRequestException('severity must be LOW, MEDIUM, HIGH, or CRITICAL');
    }
    const service = await (this.prisma.bookingService as any).findUnique({ where: { id: bookingServiceId } });
    if (!service) throw new NotFoundException('Service not found');

    const updated = await (this.prisma.bookingService as any).update({
      where: { id: bookingServiceId },
      data: {
        issueSeverity: sev as any,
        executionStatus: service.executionStatus === 'ISSUE' ? service.executionStatus : ('ISSUE' as any),
        issueReportedAt: service.issueReportedAt || new Date(),
        issueNotes: data.notes ? `${service.issueNotes ? service.issueNotes + ' | ' : ''}${data.notes}` : service.issueNotes,
      },
    });
    await this.events.log({
      bookingId: service.bookingId,
      bookingServiceId,
      eventType: 'ISSUE_ESCALATED',
      severity: sev === 'CRITICAL' || sev === 'HIGH' ? 'CRITICAL' : 'WARNING',
      actor: this.actorLabel(data.actor),
      notes: data.notes || `Escalated to ${sev}`,
      payload: { newSeverity: sev, previousSeverity: service.issueSeverity || null },
    });
    return updated;
  }

  // Operational replacement request — records the operator's intent to
  // replace someone without immediately doing the reassignment (e.g. waiting
  // for the new supplier to confirm availability). Pure event-log entry —
  // no schema change required.
  async requestReplacement(
    bookingServiceId: string,
    data: { target: 'SUPPLIER' | 'DRIVER' | 'VEHICLE' | 'GUIDE'; reason?: string | null; actor?: any },
  ) {
    const target = String(data.target || '').toUpperCase();
    if (!['SUPPLIER', 'DRIVER', 'VEHICLE', 'GUIDE'].includes(target)) {
      throw new BadRequestException('target must be SUPPLIER, DRIVER, VEHICLE, or GUIDE');
    }
    const service = await (this.prisma.bookingService as any).findUnique({ where: { id: bookingServiceId } });
    if (!service) throw new NotFoundException('Service not found');
    await this.events.log({
      bookingId: service.bookingId,
      bookingServiceId,
      eventType: 'NOTE_ADDED',
      severity: 'WARNING',
      actor: this.actorLabel(data.actor),
      notes: `Replacement requested: ${target}${data.reason ? ` — ${data.reason}` : ''}`,
      payload: { recoveryAction: 'REPLACEMENT_REQUESTED', target, reason: data.reason || null },
    });
    return { ok: true };
  }

  // Recovery metrics for the dashboard / recovery page. Computed cheap on
  // the fly from DispatchEvent counts + booking service aggregations.
  async getRecoveryMetrics(input: { rangeDays?: number } = {}) {
    const rangeDays = Math.max(1, Math.min(Number(input.rangeDays) || 7, 30));
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [resolvedToday, openIncidents, recentEvents] = await Promise.all([
      (this.prisma as any).dispatchEvent.count({
        where: { eventType: 'ISSUE_RESOLVED', occurredAt: { gte: todayStart } },
      }),
      (this.prisma.bookingService as any).count({
        where: { executionStatus: 'ISSUE' as any },
      }),
      (this.prisma as any).dispatchEvent.findMany({
        where: { occurredAt: { gte: since }, eventType: { in: ['ISSUE_RAISED', 'ISSUE_RESOLVED'] } },
        orderBy: [{ occurredAt: 'asc' }],
        select: { bookingServiceId: true, eventType: true, occurredAt: true },
      }),
    ]);

    // Average resolution time: pair each ISSUE_RESOLVED with the most-recent
    // ISSUE_RAISED for the same service preceding it.
    const raisedByService = new Map<string, Date[]>();
    const resolutions: number[] = [];
    for (const event of recentEvents as Array<{ bookingServiceId: string | null; eventType: string; occurredAt: Date }>) {
      if (!event.bookingServiceId) continue;
      const list = raisedByService.get(event.bookingServiceId) || [];
      if (event.eventType === 'ISSUE_RAISED') {
        list.push(event.occurredAt);
        raisedByService.set(event.bookingServiceId, list);
      } else if (event.eventType === 'ISSUE_RESOLVED') {
        const lastRaised = list.pop();
        if (lastRaised) {
          resolutions.push(event.occurredAt.getTime() - lastRaised.getTime());
          raisedByService.set(event.bookingServiceId, list);
        }
      }
    }
    const avgResolutionMs = resolutions.length > 0 ? Math.round(resolutions.reduce((sum, n) => sum + n, 0) / resolutions.length) : null;
    const avgResolutionMinutes = avgResolutionMs ? Math.round(avgResolutionMs / 60_000) : null;

    // Delayed ops % within the same window — services with delayMinutes > 0
    // out of all services scheduled in the window.
    const totalScheduledInWindow = await (this.prisma.bookingService as any).count({
      where: { serviceDate: { gte: since } },
    });
    const delayedInWindow = await (this.prisma.bookingService as any).count({
      where: { serviceDate: { gte: since }, delayMinutes: { gt: 0 } },
    });
    const delayedOpsPct = totalScheduledInWindow > 0 ? Math.round((delayedInWindow / totalScheduledInWindow) * 100) : 0;

    return {
      rangeDays,
      resolvedTodayCount: Number(resolvedToday) || 0,
      openIncidentsCount: Number(openIncidents) || 0,
      avgResolutionMinutes,
      delayedOpsPct,
      totalScheduledInWindow: Number(totalScheduledInWindow) || 0,
      delayedInWindow: Number(delayedInWindow) || 0,
    };
  }

  private shiftHhmm(input: string, minutes: number): string {
    const match = String(input || '').match(/(\d{1,2}):(\d{2})/);
    if (!match) return input;
    const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
    if (total >= 24 * 60) return '23:59';
    if (total < 0) return '00:00';
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  private actorLabel(actor: any): string {
    if (!actor) return 'system';
    if (typeof actor.email === 'string' && actor.email) return actor.email;
    if (typeof actor.id === 'string' && actor.id) return actor.id;
    return 'system';
  }
}
