// Transport feature flags (PR5 of the contract-regime refactor). All default OFF.
//
// `transport.packageEligibilityShadow` gates the read-only package-eligibility shadow
// diagnostic endpoint. When OFF (the default), the shadow path does not run at all.

export const PACKAGE_ELIGIBILITY_SHADOW_FLAG = 'transport.packageEligibilityShadow';

function readBooleanEnv(name: string): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

// OFF unless TRANSPORT_PACKAGE_ELIGIBILITY_SHADOW is explicitly truthy.
export function isPackageEligibilityShadowEnabled(): boolean {
  return readBooleanEnv('TRANSPORT_PACKAGE_ELIGIBILITY_SHADOW');
}

// `transport.packagePricingShadowCompare` (PR9) gates the read-only pricing shadow-compare
// endpoint (route/transfer baseline vs package candidate). Independent of the eligibility
// flag. OFF (default) → the comparison never runs.
export const PACKAGE_PRICING_SHADOW_COMPARE_FLAG = 'transport.packagePricingShadowCompare';

export function isPackagePricingShadowCompareEnabled(): boolean {
  return readBooleanEnv('TRANSPORT_PACKAGE_PRICING_SHADOW_COMPARE');
}

// `transport.packageOptionSelection` (PR10B-1) gates the save/clear of a planner's manual
// route-vs-package selection (metadata only, never applied to totals). OFF (default) → the
// save endpoint rejects.
export const PACKAGE_OPTION_SELECTION_FLAG = 'transport.packageOptionSelection';

export function isPackageOptionSelectionEnabled(): boolean {
  return readBooleanEnv('TRANSPORT_PACKAGE_OPTION_SELECTION');
}

// `transport.packagePricingLiveApply` (PR11A) gates the FIRST live-apply step: applying a saved,
// valid PACKAGE selection to a quote's transport totals (total-level additive delta only — never
// mutates quote items). OFF (default) → totals are computed exactly as today; the saved selection
// stays metadata-only. PR11A applies ONLY for the single pinned pilot contract.
export const PACKAGE_PRICING_LIVE_APPLY_FLAG = 'transport.packagePricingLiveApply';

export function isPackagePricingLiveApplyEnabled(): boolean {
  return readBooleanEnv('TRANSPORT_PACKAGE_PRICING_LIVE_APPLY');
}

// `transport.overnightStationaryLiveApply` (PR12F) gates the future live apply of driver
// overnight / stationary charges on top of an applied package. OFF (default). In PR12F-1 the
// gated method is a NO-OP for totals: it consumes the validated overnight/stationary SHADOW and
// surfaces the decision matrix (recognized charges + abort-on-blocker) but ALWAYS returns
// apply:false with zero cost/sell deltas, and is NOT wired into recalculateQuoteTotals. The
// number-changing implementation is PR12F-2.
export const OVERNIGHT_STATIONARY_LIVE_APPLY_FLAG = 'transport.overnightStationaryLiveApply';

export function isOvernightStationaryLiveApplyEnabled(): boolean {
  return readBooleanEnv('TRANSPORT_OVERNIGHT_STATIONARY_LIVE_APPLY');
}
