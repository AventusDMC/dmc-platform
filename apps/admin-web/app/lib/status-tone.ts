// Shared status-tone palette for dashboard Stat cards / summary chips / load
// indicators across the operations, executive, and admin pages.
//
// This was previously copy-pasted (byte-for-byte) into a local `palette`
// object inside ~11 separate Stat/SummaryStat/SummaryCard helpers across 9
// page files. Centralising it removes that duplication and gives a single
// place to evolve the palette.
//
// The values now reference the canonical `--ds-color-*` feedback tokens
// (see app/design-tokens.css) so the dashboard status palette is sourced
// from the design system rather than hard-coded hexes. The fallback hex
// in each var() is the value the inline copies used. Re-pointing softens
// the chip borders to the design-system token border (saturated → pastel);
// the surface and the status TEXT colour (the dominant scan signal, e.g.
// the red/green KPI number) are unchanged. info maps to a dedicated
// neutral-blue info token, NOT the teal brand accent.
//
// tone → token group:  info → info,  action → warning,
//                      critical → danger,  ready → success.

export type StatusTone = 'info' | 'action' | 'critical' | 'ready';

export const STATUS_TONE: Record<StatusTone, { bg: string; border: string; text: string }> = {
  info: {
    bg: 'var(--ds-color-info-surface, #eff8ff)',
    border: 'var(--ds-color-info-border, #84caff)',
    text: 'var(--ds-color-info, #175cd3)',
  },
  action: {
    bg: 'var(--ds-color-warning-surface, #fff8eb)',
    border: 'var(--ds-color-warning-border, #f79009)',
    text: 'var(--ds-color-warning, #b54708)',
  },
  critical: {
    bg: 'var(--ds-color-danger-surface, #fef3f2)',
    border: 'var(--ds-color-danger-border, #f04438)',
    text: 'var(--ds-color-danger, #b42318)',
  },
  ready: {
    bg: 'var(--ds-color-success-surface, #f0fdf4)',
    border: 'var(--ds-color-success-border, #12b76a)',
    text: 'var(--ds-color-success, #067647)',
  },
};
