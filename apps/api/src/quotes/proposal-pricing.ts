export type ProposalPricingLine = {
  label: string;
  perPerson?: string | null;
  total?: string | null;
  note?: string | null;
  isSelected?: boolean;
};

export type ProposalPricingViewModel = {
  mode: 'group' | 'simple' | 'pending';
  title: string;
  snapshotLabel: string;
  snapshotValue: string;
  snapshotHelper: string;
  basisLines: string[];
  noteLines: string[];
  slabLines: ProposalPricingLine[];
};

type ValidProposalSlabLine = ProposalPricingLine & {
  label: string;
};

type ProposalPricingQuote = {
  adults: number;
  children: number;
  pricingMode?: 'SLAB' | 'FIXED' | string | null;
  fixedPricePerPerson?: number | null;
  totalSell?: number | null;
  pricePerPax?: number | null;
  singleSupplement?: number | null;
  currentPricing?: {
    label?: string | null;
    value?: number | null;
    isAvailable?: boolean;
    paxCount?: number;
    matchedSlab?: {
      label: string;
      totalSell?: number | null;
      payingPax?: number;
      actualPax?: number;
    } | null;
    message?: string | null;
  } | null;
  pricingSlabs?: Array<{
    minPax: number;
    maxPax?: number | null;
    price?: number | null;
    pricePerPayingPax?: number | null;
    notes?: string | null;
    totalSell?: number | null;
    actualPax?: number;
    payingPax?: number;
    focPax?: number | null;
    label?: string | null;
  }> | null;
  priceComputation?: {
    mode: 'simple' | 'group';
    status: 'ok' | 'missing_coverage' | 'invalid_config';
    warnings: string[];
    matchedSlab?: {
      label: string;
    } | null;
    totals?: {
      pricePerPayingPax?: number;
      totalPrice?: number;
      totalSell?: number;
      payingPax?: number;
      actualPax?: number;
    } | null;
    display: {
      summaryLabel: string;
      summaryValue?: string | null;
      pricingText?: string;
      focText?: string;
      singleSupplementText?: string;
      slabLines?: Array<{ label: string; value: string; detail?: string }>;
      contextLines?: string[];
    };
  } | null;
};

type FormatMoney = (amount: number, currency: string) => string;

function hasPositiveAmount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeLabel(minPax: number, maxPax?: number | null, explicitLabel?: string | null) {
  if (explicitLabel?.trim()) {
    return explicitLabel.trim();
  }

  if (maxPax === null || maxPax === undefined) {
    return `${minPax}+ guests`;
  }

  if (maxPax === minPax) {
    return `${minPax} guest${minPax === 1 ? '' : 's'}`;
  }

  return `${minPax}\u2013${maxPax} guests`;
}

function appendFocLabel(label: string, focPax?: number | null) {
  return focPax && focPax > 0 ? `${label} + ${focPax} FOC` : label;
}

function uniqueLines(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function isSafePricingNote(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  const lowercase = normalized.toLowerCase();
  if (lowercase.includes('0 paying')) {
    return false;
  }

  if (/(^|[\s:(])(?:[A-Z]{3}\s+)?0(?:\.0+)?(?:\b|[)\s,.;])/i.test(normalized)) {
    return false;
  }

  return true;
}

function hasUsableSummaryAmount(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.includes('to be confirmed') || normalized.includes('unavailable') || normalized.includes('pending')) {
    return false;
  }

  return !/(^|[^\d])0(?:\.0+)?(?:[^\d]|$)/.test(normalized);
}

function isPositiveInteger(value: number | null | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number | null | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function buildValidSlabLines(
  quote: ProposalPricingQuote,
  currency: string,
  formatMoney: FormatMoney,
): ValidProposalSlabLine[] | null {
  const sourceSlabs = quote.pricingSlabs || [];

  if (sourceSlabs.length === 0) {
    return [];
  }

  const lines: ValidProposalSlabLine[] = [];

  for (const slab of sourceSlabs) {
    if (!isPositiveInteger(slab.minPax)) {
      return null;
    }

    if (slab.maxPax !== null && slab.maxPax !== undefined) {
      if (!isPositiveInteger(slab.maxPax) || slab.maxPax < slab.minPax) {
        return null;
      }
    }

    const focPax = slab.focPax ?? 0;
    if (!isNonNegativeInteger(focPax) || focPax >= slab.minPax) {
      return null;
    }

    if (slab.actualPax !== undefined && slab.actualPax !== null) {
      if (!isPositiveInteger(slab.actualPax)) {
        return null;
      }
      if (slab.actualPax < slab.minPax) {
        return null;
      }
      if (slab.maxPax !== null && slab.maxPax !== undefined && slab.actualPax > slab.maxPax) {
        return null;
      }
    }

    if (slab.payingPax !== undefined && slab.payingPax !== null) {
      if (!isPositiveInteger(slab.payingPax)) {
        return null;
      }
      if (slab.actualPax !== undefined && slab.actualPax !== null && slab.actualPax - focPax !== slab.payingPax) {
        return null;
      }
    }

    const perPersonAmount = hasPositiveAmount(slab.pricePerPayingPax) ? slab.pricePerPayingPax : slab.price;
    if (!hasPositiveAmount(perPersonAmount)) {
      return null;
    }

    const label = appendFocLabel(normalizeLabel(slab.minPax, slab.maxPax, slab.label), focPax);
    const totalAmount = hasPositiveAmount(slab.totalSell) ? slab.totalSell : null;

    lines.push({
      label,
      perPerson: formatMoney(perPersonAmount!, currency),
      total: hasPositiveAmount(totalAmount) ? formatMoney(totalAmount!, currency) : null,
      note: slab.notes?.trim() || null,
      isSelected: quote.currentPricing?.matchedSlab?.label === label,
    });
  }

  return lines;
}

function buildPendingPricingViewModel(_totalGuests: number, quote: ProposalPricingQuote): ProposalPricingViewModel {
  return {
    mode: 'pending',
    title: 'Investment',
    snapshotLabel: 'Pricing status',
    snapshotValue: 'Pricing to be confirmed',
    snapshotHelper: 'Final slab selection depends on the confirmed group size.',
    basisLines: [],
    noteLines: [],
    slabLines: [],
  };
}

export function buildProposalPricingViewModel(
  quote: ProposalPricingQuote,
  currency: string,
  formatMoney: FormatMoney,
): ProposalPricingViewModel {
  const totalGuests = Math.max((quote.adults || 0) + (quote.children || 0), 1);
  const slabLines = buildValidSlabLines(quote, currency, formatMoney);

  if (
    quote.priceComputation?.status === 'invalid_config' ||
    ((quote.priceComputation?.mode === 'group' || quote.pricingMode === 'SLAB' || (quote.pricingSlabs || []).length > 0) &&
      slabLines === null)
  ) {
    return buildPendingPricingViewModel(totalGuests, quote);
  }

  const computedGroupValue = hasPositiveAmount(quote.currentPricing?.value)
    ? formatMoney(quote.currentPricing!.value!, currency)
    : quote.priceComputation &&
        hasUsableSummaryAmount(quote.priceComputation.display.summaryValue) &&
        (hasPositiveAmount(quote.priceComputation.totals?.pricePerPayingPax) ||
          hasPositiveAmount(quote.priceComputation.totals?.totalSell))
    ? quote.priceComputation.display.summaryValue
    : null;

  if (
    (quote.priceComputation?.mode === 'group' || quote.pricingMode === 'SLAB' || (slabLines?.length || 0) > 0) &&
    slabLines &&
    slabLines.length > 0
  ) {
    const selectedLine = slabLines.find((line) => line.isSelected) || null;

    return {
      mode: 'group',
      title: 'Investment by Group Size',
      snapshotLabel: selectedLine ? 'Selected group size' : 'Group pricing',
      snapshotValue: computedGroupValue || selectedLine?.perPerson || 'Pricing to be confirmed',
      snapshotHelper:
        selectedLine
          ? `Current quote matches ${selectedLine.label}.`
          : 'Final slab selection depends on the confirmed group size.',
      basisLines: uniqueLines([
        'Rates are shown per paying guest unless noted otherwise.',
      ]),
      noteLines: uniqueLines([
        quote.priceComputation?.display.singleSupplementText,
      ]).filter((line) => isSafePricingNote(line)),
      slabLines,
    };
  }

  const simpleAmount = hasPositiveAmount(quote.fixedPricePerPerson)
    ? quote.fixedPricePerPerson
    : hasPositiveAmount(quote.currentPricing?.value)
    ? quote.currentPricing!.value!
    : hasPositiveAmount(quote.pricePerPax)
    ? quote.pricePerPax
    : hasPositiveAmount(quote.totalSell)
    ? quote.totalSell! / totalGuests
    : null;

  if (hasPositiveAmount(simpleAmount)) {
    return {
      mode: 'simple',
      title: 'Investment',
      snapshotLabel: quote.currentPricing?.label || 'Package sell price per person',
      snapshotValue: formatMoney(simpleAmount!, currency),
      snapshotHelper: `Based on ${totalGuests} guest${totalGuests === 1 ? '' : 's'} sharing.`,
      basisLines: uniqueLines([
        ...(quote.priceComputation?.display.contextLines || []),
        `Quotation prepared for ${totalGuests} guest${totalGuests === 1 ? '' : 's'}.`,
      ]),
      noteLines: uniqueLines([
        quote.priceComputation?.display.singleSupplementText,
        quote.priceComputation?.display.focText,
      ]).filter((line) => isSafePricingNote(line)),
      slabLines: [],
    };
  }

  return buildPendingPricingViewModel(totalGuests, quote);
}
