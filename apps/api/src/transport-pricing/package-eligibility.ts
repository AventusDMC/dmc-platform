// Package eligibility / minimumFullDays evaluation (PR4 of the contract-regime refactor)
// — PURE / SHADOW. Answers one question only:
//   Given a PACKAGE_MIN_FULL_DAY contract candidate and classified transport days, is the
//   package option ELIGIBLE, INELIGIBLE, or MANUALLY BLOCKED?
//
// INERT: imported by NO live quote/pricing code. It does not price, enforce minimums in
// live pricing, choose suppliers/methods, charge overnight, or activate DAILY_PACKAGE.
// It consumes the PR3 day-classifier output and a minimal contract shape, and returns a
// diagnostic verdict. No DB, no side effects.

import {
  classifyItinerary,
  type ItineraryDayInput,
  type ItineraryClassification,
  type DayClassificationPolicy,
} from '../common/transport-day-classification';

export const MINIMUM_DAY_POLICIES = ['INELIGIBLE_UNDER_MIN', 'CHARGE_MINIMUM_DAYS'] as const;
export type MinimumDayPolicy = (typeof MINIMUM_DAY_POLICIES)[number];

export const PACKAGE_INELIGIBLE_REASONS = ['no-package-contract', 'below-minimum'] as const;
export type PackageIneligibleReason = (typeof PACKAGE_INELIGIBLE_REASONS)[number];

// Minimal contract shape the evaluator needs. In production this is derived from a
// PACKAGE_MIN_FULL_DAY TransportContract; `null` means no such contract exists.
export type PackageContractCandidate = {
  minimumFullDays: number;
  minimumDayPolicy?: MinimumDayPolicy; // default INELIGIBLE_UNDER_MIN
  // Classification-policy flags (drive PR3 weighting); used only by the *ForDays helper.
  halfDayCountsTowardMin?: boolean;
  halfDayChargedAsFullDay?: boolean;
  stationaryCountsTowardMinDays?: boolean;
  airportTransferIncluded?: boolean;
  halfDayWeight?: number;
};

export type PackageEligibility = {
  eligible: boolean;
  reason: PackageIneligibleReason | null;
  countedFullPackageDays: number;
  minimumFullDays: number | null;
  minimumDayPolicy: MinimumDayPolicy | null;
  billedAtMinimum: boolean; // CHARGE_MINIMUM_DAYS below min → bill the floor
  billedDays: number | null; // days that would be billed (shadow only — not priced here)
  manualRequiredDays: number; // retention-candidate days that must be confirmed (never auto-counted)
};

// Core evaluator: pre-classified days + contract candidate → verdict. Pure.
export function evaluatePackageEligibility(
  classified: ItineraryClassification,
  contract: PackageContractCandidate | null,
): PackageEligibility {
  const counted = classified.countedFullPackageDays;
  const manualRequiredDays = classified.days.filter((d) => d.retentionCandidate).length;

  if (!contract) {
    return {
      eligible: false,
      reason: 'no-package-contract',
      countedFullPackageDays: counted,
      minimumFullDays: null,
      minimumDayPolicy: null,
      billedAtMinimum: false,
      billedDays: null,
      manualRequiredDays,
    };
  }

  const minimumFullDays = contract.minimumFullDays;
  const policy: MinimumDayPolicy = contract.minimumDayPolicy ?? 'INELIGIBLE_UNDER_MIN';

  if (counted >= minimumFullDays) {
    return {
      eligible: true,
      reason: null,
      countedFullPackageDays: counted,
      minimumFullDays,
      minimumDayPolicy: policy,
      billedAtMinimum: false,
      billedDays: counted,
      manualRequiredDays,
    };
  }

  // Below the minimum.
  if (policy === 'CHARGE_MINIMUM_DAYS') {
    return {
      eligible: true,
      reason: null,
      countedFullPackageDays: counted,
      minimumFullDays,
      minimumDayPolicy: policy,
      billedAtMinimum: true,
      billedDays: minimumFullDays,
      manualRequiredDays,
    };
  }

  return {
    eligible: false,
    reason: 'below-minimum',
    countedFullPackageDays: counted,
    minimumFullDays,
    minimumDayPolicy: policy,
    billedAtMinimum: false,
    billedDays: null,
    manualRequiredDays,
  };
}

// Convenience: classify raw itinerary days using the contract's classification-policy
// flags, then evaluate. When `contract` is null, days are classified with default policy
// and the verdict is `no-package-contract`.
export function evaluatePackageEligibilityForDays(
  days: ItineraryDayInput[],
  contract: PackageContractCandidate | null,
): PackageEligibility {
  // Build the classification policy WITHOUT undefined keys — spreading an explicit
  // `undefined` over the classifier's defaults would wipe them (e.g. halfDayWeight → NaN).
  const policy: DayClassificationPolicy = {};
  if (contract) {
    if (contract.halfDayCountsTowardMin !== undefined) policy.halfDayCountsTowardMin = contract.halfDayCountsTowardMin;
    if (contract.halfDayChargedAsFullDay !== undefined) policy.halfDayChargedAsFullDay = contract.halfDayChargedAsFullDay;
    if (contract.stationaryCountsTowardMinDays !== undefined) policy.stationaryCountsTowardMinDays = contract.stationaryCountsTowardMinDays;
    if (contract.airportTransferIncluded !== undefined) policy.airportTransferIncluded = contract.airportTransferIncluded;
    if (contract.halfDayWeight !== undefined) policy.halfDayWeight = contract.halfDayWeight;
  }
  return evaluatePackageEligibility(classifyItinerary(days, policy), contract);
}
