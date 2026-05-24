import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Financial + Operational Convergence v1 — estimates operational cost
// leakage from incidents/delays using HEURISTIC rates (we don't yet store
// real per-incident actuals; that's an `IncidentCostEntry` schema we defer
// to v2). Every output is clearly labelled "estimated" so operators don't
// mistake these for accounting figures.
//
// All amounts in USD for consistency with the rest of the platform's
// pricing snapshots. Adjust the constants below in one place if/when we
// move to per-DMC/per-supplier rates.
const COST = {
  // Delay cost: per-minute, per-pax. A 90-min delay for 4 pax = $180.
  delayPerMinPerPax: 0.5,
  // Operational-state-change cost: idle/setup overhead each time a
  // resource is swapped mid-flight.
  driverReassignment: 50,
  vehicleReassignment: 30,
  guideReassignment: 80,
  // Replacement supplier premium — when an existing supplier no-shows or
  // is rejected and another has to be brought in last-minute. Modelled as
  // 30% of the average booking-service spend (defaults to a flat $200 when
  // no spend reference is available).
  supplierReplacementFlat: 200,
  // Hotel overbooking → relocating guests. Per affected rooming group.
  hotelMovePerRoomingGroup: 200,
  // Recovery overhead per reported incident (operator time / phone calls).
  recoveryHandlingPerIncident: 25,
};

type Severity = 'OK' | 'WARN' | 'BAD' | 'CRITICAL';

@Injectable()
export class FinancialIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(input: { rangeDays?: number } = {}) {
    const rangeDays = Math.max(7, Math.min(Number(input.rangeDays) || 30, 90));
    const now = new Date();
    const since = this.startOfUtcDay(new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000));
    const todayStart = this.startOfUtcDay(now);

    // ---- Defensive parallel fetches ---------------------------------------
    const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        console.error(`[financial-intelligence] ${label} failed`, err);
        return fallback;
      }
    };

    const [historical, events] = await Promise.all([
      safe(
        'historical',
        () =>
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
              booking: {
                select: {
                  id: true,
                  bookingRef: true,
                  pax: true,
                },
              },
            },
          }),
        [] as any[],
      ),
      safe(
        'events',
        () =>
          (this.prisma as any).dispatchEvent.findMany({
            where: { occurredAt: { gte: since } },
            select: { bookingServiceId: true, eventType: true, occurredAt: true, severity: true },
            orderBy: [{ occurredAt: 'asc' }],
          }),
        [] as any[],
      ),
    ]);

    // ---- Per-row financial impact -----------------------------------------
    // Estimate the cost leakage attributable to each historical row.
    const eventsByService = new Map<string, any[]>();
    for (const e of events) {
      if (!e.bookingServiceId) continue;
      const list = eventsByService.get(e.bookingServiceId) || [];
      list.push(e);
      eventsByService.set(e.bookingServiceId, list);
    }

    type RowImpact = {
      bookingServiceId: string;
      bookingRef: string | null;
      supplierId: string | null;
      supplierName: string | null;
      operationType: string;
      issueType: string | null;
      delayMinutes: number;
      reassignments: number;
      pax: number;
      estimatedDelayCost: number;
      estimatedReassignmentCost: number;
      estimatedSupplierReplacementCost: number;
      estimatedHotelMoveCost: number;
      estimatedRecoveryCost: number;
      estimatedTotalCost: number;
    };

    const impacts: RowImpact[] = historical.map((r: any) => {
      const evs = eventsByService.get(r.id) || [];
      const reassignments = evs.filter((e: any) =>
        ['REASSIGNED_DRIVER', 'REASSIGNED_VEHICLE', 'REASSIGNED_GUIDE', 'REASSIGNED_SUPPLIER'].includes(e.eventType),
      ).length;
      const delay = Number(r.delayMinutes || 0);
      const pax = Math.max(1, Number(r.booking?.pax || 1));
      const type = String(r.operationType || r.serviceType || '').toUpperCase();
      const issueType = String(r.issueType || '').toUpperCase();

      const delayCost = delay * pax * COST.delayPerMinPerPax;
      const reassignmentCost = evs.reduce((sum: number, e: any) => {
        if (e.eventType === 'REASSIGNED_DRIVER') return sum + COST.driverReassignment;
        if (e.eventType === 'REASSIGNED_VEHICLE') return sum + COST.vehicleReassignment;
        if (e.eventType === 'REASSIGNED_GUIDE') return sum + COST.guideReassignment;
        return sum;
      }, 0);
      const supplierReplacementCost =
        issueType === 'SUPPLIER_NO_SHOW' || evs.some((e: any) => e.eventType === 'REASSIGNED_SUPPLIER')
          ? COST.supplierReplacementFlat
          : 0;
      const hotelMoveCost = issueType === 'OVERBOOKING' ? COST.hotelMovePerRoomingGroup : 0;
      const recoveryCost = r.issueReportedAt || evs.some((e: any) => e.eventType === 'ISSUE_RAISED')
        ? COST.recoveryHandlingPerIncident
        : 0;

      const total = delayCost + reassignmentCost + supplierReplacementCost + hotelMoveCost + recoveryCost;

      return {
        bookingServiceId: r.id,
        bookingRef: r.booking?.bookingRef || null,
        supplierId: r.assignedSupplier?.id || r.supplier?.id || null,
        supplierName: r.assignedSupplier?.name || r.supplier?.name || null,
        operationType: type,
        issueType: r.issueType || null,
        delayMinutes: delay,
        reassignments,
        pax,
        estimatedDelayCost: Math.round(delayCost * 100) / 100,
        estimatedReassignmentCost: Math.round(reassignmentCost * 100) / 100,
        estimatedSupplierReplacementCost: Math.round(supplierReplacementCost * 100) / 100,
        estimatedHotelMoveCost: Math.round(hotelMoveCost * 100) / 100,
        estimatedRecoveryCost: Math.round(recoveryCost * 100) / 100,
        estimatedTotalCost: Math.round(total * 100) / 100,
      };
    });

    // ---- Aggregate margin leakage -----------------------------------------
    const totalLeakage = impacts.reduce((sum, r) => sum + r.estimatedTotalCost, 0);
    const totalDelayCost = impacts.reduce((sum, r) => sum + r.estimatedDelayCost, 0);
    const totalReassignmentCost = impacts.reduce((sum, r) => sum + r.estimatedReassignmentCost, 0);
    const totalSupplierReplacementCost = impacts.reduce((sum, r) => sum + r.estimatedSupplierReplacementCost, 0);
    const totalHotelMoveCost = impacts.reduce((sum, r) => sum + r.estimatedHotelMoveCost, 0);
    const totalRecoveryCost = impacts.reduce((sum, r) => sum + r.estimatedRecoveryCost, 0);
    const incidentCount = impacts.filter((r) => r.estimatedTotalCost > 0).length;
    const totalServices = impacts.length;

    // ---- Supplier intelligence + reliability scoring ----------------------
    const supplierMap = new Map<
      string,
      {
        id: string;
        name: string;
        totalServices: number;
        incidentCount: number;
        delayedCount: number;
        slaBreaches: number;
        completedCount: number;
        noShowCount: number;
        estimatedLeakage: number;
        // Reliability score: 0-100, higher is better.
        reliabilityScore: number;
        recoverySuccessPct: number;
      }
    >();

    for (const r of historical) {
      const s = r.assignedSupplier || r.supplier;
      if (!s) continue;
      const cur = supplierMap.get(s.id) || {
        id: s.id,
        name: s.name,
        totalServices: 0,
        incidentCount: 0,
        delayedCount: 0,
        slaBreaches: 0,
        completedCount: 0,
        noShowCount: 0,
        estimatedLeakage: 0,
        reliabilityScore: 100,
        recoverySuccessPct: 0,
      };
      cur.totalServices += 1;
      if (r.issueReportedAt || String(r.executionStatus).toUpperCase() === 'ISSUE') cur.incidentCount += 1;
      if (Number(r.delayMinutes || 0) > 0) cur.delayedCount += 1;
      if (String(r.executionStatus).toUpperCase() === 'COMPLETED') cur.completedCount += 1;
      if (String(r.issueType || '').toUpperCase() === 'SUPPLIER_NO_SHOW') cur.noShowCount += 1;
      // SLA breach if issue is older than 30 min without resolution.
      if (r.issueReportedAt) {
        const ageMin = (Date.now() - new Date(r.issueReportedAt).getTime()) / 60000;
        if (ageMin >= 30 && String(r.executionStatus).toUpperCase() === 'ISSUE') cur.slaBreaches += 1;
      }
      const impact = impacts.find((i) => i.bookingServiceId === r.id);
      if (impact) cur.estimatedLeakage += impact.estimatedTotalCost;
      supplierMap.set(s.id, cur);
    }

    // Compute reliability score per supplier.
    // Start at 100, deduct per incident class, floor at 0.
    for (const s of supplierMap.values()) {
      let score = 100;
      score -= s.incidentCount * 10;
      score -= s.delayedCount * 5;
      score -= s.slaBreaches * 15;
      score -= s.noShowCount * 20;
      const resolvedIncidents = events.filter((e: any) => {
        if (e.eventType !== 'ISSUE_RESOLVED') return false;
        const svc = historical.find((h: any) => h.id === e.bookingServiceId);
        const sid = svc?.assignedSupplier?.id || svc?.supplier?.id;
        return sid === s.id;
      }).length;
      score += resolvedIncidents * 5;
      s.reliabilityScore = Math.max(0, Math.min(100, Math.round(score)));
      s.recoverySuccessPct = s.incidentCount > 0 ? Math.round((resolvedIncidents / s.incidentCount) * 100) : 0;
      s.estimatedLeakage = Math.round(s.estimatedLeakage * 100) / 100;
    }

    const suppliers = [...supplierMap.values()].sort((a, b) => a.reliabilityScore - b.reliabilityScore);
    // Preferred suppliers — highest reliability with at least 3 services.
    const preferredSuppliers = [...supplierMap.values()]
      .filter((s) => s.totalServices >= 3)
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore)
      .slice(0, 10);
    // Worst-performing — lowest reliability with at least 2 services.
    const riskSuppliers = [...supplierMap.values()]
      .filter((s) => s.totalServices >= 2 && s.reliabilityScore < 80)
      .sort((a, b) => a.reliabilityScore - b.reliabilityScore)
      .slice(0, 10);

    // ---- Cost-by-category breakdown for the leakage panel -----------------
    const leakageByCategory = [
      { category: 'Delays', amount: totalDelayCost, color: '#f79009' },
      { category: 'Reassignments', amount: totalReassignmentCost, color: '#7e22ce' },
      { category: 'Supplier replacements', amount: totalSupplierReplacementCost, color: '#b42318' },
      { category: 'Hotel moves', amount: totalHotelMoveCost, color: '#b54708' },
      { category: 'Recovery handling', amount: totalRecoveryCost, color: '#175cd3' },
    ]
      .filter((c) => c.amount > 0)
      .map((c) => ({ ...c, amount: Math.round(c.amount * 100) / 100 }));

    // ---- SLA penalty exposure (heuristic) --------------------------------
    // For each open or unresolved CRITICAL incident, model a hypothetical
    // client compensation = delayCost × 2 (we'd refund partially + apply a
    // goodwill credit). Caps the picture at the actual delay cost; this is
    // an exposure number, not a booked liability.
    const openSlaExposure = impacts.reduce((sum, r) => {
      if (r.delayMinutes >= 30) return sum + r.estimatedDelayCost * 2;
      return sum;
    }, 0);

    // ---- Highest-cost rows (top 10) ---------------------------------------
    const topCostRows = [...impacts].sort((a, b) => b.estimatedTotalCost - a.estimatedTotalCost).slice(0, 10);

    // ---- Operational alerts ---------------------------------------------
    const alerts: string[] = [];
    if (riskSuppliers.length > 0) {
      const worst = riskSuppliers[0];
      alerts.push(
        `${worst.name} reliability ${worst.reliabilityScore}/100 — ${worst.incidentCount} incidents, est $${worst.estimatedLeakage.toFixed(0)} cost leakage in ${rangeDays}d.`,
      );
    }
    if (totalDelayCost > 500) {
      alerts.push(`Estimated delay cost over the window: $${totalDelayCost.toFixed(0)} — consider tightening turnaround windows.`);
    }
    if (totalReassignmentCost > 200) {
      alerts.push(`Estimated reassignment overhead: $${totalReassignmentCost.toFixed(0)} — frequent resource swaps eating margin.`);
    }
    if (openSlaExposure > 1000) {
      alerts.push(`SLA exposure to clients: ~$${openSlaExposure.toFixed(0)} based on current open delays — refund / compensation risk.`);
    }

    return {
      rangeDays,
      window: { from: since.toISOString().slice(0, 10), to: todayStart.toISOString().slice(0, 10) },
      heuristicRates: COST,
      summary: {
        totalServices,
        incidentCount,
        estimatedTotalLeakage: Math.round(totalLeakage * 100) / 100,
        avgLeakagePerService: totalServices > 0 ? Math.round((totalLeakage / totalServices) * 100) / 100 : 0,
        openSlaExposure: Math.round(openSlaExposure * 100) / 100,
      },
      leakageByCategory,
      preferredSuppliers,
      riskSuppliers,
      suppliers: suppliers.slice(0, 20),
      topCostRows,
      alerts,
    };
  }

  private startOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}
