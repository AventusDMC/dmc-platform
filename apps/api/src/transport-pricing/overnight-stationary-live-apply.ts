// PR 12F-1 — Driver-overnight + stationary LIVE-APPLY decision skeleton (PURE, no I/O).
//
// This module is the DESIGN/TEST skeleton for a future live apply of overnight/stationary
// charges on top of an applied package (PR 12F-2 will do the number-changing wiring). It is a
// pure function over the already-validated read-only `overnightStationaryShadow` (PR 12C-2).
//
// 12F-1 GUARANTEE: it NEVER changes totals — `apply` is ALWAYS false and `costDelta`/`sellDelta`
// are ALWAYS 0. It only SURFACES the future decision (which charges would apply, and the
// abort-on-blocker rule), so the decision matrix is locked by tests before any apply ships.
//
// Approved product decisions encoded here (PR 12F-1):
//   • Representation: embedded total-level delta + structured per-day breakdown (no QuoteItems).
//   • Supplier-cost / internal only; pass-through (NO markup) → wouldApplySell === wouldApplyCost.
//   • Any blocker on a relevant charge ABORTS the whole overnight/stationary apply (no partial).
//   • Included stationary → outcome 'included' → no charge (internal note only).
//   • Per-day breakdown, carrying city where the shadow provides it.
//   • Capacity-unit overnight stays deferred (the shadow never emits such a charge; its
//     deferral warning is carried through unchanged).

import type { OvernightStationaryShadowResult } from './overnight-stationary-shadow';

export type OvernightStationaryApplyOptions = {
  // Reserved for PR 12F-2 (e.g. pricingIsSlab, recalcItemIds). Unused in 12F-1.
  pricingIsSlab?: boolean;
};

export type OvernightStationaryApplyLine = {
  dayNumber: number;
  kind: 'overnight' | 'stationary';
  outcome: string;
  amount: number;
  currency: string | null;
  city: string | null;
  blocker: string | null;
  // PR 12F-3A — optional internal enrichment for the admin-web breakdown / supplier readiness.
  // Filled by the read-only shadow-response assembly from the day's resolved vehicle; the pure
  // decider leaves them undefined.
  supplierId?: string | null;
  vehicleClass?: string | null;
  vehicleName?: string | null;
};

export type OvernightStationaryLiveApplyResult = {
  /** PR 12F-2: true only when the shadow is valid, blocker-free, and has recognized charges. */
  apply: boolean;
  reason: 'flag-disabled' | 'no-shadow' | 'blocked' | 'no-charges' | 'applied';
  /** PR 12F-2: the pass-through overnight/stationary cost folded into totalCost when apply=true; 0 otherwise. */
  costDelta: number;
  /** PR 12F-2: ALWAYS 0 — supplier-cost / internal only, client sell totals never change. */
  sellDelta: number;
  /** Diagnostic — the pass-through cost the apply WOULD/DOES use (mirrors costDelta when applied). */
  wouldApplyCost: number;
  /** Diagnostic — equals wouldApplyCost (supplier-cost only, no markup in the first rollout). */
  wouldApplySell: number;
  blockers: string[];
  warnings: string[];
  /** Per-day breakdown of every overnight/stationary charge the shadow surfaced. */
  lines: OvernightStationaryApplyLine[];
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;
}

const ZERO = {
  apply: false as const,
  costDelta: 0,
  sellDelta: 0,
  wouldApplyCost: 0,
  wouldApplySell: 0,
  blockers: [] as string[],
  warnings: [] as string[],
  lines: [] as OvernightStationaryApplyLine[],
};

/**
 * Pure decision over the validated overnight/stationary shadow (PR 12F-2 — number-changing).
 * Applies a pass-through COST delta (supplier-cost only; sellDelta always 0) when the shadow is
 * valid, has no blockers, and surfaces recognized 'separate' charges. Any blocker aborts the
 * whole apply (no partial); included/no-charge/waived rows contribute 0 and remain note lines.
 */
export function decideOvernightStationaryLiveApply(
  shadow: OvernightStationaryShadowResult | null | undefined,
  _opts: OvernightStationaryApplyOptions = {},
): OvernightStationaryLiveApplyResult {
  if (!shadow) return { ...ZERO, reason: 'no-shadow' };

  const warnings = [...(shadow.warnings ?? [])];
  const overnight = shadow.overnightCharges ?? [];
  const stationary = shadow.stationaryCharges ?? [];

  const lines: OvernightStationaryApplyLine[] = [
    ...overnight.map((c) => ({ dayNumber: c.dayNumber, kind: 'overnight' as const, outcome: c.outcome, amount: c.amount, currency: c.currency, city: c.overnightCity ?? null, blocker: c.blocker ?? null })),
    ...stationary.map((c) => ({ dayNumber: c.dayNumber, kind: 'stationary' as const, outcome: c.outcome, amount: c.amount, currency: c.currency, city: null, blocker: c.blocker ?? null })),
  ];

  // Approved decision #5 — any blocker on a relevant charge (or a top-level shadow blocker)
  // ABORTS the whole overnight/stationary apply. No partial application.
  const blockers = Array.from(
    new Set([
      ...(shadow.blockers ?? []),
      ...overnight.filter((c) => c.blocker).map((c) => c.blocker as string),
      ...stationary.filter((c) => c.blocker).map((c) => c.blocker as string),
    ]),
  );
  if (blockers.length > 0) {
    return { ...ZERO, reason: 'blocked', blockers, warnings, lines };
  }

  // Pass-through (no markup), supplier-cost only: only 'separate' charges count — 'included' /
  // 'no-charge' / 'waived' contribute nothing (they remain note lines in `lines`).
  const wouldApplyCost = round2(
    overnight.filter((c) => c.outcome === 'separate').reduce((s, c) => s + (Number(c.amount) || 0), 0) +
      stationary.filter((c) => c.outcome === 'separate').reduce((s, c) => s + (Number(c.amount) || 0), 0),
  );
  if (wouldApplyCost <= 0) {
    return { ...ZERO, reason: 'no-charges', warnings, lines };
  }

  // PR 12F-2 — APPLY: fold the pass-through cost delta. sellDelta stays 0 (internal supplier-cost
  // only; the client sell total is unchanged). The per-day breakdown is recompute-on-demand here.
  return {
    ...ZERO,
    apply: true,
    reason: 'applied',
    costDelta: wouldApplyCost,
    sellDelta: 0,
    wouldApplyCost,
    wouldApplySell: wouldApplyCost,
    warnings,
    lines,
  };
}
