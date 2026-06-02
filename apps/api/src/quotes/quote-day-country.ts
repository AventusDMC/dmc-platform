// Derives the destination COUNTRY for a quote itinerary day from the services
// scheduled on it. This is location metadata only — it does NOT touch the
// pricing engine. Used to group a multi-country quote by country in the
// builder (and, later, the proposal).
//
// Precedence, highest first:
//   1. a hotel day-item's resolved city country (Hotel.cityRecord.country)
//   2. an external-package day-item's country (QuoteItem.externalPackageCountry)
//   3. a quote-level fallback (e.g. a series' destinationCountry), if provided
//   4. null  — the caller renders DAY_COUNTRY_UNRESOLVED
//
// Pure and dependency-free so it is trivially unit-testable and reusable by
// both the builder payload and the proposal mapper.

/** Label shown when a day's country cannot be derived from its services. */
export const DAY_COUNTRY_UNRESOLVED = 'To be confirmed';

export type QuoteDayCountryItem = {
  /** Country of the item's hotel, resolved via Hotel.cityRecord.country. */
  hotelCountry?: string | null;
  /** Country tagged on an external-package item (QuoteItem.externalPackageCountry). */
  externalPackageCountry?: string | null;
};

export type QuoteDayCountryInput = {
  items: QuoteDayCountryItem[];
  /** Quote-level fallback (e.g. a series' destinationCountry), if any. */
  quoteFallbackCountry?: string | null;
};

function cleanCountry(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Derive a day's country from its services, following the precedence above.
 * Returns null when nothing resolves (caller shows DAY_COUNTRY_UNRESOLVED).
 */
export function deriveDayCountry(input: QuoteDayCountryInput): string | null {
  for (const item of input.items) {
    const hotelCountry = cleanCountry(item.hotelCountry);
    if (hotelCountry) {
      return hotelCountry;
    }
  }

  for (const item of input.items) {
    const packageCountry = cleanCountry(item.externalPackageCountry);
    if (packageCountry) {
      return packageCountry;
    }
  }

  return cleanCountry(input.quoteFallbackCountry);
}
