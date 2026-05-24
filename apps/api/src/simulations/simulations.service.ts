import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchEventsService } from '../dispatch-events/dispatch-events.service';

export type SimulationScenarioKey =
  | 'flight-delay'
  | 'driver-delay'
  | 'supplier-no-show'
  | 'hotel-overbooking'
  | 'missing-passenger'
  | 'guide-late';

export const SIMULATION_SCENARIOS: Array<{
  key: SimulationScenarioKey;
  label: string;
  description: string;
  expectedTargetType: 'TRANSPORT' | 'HOTEL' | 'GUIDE' | 'ACTIVITY' | 'ANY';
  defaultSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}> = [
  {
    key: 'flight-delay',
    label: 'Flight Delay',
    description:
      'Inbound flight delayed by 90 minutes. Arrival transfer and meet-&-assist shift. Dispatch timeline must reflect the slip.',
    expectedTargetType: 'TRANSPORT',
    defaultSeverity: 'MEDIUM',
  },
  {
    key: 'driver-delay',
    label: 'Driver Delay',
    description:
      'Driver running 45 min late on a transport row. Escalation warning fires; downstream services should show cascade impact.',
    expectedTargetType: 'TRANSPORT',
    defaultSeverity: 'MEDIUM',
  },
  {
    key: 'supplier-no-show',
    label: 'Supplier No-Show',
    description:
      'Supplier did not show. Operation moves to ISSUE / CRITICAL. Operator must assign a replacement supplier.',
    expectedTargetType: 'ANY',
    defaultSeverity: 'CRITICAL',
  },
  {
    key: 'hotel-overbooking',
    label: 'Hotel Overbooking',
    description:
      'Hotel cannot honour the booked rooms. Rooming issue raised; operator must reassign or move the guests.',
    expectedTargetType: 'HOTEL',
    defaultSeverity: 'HIGH',
  },
  {
    key: 'missing-passenger',
    label: 'Missing Passenger',
    description:
      'Passenger missed pickup. Manifest mismatch; transfer is blocked pending decision (wait / go / reschedule).',
    expectedTargetType: 'TRANSPORT',
    defaultSeverity: 'HIGH',
  },
  {
    key: 'guide-late',
    label: 'Guide Late',
    description:
      'Guide running 30 min late on an activity. Activity start slips; operator should reassign or notify clients.',
    expectedTargetType: 'GUIDE',
    defaultSeverity: 'MEDIUM',
  },
];

@Injectable()
export class SimulationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DispatchEventsService,
  ) {}

  listScenarios() {
    return SIMULATION_SCENARIOS;
  }

  // Public entry — pick the right service in the booking, mutate it to
  // look like the scenario happened, log a DispatchEvent describing what
  // was applied. The downstream dispatch view + execution lifecycle do the
  // rest — the simulator never reads its own state.
  async applyScenario(
    scenarioKey: SimulationScenarioKey,
    bookingId: string,
    actor?: string | null,
  ) {
    const scenario = SIMULATION_SCENARIOS.find((s) => s.key === scenarioKey);
    if (!scenario) throw new BadRequestException(`Unknown scenario: ${scenarioKey}`);

    const booking = await (this.prisma as any).booking.findUnique({
      where: { id: bookingId },
      include: {
        services: {
          orderBy: [{ serviceDate: 'asc' }, { startTime: 'asc' }],
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (!Array.isArray(booking.services) || booking.services.length === 0) {
      throw new BadRequestException('Booking has no services to simulate against');
    }

    const target = this.pickTarget(booking.services, scenario.expectedTargetType);
    if (!target) {
      throw new BadRequestException(
        `Booking has no ${scenario.expectedTargetType.toLowerCase()} service to apply ${scenario.label}`,
      );
    }

    switch (scenarioKey) {
      case 'flight-delay':
        return this.applyFlightDelay(booking.id, target, actor || null);
      case 'driver-delay':
        return this.applyDriverDelay(booking.id, target, actor || null);
      case 'supplier-no-show':
        return this.applySupplierNoShow(booking.id, target, actor || null);
      case 'hotel-overbooking':
        return this.applyHotelOverbooking(booking.id, target, actor || null);
      case 'missing-passenger':
        return this.applyMissingPassenger(booking.id, target, actor || null);
      case 'guide-late':
        return this.applyGuideLate(booking.id, target, actor || null);
      default:
        throw new BadRequestException(`Scenario ${scenarioKey} has no handler`);
    }
  }

  // Pick the first service that matches the scenario's expected target type.
  // We bias toward IN_PROGRESS > DISPATCHED > READY so the scenario lands on
  // something operationally relevant (a no-show on a future-week service is
  // less interesting than on something in the next hour).
  private pickTarget(services: any[], expected: 'TRANSPORT' | 'HOTEL' | 'GUIDE' | 'ACTIVITY' | 'ANY') {
    const candidates = services.filter((s) => this.matchesType(s, expected));
    if (candidates.length === 0) return null;
    const rank = (s: any) => {
      const exec = String(s.executionStatus || 'READY').toUpperCase();
      if (exec === 'IN_PROGRESS') return 0;
      if (exec === 'DISPATCHED') return 1;
      if (exec === 'READY') return 2;
      return 9;
    };
    return [...candidates].sort((a, b) => rank(a) - rank(b))[0];
  }

  private matchesType(service: any, expected: 'TRANSPORT' | 'HOTEL' | 'GUIDE' | 'ACTIVITY' | 'ANY') {
    if (expected === 'ANY') return true;
    const t = String(service.operationType || service.serviceType || '').toUpperCase();
    switch (expected) {
      case 'TRANSPORT':
        return t === 'TRANSPORT' || /TRANSFER|TRANSPORT/.test(t);
      case 'HOTEL':
        return t === 'HOTEL' || /ACCOMMODATION|LODGING/.test(t);
      case 'GUIDE':
        return t === 'GUIDE' || /GUIDE/.test(t);
      case 'ACTIVITY':
        return ['ACTIVITY', 'EXCURSION', 'TICKET'].includes(t) || /ACTIVITY|EXCURSION|TICKET/.test(t);
      default:
        return false;
    }
  }

  private async applyFlightDelay(bookingId: string, target: any, actor: string | null) {
    const delayMinutes = 90;
    const newTime = this.shiftHhmm(target.startTime || target.pickupTime || '08:00', delayMinutes);
    await (this.prisma as any).bookingService.update({
      where: { id: target.id },
      data: {
        startTime: newTime,
        pickupTime: target.pickupTime ? newTime : undefined,
        executionStatus: 'ISSUE' as any,
        issueReportedAt: new Date(),
        issueType: 'FLIGHT_DELAY' as any,
        issueSeverity: 'MEDIUM' as any,
        issueNotes: `Inbound flight delayed by ${delayMinutes} min. Arrival pickup shifted to ${newTime}.`,
        delayMinutes,
      },
    });
    return this.recordEvent(bookingId, target.id, 'flight-delay', {
      newPickupTime: newTime,
      delayMinutes,
      severity: 'WARNING',
      actor,
    });
  }

  private async applyDriverDelay(bookingId: string, target: any, actor: string | null) {
    const delayMinutes = 45;
    await (this.prisma as any).bookingService.update({
      where: { id: target.id },
      data: {
        executionStatus: 'ISSUE' as any,
        issueReportedAt: new Date(),
        issueType: 'DRIVER_DELAY' as any,
        issueSeverity: 'MEDIUM' as any,
        issueNotes: `Driver running ${delayMinutes} min behind. Downstream services impacted — reassign or accept slip.`,
        delayMinutes,
      },
    });
    await this.events.log({
      bookingId,
      bookingServiceId: target.id,
      eventType: 'DELAYED',
      severity: 'WARNING',
      actor,
      notes: `Driver delayed by ${delayMinutes} min`,
      payload: { delayMinutes, scenario: 'driver-delay' },
    });
    return this.recordEvent(bookingId, target.id, 'driver-delay', { delayMinutes, severity: 'WARNING', actor });
  }

  private async applySupplierNoShow(bookingId: string, target: any, actor: string | null) {
    await (this.prisma as any).bookingService.update({
      where: { id: target.id },
      data: {
        executionStatus: 'ISSUE' as any,
        issueReportedAt: new Date(),
        issueType: 'SUPPLIER_NO_SHOW' as any,
        issueSeverity: 'CRITICAL' as any,
        issueNotes:
          'Supplier did not show up. Replacement required immediately — assign a new supplier via the operations grid.',
      },
    });
    return this.recordEvent(bookingId, target.id, 'supplier-no-show', { severity: 'CRITICAL', actor });
  }

  private async applyHotelOverbooking(bookingId: string, target: any, actor: string | null) {
    await (this.prisma as any).bookingService.update({
      where: { id: target.id },
      data: {
        executionStatus: 'ISSUE' as any,
        issueReportedAt: new Date(),
        issueType: 'OVERBOOKING' as any,
        issueSeverity: 'HIGH' as any,
        issueNotes:
          'Hotel overbooked — rooms cannot be honoured as confirmed. Reassign rooms, move guests, or relocate to a sister property.',
        confirmationStatus: 'rejected' as any,
        supplierConfirmationStatus: 'REJECTED' as any,
      },
    });
    return this.recordEvent(bookingId, target.id, 'hotel-overbooking', { severity: 'CRITICAL', actor });
  }

  private async applyMissingPassenger(bookingId: string, target: any, actor: string | null) {
    await (this.prisma as any).bookingService.update({
      where: { id: target.id },
      data: {
        executionStatus: 'ISSUE' as any,
        issueReportedAt: new Date(),
        issueType: 'GUEST_MISSING' as any,
        issueSeverity: 'HIGH' as any,
        issueNotes:
          'Passenger missed pickup. Manifest mismatch. Decide: wait, depart without them, or reschedule transfer.',
      },
    });
    return this.recordEvent(bookingId, target.id, 'missing-passenger', { severity: 'WARNING', actor });
  }

  private async applyGuideLate(bookingId: string, target: any, actor: string | null) {
    const delayMinutes = 30;
    await (this.prisma as any).bookingService.update({
      where: { id: target.id },
      data: {
        executionStatus: 'ISSUE' as any,
        issueReportedAt: new Date(),
        issueType: 'GUIDE_LATE' as any,
        issueSeverity: 'MEDIUM' as any,
        issueNotes: `Guide running ${delayMinutes} min late — activity start delayed. Reassign or notify clients.`,
        delayMinutes,
      },
    });
    await this.events.log({
      bookingId,
      bookingServiceId: target.id,
      eventType: 'DELAYED',
      severity: 'WARNING',
      actor,
      notes: `Guide delayed by ${delayMinutes} min`,
      payload: { delayMinutes, scenario: 'guide-late' },
    });
    return this.recordEvent(bookingId, target.id, 'guide-late', { delayMinutes, severity: 'WARNING', actor });
  }

  // Shared envelope event — every scenario application records this so the
  // /operations/simulation event timeline can show "X scenario applied to
  // booking Y at time Z" as a single line.
  private async recordEvent(
    bookingId: string,
    bookingServiceId: string,
    scenarioKey: SimulationScenarioKey,
    payload: { delayMinutes?: number; newPickupTime?: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; actor: string | null },
  ) {
    const scenario = SIMULATION_SCENARIOS.find((s) => s.key === scenarioKey)!;
    const event = await this.events.log({
      bookingId,
      bookingServiceId,
      eventType: 'SIMULATION_SCENARIO_APPLIED',
      severity: payload.severity,
      actor: payload.actor,
      notes: `${scenario.label} applied`,
      payload: {
        scenario: scenarioKey,
        scenarioLabel: scenario.label,
        delayMinutes: payload.delayMinutes,
        newPickupTime: payload.newPickupTime,
      },
    });
    return { scenario: scenario.label, bookingServiceId, event };
  }

  // Add `minutes` to an "HH:MM"-shaped time string. Tolerant of ISO-shaped
  // inputs (takes the HH:MM portion). Wraps past 24:00 by clamping to 23:59
  // so we never produce e.g. "27:30" — operator will see the cap and adjust.
  private shiftHhmm(input: string, minutes: number): string {
    const match = String(input || '').match(/(\d{1,2}):(\d{2})/);
    if (!match) return input;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return input;
    const total = h * 60 + m + minutes;
    if (total >= 24 * 60) return '23:59';
    if (total < 0) return '00:00';
    const nh = Math.floor(total / 60);
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  }
}
