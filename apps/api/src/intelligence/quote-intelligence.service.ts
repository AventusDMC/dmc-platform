import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { IntelligenceService } from './intelligence.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: IntelligenceService,
    private readonly financial: FinancialIntelligenceService,
  ) {}

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

    // --- Factor 3: supplier reliability ---
    // Pull the supplier reliability landscape from the financial-intel
    // service. Match suppliers by name appearing anywhere in quote text.
    const financial = await this.safe('financial', () => this.financial.getDashboard({ rangeDays: 30 }), null as any);
    if (financial?.riskSuppliers?.length) {
      const referencedRiskySuppliers = financial.riskSuppliers.filter((s: any) =>
        text.includes(String(s.name || '').toLowerCase()),
      );
      for (const s of referencedRiskySuppliers) {
        warnings.push({
          category: 'supplier',
          severity: s.reliabilityScore < 50 ? 'CRITICAL' : 'WARN',
          message: `${s.name} reliability ${s.reliabilityScore}/100 over last 30 days (${s.incidentCount} incidents). Flag operations team before booking conversion.`,
        });
      }
    }

    // --- Factor 4: dispatch saturation on quote dates ---
    // Cross-ref against the next-14-day capacity forecast. Quote doesn't
    // store specific dates the same way, so for v1 we just surface
    // *general* capacity pressure for the booking window if any forecast
    // day is overloaded.
    const opsDashboard = await this.safe('ops', () => this.intelligence.getDashboard({ rangeDays: 30 }), null as any);
    const overloadedDays = (opsDashboard?.capacityForecast || []).filter((d: any) => d.loadLevel === 'overloaded');
    const highLoadDays = (opsDashboard?.capacityForecast || []).filter((d: any) => d.loadLevel === 'high');
    if (overloadedDays.length > 0) {
      warnings.push({
        category: 'saturation',
        severity: 'CRITICAL',
        message: `${overloadedDays.length} day${overloadedDays.length === 1 ? '' : 's'} in the next 14 days projected overloaded (${overloadedDays
          .slice(0, 3)
          .map((d: any) => d.dayLabel)
          .join(', ')}). If this quote operates in that window, expect dispatch saturation.`,
      });
    } else if (highLoadDays.length > 0) {
      warnings.push({
        category: 'capacity',
        severity: 'WARN',
        message: `${highLoadDays.length} high-load day${highLoadDays.length === 1 ? '' : 's'} in the next 14 days (${highLoadDays
          .slice(0, 3)
          .map((d: any) => d.dayLabel)
          .join(', ')}). Capacity pressure if this quote operates then.`,
      });
    }

    // --- Factor 5: operational bottleneck routes ---
    const bottleneckRoutes = (opsDashboard?.bottlenecks || []).filter((b: any) => b.category === 'route');
    if (bottleneckRoutes.length > 0) {
      const matchedBottlenecks = bottleneckRoutes.filter((b: any) => text.includes(String(b.label || '').toLowerCase()));
      for (const b of matchedBottlenecks) {
        warnings.push({
          category: 'leakage',
          severity: 'WARN',
          message: `Route "${b.label}" flagged as bottleneck — ${b.insight}.`,
        });
      }
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
