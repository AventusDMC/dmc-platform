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
    // Outer try/catch so an unexpected failure surfaces a precise error
    // payload instead of a generic 500 — operator can see what failed.
    try {
      return await this.computeIntelligence(quoteId);
    } catch (err) {
      console.error('[quote-intelligence] top-level failure', err);
      const message = err instanceof Error ? err.message : String(err);
      return {
        quoteId,
        quoteTitle: '',
        summary: {
          operationalRisk: 'LOW' as const,
          feasibility: 'Operationally Safe' as const,
          warningCount: 1,
          criticalCount: 0,
          warnCount: 1,
        },
        itemCount: 0,
        paxCount: 0,
        warnings: [
          {
            category: 'complexity' as const,
            severity: 'WARN' as const,
            message: `Insights partially unavailable: ${message}`,
          },
        ],
        heuristicNote: 'Error path — backend logged details.',
      };
    }
  }

  private async computeIntelligence(quoteId: string) {
    // Quote lookup with a minimal include — even if items are missing,
    // we still want to render basic insight.
    const quote = await this.safe(
      'quote-lookup',
      () =>
        (this.prisma.quote as any).findUnique({
          where: { id: quoteId },
          include: {
            items: {
              include: {
                activity: { select: { id: true, name: true } },
                service: { select: { id: true, name: true } },
              },
            },
          },
        }),
      null as any,
    );
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

    // --- Factor 3: platform incident pressure (simplest possible count) ---
    // Stripped to the bare minimum: one count query. PR #60 attempted a
    // Prisma groupBy here and was getting opaque 500s; the cheapest safe
    // signal is just "are there many active incidents in the platform
    // right now". If yes, surface as a platform-wide capacity warning.
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentIncidentCount = await this.safe(
      'recent-incidents',
      () =>
        (this.prisma.bookingService as any).count({
          where: { issueReportedAt: { gte: since30d } },
        }),
      0,
    );
    if (recentIncidentCount > 10) {
      warnings.push({
        category: 'supplier',
        severity: 'WARN',
        message: `Platform has logged ${recentIncidentCount} incidents in the last 30 days. Operations team may be stretched — flag before booking conversion.`,
      });
    }

    // --- Factor 4: dispatch saturation (simplest possible) ---
    // Wrapped in safe() so a failure returns 0 and we just skip the check.
    const upcomingCount = await this.safe(
      'upcoming-count',
      () =>
        (this.prisma.bookingService as any).count({
          where: {
            serviceDate: {
              gte: new Date(),
              lt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      0,
    );
    if (upcomingCount > 100) {
      warnings.push({
        category: 'saturation',
        severity: 'WARN',
        message: `${upcomingCount} services scheduled in the next 14 days — platform under load. New bookings will add operational pressure.`,
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
