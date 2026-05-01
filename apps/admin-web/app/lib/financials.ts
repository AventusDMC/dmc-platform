export type MarginTone = 'positive' | 'low' | 'negative';

function safeMoneyNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function calculateProfit(sell: number | null | undefined, cost: number | null | undefined) {
  return Number((safeMoneyNumber(sell) - safeMoneyNumber(cost)).toFixed(2));
}

export function calculateMarginPercent(sell: number | null | undefined, cost: number | null | undefined) {
  const resolvedSell = safeMoneyNumber(sell);
  if (resolvedSell <= 0) {
    return 0;
  }

  return Number(((calculateProfit(resolvedSell, cost) / resolvedSell) * 100).toFixed(2));
}

export function formatMarginPercent(value: number | null | undefined) {
  return `${safeMoneyNumber(value).toFixed(2)}%`;
}

export function getItemMarginWarning(sell: number | null | undefined, cost: number | null | undefined) {
  const profit = calculateProfit(sell, cost);
  const marginPercent = calculateMarginPercent(sell, cost);

  if (profit < 0) return 'Loss';
  if (marginPercent < 10) return 'Low margin';

  return null;
}

export function getQuoteMarginWarning(sell: number | null | undefined, cost: number | null | undefined) {
  const profit = calculateProfit(sell, cost);
  const marginPercent = calculateMarginPercent(sell, cost);

  if (profit < 0) return 'Loss';
  if (marginPercent < 15) return 'Low quote margin';

  return null;
}

export function getMarginMetrics(totalSell: number, totalCost: number) {
  const margin = calculateProfit(totalSell, totalCost);
  const marginPercent = calculateMarginPercent(totalSell, totalCost);
  const tone: MarginTone = margin < 0 ? 'negative' : marginPercent < 10 ? 'low' : 'positive';

  return {
    totalCost,
    totalSell,
    margin,
    grossProfit: margin,
    marginPercent,
    tone,
    isNegative: margin < 0,
  };
}

export function getMarginColor(tone: MarginTone) {
  if (tone === 'negative') {
    return '#b42318';
  }

  if (tone === 'low') {
    return '#b54708';
  }

  return '#027a48';
}
