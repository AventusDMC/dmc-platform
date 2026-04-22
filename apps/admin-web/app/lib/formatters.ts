export function formatNightCountLabel(value: number) {
  return `${value} NIGHT${value === 1 ? '' : 'S'}`;
}
