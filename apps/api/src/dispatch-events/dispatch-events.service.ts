import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type DispatchEventTypeKey =
  | 'SIMULATION_SCENARIO_APPLIED'
  | 'ISSUE_RAISED'
  | 'ISSUE_ESCALATED'
  | 'ISSUE_RESOLVED'
  | 'DISPATCHED'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DELAYED'
  | 'REASSIGNED_SUPPLIER'
  | 'REASSIGNED_DRIVER'
  | 'REASSIGNED_VEHICLE'
  | 'REASSIGNED_GUIDE'
  | 'NOTE_ADDED';

export type DispatchEventSeverityKey = 'INFO' | 'WARNING' | 'CRITICAL';

export type DispatchEventInput = {
  bookingId: string;
  bookingServiceId?: string | null;
  eventType: DispatchEventTypeKey;
  severity?: DispatchEventSeverityKey | null;
  actor?: string | null;
  payload?: Record<string, unknown> | null;
  notes?: string | null;
};

@Injectable()
export class DispatchEventsService {
  constructor(private readonly prisma: PrismaService) {}

  // Append-only insert. Never throws into the caller — event logging must
  // not break the underlying domain operation. Errors are console.error'd
  // so they surface in Railway logs but the caller's transaction continues.
  async log(input: DispatchEventInput) {
    try {
      return await (this.prisma as any).dispatchEvent.create({
        data: {
          bookingId: input.bookingId,
          bookingServiceId: input.bookingServiceId || null,
          eventType: input.eventType as any,
          severity: (input.severity || null) as any,
          actor: input.actor || null,
          payload: (input.payload as any) || null,
          notes: input.notes || null,
        },
      });
    } catch (error) {
      console.error('[dispatch-events] log failed', input.eventType, input.bookingId, error);
      return null;
    }
  }

  // List recent events. Optionally scoped to one booking, one service, or a
  // since-cutoff. Used by /operations/simulation (global) and the
  // (future) per-booking event timeline.
  async list(filter: {
    bookingId?: string;
    bookingServiceId?: string;
    eventType?: DispatchEventTypeKey;
    since?: Date;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filter.bookingId) where.bookingId = filter.bookingId;
    if (filter.bookingServiceId) where.bookingServiceId = filter.bookingServiceId;
    if (filter.eventType) where.eventType = filter.eventType;
    if (filter.since) where.occurredAt = { gte: filter.since };
    return (this.prisma as any).dispatchEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }],
      take: Math.min(Math.max(Number(filter.limit) || 50, 1), 500),
      include: {
        booking: { select: { id: true, bookingRef: true } },
        bookingService: { select: { id: true, description: true, serviceType: true, operationType: true } },
      },
    });
  }
}
