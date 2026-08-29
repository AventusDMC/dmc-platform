import { canViewQuoteCostMargin } from '../auth/cost-visibility';
import type { AuthenticatedActor } from '../auth/auth.types';

/**
 * CP-N3b1 — fail-closed non-finance cost-write policy.
 *
 * Buy-side cost / margin / provenance / internal-cost-note fields that a
 * NON-finance actor must never control through a quote item mutation payload.
 * The list is the canonical restricted set PLUS the confirmed request-body
 * aliases the quote item controllers map onto the same stored fields
 * (`unitCost` -> costBaseAmount, `netCost` -> externalNetCost, `supplierName` ->
 * externalSupplierName, `internalNotes` -> externalInternalNotes,
 * `pricingMatrixJson` -> externalPackagePricingMatrixJson). Keys absent from the
 * current DTOs are included defensively so a future field cannot silently open a
 * write path.
 *
 * Deliberately EXCLUDED (sell-side / operational — must keep working for
 * non-finance): `sellPrice`, `sellPriceOverrideExplicit`, `totalSell`,
 * `singleSupplement`, and all scheduling/identifier/quantity fields. Ambiguous
 * fields (pricingDescription, tax/service-charge/tourism-fee, contract
 * selection, operational identifiers) are intentionally NOT gated here — they
 * are deferred to CP-N3b2 rather than guessed.
 */
export const NON_FINANCE_RESTRICTED_QUOTE_ITEM_WRITE_KEYS = [
  'totalCost',
  'baseCost',
  'costBaseAmount',
  'overrideCost',
  'useOverride',
  'finalCost',
  'netCost',
  'cost',
  'markupPercent',
  'markupAmount',
  'externalNetCost',
  'externalPackagePricingMatrixJson',
  'externalSupplierName',
  'externalInternalNotes',
  'overrideReason',
  'fxRate',
  'fxFromCurrency',
  'fxToCurrency',
  'fxRateDate',
  'jordanPassSavingsJod',
  // Confirmed request-body aliases mapping to the same restricted stored fields:
  'unitCost',
  'supplierName',
  'internalNotes',
  'pricingMatrixJson',
] as const;

/**
 * Return a fresh copy of a quote item mutation body with restricted buy-side
 * cost/provenance fields removed for NON-finance actors. Finance-visible actors
 * (admin / super_admin / finance) get the body back unchanged. Fail-closed:
 * a missing/unknown role is not finance-visible, so it is sanitized.
 *
 * NEVER mutates the input object. Removing a key (rather than nulling/zeroing)
 * makes the downstream controller mappers resolve it to `undefined`, which the
 * create/update paths treat as "not provided" / "preserve existing stored
 * value" — so a non-finance edit can neither set nor zero stored cost, and a
 * removed value can never become an unintended zero-cost override.
 */
export function stripRestrictedQuoteCostWriteFields<T extends Record<string, any>>(
  body: T,
  actor: Pick<AuthenticatedActor, 'role'> | null | undefined,
): T {
  if (canViewQuoteCostMargin(actor?.role)) {
    return body;
  }
  const sanitized: Record<string, any> = { ...body };
  for (const key of NON_FINANCE_RESTRICTED_QUOTE_ITEM_WRITE_KEYS) {
    if (key in sanitized) {
      delete sanitized[key];
    }
  }
  return sanitized as T;
}
