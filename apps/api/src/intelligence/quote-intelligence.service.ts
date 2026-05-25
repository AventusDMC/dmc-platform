import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Quote Intelligence v1 — lightweight operational overlay for the quote
// engine. Tells sales whether the quote they're building will be hard or
// easy to operate, which suppliers are risky, and whether the dates fall
// on already-overloaded capacity windows.
//
// Per spec: lightweight overlays only. No quote redesign, no blocking,
// no automatic rejection. Pure read-side service that returns a payload
// the quote view renders in an expandable drawer.

type WarningSeverity = 'INFO' | 'WARN' | 'CRITICAL';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type FeasibilityLabel = 'Operationally Safe' | 'Operationally Tight' | 'High Coordination Required';

type IntelligenceWarning = {
  category: 'supplier' | 'capacity' | 'leakage' | 'saturation' | 'complexity';
  severity: WarningSeverity;
  message: string;
};

// Destinations historically requiring tighter coordination — a v1 heuristic
// shortlist; refine once we have route-level cost history.
const HIGH_RECOVERY_COST_DESTINATIONS = ['petra', 'dead sea', 'wadi rum', 'airport'];

@Injectable()
export class QuoteIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getIntelligence(quoteId: string) {
    // Quote + its accepted version + items + supplier refs. We pull just
    // what the heuristics need, not the full quote graph.
    const quote = await (this.prisma.quote as any).findUnique({
      where: { id: quoteId },
      include: {
        items: {
          include: {
            activity: { select: { id: true, name: true } },
            service: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!quote) throw new NotFoundException('Quote not found');

    const warnings: IntelligenceWarning[] = [];

    // --- Factor 1: operational movement count ---
    const itemCount = (quote.items || []).length;
    const movementSeverity: WarningSeverity =
      itemCount > 30 ? 'CRITICAL' : itemCount > 15 ? 'WARN' : 'INFO';
    let movementMessage: string;
    if (itemCount > 30) {
      movementMessage = `Quote has ${itemCount} line items — high operational complexity. Expect dispatch saturation across the trip.`;
    } else if (itemCount > 15) {
      movementMessage = `Quote has ${itemCount} line items — moderate operational complexity. Plan resource allocation carefully.`;
    } else {
      movementMessage = `Quote has ${itemCount} line items — straightforward operationally.`;
    }
    warnings.push({ category: 'complexity', severity: movementSeverity, message: movementMessage });

    // --- Factor 2: high-recovery-cost destinations ---
    const text = `${quote.title || ''} ${quote.description || ''} ${(quote.items || []).map((i: any) => i.activity?.name || i.service?.name || '').join(' ')}`.toLowerCase();
    const matchedHighRiskDestinations = HIGH_RECOVERY_COST_DESTINATIONS.filter((d) => text.includes(d));
    if (matchedHighRiskDestinations.length > 0) {
      warnings.push({
        category: 'leakage',
        severity: 'WARN',
        message: `Quote includes ${matchedHighRiskDestinations
          .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
          .join(' / ')} — historically higher recovery cost per operational issue.`,
      });
    }

    // --- Factor 3: supplier reliability (lightweight direct query) ---
    // Instead of running the full FinancialIntelligence dashboard (which
    // loads 30 days of bookings + events — too heavy per quote view), we
    // count ISSUE-state services per supplier directly. Suppliers with ≥3
    // active incidents in the last 30 days surface as a warning.
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const supplierIncidents = await this.safe(
      'supplier-incidents',
      async () =>
        await this.prisma.$queryRawUnsafe<Array<{ supplierId: string; name: string; incidentCount: bigint }>>(
          `SELECT s.id AS "supplierId", s.name, COUNT(*)::bigint AS "incidentCount"
           FROM "booking_services" bs
           JOIN "suppliers" s ON s.id = COALESCE(bs."assignedSupplierId", bs."supplierId")
           WHERE bs."issueReportedAt" >= $1
           GROUP BY s.id, s.name
           HAVING COUNT(*) >= 3
           ORDER BY COUNT(*) DESC
           LIMIT 10`,
          since30d,
        ),
      [] as Array<{ supplierId: string; name: string; incidentCount: bigint }>,
    );
    for (const s of supplierIncidents) {
      if (!text.includes(String(s.name || '').toLowerCase())) continue;
      const incidentCount = Number(s.incidentCount);
      warnings.push({
        category: 'supplier',
        severity: incidentCount >= 5 ? 'CRITICAL' : 'WARN',
        message: `${s.name}: ${incidentCount} incidents in the last 30 days. Flag operations team before booking conversion.`,
      });
    }

    // --- Factor 4: dispatch saturation (lightweight count query) ---
    // Count services scheduled in next 14 days that already have heavy
    // assignment. If we're nearing the active-driver pool size for any
    // day, that's overload — but counting per-day is more expensive than
    // the warning is worth. v1 surface: simple total count vs threshold.
    const next14d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const upcomingActiveCount = await this.safe(
      'upcoming-count',
      () =>
        (this.prisma.bookingService as any).count({
          where: {
            OR: [
              { serviceDate: { gte: new Date(), lt: next14d } },
              { operationalDate: { gte: new Date(), lt: next14d } },
            ],
            executionStatus: { notIn: ['CANCELLED'] as any },
          },
        }),
      0,
    );
    const activeDriverCount = await this.safe(
      'active-drivers',
      () => (this.prisma as any).driver.count({ where: { active: true } }),
      0,
    );
    // Rule of thumb: more than 30 services per active driver in the next
    // 14 days = systemic saturation pressure.
    const servicesPerDriver = activeDriverCount > 0 ? upcomingActiveCount / activeDriverCount : 0;
    if (servicesPerDriver > 30) {
      warnings.push({
        category: 'saturation',
        severity: 'CRITICAL',
        message: `Platform-wide dispatch saturation: ${upcomingActiveCount} services across ${activeDriverCount} active drivers over the next 14 days. New bookings will add pressure.`,
      });
    } else if (servicesPerDriver > 15) {
      warnings.push({
        category: 'capacity',
        severity: 'WARN',
        message: `Capacity pressure: ${upcomingActiveCount} services across ${activeDriverCount} active drivers. Plan ahead before adding this booking.`,
      });
    }

    // --- Factor 6: passenger count + complexity ---
    if ((quote.adults || 0) + (quote.children || 0) >= 30) {
      warnings.push({
        category: 'complexity',
        severity: 'WARN',
        message: `Large group (${(quote.adults || 0) + (quote.children || 0)} pax) — coach + multi-driver coordination required, expect operational difficulty above FIT-level.`,
      });
    }

    // --- Aggregate the score ---
    const criticalCount = warnings.filter((w) => w.severity === 'CRITICAL').length;
    const warnCount = warnings.filter((w) => w.severity === 'WARN').length;
    const riskScore: RiskLevel =
      criticalCount >= 1 || warnCount >= 4 ? 'HIGH' : warnCount >= 2 ? 'MEDIUM' : 'LOW';
    const feasibilityLabel: FeasibilityLabel =
      riskScore === 'HIGH'
        ? 'High Coordination Required'
        : riskScore === 'MEDIUM'
        ? 'Operationally Tight'
        : 'Operationally Safe';

    return {
      quoteId: quote.id,
      quoteTitle: quote.title,
      summary: {
        operationalRisk: riskScore,
        feasibility: feasibilityLabel,
        warningCount: warnings.length,
        criticalCount,
        warnCount,
      },
      itemCount,
      paxCount: (quote.adults || 0) + (quote.children || 0),
      warnings,
      heuristicNote:
        'v1 heuristics — destination text matches, supplier-name matches, and forward capacity snapshots. Refine once route-level history is denser.',
    };
  }

  private async safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      console.error(`[quote-intelligence] ${label} failed`, err);
      return fallback;
    }
  }
}
