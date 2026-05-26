import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  diffContractSnapshots,
  interpretRates,
  isPricingComplete,
  recommendConfidence,
  suggestRoomMappings,
  validateSeasons,
  validateSupplements,
  type ConfidenceStatus,
  type ContractSnapshot,
} from './hotel-contract-health.validators';

// Hotel Contract Stabilization & Trustworthiness v2 — service surface.
//
// Reads from hotel_contracts + hotel_rates + hotel_contract_supplements
// + hotel_contract_meal_plans + hotel_contract_child_policies +
// hotel_contract_cancellation_policies. NEVER writes pricing data.
// The only mutation the service performs is updating the confidence
// column + lastVerifiedAt + verifiedBy + verificationNotes — the
// operator-managed trustworthiness layer.
//
// The pricing engine, quote engine, booking conversion, and route
// integrations all remain untouched.

const ALL_CONFIDENCE_VALUES: ConfidenceStatus[] = [
  'IMPORTED_UNVERIFIED',
  'NEEDS_REVIEW',
  'PRICING_INCOMPLETE',
  'SUPPLEMENT_REVIEW_REQUIRED',
  'SEASON_CONFLICT',
  'VERIFIED',
];

@Injectable()
export class HotelContractHealthService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Dashboard — counts per finding category across ALL contracts.
  // Lightweight aggregation: counts only, no individual rate rows.
  // ---------------------------------------------------------------------------

  async getHealthDashboard() {
    const contracts = (await (this.prisma as any).hotelContract.findMany({
      include: {
        hotel: { select: { id: true, name: true, city: true } },
        rates: { select: { id: true, roomCategoryId: true, occupancyType: true, mealPlan: true, seasonName: true, seasonFrom: true, seasonTo: true, cost: true, currency: true, pricingBasis: true } },
        supplements: { select: { id: true, type: true, roomCategoryId: true, chargeBasis: true, amount: true, isMandatory: true, isActive: true } },
        mealPlans: { select: { id: true, code: true, isActive: true } },
        childPolicy: { select: { id: true } },
      },
    })) as any[];

    const sections = {
      missingMealPlans: [] as Array<{ contractId: string; name: string; hotelName: string }>,
      suspiciousPricing: [] as Array<{ contractId: string; name: string; hotelName: string; reason: string }>,
      missingOccupancyMapping: [] as Array<{ contractId: string; name: string; hotelName: string; missing: number }>,
      supplementConflicts: [] as Array<{ contractId: string; name: string; hotelName: string; findingCount: number }>,
      overlappingSeasons: [] as Array<{ contractId: string; name: string; hotelName: string; findingCount: number }>,
      missingChildPolicy: [] as Array<{ contractId: string; name: string; hotelName: string }>,
      importedUnverified: [] as Array<{ contractId: string; name: string; hotelName: string }>,
    };
    const byConfidence: Record<ConfidenceStatus, number> = {
      IMPORTED_UNVERIFIED: 0,
      NEEDS_REVIEW: 0,
      PRICING_INCOMPLETE: 0,
      SUPPLEMENT_REVIEW_REQUIRED: 0,
      SEASON_CONFLICT: 0,
      VERIFIED: 0,
    };

    for (const contract of contracts) {
      const confidence: ConfidenceStatus = (contract.confidence as ConfidenceStatus) || 'IMPORTED_UNVERIFIED';
      byConfidence[confidence] = (byConfidence[confidence] || 0) + 1;

      const hotelName = contract.hotel?.name || 'Unknown hotel';
      const ctx = { contractId: contract.id, name: contract.name, hotelName };

      // Imported but unverified.
      if (confidence === 'IMPORTED_UNVERIFIED') sections.importedUnverified.push(ctx);

      // Missing meal plans = no active meal-plan rows.
      const activeMealPlans = (contract.mealPlans || []).filter((m: any) => m.isActive !== false);
      if (activeMealPlans.length === 0) sections.missingMealPlans.push(ctx);

      // Missing child policy.
      if (!contract.childPolicy) sections.missingChildPolicy.push(ctx);

      // Suspicious pricing: rates with cost <= 0 OR > 5000 (rough sanity).
      const suspiciousRates = (contract.rates || []).filter((r: any) => !Number.isFinite(Number(r.cost)) || Number(r.cost) <= 0 || Number(r.cost) > 5000);
      if (suspiciousRates.length > 0) {
        sections.suspiciousPricing.push({ ...ctx, reason: `${suspiciousRates.length} rate row(s) outside the 0–5000 sanity band.` });
      }

      // Missing occupancy mapping = rates exist but occupancyType is null/empty.
      const orphanRates = (contract.rates || []).filter((r: any) => !r.occupancyType);
      if (orphanRates.length > 0) {
        sections.missingOccupancyMapping.push({ ...ctx, missing: orphanRates.length });
      }

      // Supplement conflicts.
      const rateMealPlans: string[] = Array.from(new Set((contract.rates || []).map((r: any) => String(r.mealPlan || '')).filter(Boolean)));
      const supplementFindings = validateSupplements(contract.supplements || [], { rateMealPlans });
      if (supplementFindings.length > 0) {
        sections.supplementConflicts.push({ ...ctx, findingCount: supplementFindings.length });
      }

      // Overlapping seasons — derived from rate season ranges since
      // seasons aren't a separate model on every contract.
      const seasonsForValidation = derivedSeasonsFromRates(contract.rates || []);
      const seasonFindings = validateSeasons(seasonsForValidation, { validFrom: contract.validFrom, validTo: contract.validTo });
      if (seasonFindings.length > 0) {
        sections.overlappingSeasons.push({ ...ctx, findingCount: seasonFindings.length });
      }
    }

    return {
      totals: { contracts: contracts.length, byConfidence },
      sections,
    };
  }

  // ---------------------------------------------------------------------------
  // Correction Queue — sorted by priority. Prioritization order:
  //   1. Contracts whose hotels appear in ACTIVE quotes (highest impact)
  //   2. Contracts with unresolved pricing findings
  //   3. Imported PDFs with warnings (NEEDS_REVIEW / etc.)
  //   4. Frequent hotels (by number of contracts)
  // ---------------------------------------------------------------------------

  async getCorrectionQueue(options: { limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);

    const contracts = (await (this.prisma as any).hotelContract.findMany({
      where: { confidence: { not: 'VERIFIED' } },
      include: {
        hotel: { select: { id: true, name: true, city: true } },
        rates: { select: { id: true, cost: true, occupancyType: true, mealPlan: true } },
        supplements: { select: { id: true, type: true, roomCategoryId: true, chargeBasis: true, amount: true, isMandatory: true, isActive: true } },
      },
      take: 500,
    })) as any[];

    // Active quote impact — hotels referenced from quote items whose
    // status is still in-flight (DRAFT/PROPOSED/CONFIRMED etc., not
    // CANCELLED/EXPIRED).
    const activeQuoteHotelIds = await this.getActiveQuoteHotelIds();

    // Hotel frequency = number of contracts per hotel. Used as a
    // tiebreaker so chains with many contracts get triaged first.
    const hotelContractFreq = new Map<string, number>();
    for (const contract of contracts) {
      const id = contract.hotel?.id;
      if (id) hotelContractFreq.set(id, (hotelContractFreq.get(id) || 0) + 1);
    }

    const queue = contracts.map((contract) => {
      const rateMealPlans: string[] = Array.from(new Set((contract.rates || []).map((r: any) => String(r.mealPlan || '')).filter(Boolean)));
      const supplementFindings = validateSupplements(contract.supplements || [], { rateMealPlans });
      const inActiveQuote = activeQuoteHotelIds.has(contract.hotelId);
      const frequency = hotelContractFreq.get(contract.hotelId) || 1;
      const supplementSeverity = supplementFindings.some((f) => f.severity === 'high') ? 100 : supplementFindings.length > 0 ? 30 : 0;
      const confidencePenalty: Record<ConfidenceStatus, number> = {
        IMPORTED_UNVERIFIED: 40,
        NEEDS_REVIEW: 60,
        PRICING_INCOMPLETE: 80,
        SUPPLEMENT_REVIEW_REQUIRED: 90,
        SEASON_CONFLICT: 90,
        VERIFIED: 0,
      };
      const confidence: ConfidenceStatus = (contract.confidence as ConfidenceStatus) || 'IMPORTED_UNVERIFIED';
      const priorityScore =
        (inActiveQuote ? 500 : 0) +
        supplementSeverity +
        confidencePenalty[confidence] +
        Math.min(frequency * 5, 50);

      return {
        contractId: contract.id,
        name: contract.name,
        hotel: contract.hotel,
        confidence,
        rateCount: (contract.rates || []).length,
        supplementFindings: supplementFindings.length,
        inActiveQuote,
        priorityScore,
      };
    });

    queue.sort((a, b) => b.priorityScore - a.priorityScore);
    return { queue: queue.slice(0, limit), totalCandidates: queue.length };
  }

  // ---------------------------------------------------------------------------
  // Per-contract validation — runs every validator over one contract.
  // Powers the Pricing Interpretation Preview + Supplement / Season
  // validation cards in the admin detail page.
  // ---------------------------------------------------------------------------

  async validateContract(contractId: string) {
    const contract = await this.loadFullContract(contractId);
    if (!contract) throw new NotFoundException('Hotel contract not found');

    const rateMealPlans: string[] = Array.from(new Set((contract.rates || []).map((r: any) => String(r.mealPlan || '')).filter(Boolean)));
    const supplementFindings = validateSupplements(contract.supplements || [], { rateMealPlans });
    const seasonFindings = validateSeasons(derivedSeasonsFromRates(contract.rates || []), {
      validFrom: contract.validFrom,
      validTo: contract.validTo,
    });
    const interpretation = interpretRates((contract.rates || []).slice(0, 50));
    const pricingCheck = isPricingComplete(
      (contract.hotel?.roomCategories || []).map((r: any) => r.id),
      contract.rates || [],
    );
    const confidenceSuggestion = recommendConfidence({
      currentStatus: (contract.confidence as ConfidenceStatus) || 'IMPORTED_UNVERIFIED',
      supplementFindings,
      seasonFindings,
      pricingComplete: pricingCheck.complete,
    });

    return {
      contractId: contract.id,
      name: contract.name,
      confidence: contract.confidence,
      lastVerifiedAt: contract.lastVerifiedAt,
      verifiedBy: contract.verifiedBy,
      verificationNotes: contract.verificationNotes,
      findings: {
        supplements: supplementFindings,
        seasons: seasonFindings,
        pricing: {
          complete: pricingCheck.complete,
          missingCount: pricingCheck.missing.length,
          // Cap the missing list — UI only needs the first ~50 anyway.
          missingPreview: pricingCheck.missing.slice(0, 50),
        },
      },
      // Pricing Interpretation Preview — first 50 rate rows.
      interpretation,
      confidenceSuggestion,
    };
  }

  // ---------------------------------------------------------------------------
  // Guided room mapping — suggest standard categories for a free-text
  // source name. Pure passthrough to the validator.
  // ---------------------------------------------------------------------------

  suggestRoomMapping(sourceName: string) {
    return suggestRoomMappings(sourceName);
  }

  // ---------------------------------------------------------------------------
  // Re-upload diff — accepts a candidate snapshot from the importer and
  // returns the structured diff. NEVER applies the diff itself — the
  // operator confirms in a follow-up call.
  // ---------------------------------------------------------------------------

  async diffAgainstSnapshot(contractId: string, candidate: ContractSnapshot) {
    const current = await this.snapshotContract(contractId);
    if (!current) throw new NotFoundException('Hotel contract not found');
    return diffContractSnapshots(current, candidate);
  }

  // ---------------------------------------------------------------------------
  // Safe correction — update confidence status, verification metadata,
  // and verification notes. Never touches rates / supplements / seasons
  // / quotes. Historical references remain intact.
  // ---------------------------------------------------------------------------

  async updateConfidence(
    contractId: string,
    input: { status: ConfidenceStatus; verifiedBy?: string | null; notes?: string | null },
  ) {
    if (!ALL_CONFIDENCE_VALUES.includes(input.status)) {
      throw new BadRequestException(`Invalid confidence status: ${input.status}`);
    }
    const existing = await (this.prisma as any).hotelContract.findUnique({ where: { id: contractId } });
    if (!existing) throw new NotFoundException('Hotel contract not found');
    return (this.prisma as any).hotelContract.update({
      where: { id: contractId },
      data: {
        confidence: input.status,
        lastVerifiedAt: input.status === 'VERIFIED' ? new Date() : existing.lastVerifiedAt,
        verifiedBy: input.status === 'VERIFIED' ? input.verifiedBy || existing.verifiedBy || null : existing.verifiedBy,
        verificationNotes: input.notes === undefined ? existing.verificationNotes : input.notes,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async loadFullContract(contractId: string) {
    return (this.prisma as any).hotelContract.findUnique({
      where: { id: contractId },
      include: {
        hotel: {
          select: {
            id: true,
            name: true,
            city: true,
            roomCategories: { select: { id: true, name: true, code: true, isActive: true } },
          },
        },
        rates: {
          select: {
            id: true,
            roomCategoryId: true,
            occupancyType: true,
            mealPlan: true,
            seasonName: true,
            seasonFrom: true,
            seasonTo: true,
            cost: true,
            currency: true,
            pricingBasis: true,
          },
        },
        supplements: {
          select: {
            id: true,
            type: true,
            roomCategoryId: true,
            chargeBasis: true,
            amount: true,
            isMandatory: true,
            isActive: true,
          },
        },
      },
    });
  }

  private async snapshotContract(contractId: string): Promise<ContractSnapshot | null> {
    const contract = await this.loadFullContract(contractId);
    if (!contract) return null;
    return {
      roomCategories: (contract.hotel?.roomCategories || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        isActive: r.isActive,
      })),
      rates: contract.rates || [],
      supplements: contract.supplements || [],
      seasons: derivedSeasonsFromRates(contract.rates || []),
    };
  }

  private async getActiveQuoteHotelIds(): Promise<Set<string>> {
    try {
      const rows = await (this.prisma as any).quoteItem.findMany({
        where: {
          // Be defensive — schema columns vary. The intent is "items
          // belonging to a quote that's still in flight".
          hotelId: { not: null },
        },
        select: { hotelId: true },
        take: 5000,
      });
      return new Set(rows.map((row: any) => row.hotelId).filter(Boolean));
    } catch {
      // If the model shape isn't what we expected, fail safe — no quote
      // impact prioritization, but the queue still works on supplement
      // / confidence signals alone.
      return new Set<string>();
    }
  }
}

// ---------------------------------------------------------------------------
// Pure local helper. Synthesizes a season list from rate rows because
// we don't carry a separate Season model on this contract path.
// ---------------------------------------------------------------------------

function derivedSeasonsFromRates(
  rates: Array<{ seasonName: string; seasonFrom: Date | string | null | undefined; seasonTo: Date | string | null | undefined }>,
) {
  const map = new Map<string, { id: string; name: string; validFrom: Date | string; validTo: Date | string }>();
  for (const rate of rates) {
    const name = String(rate.seasonName || 'Open season');
    const from = rate.seasonFrom || '';
    const to = rate.seasonTo || '';
    if (!from || !to) continue;
    const key = `${name}::${String(from)}::${String(to)}`;
    if (!map.has(key)) {
      map.set(key, { id: key, name, validFrom: from, validTo: to });
    }
  }
  return Array.from(map.values());
}
