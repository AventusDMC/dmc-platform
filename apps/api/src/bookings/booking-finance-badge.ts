export type FinanceBadgeBreakdown = {
  unpaidClient: number;
  unpaidSupplier: number;
  negativeMargin: number;
  lowMargin: number;
  overdueClient: number;
  overdueSupplier: number;
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
  hasOverdueClientPayments: boolean;
  hasOverdueSupplierPayments: boolean;
};

export function buildFinanceBadge(values: BuildFinanceBadgeInput): FinanceBadge {
  const breakdown: FinanceBadgeBreakdown = {
    unpaidClient: values.hasUnpaidClientBalance ? 1 : 0,
    unpaidSupplier: values.hasUnpaidSupplierObligation ? 1 : 0,
    negativeMargin: values.hasNegativeMargin ? 1 : 0,
    lowMargin: values.hasLowMargin ? 1 : 0,
    overdueClient: values.hasOverdueClientPayments ? 1 : 0,
    overdueSupplier: values.hasOverdueSupplierPayments ? 1 : 0,
  };

  const count =
    breakdown.unpaidClient +
    breakdown.unpaidSupplier +
    breakdown.negativeMargin +
    breakdown.lowMargin +
    breakdown.overdueClient +
    breakdown.overdueSupplier;
  const tone: FinanceBadge['tone'] =
    breakdown.unpaidClient > 0 ||
    breakdown.unpaidSupplier > 0 ||
    breakdown.negativeMargin > 0 ||
    breakdown.overdueClient > 0 ||
    breakdown.overdueSupplier > 0
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
