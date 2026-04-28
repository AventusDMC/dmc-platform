export type ProfitSummaryInput = {
  totalCost: number | null | undefined;
  totalSell: number | null | undefined;
};

export function calculateProfitSummary(input: ProfitSummaryInput) {
  const totalCost = roundMoney(Number(input.totalCost || 0));
  const totalSell = roundMoney(Number(input.totalSell || 0));
  const grossProfit = roundMoney(totalSell - totalCost);
  const marginPercent = totalSell > 0 ? Number(((grossProfit / totalSell) * 100).toFixed(2)) : 0;

  return {
    totalCost,
    totalSell,
    grossProfit,
    marginPercent,
  };
}

function roundMoney(value: number) {
  return Number(Number(value || 0).toFixed(2));
}
