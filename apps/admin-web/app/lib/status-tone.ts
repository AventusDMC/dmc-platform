// Shared status-tone palette for dashboard Stat cards / summary chips / load
// indicators across the operations, executive, and admin pages.
//
// This was previously copy-pasted (byte-for-byte) into a local `palette`
// object inside ~11 separate Stat/SummaryStat/SummaryCard helpers across 9
// page files. Centralising it removes that duplication and gives a single
// place to evolve the palette.
//
// NOTE: the values below are the exact hexes those inline copies used, so
// adopting this constant is a pure no-op. A future design-system pass can
// re-point these to the canonical `--ds-color-*` feedback tokens (see
// app/design-tokens.css) in one edit — but that is a real visual change
// (the borders would soften), so it must be eyeballed separately.

export type StatusTone = 'info' | 'action' | 'critical' | 'ready';

export const STATUS_TONE: Record<StatusTone, { bg: string; border: string; text: string }> = {
  info: { bg: '#eff8ff', border: '#84caff', text: '#175cd3' },
  action: { bg: '#fff8eb', border: '#f79009', text: '#b54708' },
  critical: { bg: '#fef3f2', border: '#f04438', text: '#b42318' },
  ready: { bg: '#f0fdf4', border: '#12b76a', text: '#067647' },
};
