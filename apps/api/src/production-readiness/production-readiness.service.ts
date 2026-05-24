import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Production Readiness v1 — aggregates data integrity, audit coverage,
// safety, performance, and operational-risk signals into one health view.
// Pure read-side; nothing here mutates state. Cheap enough to no-store SSR.
//
// Each check returns a severity ('ok' | 'warn' | 'bad') so the dashboard can
// surface anything red without the operator scanning every panel.

type CheckSeverity = 'ok' | 'warn' | 'bad';

type CheckResult = {
  key: string;
  label: string;
  severity: CheckSeverity;
  message: string;
  count?: number;
  sample?: Array<{ id: string; description?: string | null; href?: string }>;
};

@Injectable()
export class ProductionReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        console.error(`[production-readiness] ${label} failed`, err);
        return fallback;
      }
    };

    const startedAt = Date.now();
    const [dataIntegrity, operationalRisks, auditCoverage, performance, safetyAdvisories] = await Promise.all([
      safe('integrity', () => this.checkDataIntegrity(), [] as CheckResult[]),
      safe('risks', () => this.checkOperationalRisks(), [] as CheckResult[]),
      safe('audit', () => this.checkAuditCoverage(), [] as CheckResult[]),
      safe('performance', () => this.checkPerformanceSignals(), [] as CheckResult[]),
      safe('safety', () => this.checkSafetyAdvisories(), [] as CheckResult[]),
    ]);
    const elapsedMs = Date.now() - startedAt;

    const allChecks = [...dataIntegrity, ...operationalRisks, ...auditCoverage, ...performance, ...safetyAdvisories];
    const summary = {
      total: allChecks.length,
      ok: allChecks.filter((c) => c.severity === 'ok').length,
      warn: allChecks.filter((c) => c.severity === 'warn').length,
      bad: allChecks.filter((c) => c.severity === 'bad').length,
    };
    const healthScore = summary.total > 0
      ? Math.max(0, Math.round(100 - (summary.bad * 20 + summary.warn * 5)))
      : 100;

    return {
      healthScore,
      summary,
      generatedAt: new Date().toISOString(),
      computeMs: elapsedMs,
      sections: {
        dataIntegrity,
        operationalRisks,
        auditCoverage,
        performance,
        safetyAdvisories,
      },
    };
  }

  // ---- Data integrity checks --------------------------------------------

  private async checkDataIntegrity(): Promise<CheckResult[]> {
    const out: CheckResult[] = [];

    // 1) Services with assignedSupplierId pointing to a non-existent supplier.
    const orphanSuppliers = await this.prisma.$queryRawUnsafe<Array<{ id: string; description: string | null }>>(
      `SELECT bs.id, bs.description FROM "booking_services" bs
       LEFT JOIN "suppliers" s ON s.id = bs."assignedSupplierId"
       WHERE bs."assignedSupplierId" IS NOT NULL AND s.id IS NULL
       LIMIT 10`,
    );
    out.push({
      key: 'orphan-suppliers',
      label: 'Orphan supplier references',
      severity: orphanSuppliers.length > 0 ? 'bad' : 'ok',
      message: orphanSuppliers.length > 0
        ? `${orphanSuppliers.length}+ services reference a supplier that no longer exists.`
        : 'No orphan supplier references.',
      count: orphanSuppliers.length,
      sample: orphanSuppliers.map((s) => ({ id: s.id, description: s.description })),
    });

    // 2) ISSUE-state services without an issueReportedAt timestamp.
    const issueWithoutTimestamp = await (this.prisma.bookingService as any).count({
      where: { executionStatus: 'ISSUE' as any, issueReportedAt: null },
    });
    out.push({
      key: 'issue-without-timestamp',
      label: 'ISSUE rows missing issueReportedAt',
      severity: issueWithoutTimestamp > 0 ? 'warn' : 'ok',
      message: issueWithoutTimestamp > 0
        ? `${issueWithoutTimestamp} services in ISSUE state without issueReportedAt — SLA aging won't compute correctly.`
        : 'All ISSUE rows have issueReportedAt set.',
      count: issueWithoutTimestamp,
    });

    // 3) Services in IN_PROGRESS state without startedAt.
    const inProgressWithoutStart = await (this.prisma.bookingService as any).count({
      where: { executionStatus: 'IN_PROGRESS' as any, startedAt: null },
    });
    out.push({
      key: 'in-progress-without-startedAt',
      label: 'IN_PROGRESS rows missing startedAt',
      severity: inProgressWithoutStart > 0 ? 'warn' : 'ok',
      message: inProgressWithoutStart > 0
        ? `${inProgressWithoutStart} services marked IN_PROGRESS without a startedAt timestamp.`
        : 'All IN_PROGRESS rows have startedAt.',
      count: inProgressWithoutStart,
    });

    // 4) COMPLETED services without completedAt.
    const completedWithoutTimestamp = await (this.prisma.bookingService as any).count({
      where: { executionStatus: 'COMPLETED' as any, completedAt: null },
    });
    out.push({
      key: 'completed-without-timestamp',
      label: 'COMPLETED rows missing completedAt',
      severity: completedWithoutTimestamp > 0 ? 'warn' : 'ok',
      message: completedWithoutTimestamp > 0
        ? `${completedWithoutTimestamp} services marked COMPLETED without a completedAt timestamp.`
        : 'All COMPLETED rows have completedAt.',
      count: completedWithoutTimestamp,
    });

    // 5) Synthetic scale-sim leftover.
    const syntheticCount = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "booking_services" WHERE "sourceMetadata"->>'scaleSimMarker' = 'true'`,
    );
    const syntheticTotal = Number(syntheticCount[0]?.count || 0);
    out.push({
      key: 'leftover-synthetic',
      label: 'Leftover synthetic stress data',
      severity: syntheticTotal > 0 ? 'warn' : 'ok',
      message: syntheticTotal > 0
        ? `${syntheticTotal} synthetic services from a Scale Simulation run still in the database. Clear via /operations/simulation/scale.`
        : 'No leftover synthetic data.',
      count: syntheticTotal,
    });

    return out;
  }

  // ---- Operational risk checks ------------------------------------------

  private async checkOperationalRisks(): Promise<CheckResult[]> {
    const out: CheckResult[] = [];

    // Unresolved incidents open > 1 hour.
    const oldOpenIncidents = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "booking_services"
       WHERE "executionStatus" = 'ISSUE' AND "issueReportedAt" < NOW() - INTERVAL '1 hour'`,
    );
    const oldCount = Number(oldOpenIncidents[0]?.count || 0);
    out.push({
      key: 'old-open-incidents',
      label: 'Incidents unresolved > 1 hour',
      severity: oldCount > 0 ? 'bad' : 'ok',
      message: oldCount > 0
        ? `${oldCount} incident${oldCount === 1 ? '' : 's'} have been open longer than 1 hour without resolution.`
        : 'No long-running open incidents.',
      count: oldCount,
    });

    // DISPATCHED services more than 8 hours old (likely stuck).
    const stuckDispatched = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "booking_services"
       WHERE "executionStatus" = 'DISPATCHED' AND "dispatchedAt" < NOW() - INTERVAL '8 hours'`,
    );
    const stuckCount = Number(stuckDispatched[0]?.count || 0);
    out.push({
      key: 'stuck-dispatched',
      label: 'Services stuck in DISPATCHED > 8h',
      severity: stuckCount > 0 ? 'warn' : 'ok',
      message: stuckCount > 0
        ? `${stuckCount} services dispatched > 8 hours ago haven't progressed. Operator may have forgotten to mark started/completed.`
        : 'No stuck dispatch operations.',
      count: stuckCount,
    });

    // Services in past with executionStatus still READY (likely missed).
    const missedServices = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "booking_services"
       WHERE "executionStatus" = 'READY'
         AND ("serviceDate" < NOW() - INTERVAL '1 day' OR "operationalDate" < NOW() - INTERVAL '1 day')`,
    );
    const missedCount = Number(missedServices[0]?.count || 0);
    out.push({
      key: 'past-services-ready',
      label: 'Past services still READY',
      severity: missedCount > 5 ? 'bad' : missedCount > 0 ? 'warn' : 'ok',
      message: missedCount > 0
        ? `${missedCount} services with past dates are still in READY state. Likely missed without dispatch.`
        : 'No past-due services in READY state.',
      count: missedCount,
    });

    return out;
  }

  // ---- Audit trail coverage --------------------------------------------

  private async checkAuditCoverage(): Promise<CheckResult[]> {
    const out: CheckResult[] = [];

    // Events in last 24h — signal that the platform is actively used.
    const recentEvents = await (this.prisma as any).dispatchEvent.count({
      where: { occurredAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    out.push({
      key: 'recent-event-volume',
      label: 'Dispatch events (last 24h)',
      severity: 'ok',
      message: `${recentEvents} dispatch events logged in the last 24h.`,
      count: recentEvents,
    });

    // Events from `system` actor — usually means an automated action; high
    // ratio could indicate a bug where actor isn't being propagated.
    const systemEvents = await (this.prisma as any).dispatchEvent.count({
      where: { occurredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, actor: 'system' },
    });
    const totalLastWeek = await (this.prisma as any).dispatchEvent.count({
      where: { occurredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });
    const systemRatio = totalLastWeek > 0 ? Math.round((systemEvents / totalLastWeek) * 100) : 0;
    out.push({
      key: 'system-actor-ratio',
      label: 'System-actor event ratio (7d)',
      severity: systemRatio > 50 ? 'warn' : 'ok',
      message: systemRatio > 50
        ? `${systemRatio}% of last week's events were logged as actor=system. Check that actor context is being propagated.`
        : `${systemRatio}% of events from system actor — looks healthy.`,
      count: systemRatio,
    });

    return out;
  }

  // ---- Performance signals ---------------------------------------------

  private async checkPerformanceSignals(): Promise<CheckResult[]> {
    const out: CheckResult[] = [];

    // Total active services in the dispatch window (next 7 days).
    const startedAt = Date.now();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const dispatchVolume = await (this.prisma.bookingService as any).count({
      where: {
        OR: [
          { serviceDate: { gte: todayStart, lt: weekEnd } },
          { operationalDate: { gte: todayStart, lt: weekEnd } },
        ],
        executionStatus: { notIn: ['CANCELLED'] as any },
      },
    });
    const elapsedMs = Date.now() - startedAt;

    out.push({
      key: 'dispatch-volume',
      label: 'Active services in dispatch window (7d)',
      severity: dispatchVolume > 500 ? 'warn' : 'ok',
      message: dispatchVolume > 500
        ? `${dispatchVolume} active services — heavy load. Consider pagination or index review if dispatch becomes sluggish.`
        : `${dispatchVolume} active services in the next 7 days.`,
      count: dispatchVolume,
    });
    out.push({
      key: 'simple-count-timing',
      label: 'Dispatch-window count query speed',
      severity: elapsedMs > 1000 ? 'warn' : 'ok',
      message: `${elapsedMs}ms to count dispatch-window services.`,
      count: elapsedMs,
    });

    return out;
  }

  // ---- Safety advisories -----------------------------------------------

  private async checkSafetyAdvisories(): Promise<CheckResult[]> {
    const out: CheckResult[] = [];

    // Services in COMPLETED state with no supplier assigned — possible bypass.
    const completedNoSupplier = await (this.prisma.bookingService as any).count({
      where: {
        executionStatus: 'COMPLETED' as any,
        assignedSupplierId: null,
        supplierId: null,
      },
    });
    out.push({
      key: 'completed-without-supplier',
      label: 'COMPLETED without supplier',
      severity: completedNoSupplier > 0 ? 'warn' : 'ok',
      message: completedNoSupplier > 0
        ? `${completedNoSupplier} services marked COMPLETED with no supplier on record. Audit trail incomplete.`
        : 'All COMPLETED services have a supplier on record.',
      count: completedNoSupplier,
    });

    return out;
  }
}
