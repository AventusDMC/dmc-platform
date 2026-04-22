export type QuotePricingType = 'simple' | 'group';
export type QuotePricingMode = 'SLAB' | 'FIXED';

export type QuotePricingSlabValue = {
  id?: string;
  minPax: number;
  maxPax: number | null;
  price: number;
  actualPax?: number;
  focPax?: number;
  payingPax?: number;
  totalCost?: number;
  totalSell?: number;
  pricePerPayingPax?: number;
  pricePerActualPax?: number | null;
  notes?: string | null;
};

export type QuoteCurrentPricingResult = {
  pricingType: QuotePricingType;
  pricingMode: QuotePricingMode;
  paxCount: number;
  isAvailable: boolean;
  label: string;
  value: number | null;
  message: string | null;
  matchedSlab: (QuotePricingSlabValue & { label: string }) | null;
};

export function formatPricingSlabLabel(minPax: number, maxPax: number | null, focPax?: number | null) {
  const rangeLabel =
    maxPax === null ? `${minPax}+ guests` : minPax === maxPax ? `${minPax} guest${minPax === 1 ? '' : 's'}` : `${minPax}\u2013${maxPax} guests`;
  return focPax && focPax > 0 ? `${rangeLabel} + ${focPax} FOC` : rangeLabel;
}

export function resolveCurrentQuotePricing(values: {
  pricingMode?: string | null;
  pricingType?: string | null;
  adults: number;
  children: number;
  totalSell?: number | null;
  pricePerPax?: number | null;
  fixedPricePerPerson?: number | null;
  pricingSlabs?: QuotePricingSlabValue[] | null;
}): QuoteCurrentPricingResult {
  const pricingMode: QuotePricingMode =
    values.pricingMode === 'SLAB' ? 'SLAB' : values.pricingMode === 'FIXED' ? 'FIXED' : values.pricingType === 'group' ? 'SLAB' : 'FIXED';
  const pricingType: QuotePricingType = pricingMode === 'SLAB' ? 'group' : 'simple';
  const paxCount = Math.max(1, values.adults + values.children);

  if (pricingType === 'group') {
    const matchedSlab =
      values.pricingSlabs?.find((slab) => paxCount >= slab.minPax && (slab.maxPax === null || paxCount <= slab.maxPax)) || null;

    return {
      pricingType,
      pricingMode,
      paxCount,
      isAvailable: Boolean(matchedSlab),
      label: 'Group price',
      value: matchedSlab?.pricePerPayingPax ?? matchedSlab?.price ?? null,
      message: matchedSlab ? null : 'Price unavailable for selected passenger count.',
      matchedSlab: matchedSlab
        ? {
            ...matchedSlab,
            label: formatPricingSlabLabel(matchedSlab.minPax, matchedSlab.maxPax, matchedSlab.focPax ?? 0),
          }
        : null,
    };
  }

  const value = values.fixedPricePerPerson ?? values.pricePerPax ?? null;

  return {
    pricingType,
    pricingMode,
    paxCount,
    isAvailable: value !== null,
    label: 'Price per person',
    value,
    message: value === null ? 'Price unavailable for selected passenger count.' : null,
    matchedSlab: null,
  };
}
