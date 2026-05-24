import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchEventsService } from '../dispatch-events/dispatch-events.service';

// Scale & Stress Simulation v1 — generates synthetic operational load by
// creating BookingService records on existing bookings, tagged with a
// `scaleSimMarker` flag in `sourceMetadata` so they can be cleanly removed.
// Drivers / vehicles / guides are reused across services to force resource
// conflicts; some services are seeded in ISSUE state with delayMinutes to
// generate immediate dispatch / recovery / intelligence pressure.
//
// Why synthetic services on EXISTING bookings rather than synthetic bookings:
// creating realistic Booking + Quote + snapshot chains is a big lift; for
// stress-testing the operational stack what matters is the dispatch-row
// count + conflict count + incident count, not realistic accounting.

export type ScalePresetKey = 'small-day' | 'medium-day' | 'high-season' | 'crisis-day';

type PresetConfig = {
  key: ScalePresetKey;
  label: string;
  description: string;
  bookingsToTouch: number;
  servicesPerBooking: number;
  incidentRatePct: number;       // 0-100, % of synthetic services to put in ISSUE state
  delayRatePct: number;          // 0-100, % to set delayMinutes > 0
  resourceConflictPct: number;   // 0-100, % to assign overlapping driver/vehicle/guide
};

export const SCALE_PRESETS: PresetConfig[] = [
  {
    key: 'small-day',
    label: 'Small Day',
    description: '20 pax · 2 groups · low operational load. Sanity check.',
    bookingsToTouch: 2,
    servicesPerBooking: 4,
    incidentRatePct: 0,
    delayRatePct: 0,
    resourceConflictPct: 0,
  },
  {
    key: 'medium-day',
    label: 'Medium Day',
    description: '80 pax · multiple simultaneous arrivals · mixed FIT/GROUP.',
    bookingsToTouch: 4,
    servicesPerBooking: 6,
    incidentRatePct: 10,
    delayRatePct: 15,
    resourceConflictPct: 10,
  },
  {
    key: 'high-season',
    label: 'High Season Day',
    description: '300+ pax · multiple airports · overlapping transfers · hotel + guide pressure · transport saturation.',
    bookingsToTouch: 6,
    servicesPerBooking: 12,
    incidentRatePct: 15,
    delayRatePct: 25,
    resourceConflictPct: 40,
  },
  {
    key: 'crisis-day',
    label: 'Crisis Day',
    description: 'Cascading failure — airport delays + supplier no-shows + driver shortages + hotel overbooking.',
    bookingsToTouch: 5,
    servicesPerBooking: 10,
    incidentRatePct: 50,
    delayRatePct: 60,
    resourceConflictPct: 70,
  },
];

const SERVICE_TYPE_POOL = [
  { operationType: 'TRANSPORT', description: 'Airport pickup', startTimes: ['07:30', '08:00', '08:30', '09:00', '10:00'] },
  { operationType: 'TRANSPORT', description: 'Hotel-to-hotel transfer', startTimes: ['10:30', '11:00', '14:00', '15:00'] },
  { operationType: 'HOTEL', description: 'Hotel check-in', startTimes: ['14:00', '15:00', '16:00'] },
  { operationType: 'GUIDE', description: 'Half-day city tour', startTimes: ['09:00', '14:00'] },
  { operationType: 'ACTIVITY', description: 'Petra full-day excursion', startTimes: ['07:00', '08:00'] },
  { operationType: 'ACTIVITY', description: 'Dead Sea wellness afternoon', startTimes: ['14:00', '15:00'] },
  { operationType: 'TRANSPORT', description: 'Airport drop-off', startTimes: ['18:00', '19:00', '20:00'] },
];

@Injectable()
export class ScaleSimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DispatchEventsService,
  ) {}

  listPresets() {
    return SCALE_PRESETS;
  }

  // Apply a preset — refuses if synthetic data already exists (force clear
  // first so the operator knows what they're stacking on top of).
  async applyPreset(key: ScalePresetKey, actor: string | null) {
    const preset = SCALE_PRESETS.find((p) => p.key === key);
    if (!preset) throw new BadRequestException(`Unknown preset: ${key}`);

    const existingCount = await this.countSynthetic();
    if (existingCount > 0) {
      throw new BadRequestException(
        `${existingCount} synthetic services already exist. Clear them first before applying a new preset.`,
      );
    }

    // Pick existing bookings to attach synthetic services to.
    const bookings = await (this.prisma.booking as any).findMany({
      where: { status: { not: 'cancelled' as any } },
      orderBy: [{ createdAt: 'desc' }],
      take: preset.bookingsToTouch,
      select: { id: true, bookingRef: true, pax: true },
    });
    if (bookings.length === 0) {
      throw new BadRequestException('No bookings available to attach synthetic services to. Create at least one booking first.');
    }

    // Pull resource pools — for conflict-heavy presets we reuse the same
    // small set of drivers/vehicles/guides across overlapping services.
    const [drivers, vehicles, guides] = await Promise.all([
      (this.prisma as any).driver.findMany({ where: { active: true }, take: 5, orderBy: [{ fullName: 'asc' }] }),
      (this.prisma as any).vehicle.findMany({ take: 5, orderBy: [{ name: 'asc' }] }),
      (this.prisma.guide as any).findMany({ where: { active: true }, take: 5, orderBy: [{ fullName: 'asc' }] }),
    ]);

    const batchId = `scale-${Date.now()}`;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let createdServices = 0;
    let incidentsCreated = 0;
    let conflictsForced = 0;

    for (let b = 0; b < bookings.length; b++) {
      const booking = bookings[b];
      for (let s = 0; s < preset.servicesPerBooking; s++) {
        const template = SERVICE_TYPE_POOL[(b * preset.servicesPerBooking + s) % SERVICE_TYPE_POOL.length];
        const startTime = template.startTimes[s % template.startTimes.length];
        const serviceDayOffset = Math.floor(s / 3); // spread across 1-4 days
        const serviceDate = new Date(today.getTime() + serviceDayOffset * 24 * 60 * 60 * 1000);

        // Resource assignment — for conflict-heavy presets, deliberately
        // assign the same resource to overlapping services.
        const forceConflict = Math.random() * 100 < preset.resourceConflictPct;
        const resourceIdx = forceConflict ? 0 : Math.floor(Math.random() * 5);
        const driverId = drivers[resourceIdx % Math.max(1, drivers.length)]?.id || null;
        const vehicleId = vehicles[resourceIdx % Math.max(1, vehicles.length)]?.id || null;
        const guideId = template.operationType === 'GUIDE' ? guides[resourceIdx % Math.max(1, guides.length)]?.id || null : null;

        const isIncident = Math.random() * 100 < preset.incidentRatePct;
        const isDelayed = Math.random() * 100 < preset.delayRatePct;
        const delayMinutes = isDelayed ? Math.floor(Math.random() * 90) + 15 : null;

        const data: any = {
          bookingId: booking.id,
          bookingDayId: null,
          serviceType: template.operationType,
          operationType: template.operationType,
          description: `${template.description} (sim)`,
          serviceDate,
          startTime,
          pickupTime: template.operationType === 'TRANSPORT' ? startTime : null,
          executionStatus: isIncident ? 'ISSUE' : 'READY',
          serviceOrder: s,
          ...(driverId && template.operationType === 'TRANSPORT' ? { driverId } : {}),
          ...(vehicleId && template.operationType === 'TRANSPORT' ? { vehicleId } : {}),
          ...(guideId ? { guideId } : {}),
          ...(delayMinutes ? { delayMinutes } : {}),
          ...(isIncident
            ? {
                issueReportedAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 60_000),
                issueSeverity: this.randomChoice(['MEDIUM', 'HIGH', 'CRITICAL']),
                issueType: this.randomChoice([
                  'DRIVER_DELAY',
                  'FLIGHT_DELAY',
                  'SUPPLIER_NO_SHOW',
                  'OVERBOOKING',
                  'GUEST_MISSING',
                  'GUIDE_LATE',
                ]),
                issueNotes: 'Generated by scale simulation',
              }
            : {}),
          sourceMetadata: { scaleSimMarker: true, preset: key, batchId },
        };

        try {
          await (this.prisma.bookingService as any).create({ data });
          createdServices += 1;
          if (isIncident) incidentsCreated += 1;
          if (forceConflict) conflictsForced += 1;
        } catch (err) {
          // Don't blow up the whole batch on one bad row.
          console.error('[scale-sim] failed to create synthetic service', err);
        }
      }
    }

    await this.events.log({
      bookingId: bookings[0].id,
      eventType: 'NOTE_ADDED',
      severity: 'WARNING',
      actor,
      notes: `Scale simulation: ${preset.label} applied (${createdServices} services, ${incidentsCreated} incidents, ${conflictsForced} forced conflicts)`,
      payload: { preset: preset.key, batchId, createdServices, incidentsCreated, conflictsForced },
    });

    return {
      preset: preset.label,
      batchId,
      bookingsTouched: bookings.length,
      createdServices,
      incidentsCreated,
      conflictsForced,
    };
  }

  async clearSynthetic() {
    // Prisma doesn't support JSON path predicates in deleteMany the same way
    // across providers, so use raw query for the cleanup.
    const deleted = await this.prisma.$executeRawUnsafe(
      `DELETE FROM "booking_services" WHERE "sourceMetadata"->>'scaleSimMarker' = 'true'`,
    );
    return { deletedCount: Number(deleted) || 0 };
  }

  async getStatus() {
    const count = await this.countSynthetic();
    return { syntheticServiceCount: count };
  }

  private async countSynthetic(): Promise<number> {
    const result = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "booking_services" WHERE "sourceMetadata"->>'scaleSimMarker' = 'true'`,
    );
    return result?.[0]?.count ? Number(result[0].count) : 0;
  }

  private randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
