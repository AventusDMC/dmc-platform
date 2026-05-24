import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { IntelligenceService } from './intelligence.service';
import { ResourcesService } from '../resources/resources.service';

// Executive Operational Intelligence v1 — rolls up the existing analytics
// services (operational + financial + resources) into one scannable
// management view. Adds executive-specific computations:
//   * cross-window trend deltas (this period vs the previous one)
//   * top-of-class summary cards (most profitable supplier, biggest leakage
//     source, biggest bottleneck, most overloaded route)
//   * strategic alerts (combine signals from multiple sources)
//   * operations team rollup (per-actor DispatchEvent performance)
@Injectable()
export class ExecutiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: IntelligenceService,
    private readonly financial: FinancialIntelligenceService,
    private readonly resources: ResourcesService,
  ) {}

  async getDashboard(input: { rangeDays?: number } = {}) {
    const rangeDays = Math.max(7, Math.min(Number(input.rangeDays) || 30, 90));
    const previousRangeDays = rangeDays; // same-length comparison window

    const [ops, financial, conflicts, utilization, teamStats, previousOps, previousFinancial] = await Promise.all([
      this.safe('intelligence', () => this.intelligence.getDashboard({ rangeDays }), null),
      this.safe('financial', () => this.financial.getDashboard({ rangeDays }), null),
      this.safe('conflicts', () => this.resources.findConflicts({ rangeDays: 14 }), null),
      this.safe('utilization', () => this.resources.getUtilization({ rangeDays: 7 }), null),
      this.safe('team', () => this.computeTeamStats({ rangeDays }), [] as any[]),
      // Previous period for delta comparison.
      this.safe(
        'previousOps',
        () => this.computePeriodCounts({ rangeDays: previousRangeDays, offsetDays: rangeDays }),
        { incidents: 0, completed: 0, delayed: 0, leakage: 0 },
      ),
      this.safe(
        'previousFinancial',
        () => this.computePeriodCounts({ rangeDays: previousRangeDays, offsetDays: rangeDays }),
        { incidents: 0, completed: 0, delayed: 0, leakage: 0 },
      ),
    ]);

    // ---- Executive KPIs ---------------------------------------------------
    const totalServices = ops?.efficiency?.totalServices ?? 0;
    const completionPct = ops?.efficiency?.completionPct ?? 0;
    const delayedPct = ops?.efficiency?.delayedPct ?? 0;
    const completedOnTimePct = ops?.efficiency?.completedOnTimePct ?? 0;
    const incidentCount = ops?.sla?.totalIncidents ?? 0;
    const incidentFrequencyPct = totalServices > 0 ? Math.round((incidentCount / totalServices) * 100) : 0;
    const slaBreachPct =
      incidentCount > 0
        ? Math.round(((ops?.sla?.escalationCount ?? 0) / incidentCount) * 100)
        : 0;
    const recoverySuccessPct =
      incidentCount > 0
        ? Math.round(((ops?.sla?.resolvedIncidents ?? 0) / incidentCount) * 100)
        : 0;
    // Operational profitability proxy: 100 - delayed% - margin leakage % of services
    // (we don't have revenue-side data so we approximate with operational completion).
    const leakagePerServiceWeight = totalServices > 0 ? Math.round((financial?.summary?.avgLeakagePerService ?? 0) * 10) / 10 : 0;
    const operationalHealthScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          completionPct - delayedPct * 0.5 - (incidentFrequencyPct > 0 ? incidentFrequencyPct * 0.3 : 0),
        ),
      ),
    );
    // Aggregate supplier reliability — average of supplier reliability scores
    // weighted by service count.
    const supplierReliabilityPct = this.weightedAvg(
      (financial?.suppliers || []).map((s: any) => ({ value: s.reliabilityScore, weight: s.totalServices })),
    );

    const kpis = {
      operationalHealthScore,
      operationalProfitabilityScore: Math.max(0, Math.min(100, 100 - leakagePerServiceWeight * 4)),
      marginLeakagePct: this.pct(financial?.summary?.estimatedTotalLeakage ?? 0, Math.max(1, totalServices) * 100),
      incidentFrequencyPct,
      slaBreachPct,
      dispatchCompletionPct: completionPct,
      supplierReliabilityPct,
      recoverySuccessPct,
      delayedOperationsPct: delayedPct,
      onTimePct: completedOnTimePct,
      unresolvedIssueAgeMinutes: ops?.sla?.oldestUnresolvedAgeMinutes ?? null,
    };

    // ---- Financial exposure block (passes through financial service) -----
    const financialExposure = {
      totalEstimatedLeakage: financial?.summary?.estimatedTotalLeakage ?? 0,
      estimatedCompensationExposure: financial?.summary?.openSlaExposure ?? 0,
      // Modelled estimates from leakage categories.
      supplierRecoveryCost:
        (financial?.leakageByCategory || []).find((c: any) => c.category === 'Supplier replacements')?.amount ?? 0,
      reassignmentExposure:
        (financial?.leakageByCategory || []).find((c: any) => c.category === 'Reassignments')?.amount ?? 0,
      delayExposure: (financial?.leakageByCategory || []).find((c: any) => c.category === 'Delays')?.amount ?? 0,
      avgLeakagePerService: financial?.summary?.avgLeakagePerService ?? 0,
    };

    // ---- Trend deltas ----------------------------------------------------
    const currentPeriod = await this.safe(
      'currentPeriodCounts',
      () => this.computePeriodCounts({ rangeDays, offsetDays: 0 }),
      { incidents: 0, completed: 0, delayed: 0, leakage: 0 },
    );
    const deltas = {
      incidentsDelta: this.delta(currentPeriod.incidents, previousOps.incidents),
      completedDelta: this.delta(currentPeriod.completed, previousOps.completed),
      delayedDelta: this.delta(currentPeriod.delayed, previousOps.delayed),
      // Leakage delta isn't currently tracked — placeholder for future.
    };

    // ---- Top-of-class summary cards --------------------------------------
    const summaryCards = this.buildSummaryCards({
      financialSuppliers: financial?.suppliers || [],
      preferredSuppliers: financial?.preferredSuppliers || [],
      riskSuppliers: financial?.riskSuppliers || [],
      bottlenecks: ops?.bottlenecks || [],
      forecast: ops?.capacityForecast || [],
      topCostRows: financial?.topCostRows || [],
    });

    // ---- Strategic alerts (combine multiple signal sources) --------------
    const strategicAlerts = this.buildStrategicAlerts({
      financial,
      ops,
      conflicts,
      utilization,
      deltas,
    });

    return {
      rangeDays,
      window: ops?.window || { from: '', to: '' },
      kpis,
      financialExposure,
      summaryCards,
      strategicAlerts,
      deltas: { current: currentPeriod, previous: previousOps, ...deltas },
      // Pass through the source analytics for the deeper sections — no need
      // to rebuild what the underlying services already expose.
      trends: ops?.trends || [],
      capacityForecast: ops?.capacityForecast || [],
      heatmap: ops?.heatmap || [],
      bottlenecks: ops?.bottlenecks || [],
      supplierRanking: this.buildSupplierRanking(financial?.suppliers || []),
      routeIntelligence: this.buildRouteIntelligence(ops?.bottlenecks || []),
      conflictsSummary: conflicts
        ? {
            total: conflicts.counts?.total ?? 0,
            blocking: conflicts.counts?.blocking ?? 0,
            critical: conflicts.counts?.critical ?? 0,
          }
        : { total: 0, blocking: 0, critical: 0 },
      teamStats,
    };
  }

  // ---- Internals -------------------------------------------------------

  private async safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      console.error(`[executive] ${label} failed`, err);
      return fallback;
    }
  }

  // Quick period counts for delta comparison. Doesn't go through the full
  // dashboard service — just counts incidents/completions/delays in the
  // window.
  private async computePeriodCounts(input: { rangeDays: number; offsetDays: number }) {
    const end = new Date(Date.now() - input.offsetDays * 24 * 60 * 60 * 1000);
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - input.rangeDays * 24 * 60 * 60 * 1000);
    const services = await (this.prisma.bookingService as any).findMany({
      where: {
        OR: [
          { serviceDate: { gte: start, lt: end } },
          { operationalDate: { gte: start, lt: end } },
        ],
      },
      select: { id: true, executionStatus: true, delayMinutes: true, issueReportedAt: true },
    });
    return {
      incidents: services.filter((s: any) => s.issueReportedAt).length,
      completed: services.filter((s: any) => String(s.executionStatus || '').toUpperCase() === 'COMPLETED').length,
      delayed: services.filter((s: any) => Number(s.delayMinutes || 0) > 0).length,
      leakage: 0, // Not tracked at this layer — financial service computes total.
    };
  }

  // Per-operator DispatchEvent rollup — grouped by actor (email/id).
  private async computeTeamStats(input: { rangeDays: number }) {
    const since = new Date(Date.now() - input.rangeDays * 24 * 60 * 60 * 1000);
    since.setUTCHours(0, 0, 0, 0);
    const events = await (this.prisma as any).dispatchEvent.findMany({
      where: { occurredAt: { gte: since }, actor: { not: null } },
      select: { bookingServiceId: true, eventType: true, occurredAt: true, actor: true },
      orderBy: [{ occurredAt: 'asc' }],
    });
    type TeamStat = {
      actor: string;
      totalActions: number;
      dispatches: number;
      resolutions: number;
      reassignments: number;
      escalations: number;
      avgResolutionMinutes: number | null;
    };
    const byActor = new Map<string, { actor: string; events: any[] }>();
    for (const e of events as any[]) {
      const key = e.actor || 'system';
      const cur = byActor.get(key) || { actor: key as string, events: [] as any[] };
      cur.events.push(e);
      byActor.set(key, cur);
    }
    const out: TeamStat[] = [];
    for (const { actor, events: actorEvents } of byActor.values()) {
      // Pair raised/resolved by service for this actor only.
      const raisedByService = new Map<string, Date[]>();
      const resolutions: number[] = [];
      for (const e of actorEvents) {
        if (!e.bookingServiceId) continue;
        const list = raisedByService.get(e.bookingServiceId) || [];
        if (e.eventType === 'ISSUE_RAISED') {
          list.push(new Date(e.occurredAt));
          raisedByService.set(e.bookingServiceId, list);
        } else if (e.eventType === 'ISSUE_RESOLVED') {
          const last = list.pop();
          if (last) {
            resolutions.push(new Date(e.occurredAt).getTime() - last.getTime());
            raisedByService.set(e.bookingServiceId, list);
          }
        }
      }
      const avgMs = resolutions.length > 0 ? resolutions.reduce((s, n) => s + n, 0) / resolutions.length : 0;
      out.push({
        actor,
        totalActions: actorEvents.length,
        dispatches: actorEvents.filter((e: any) => e.eventType === 'DISPATCHED').length,
        resolutions: resolutions.length,
        reassignments: actorEvents.filter((e: any) =>
          ['REASSIGNED_SUPPLIER', 'REASSIGNED_DRIVER', 'REASSIGNED_VEHICLE', 'REASSIGNED_GUIDE'].includes(e.eventType),
        ).length,
        escalations: actorEvents.filter((e: any) => e.eventType === 'ISSUE_ESCALATED').length,
        avgResolutionMinutes: avgMs > 0 ? Math.round(avgMs / 60000) : null,
      });
    }
    return out.sort((a, b) => b.totalActions - a.totalActions);
  }

  private buildSummaryCards(input: {
    financialSuppliers: any[];
    preferredSuppliers: any[];
    riskSuppliers: any[];
    bottlenecks: any[];
    forecast: any[];
    topCostRows: any[];
  }) {
    return {
      mostProfitableSupplier: input.preferredSuppliers[0]
        ? { name: input.preferredSuppliers[0].name, score: input.preferredSuppliers[0].reliabilityScore, services: input.preferredSuppliers[0].totalServices }
        : null,
      highestRiskSupplier: input.riskSuppliers[0]
        ? { name: input.riskSuppliers[0].name, score: input.riskSuppliers[0].reliabilityScore, leakage: input.riskSuppliers[0].estimatedLeakage }
        : null,
      biggestBottleneck: input.bottlenecks[0]
        ? { label: input.bottlenecks[0].label, category: input.bottlenecks[0].category, insight: input.bottlenecks[0].insight }
        : null,
      mostOverloadedDay: input.forecast.find((d: any) => d.loadLevel === 'overloaded')
        ? input.forecast.find((d: any) => d.loadLevel === 'overloaded')
        : null,
      largestLeakageSource: input.topCostRows[0]
        ? {
            bookingRef: input.topCostRows[0].bookingRef,
            supplierName: input.topCostRows[0].supplierName,
            estimatedCost: input.topCostRows[0].estimatedTotalCost,
            operationType: input.topCostRows[0].operationType,
          }
        : null,
    };
  }

  private buildStrategicAlerts(input: {
    financial: any;
    ops: any;
    conflicts: any;
    utilization: any;
    deltas: any;
  }): string[] {
    const alerts: string[] = [];
    // Supplier reliability collapse — any supplier with reliability < 40.
    const collapsing = (input.financial?.suppliers || []).find((s: any) => s.reliabilityScore < 40 && s.totalServices >= 3);
    if (collapsing) {
      alerts.push(
        `🚨 Supplier reliability collapsing — ${collapsing.name} at ${collapsing.reliabilityScore}/100 across ${collapsing.totalServices} services.`,
      );
    }
    // Operational leakage spike — total leakage > $1000 in window.
    if ((input.financial?.summary?.estimatedTotalLeakage ?? 0) > 1000) {
      alerts.push(
        `📉 Operational leakage spike — ~$${Math.round(input.financial.summary.estimatedTotalLeakage)} estimated cost over the window.`,
      );
    }
    // Sustained SLA breach increase — incidents this period more than 50%
    // higher than previous.
    if (input.deltas?.incidentsDelta?.changePct >= 50 && input.deltas?.current?.incidents >= 3) {
      alerts.push(
        `📈 Sustained SLA breach increase — ${input.deltas.current.incidents} incidents (+${input.deltas.incidentsDelta.changePct}% vs prior period).`,
      );
    }
    // Resource overload risk.
    if (input.utilization?.drivers?.utilizationPct >= 80) {
      alerts.push(
        `⚠ Driver pool stretched — ${input.utilization.drivers.utilizationPct}% utilisation across ${input.utilization.drivers.active} active drivers.`,
      );
    }
    if (input.utilization?.guides?.utilizationPct >= 80) {
      alerts.push(
        `⚠ Guide pool stretched — ${input.utilization.guides.utilizationPct}% utilisation across ${input.utilization.guides.active} active guides.`,
      );
    }
    // Resource conflicts hot.
    if ((input.conflicts?.counts?.critical ?? 0) > 0) {
      alerts.push(
        `🚨 ${input.conflicts.counts.critical} critical resource conflict${input.conflicts.counts.critical === 1 ? '' : 's'} — resource is actively committed to overlapping operations.`,
      );
    }
    // Capacity forecast — any overloaded day in next 7.
    const overloadedSoon = (input.ops?.capacityForecast || []).slice(0, 7).find((d: any) => d.loadLevel === 'overloaded');
    if (overloadedSoon) {
      alerts.push(
        `📅 Capacity overload forecast — ${overloadedSoon.dayLabel} projected to exceed pool capacity (${overloadedSoon.totalServices} services).`,
      );
    }
    return alerts;
  }

  private buildSupplierRanking(suppliers: any[]) {
    return [...suppliers]
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore || b.totalServices - a.totalServices)
      .slice(0, 15)
      .map((s, idx) => ({
        rank: idx + 1,
        ...s,
      }));
  }

  // Pull route bottlenecks out of the ops bottlenecks list — sub-category of
  // operational intelligence focused on destinations.
  private buildRouteIntelligence(bottlenecks: any[]) {
    return bottlenecks.filter((b) => b.category === 'route' || b.category === 'hour').slice(0, 10);
  }

  private pct(num: number, denom: number): number {
    if (!denom || denom <= 0) return 0;
    return Math.round((num / denom) * 100);
  }

  private weightedAvg(items: Array<{ value: number; weight: number }>): number {
    let num = 0;
    let den = 0;
    for (const i of items) {
      const w = Math.max(0, i.weight);
      num += i.value * w;
      den += w;
    }
    return den > 0 ? Math.round(num / den) : 0;
  }

  private delta(current: number, previous: number) {
    if (previous === 0 && current === 0) return { absolute: 0, changePct: 0, direction: 'flat' as const };
    if (previous === 0) return { absolute: current, changePct: 100, direction: 'up' as const };
    const absolute = current - previous;
    const changePct = Math.round((absolute / previous) * 100);
    return {
      absolute,
      changePct,
      direction: changePct > 5 ? ('up' as const) : changePct < -5 ? ('down' as const) : ('flat' as const),
    };
  }
}
