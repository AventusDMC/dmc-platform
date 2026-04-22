export type FinanceBadgeBreakdown = {
  unpaidClient: number;
  unpaidSupplier: number;
  negativeMargin: number;
  lowMargin: number;
};

export type FinanceBadge = {
  count: number;
  tone: 'error' | 'warning' | 'none';
  breakdown: FinanceBadgeBreakdown;
};

type BuildFinanceBadgeInput = {
  hasUnpaidClientBalance: boolean;
  hasUnpaidSupplierObligation: boolean;
  hasNegativeMargin: boolean;
  hasLowMargin: boolean;
};

export function buildFinanceBadge(values: BuildFinanceBadgeInput): FinanceBadge {
  const breakdown: FinanceBadgeBreakdown = {
    unpaidClient: values.hasUnpaidClientBalance ? 1 : 0,
    unpaidSupplier: values.hasUnpaidSupplierObligation ? 1 : 0,
    negativeMargin: values.hasNegativeMargin ? 1 : 0,
    lowMargin: values.hasLowMargin ? 1 : 0,
  };

  const count = breakdown.unpaidClient + breakdown.unpaidSupplier + breakdown.negativeMargin + breakdown.lowMargin;
  const tone: FinanceBadge['tone'] =
    breakdown.unpaidClient > 0 || breakdown.unpaidSupplier > 0 || breakdown.negativeMargin > 0
      ? 'error'
      : breakdown.lowMargin > 0
        ? 'warning'
        : 'none';

  return {
    count,
    tone,
    breakdown,
  };
}
