import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Operational Intelligence v1 — turns historical BookingService + DispatchEvent
// data into actionable analytics. Pure computation; no schema changes.
// Everything below is best-effort over the data we already have; metrics
// that need fields we don't yet model (e.g. supplier response time, guide
// language match) are omitted with a clear "n/a" rather than faked.

type Performer = {
  id: string;
  name: string;
  totalServices: number;
  incidentCount: number;
  delayedCount: number;
  completedCount: number;
  totalDelayMinutes: number;
  // Derived percentages — frontend renders these directly.
  incidentRatePct: number;
  delayedRatePct: number;
  completionPct: number;
  avgDelayMinutes: number;
};

type BottleneckEntry = {
  key: string;
  label: string;
  category: 'route' | 'hotel' | 'supplier' | 'hour' | 'day';
  totalServices: number;
  incidentCount: number;
  delayedCount: number;
  insight: string;
};

type ForecastDay = {
  date: string;
  dayLabel: string;
  totalServices: number;
  assignedDriverServices: number;
  assignedVehicleServices: number;
  assignedGuideServices: number;
  driverUtilizationPct: number;
  vehicleUtilizationPct: number;
  guideUtilizationPct: number;
  loadLevel: 'low' | 'medium' | 'high' | 'overloaded';
};

type HeatmapCell = {
  dayOfWeek: number;     // 0 = Sun, 6 = Sat
  dayLabel: string;      // "Sun" / "Mon" / ...
  bucket: 'morning' | 'afternoon' | 'evening' | 'late';
  totalServices: number;
  incidentCount: number;
};

type TrendPoint = {
  weekStart: string;
  weekLabel: string;
  dispatchedCount: number;
  completedCount: number;
  incidentCount: number;
  delayedCount: number;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  // Single fat payload — frontend renders the whole page from one SSR fetch.
  async getDashboard(input: { rangeDays?: number } = {}) {
    const rangeDays = Math.max(7, Math.min(Number(input.rangeDays) || 30, 90));
    const now = new Date();
    const since = this.startOfUtcDay(new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000));
    const todayStart = this.startOfUtcDay(now);
    const forecastEnd = new Date(todayStart.getTime() + 14 * 24 * 60 * 60 * 1000);

    // ---- Pull the data we need in parallel --------------------------------
    const [historical, forecast, events, activeCounts] = await Promise.all([
      // Historical window — drives performance / bottleneck / trend / heatmap.
      (this.prisma.bookingService as any).findMany({
        where: {
          OR: [
            { serviceDate: { gte: since, lt: todayStart } },
            { operationalDate: { gte: since, lt: todayStart } },
          ],
        },
        include: {
          supplier: { select: { id: true, name: true, type: true } },
          assignedSupplier: { select: { id: true, name: true, type: true } },
          driver: { select: { id: true, fullName: true } },
          guide: { select: { id: true, fullName: true } },
          touringRoute: { select: { id: true, name: true } },
        },
      }),
      // Forecast window — next 14 days, all assigned services.
      (this.prisma.bookingService as any).findMany({
        where: {
          OR: [
            { serviceDate: { gte: todayStart, lt: forecastEnd } },
            { operationalDate: { gte: todayStart, lt: forecastEnd } },
          ],
          executionStatus: { notIn: ['CANCELLED'] as any },
        },
        select: {
          id: true,
          serviceType: true,
          operationType: true,
          serviceDate: true,
          operationalDate: true,
          driverId: true,
          vehicleId: true,
          guideId: true,
        },
      }),
      // DispatchEvent slice for SLA + recovery metrics.
      (this.prisma as any).dispatchEvent.findMany({
        where: { occurredAt: { gte: since } },
        select: { bookingServiceId: true, eventType: true, occurredAt: true, payload: true, severity: true },
        orderBy: [{ occurredAt: 'asc' }],
      }),
      // Active resource pool counts for forecast denominators.
      Promise.all([
        (this.prisma as any).driver.count({ where: { active: true } }),
        (this.prisma as any).vehicle.count({}),
        (this.prisma.guide as any).count({ where: { active: true } }),
      ]).then(([drivers, vehicles, guides]) => ({ drivers, vehicles, guides })),
    ]);

    const total = historical.length;

    // ---- Efficiency stats -------------------------------------------------
    const completedRows = historical.filter((r: any) => String(r.executionStatus).toUpperCase() === 'COMPLETED');
    const delayedRows = historical.filter((r: any) => Number(r.delayMinutes || 0) > 0);
    const incidentRows = historical.filter((r: any) => r.issueReportedAt || String(r.executionStatus).toUpperCase() === 'ISSUE');
    const reassignmentCount = events.filter((e: any) =>
      ['REASSIGNED_SUPPLIER', 'REASSIGNED_DRIVER', 'REASSIGNED_VEHICLE', 'REASSIGNED_GUIDE'].includes(e.eventType),
    ).length;
    const efficiency = {
      totalServices: total,
      completedCount: completedRows.length,
      delayedCount: delayedRows.length,
      onTimeCount: Math.max(0, completedRows.length - delayedRows.filter((r: any) => completedRows.includes(r)).length),
      reassignmentCount,
      completedOnTimePct: this.pct(
        Math.max(0, completedRows.length - delayedRows.filter((r: any) => completedRows.includes(r)).length),
        completedRows.length,
      ),
      delayedPct: this.pct(delayedRows.length, total),
      completionPct: this.pct(completedRows.length, total),
    };

    // ---- SLA analytics ----------------------------------------------------
    const sla = this.computeSlaAnalytics(events, incidentRows);

    // ---- Performer rollups (supplier / driver / guide) --------------------
    const supplierStats = this.rollupPerformers(historical, (r: any) => {
      const s = r.assignedSupplier || r.supplier;
      return s ? { id: s.id, name: s.name } : null;
    });
    const driverStats = this.rollupPerformers(historical, (r: any) => (r.driver ? { id: r.driver.id, name: r.driver.fullName } : null));
    const guideStats = this.rollupPerformers(historical, (r: any) => (r.guide ? { id: r.guide.id, name: r.guide.fullName } : null));

    // ---- Bottlenecks ------------------------------------------------------
    const bottlenecks = this.detectBottlenecks(historical, supplierStats);

    // ---- Capacity forecast (next 14 days) --------------------------------
    const capacityForecast = this.buildForecast(forecast, activeCounts, todayStart, 14);

    // ---- Heatmap (7-day × 4-bucket) ---------------------------------------
    const heatmap = this.buildHeatmap(historical);

    // ---- Trends (last 4 weeks) -------------------------------------------
    const trends = this.buildTrends(historical, events, now);

    // ---- Intelligence warnings -------------------------------------------
    const warnings = this.buildWarnings({
      drivers: driverStats,
      suppliers: supplierStats,
      bottlenecks,
      forecast: capacityForecast,
      trends,
    });

    return {
      rangeDays,
      window: { from: since.toISOString().slice(0, 10), to: todayStart.toISOString().slice(0, 10) },
      efficiency,
      sla,
      supplierPerformance: supplierStats.slice(0, 10),
      driverPerformance: driverStats.slice(0, 10),
      guidePerformance: guideStats.slice(0, 10),
      bottlenecks,
      capacityForecast,
      heatmap,
      trends,
      warnings,
    };
  }

  // ----- Internals -------------------------------------------------------

  private computeSlaAnalytics(events: any[], incidentRows: any[]) {
    // Pair ISSUE_RAISED → ISSUE_RESOLVED per service. Use the LAST raised
    // event before each resolution (rows can have multiple incidents over
    // their lifetime).
    const raisedByService = new Map<string, Date[]>();
    const resolutions: number[] = [];
    for (const e of events) {
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
    const escalations = events.filter((e: any) => e.eventType === 'ISSUE_ESCALATED').length;
    // Oldest unresolved — find raised events without a matching resolution.
    let oldestUnresolvedAgeMin: number | null = null;
    for (const [, list] of raisedByService.entries()) {
      for (const raised of list) {
        const age = Math.floor((Date.now() - raised.getTime()) / 60000);
        if (oldestUnresolvedAgeMin == null || age > oldestUnresolvedAgeMin) oldestUnresolvedAgeMin = age;
      }
    }
    return {
      totalIncidents: incidentRows.length,
      resolvedIncidents: resolutions.length,
      avgResolutionMinutes: avgMs > 0 ? Math.round(avgMs / 60000) : null,
      escalationCount: escalations,
      oldestUnresolvedAgeMinutes: oldestUnresolvedAgeMin,
      operationalCompletionPct: this.pct(
        incidentRows.filter((r: any) => String(r.executionStatus).toUpperCase() === 'COMPLETED').length,
        incidentRows.length,
      ),
    };
  }

  private rollupPerformers(historical: any[], extractor: (row: any) => { id: string; name: string } | null): Performer[] {
    const map = new Map<string, Performer>();
    for (const row of historical) {
      const entity = extractor(row);
      if (!entity) continue;
      const key = entity.id;
      const p = map.get(key) || {
        id: entity.id,
        name: entity.name,
        totalServices: 0,
        incidentCount: 0,
        delayedCount: 0,
        completedCount: 0,
        totalDelayMinutes: 0,
        incidentRatePct: 0,
        delayedRatePct: 0,
        completionPct: 0,
        avgDelayMinutes: 0,
      };
      p.totalServices += 1;
      if (row.issueReportedAt || String(row.executionStatus).toUpperCase() === 'ISSUE') p.incidentCount += 1;
      const delay = Number(row.delayMinutes || 0);
      if (delay > 0) {
        p.delayedCount += 1;
        p.totalDelayMinutes += delay;
      }
      if (String(row.executionStatus).toUpperCase() === 'COMPLETED') p.completedCount += 1;
      map.set(key, p);
    }
    return [...map.values()]
      .map((p) => ({
        ...p,
        incidentRatePct: this.pct(p.incidentCount, p.totalServices),
        delayedRatePct: this.pct(p.delayedCount, p.totalServices),
        completionPct: this.pct(p.completedCount, p.totalServices),
        avgDelayMinutes: p.delayedCount > 0 ? Math.round(p.totalDelayMinutes / p.delayedCount) : 0,
      }))
      .sort((a, b) => b.totalServices - a.totalServices);
  }

  private detectBottlenecks(historical: any[], suppliers: Performer[]): BottleneckEntry[] {
    const out: BottleneckEntry[] = [];

    // Routes generating delays.
    const routeMap = new Map<string, { label: string; total: number; incidents: number; delayed: number }>();
    for (const row of historical) {
      const name = row.touringRoute?.name;
      if (!name) continue;
      const key = `route:${row.touringRoute.id}`;
      const cur = routeMap.get(key) || { label: name, total: 0, incidents: 0, delayed: 0 };
      cur.total += 1;
      if (row.issueReportedAt) cur.incidents += 1;
      if (Number(row.delayMinutes || 0) > 0) cur.delayed += 1;
      routeMap.set(key, cur);
    }
    for (const [key, cur] of routeMap.entries()) {
      if (cur.delayed >= 2 || cur.incidents >= 2) {
        out.push({
          key,
          label: cur.label,
          category: 'route',
          totalServices: cur.total,
          incidentCount: cur.incidents,
          delayedCount: cur.delayed,
          insight: `${cur.delayed} delays / ${cur.incidents} incidents over ${cur.total} runs`,
        });
      }
    }

    // Suppliers generating escalations (use computed supplier roll-up).
    for (const s of suppliers.slice(0, 20)) {
      if (s.incidentCount >= 2) {
        out.push({
          key: `supplier:${s.id}`,
          label: s.name,
          category: 'supplier',
          totalServices: s.totalServices,
          incidentCount: s.incidentCount,
          delayedCount: s.delayedCount,
          insight: `${s.incidentRatePct}% incident rate over ${s.totalServices} services`,
        });
      }
    }

    // Hour-of-day congestion — count services per hour bucket, flag any
    // hour with > 5 services as congested.
    const hourCounts = new Map<number, { total: number; incidents: number }>();
    for (const row of historical) {
      const time = row.startTime || row.pickupTime || row.operationalTime;
      const m = String(time || '').match(/(\d{1,2}):/);
      if (!m) continue;
      const h = Number(m[1]);
      const cur = hourCounts.get(h) || { total: 0, incidents: 0 };
      cur.total += 1;
      if (row.issueReportedAt) cur.incidents += 1;
      hourCounts.set(h, cur);
    }
    const congested = [...hourCounts.entries()]
      .filter(([, v]) => v.total >= 5)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 3);
    for (const [h, v] of congested) {
      out.push({
        key: `hour:${h}`,
        label: `${String(h).padStart(2, '0')}:00 hour`,
        category: 'hour',
        totalServices: v.total,
        incidentCount: v.incidents,
        delayedCount: 0,
        insight: `${v.total} services dispatched at this hour over the last window`,
      });
    }

    return out.sort((a, b) => b.incidentCount + b.delayedCount - (a.incidentCount + a.delayedCount));
  }

  private buildForecast(
    services: any[],
    activeCounts: { drivers: number; vehicles: number; guides: number },
    todayStart: Date,
    days: number,
  ): ForecastDay[] {
    const dayBuckets: ForecastDay[] = [];
    for (let i = 0; i < days; i++) {
      const day = new Date(todayStart.getTime() + i * 24 * 60 * 60 * 1000);
      dayBuckets.push({
        date: day.toISOString().slice(0, 10),
        dayLabel: `${DAY_LABELS[day.getUTCDay()]} ${String(day.getUTCDate()).padStart(2, '0')}`,
        totalServices: 0,
        assignedDriverServices: 0,
        assignedVehicleServices: 0,
        assignedGuideServices: 0,
        driverUtilizationPct: 0,
        vehicleUtilizationPct: 0,
        guideUtilizationPct: 0,
        loadLevel: 'low',
      });
    }
    for (const s of services) {
      const date = s.serviceDate || s.operationalDate;
      if (!date) continue;
      const key = new Date(date).toISOString().slice(0, 10);
      const slot = dayBuckets.find((d) => d.date === key);
      if (!slot) continue;
      slot.totalServices += 1;
      if (s.driverId) slot.assignedDriverServices += 1;
      if (s.vehicleId) slot.assignedVehicleServices += 1;
      if (s.guideId) slot.assignedGuideServices += 1;
    }
    for (const slot of dayBuckets) {
      slot.driverUtilizationPct = this.pct(slot.assignedDriverServices, Math.max(1, activeCounts.drivers));
      slot.vehicleUtilizationPct = this.pct(slot.assignedVehicleServices, Math.max(1, activeCounts.vehicles));
      slot.guideUtilizationPct = this.pct(slot.assignedGuideServices, Math.max(1, activeCounts.guides));
      const max = Math.max(slot.driverUtilizationPct, slot.vehicleUtilizationPct, slot.guideUtilizationPct);
      slot.loadLevel = max >= 100 ? 'overloaded' : max >= 70 ? 'high' : max >= 30 ? 'medium' : 'low';
    }
    return dayBuckets;
  }

  private buildHeatmap(historical: any[]): HeatmapCell[] {
    const cells = new Map<string, HeatmapCell>();
    const ensure = (dayOfWeek: number, bucket: HeatmapCell['bucket']) => {
      const key = `${dayOfWeek}:${bucket}`;
      let c = cells.get(key);
      if (!c) {
        c = {
          dayOfWeek,
          dayLabel: DAY_LABELS[dayOfWeek],
          bucket,
          totalServices: 0,
          incidentCount: 0,
        };
        cells.set(key, c);
      }
      return c;
    };
    for (const row of historical) {
      const date = row.serviceDate || row.operationalDate;
      if (!date) continue;
      const d = new Date(date);
      const dow = d.getUTCDay();
      const time = row.startTime || row.pickupTime || row.operationalTime;
      const m = String(time || '').match(/(\d{1,2}):/);
      const hour = m ? Number(m[1]) : null;
      let bucket: HeatmapCell['bucket'] = 'morning';
      if (hour == null) bucket = 'morning';
      else if (hour < 12) bucket = 'morning';
      else if (hour < 17) bucket = 'afternoon';
      else if (hour < 21) bucket = 'evening';
      else bucket = 'late';
      const cell = ensure(dow, bucket);
      cell.totalServices += 1;
      if (row.issueReportedAt) cell.incidentCount += 1;
    }
    // Emit all 7×4 = 28 cells even if zero so the frontend can render a
    // proper grid.
    const grid: HeatmapCell[] = [];
    for (let dow = 0; dow < 7; dow++) {
      for (const bucket of ['morning', 'afternoon', 'evening', 'late'] as const) {
        grid.push(cells.get(`${dow}:${bucket}`) || { dayOfWeek: dow, dayLabel: DAY_LABELS[dow], bucket, totalServices: 0, incidentCount: 0 });
      }
    }
    return grid;
  }

  private buildTrends(historical: any[], events: any[], now: Date): TrendPoint[] {
    const weeks: TrendPoint[] = [];
    const startOfWeek = (d: Date) => {
      const x = new Date(d);
      x.setUTCHours(0, 0, 0, 0);
      x.setUTCDate(x.getUTCDate() - x.getUTCDay());
      return x;
    };
    for (let w = 3; w >= 0; w--) {
      const wkStart = startOfWeek(new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000));
      const wkEnd = new Date(wkStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const inWeek = (date: Date) => date >= wkStart && date < wkEnd;
      const dispatched = historical.filter((r: any) => {
        const d = r.serviceDate || r.operationalDate;
        return d && inWeek(new Date(d)) && ['DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'ISSUE'].includes(String(r.executionStatus).toUpperCase());
      }).length;
      const completed = historical.filter((r: any) => r.completedAt && inWeek(new Date(r.completedAt))).length;
      const incidents = events.filter((e: any) => e.eventType === 'ISSUE_RAISED' && inWeek(new Date(e.occurredAt))).length;
      const delayed = historical.filter((r: any) => {
        const d = r.serviceDate || r.operationalDate;
        return d && inWeek(new Date(d)) && Number(r.delayMinutes || 0) > 0;
      }).length;
      weeks.push({
        weekStart: wkStart.toISOString().slice(0, 10),
        weekLabel: `${DAY_LABELS[wkStart.getUTCDay()]} ${String(wkStart.getUTCDate()).padStart(2, '0')} ${wkStart.toLocaleString('en-GB', { month: 'short' })}`,
        dispatchedCount: dispatched,
        completedCount: completed,
        incidentCount: incidents,
        delayedCount: delayed,
      });
    }
    return weeks;
  }

  private buildWarnings(input: {
    drivers: Performer[];
    suppliers: Performer[];
    bottlenecks: BottleneckEntry[];
    forecast: ForecastDay[];
    trends: TrendPoint[];
  }): string[] {
    const warnings: string[] = [];
    // Driver overload warnings (next 3 days >70% utilisation).
    const next3 = input.forecast.slice(0, 3);
    if (next3.some((d) => d.driverUtilizationPct >= 70)) {
      const days = next3.filter((d) => d.driverUtilizationPct >= 70).map((d) => d.dayLabel).join(', ');
      warnings.push(`Driver pool stretched ${next3.find((d) => d.driverUtilizationPct >= 70)?.driverUtilizationPct}%+ on ${days}.`);
    }
    if (next3.some((d) => d.vehicleUtilizationPct >= 70)) {
      const days = next3.filter((d) => d.vehicleUtilizationPct >= 70).map((d) => d.dayLabel).join(', ');
      warnings.push(`Vehicle fleet stretched ${next3.find((d) => d.vehicleUtilizationPct >= 70)?.vehicleUtilizationPct}%+ on ${days}.`);
    }
    // Top supplier with >=3 incidents — escalation spike.
    const worstSupplier = input.suppliers.find((s) => s.incidentCount >= 3);
    if (worstSupplier) {
      warnings.push(`${worstSupplier.name} produced ${worstSupplier.incidentCount} incidents over the analytics window (${worstSupplier.incidentRatePct}% incident rate).`);
    }
    // Repeat-offender driver.
    const worstDriver = input.drivers.find((d) => d.incidentCount >= 2);
    if (worstDriver) {
      warnings.push(`Driver ${worstDriver.name} flagged on ${worstDriver.incidentCount} incidents (${worstDriver.delayedRatePct}% of services delayed).`);
    }
    // Trend-up alert — incidents rising.
    if (input.trends.length >= 2) {
      const [last, prev] = [input.trends[input.trends.length - 1], input.trends[input.trends.length - 2]];
      if (last.incidentCount > prev.incidentCount * 1.5 && last.incidentCount >= 3) {
        warnings.push(`Incidents trending up — ${last.incidentCount} this week vs ${prev.incidentCount} last week.`);
      }
    }
    // Hour-bucket congestion bottleneck.
    const congested = input.bottlenecks.find((b) => b.category === 'hour');
    if (congested) {
      warnings.push(`Dispatch hot-spot at ${congested.label} — ${congested.totalServices} services concentrated.`);
    }
    return warnings;
  }

  private pct(num: number, denom: number): number {
    if (!denom || denom <= 0) return 0;
    return Math.round((num / denom) * 100);
  }

  private startOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}
