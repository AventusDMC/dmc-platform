import type { calculateMultiCurrencyQuoteItemPricing } from './multi-currency-pricing';

/**
 * Pure Jordan Pass / entrance-fee coverage math.
 *
 * This module holds the coverage DECISION and the per-item update-field
 * ASSEMBLY that were previously inlined inside QuotesService.syncJordanPassEntranceFees.
 * It is deliberately free of Prisma, DB writes, HTTP, logging, and input
 * mutation so the same calculation can later back both the apply/recalculate
 * path AND a dry-run pricing preview, guaranteeing the two never drift.
 *
 * Behaviour is intentionally identical to the prior inline implementation —
 * this is a refactor, not a pricing change.
 */

/** Petra-site detection — single source of truth for the prior inline regex. */
export function isPetraEntranceSite(siteName: string): boolean {
  return /\bpetra\b/i.test(siteName);
}

export interface EntranceFeeCoverageInput {
  /** Already-normalized Jordan Pass type ('NONE' when no pass). */
  passType: string;
  /** Variant-level override, if a ticket rate variant is attached. */
  variantIncludedInJordanPass: boolean | null | undefined;
  /** Entrance-fee default coverage flag. */
  entranceFeeIncludedInJordanPass: boolean;
  siteName: string;
  /** Running count of Petra visits already covered within this item's option scope. */
  petraVisitsUsedForOption: number;
  /** Per-pass Petra day cap (0 when no product is found). */
  petraDayCount: number;
}

export interface EntranceFeeCoverageDecision {
  covered: boolean;
  /** True only when this item consumed one of the option's Petra coverage slots. */
  consumesPetraVisit: boolean;
}

/**
 * Decide whether a single entrance-fee item is covered by the Jordan Pass.
 * Mirrors the prior inline logic exactly: base coverage = pass present AND
 * (variant flag ?? entrance-fee flag); Petra sites additionally consume a
 * per-option day-cap slot in iteration (createdAt) order.
 */
export function decideEntranceFeeCoverage(
  input: EntranceFeeCoverageInput,
): EntranceFeeCoverageDecision {
  const baseCovered =
    input.passType !== 'NONE' &&
    (input.variantIncludedInJordanPass ?? input.entranceFeeIncludedInJordanPass);

  if (baseCovered && isPetraEntranceSite(input.siteName)) {
    const covered = input.petraVisitsUsedForOption < input.petraDayCount;
    return { covered, consumesPetraVisit: covered };
  }

  return { covered: Boolean(baseCovered), consumesPetraVisit: false };
}

/** Subset of the centralized pricing engine result that the update payload reads. */
export type EntranceFeePricingResult = Pick<
  ReturnType<typeof calculateMultiCurrencyQuoteItemPricing>,
  'totalCost' | 'totalSell' | 'quoteCurrency' | 'fxRate' | 'fxFromCurrency' | 'fxToCurrency' | 'fxRateDate'
>;

export interface EntranceFeeUpdateInput {
  covered: boolean;
  /** Ticket unit cost (variant cost price, else entrance foreigner fee). */
  ticketUnitCost: number;
  /** Normalized ticket currency. */
  ticketCurrency: string;
  /** Pre-formatted variant label suffix (e.g. ' | Adult'), '' when none. */
  ticketLabel: string;
  siteName: string;
  /** Result of the centralized pricing engine for this item. */
  pricing: EntranceFeePricingResult;
}

/**
 * Assemble the exact `quoteItem.update` data fields for an entrance-fee item.
 * Pure — returns a new object and reads only its inputs. The covered/uncovered
 * unit cost zeroing, savings, and description strings match the prior inline code.
 */
export function buildEntranceFeeUpdateData(input: EntranceFeeUpdateInput) {
  const unitCost = input.covered ? 0 : input.ticketUnitCost;
  return {
    jordanPassCovered: input.covered,
    jordanPassSavingsJod: input.covered ? input.ticketUnitCost : 0,
    pricingDescription: input.covered
      ? `${input.siteName}${input.ticketLabel} | Covered by Jordan Pass`
      : `${input.siteName}${input.ticketLabel} | Entrance fee`,
    baseCost: input.pricing.totalCost,
    costBaseAmount: unitCost,
    costCurrency: input.ticketCurrency,
    currency: input.pricing.quoteCurrency,
    quoteCurrency: input.pricing.quoteCurrency,
    fxRate: input.pricing.fxRate,
    fxFromCurrency: input.pricing.fxFromCurrency,
    fxToCurrency: input.pricing.fxToCurrency,
    fxRateDate: input.pricing.fxRateDate,
    finalCost: input.pricing.totalCost,
    totalCost: input.pricing.totalCost,
    totalSell: input.pricing.totalSell,
  };
}
