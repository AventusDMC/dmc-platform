import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Rehearsal Scoring v1 — computes operator validation metrics over a time
// window. A "rehearsal session" is just a recent window of DispatchEvents
// (no schema state). The frontend records the start timestamp in URL state
// and asks this service for a live scorecard.
//
// What we measure:
//   - Time-to-detect: minutes between an incident's serviceDate and the
//     first ISSUE_RAISED event in the window (proxy: operator noticed it)
//   - Time-to-resolve: minutes between ISSUE_RAISED and ISSUE_RESOLVED
//   - Friction signals: rows with multiple REASSIGNED_* events on the same
//     resource type (hesitation loop)
//   - Workload distribution: per-actor action counts
//   - Completion rate: services COMPLETED in window vs services touched

@Injectable()
export class RehearsalScoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getScorecard(input: { sinceMinutes?: number; actor?: string } = {}) {
    const sinceMinutes = Math.max(1, Math.min(Number(input.sinceMinutes) || 60, 24 * 60));
    const since = new Date(Date.now() - sinceMinutes * 60_000);

    const eventsWhere: Record<string, unknown> = { occurredAt: { gte: since } };
    if (input.actor) eventsWhere.actor = input.actor;

    const [events, completedServices, openIncidents] = await Promise.all([
      (this.prisma as any).dispatchEvent.findMany({
        where: eventsWhere,
        orderBy: [{ occurredAt: 'asc' }],
        select: {
          id: true,
          bookingServiceId: true,
          eventType: true,
          occurredAt: true,
          actor: true,
          severity: true,
          notes: true,
        },
      }),
      (this.prisma.bookingService as any).count({
        where: { completedAt: { gte: since } },
      }),
      (this.prisma.bookingService as any).count({
        where: { executionStatus: 'ISSUE' as any, issueReportedAt: { gte: since } },
      }),
    ]);

    // Pair ISSUE_RAISED → ISSUE_RESOLVED per service.
    const raisedByService = new Map<string, Date[]>();
    const resolutions: number[] = [];
    for (const e of events as Array<{
      bookingServiceId: string | null;
      eventType: string;
      occurredAt: Date;
    }>) {
      if (!e.bookingServiceId) continue;
      const list = raisedByService.get(e.bookingServiceId) || [];
      if (e.eventType === 'ISSUE_RAISED') {
        list.push(e.occurredAt);
        raisedByService.set(e.bookingServiceId, list);
      } else if (e.eventType === 'ISSUE_RESOLVED') {
        const last = list.pop();
        if (last) {
          resolutions.push(e.occurredAt.getTime() - last.getTime());
          raisedByService.set(e.bookingServiceId, list);
        }
      }
    }

    const avgResolutionMinutes =
      resolutions.length > 0
        ? Math.round(resolutions.reduce((s, n) => s + n, 0) / resolutions.length / 60_000)
        : null;
    const fastestResolutionMinutes =
      resolutions.length > 0 ? Math.round(Math.min(...resolutions) / 60_000) : null;
    const slowestResolutionMinutes =
      resolutions.length > 0 ? Math.round(Math.max(...resolutions) / 60_000) : null;

    // Friction signals — count rows with ≥2 reassignment events on the
    // same resource type within the window (hesitation loop).
    const reassignmentEventTypes = new Set([
      'REASSIGNED_DRIVER',
      'REASSIGNED_VEHICLE',
      'REASSIGNED_GUIDE',
      'REASSIGNED_SUPPLIER',
    ]);
    const reassignByServiceAndType = new Map<string, Map<string, number>>();
    for (const e of events as Array<{ bookingServiceId: string | null; eventType: string }>) {
      if (!e.bookingServiceId || !reassignmentEventTypes.has(e.eventType)) continue;
      const inner = reassignByServiceAndType.get(e.bookingServiceId) || new Map<string, number>();
      inner.set(e.eventType, (inner.get(e.eventType) || 0) + 1);
      reassignByServiceAndType.set(e.bookingServiceId, inner);
    }
    let hesitationLoops = 0;
    let multiTouchServices = 0;
    for (const [, inner] of reassignByServiceAndType.entries()) {
      const totalReassignments = [...inner.values()].reduce((s, n) => s + n, 0);
      if (totalReassignments >= 2) multiTouchServices += 1;
      for (const n of inner.values()) {
        if (n >= 2) hesitationLoops += 1;
      }
    }

    // Per-actor workload.
    type ActorStat = {
      actor: string;
      totalActions: number;
      dispatches: number;
      resolutions: number;
      reassignments: number;
      escalations: number;
    };
    const actorMap = new Map<string, ActorStat>();
    for (const e of events as Array<{ actor: string | null; eventType: string }>) {
      const key = e.actor || 'system';
      const cur =
        actorMap.get(key) || {
          actor: key,
          totalActions: 0,
          dispatches: 0,
          resolutions: 0,
          reassignments: 0,
          escalations: 0,
        };
      cur.totalActions += 1;
      if (e.eventType === 'DISPATCHED') cur.dispatches += 1;
      if (e.eventType === 'ISSUE_RESOLVED') cur.resolutions += 1;
      if (reassignmentEventTypes.has(e.eventType)) cur.reassignments += 1;
      if (e.eventType === 'ISSUE_ESCALATED') cur.escalations += 1;
      actorMap.set(key, cur);
    }
    const actorStats = [...actorMap.values()].sort((a, b) => b.totalActions - a.totalActions);

    // Event-type breakdown for scorecard.
    const eventTypeBreakdown = new Map<string, number>();
    for (const e of events as Array<{ eventType: string }>) {
      eventTypeBreakdown.set(e.eventType, (eventTypeBreakdown.get(e.eventType) || 0) + 1);
    }

    // Sub-scores 0-100. Heuristics; informational.
    const dispatchEfficiency = (() => {
      const dispatched = eventTypeBreakdown.get('DISPATCHED') || 0;
      const cancelled = eventTypeBreakdown.get('CANCELLED') || 0;
      const completed = eventTypeBreakdown.get('COMPLETED') || 0;
      const denom = dispatched + cancelled + completed;
      if (denom === 0) return null;
      return Math.round((completed / denom) * 100);
    })();
    const recoverySpeed = (() => {
      if (avgResolutionMinutes == null) return null;
      // <5m great, 5-15m good, 15-30m amber, >30 poor.
      if (avgResolutionMinutes < 5) return 100;
      if (avgResolutionMinutes < 15) return 80;
      if (avgResolutionMinutes < 30) return 60;
      if (avgResolutionMinutes < 60) return 40;
      return 20;
    })();
    const frictionScore = (() => {
      if (events.length === 0) return null;
      // Start at 100, -10 per hesitation loop, -5 per multi-touch service.
      return Math.max(0, 100 - hesitationLoops * 10 - multiTouchServices * 5);
    })();
    const completionScore = (() => {
      const issuesRaised = eventTypeBreakdown.get('ISSUE_RAISED') || 0;
      const resolved = eventTypeBreakdown.get('ISSUE_RESOLVED') || 0;
      if (issuesRaised === 0) return null;
      return Math.round((resolved / issuesRaised) * 100);
    })();

    // Aggregate session score: average of sub-scores that are non-null.
    const subScores = [dispatchEfficiency, recoverySpeed, frictionScore, completionScore].filter(
      (s): s is number => s != null,
    );
    const aggregateScore = subScores.length > 0
      ? Math.round(subScores.reduce((s, n) => s + n, 0) / subScores.length)
      : null;

    return {
      window: {
        sinceMinutes,
        sinceIso: since.toISOString(),
      },
      totals: {
        events: events.length,
        completedServices,
        openIncidentsInWindow: openIncidents,
        issuesRaised: eventTypeBreakdown.get('ISSUE_RAISED') || 0,
        issuesResolved: eventTypeBreakdown.get('ISSUE_RESOLVED') || 0,
        escalations: eventTypeBreakdown.get('ISSUE_ESCALATED') || 0,
        reassignments: [...reassignmentEventTypes].reduce(
          (s, t) => s + (eventTypeBreakdown.get(t) || 0),
          0,
        ),
        dispatches: eventTypeBreakdown.get('DISPATCHED') || 0,
        completions: eventTypeBreakdown.get('COMPLETED') || 0,
      },
      timing: {
        avgResolutionMinutes,
        fastestResolutionMinutes,
        slowestResolutionMinutes,
        sampleSize: resolutions.length,
      },
      friction: {
        hesitationLoops,
        multiTouchServices,
      },
      scores: {
        aggregate: aggregateScore,
        dispatchEfficiency,
        recoverySpeed,
        friction: frictionScore,
        completion: completionScore,
      },
      actorStats,
      // Last N events for the playback timeline.
      eventReplay: (events as any[]).slice(-50).reverse(),
    };
  }

  // Rehearsal scenarios — surface for the frontend picker. We reuse the
  // existing simulation + scale simulation scenarios; this just gives them
  // operator-friendly framing in the rehearsal context.
  listScenarios() {
    return [
      {
        key: 'airport-arrival-rush',
        label: 'Airport Arrival Rush',
        description: 'Apply 3 flight delays simultaneously. Operator must reassign drivers and recover all transfers.',
        recommendedSimAction: 'flight-delay',
        targetScore: 85,
      },
      {
        key: 'hotel-checkin-storm',
        label: 'Simultaneous Hotel Check-ins',
        description: 'Apply 2 hotel overbooking scenarios. Operator must move guests and reassign rooming.',
        recommendedSimAction: 'hotel-overbooking',
        targetScore: 80,
      },
      {
        key: 'driver-shortage',
        label: 'Driver Shortage',
        description: 'Apply 4 driver delays across transport rows. Operator must reassign across the available pool.',
        recommendedSimAction: 'driver-delay',
        targetScore: 80,
      },
      {
        key: 'supplier-no-show',
        label: 'Supplier No-Show',
        description: 'A critical supplier no-shows. Operator must replace immediately to avoid SLA breach.',
        recommendedSimAction: 'supplier-no-show',
        targetScore: 75,
      },
      {
        key: 'guide-late-cascade',
        label: 'Guide Late Cascade',
        description: 'Apply guide-late to multiple activities — operator must coordinate replacements or delay tours.',
        recommendedSimAction: 'guide-late',
        targetScore: 80,
      },
      {
        key: 'missing-passenger',
        label: 'Missing Passenger',
        description: 'A passenger misses pickup. Operator must decide: wait, depart, or reschedule.',
        recommendedSimAction: 'missing-passenger',
        targetScore: 85,
      },
      {
        key: 'crisis-day',
        label: 'Crisis Day · Cascading Failure',
        description: 'Apply the Crisis Day scale preset (50 services, 50% incidents, 70% forced conflicts). Stress test full operator capacity.',
        recommendedSimAction: 'scale-crisis-day',
        targetScore: 70,
      },
    ];
  }
}
