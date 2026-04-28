export function calculatePercentChange(current: number, previous: number) {
  if (!previous) {
    return current > 0 ? 100 : 0;
  }

  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function formatPercentChange(value: number) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)}%`;
}
