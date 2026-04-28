export type MarginTone = 'positive' | 'low' | 'negative';

export function getMarginMetrics(totalSell: number, totalCost: number) {
  const margin = totalSell - totalCost;
  const marginPercent = totalSell <= 0 ? 0 : (margin / totalSell) * 100;
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
