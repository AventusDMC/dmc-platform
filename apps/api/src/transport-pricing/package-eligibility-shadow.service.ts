import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  classifyItinerary,
  OPERATIONAL_TRANSPORT_TYPES,
  type ItineraryDayInput,
  type DayClassification,
  type OperationalTransportType,
} from '../common/transport-day-classification';
import {
  evaluatePackageEligibility,
  type PackageContractCandidate,
} from './package-eligibility';
import {
  isPackageEligibilityShadowEnabled,
  PACKAGE_ELIGIBILITY_SHADOW_FLAG,
  isPackagePricingShadowCompareEnabled,
  PACKAGE_PRICING_SHADOW_COMPARE_FLAG,
  isPackageOptionSelectionEnabled,
} from './transport-feature-flags';

// PR5 + PR6 — Package-eligibility SHADOW service (read-only / diagnostic).
//
// Runs the PR3 classifier + PR4 evaluator against a quote's transport days and returns a
// diagnostic verdict. STRICTLY READ-ONLY: no quote/quote-item mutation, no pricing change,
// no persistence. Gated by `transport.packageEligibilityShadow` (default OFF).
//
// PR6: reads per-day retention metadata captured on QuoteItineraryDay (transportDayType,
// vehicleRetained, vehicleReleased, inRetainedBlock). When NULL → current conservative
// inference (unchanged behavior). Contradictory metadata (vehicleRetained=true AND
// vehicleReleased=true) is treated as manual-required / invalid and NEVER auto-counted.

export type ShadowDayItem = {
  transportServiceTypeId?: string | null;
  touringRouteId?: string | null;
  vehicleId?: string | null;
  serviceTypeCode?: string | null;
  serviceTypeClassification?: string | null;
  vehicleClass?: string | null;
  supplierId?: string | null;
};

export type ShadowDayMetadata = {
  transportDayType?: string | null;
  vehicleRetained?: boolean | null;
  vehicleReleased?: boolean | null;
  inRetainedBlock?: boolean | null;
};

export type ShadowDay = { dayNumber: number; items: ShadowDayItem[]; metadata?: ShadowDayMetadata | null };

export function isValidOperationalType(value: unknown): value is OperationalTransportType {
  return typeof value === 'string' && (OPERATIONAL_TRANSPORT_TYPES as readonly string[]).includes(value);
}

// Pure: infer the operational transport type for a day from its transport items (used when
// no explicit transportDayType metadata is set). A day with no transport item is FREE.
export function inferOperationalType(items: ShadowDayItem[]): OperationalTransportType {
  const transportItems = items.filter((it) => it.touringRouteId || it.transportServiceTypeId || it.vehicleId);
  if (transportItems.length === 0) return 'FREE_DAY_NO_VEHICLE';
  const it = transportItems[0];
  if (it.touringRouteId) return 'TOURING_ROUTE';
  const cls = String(it.serviceTypeClassification || '').toUpperCase();
  const code = String(it.serviceTypeCode || '').toUpperCase();
  if (cls === 'FULL_DAY' || code === 'DAILY_FULL_DAY') return 'FULL_DAY_SERVICE';
  if (cls === 'HALF_DAY' || code === 'HALF_DAY') return 'HALF_DAY_SERVICE';
  if (code.includes('AIRPORT')) return 'AIRPORT_TRANSFER';
  if (code.includes('STATIONARY')) return 'STATIONARY_FULL_DAY';
  if (code.includes('STANDBY') || code.includes('WAITING')) return 'STANDBY_WAITING';
  return 'POINT_TO_POINT';
}

// Pure: resolve one day's classifier input from items + metadata, applying the contradiction
// rule. `metadataInvalid` = vehicleRetained && vehicleReleased both true → never auto-count.
export function resolveDayInput(day: ShadowDay): { input: ItineraryDayInput; metadataInvalid: boolean } {
  const md = day.metadata || {};
  const operationalType = isValidOperationalType(md.transportDayType)
    ? md.transportDayType
    : inferOperationalType(day.items);
  const carrier = day.items.find((it) => it.vehicleClass || it.supplierId);
  const supplierKey = carrier?.supplierId ?? null;
  const vehicleKey = carrier?.vehicleClass ?? null;

  const retained = md.vehicleRetained;
  const released = md.vehicleReleased;
  const metadataInvalid = retained === true && released === true;

  const input: ItineraryDayInput = { operationalType, supplierKey, vehicleKey };
  if (!metadataInvalid) {
    // Carry explicit signals; PR3 classifier applies the locked precedence. Contradiction
    // clears all signals (→ conservative weight 0) and is flagged separately.
    if (retained === true || retained === false) input.retained = retained;
    if (released === true || released === false) input.vehicleReleased = released;
    if (md.inRetainedBlock === true) input.inRetainedBlock = true;
  }
  return { input, metadataInvalid };
}

export function mapShadowDays(days: ShadowDay[]): {
  inputs: ItineraryDayInput[];
  invalidFlags: boolean[];
  primary: { supplierId: string | null; vehicleClass: string | null };
} {
  let primary: { supplierId: string | null; vehicleClass: string | null } = { supplierId: null, vehicleClass: null };
  const inputs: ItineraryDayInput[] = [];
  const invalidFlags: boolean[] = [];
  for (const day of days) {
    const { input, metadataInvalid } = resolveDayInput(day);
    inputs.push(input);
    invalidFlags.push(metadataInvalid);
    if (!primary.vehicleClass && (input.supplierKey || input.vehicleKey) && input.operationalType !== 'FREE_DAY_NO_VEHICLE') {
      primary = { supplierId: input.supplierKey ?? null, vehicleClass: input.vehicleKey ?? null };
    }
  }
  return { inputs, invalidFlags, primary };
}

export type ShadowDayPlanEntry = { dayNumber: number; metadataInvalid: boolean } & DayClassification;
export type PackageEligibilityShadowResult = {
  quoteId: string;
  flag: string;
  contract: { found: boolean; supplierId?: string; vehicleClass?: string; currency?: string; minimumFullDays?: number; minimumDayPolicy?: string | null };
  eligibility: ReturnType<typeof evaluatePackageEligibility>;
  dayPlan: ShadowDayPlanEntry[];
};

// PR11B-2A — vehicle-aware allowlist for package live apply (DIAGNOSTICS ONLY in this PR).
// Maps a package contract id → the set of vehicle ids it may price. Class-level package contracts
// cannot distinguish standard vs VIP/VVIP/Grand-Star vehicles sharing one vehicleClass; this
// allowlist pins the contract to its intended STANDARD vehicle(s). Pilot = Alpha "Large 49" only
// (NOT Large VIP 31-33 49c5fd5d… nor Mercedes Grand Star 33906a47…/94c1a79b…). In-code constant:
// small, closed, reviewed-in-PR; no schema. 11B-2A surfaces the decision in the shadow output but
// does NOT enforce it in computeQuotePackageLiveApply (enforcement is PR 11B-2B).
export const PACKAGE_VEHICLE_ALLOWLIST: Record<string, string[]> = {
  '66f5de06-28df-426c-90b8-ffaa01ed5c5f': ['6d575442-05fd-4cf6-bd22-5e8a0ee12303'], // pilot → Alpha Large 49
};

const VIP_OR_GRAND_STAR_NAME = /VIP|VVIP|Grand\s*Star/i;

export type PackageAllowlistDecision = {
  allowed: boolean;
  reason: string;
  contractId: string | null;
  resolvedVehicleIds: string[];
  allowedVehicleIds: string[];
  vehicleNames: string[];
  blockers: string[];
};

// Pure, read-only decision over the COUNTED-day transport vehicles. Surfaces (does not enforce) the
// VIP/standard conflation risk. `blockers` is the full list; `reason` is the first blocker (or
// 'allowed'). Never mutates anything.
export function computePackageAllowlistDecision(input: {
  contractId: string | null;
  contractCurrency: string | null;
  quoteCurrency: string | null;
  countedVehicles: Array<{ vehicleId: string | null; vehicleName: string | null; supplierId: string | null }>;
}): PackageAllowlistDecision {
  const blockers: string[] = [];
  const contractId = input.contractId ?? null;
  const inAllowlist = !!contractId && Object.prototype.hasOwnProperty.call(PACKAGE_VEHICLE_ALLOWLIST, contractId);
  const allowedVehicleIds = (contractId && PACKAGE_VEHICLE_ALLOWLIST[contractId]) || [];
  const resolvedVehicleIds = Array.from(new Set(input.countedVehicles.map((v) => v.vehicleId).filter(Boolean))) as string[];
  const vehicleNames = Array.from(new Set(input.countedVehicles.map((v) => v.vehicleName).filter(Boolean))) as string[];
  const supplierIds = Array.from(new Set(input.countedVehicles.map((v) => v.supplierId).filter(Boolean)));
  const anyMissing = input.countedVehicles.length === 0 || input.countedVehicles.some((v) => !v.vehicleId);

  if (!inAllowlist) blockers.push('not-allowlisted-contract');
  if (input.quoteCurrency && input.contractCurrency && input.quoteCurrency !== input.contractCurrency) blockers.push('cross-currency');
  if (supplierIds.length > 1) blockers.push('mixed-suppliers');
  if (anyMissing) blockers.push('missing-vehicle-id');
  else if (resolvedVehicleIds.length > 1) blockers.push('mixed-vehicles');
  else {
    const vid = resolvedVehicleIds[0];
    if (!allowedVehicleIds.includes(vid)) {
      blockers.push('vehicle-not-allowlisted');
      if (vehicleNames.some((n) => VIP_OR_GRAND_STAR_NAME.test(n))) blockers.push('vip-or-grand-star-not-allowed');
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, reason: allowed ? 'allowed' : blockers[0], contractId, resolvedVehicleIds, allowedVehicleIds, vehicleNames, blockers };
}

// PR11A — result of the live-apply decision. `apply:false` carries a `reason` (used for logs /
// fall-back to existing pricing). `apply:true` carries the total-level deltas + diagnostics.
export type LivePackageApplyResult = {
  apply: boolean;
  reason: string | null;
  costDelta: number;
  sellDelta: number;
  contractId?: string;
  countedCost?: number;
  countedSell?: number;
  packageNet?: number;
  weightedMarkupPercent?: number;
  supplierDiscountPercent?: number;
  previousTransportTotal?: number;
  appliedTransportTotal?: number;
  warnings?: string[];
};

@Injectable()
export class PackageEligibilityShadowService {
  // PR11A pilot pin — apply live package pricing ONLY for this single contract id (Alpha Large
  // Bus USD). Pinning by id (not supplier+class+currency) avoids the unresolved Alpha Large Bus
  // vs VIP 31-33 ambiguity. Broader activation is PR11B.
  static readonly PILOT_PACKAGE_CONTRACT_ID = '66f5de06-28df-426c-90b8-ffaa01ed5c5f';

  constructor(private readonly prisma: PrismaService) {}

  async evaluateQuotePackageEligibilityShadow(quoteId: string): Promise<PackageEligibilityShadowResult | null> {
    if (!isPackageEligibilityShadowEnabled()) return null;

    const rawDays = await this.prisma.quoteItineraryDay.findMany({
      where: { quoteId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }],
      select: {
        dayNumber: true,
        transportDayType: true,
        vehicleRetained: true,
        vehicleReleased: true,
        inRetainedBlock: true,
        dayItems: {
          where: { isActive: true },
          select: {
            quoteService: {
              select: {
                transportServiceTypeId: true,
                touringRouteId: true,
                vehicleId: true,
                appliedVehicleRate: {
                  select: { supplierId: true, vehicle: { select: { vehicleClass: true, resolvedSupplierId: true } }, serviceType: { select: { code: true, classification: true } } },
                },
                touringRoutePricing: {
                  select: { supplierId: true, vehicle: { select: { vehicleClass: true, resolvedSupplierId: true } }, transportServiceType: { select: { code: true, classification: true } } },
                },
              },
            },
          },
        },
      },
    });

    const days: ShadowDay[] = (rawDays as any[]).map((d) => ({
      dayNumber: d.dayNumber,
      metadata: { transportDayType: d.transportDayType, vehicleRetained: d.vehicleRetained, vehicleReleased: d.vehicleReleased, inRetainedBlock: d.inRetainedBlock },
      items: (d.dayItems || []).map((di: any) => {
        const qs = di.quoteService || {};
        const avr = qs.appliedVehicleRate;
        const trp = qs.touringRoutePricing;
        const st = avr?.serviceType || trp?.transportServiceType || null;
        const veh = avr?.vehicle || trp?.vehicle || null;
        return {
          transportServiceTypeId: qs.transportServiceTypeId ?? null,
          touringRouteId: qs.touringRouteId ?? null,
          vehicleId: qs.vehicleId ?? null,
          serviceTypeCode: st?.code ?? null,
          serviceTypeClassification: st?.classification ?? null,
          vehicleClass: veh?.vehicleClass ?? null,
          supplierId: avr?.supplierId || veh?.resolvedSupplierId || trp?.supplierId || null,
        } as ShadowDayItem;
      }),
    }));

    const { inputs, invalidFlags, primary } = mapShadowDays(days);

    let contractRow: any = null;
    if (primary.supplierId && primary.vehicleClass) {
      contractRow = await this.prisma.transportContract.findFirst({
        where: { supplierId: primary.supplierId, vehicleClass: primary.vehicleClass, regime: 'PACKAGE_MIN_FULL_DAY', active: true },
      });
    }

    const contractCandidate: PackageContractCandidate | null = contractRow
      ? {
          minimumFullDays: contractRow.minimumFullDays ?? 3,
          minimumDayPolicy: contractRow.minimumDayPolicy ?? undefined,
          halfDayCountsTowardMin: contractRow.halfDayCountsTowardMin,
          halfDayChargedAsFullDay: contractRow.halfDayChargedAsFullDay,
          stationaryCountsTowardMinDays: contractRow.stationaryCountsTowardMinDays,
          airportTransferIncluded: contractRow.airportTransferIncluded,
        }
      : null;

    const policy = contractCandidate
      ? Object.fromEntries(
          Object.entries({
            halfDayCountsTowardMin: contractCandidate.halfDayCountsTowardMin,
            halfDayChargedAsFullDay: contractCandidate.halfDayChargedAsFullDay,
            stationaryCountsTowardMinDays: contractCandidate.stationaryCountsTowardMinDays,
            airportTransferIncluded: contractCandidate.airportTransferIncluded,
          }).filter(([, v]) => v !== undefined),
        )
      : {};

    const classified = classifyItinerary(inputs, policy);

    // Apply the contradiction rule: invalid-metadata days are forced to manual-required,
    // weight 0, retention-candidate (so they count in manualRequiredDays, never as full days).
    const adjustedDays: DayClassification[] = classified.days.map((c, i) =>
      invalidFlags[i]
        ? { ...c, packageDayWeight: 0, countsAsFullPackageDay: false, countsTowardMinimum: false, billedAs: 'manual-required', retentionCandidate: true }
        : c,
    );
    const adjusted = {
      days: adjustedDays,
      countedFullPackageDays: Number(adjustedDays.reduce((s, c) => s + c.packageDayWeight, 0).toFixed(2)),
    };

    const eligibility = evaluatePackageEligibility(adjusted, contractCandidate);

    return {
      quoteId,
      flag: PACKAGE_ELIGIBILITY_SHADOW_FLAG,
      contract: contractRow
        ? { found: true, supplierId: contractRow.supplierId, vehicleClass: contractRow.vehicleClass, currency: contractRow.currency, minimumFullDays: contractRow.minimumFullDays, minimumDayPolicy: contractRow.minimumDayPolicy ?? null }
        : { found: false },
      eligibility,
      dayPlan: adjustedDays.map((c, i) => ({ dayNumber: days[i]?.dayNumber ?? i + 1, metadataInvalid: invalidFlags[i], ...c })),
    };
  }

  // PR9 — read-only pricing shadow-compare: route/transfer baseline (persisted) vs package
  // candidate (net of supplier discount). Returns null when the flag is OFF. NEVER writes,
  // never recalculates quote costs, never applies the package price.
  async evaluateQuotePackagePricingShadow(quoteId: string): Promise<any | null> {
    if (!isPackagePricingShadowCompareEnabled()) return null;
    const round = (n: number) => Number((Number(n) || 0).toFixed(2));

    const rawDays = await this.prisma.quoteItineraryDay.findMany({
      where: { quoteId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }],
      select: {
        dayNumber: true, transportDayType: true, vehicleRetained: true, vehicleReleased: true, inRetainedBlock: true,
        dayItems: {
          where: { isActive: true },
          select: {
            quoteService: {
              select: {
                transportServiceTypeId: true, touringRouteId: true, vehicleId: true,
                finalCost: true, totalCost: true, overrideCost: true, useOverride: true,
                appliedVehicleRate: { select: { supplierId: true, vehicle: { select: { id: true, name: true, vehicleClass: true, resolvedSupplierId: true } }, serviceType: { select: { code: true, classification: true } } } },
                touringRoutePricing: { select: { supplierId: true, vehicle: { select: { id: true, name: true, vehicleClass: true, resolvedSupplierId: true } }, transportServiceType: { select: { code: true, classification: true } } } },
              },
            },
          },
        },
      },
    });

    const isTransport = (qs: any) => Boolean(qs.transportServiceTypeId || qs.touringRouteId || qs.vehicleId);
    const persistedCost = (qs: any) => {
      const eff = qs.useOverride ? (qs.finalCost ?? qs.overrideCost ?? qs.totalCost) : (qs.finalCost ?? qs.totalCost);
      return Number(eff) || 0;
    };

    const days: ShadowDay[] = (rawDays as any[]).map((d) => ({
      dayNumber: d.dayNumber,
      metadata: { transportDayType: d.transportDayType, vehicleRetained: d.vehicleRetained, vehicleReleased: d.vehicleReleased, inRetainedBlock: d.inRetainedBlock },
      items: (d.dayItems || []).map((di: any) => {
        const qs = di.quoteService || {};
        const avr = qs.appliedVehicleRate;
        const trp = qs.touringRoutePricing;
        const st = avr?.serviceType || trp?.transportServiceType || null;
        const veh = avr?.vehicle || trp?.vehicle || null;
        return {
          transportServiceTypeId: qs.transportServiceTypeId ?? null,
          touringRouteId: qs.touringRouteId ?? null,
          vehicleId: qs.vehicleId ?? null,
          serviceTypeCode: st?.code ?? null,
          serviceTypeClassification: st?.classification ?? null,
          vehicleClass: veh?.vehicleClass ?? null,
          supplierId: avr?.supplierId || veh?.resolvedSupplierId || trp?.supplierId || null,
        } as ShadowDayItem;
      }),
    }));
    // Per-day persisted route cost (read-only baseline; NO recalculation).
    const dayRouteCost = (rawDays as any[]).map((d) => (d.dayItems || []).reduce((s: number, di: any) => s + (isTransport(di.quoteService || {}) ? persistedCost(di.quoteService) : 0), 0));
    const currentTransportTotal = round(dayRouteCost.reduce((a, b) => a + b, 0));

    const { inputs, invalidFlags, primary } = mapShadowDays(days);

    let contractRow: any = null;
    if (primary.supplierId && primary.vehicleClass) {
      contractRow = await this.prisma.transportContract.findFirst({ where: { supplierId: primary.supplierId, vehicleClass: primary.vehicleClass, regime: 'PACKAGE_MIN_FULL_DAY', active: true } });
    }
    const contractCandidate: PackageContractCandidate | null = contractRow
      ? { minimumFullDays: contractRow.minimumFullDays ?? 3, minimumDayPolicy: contractRow.minimumDayPolicy ?? undefined, halfDayCountsTowardMin: contractRow.halfDayCountsTowardMin, halfDayChargedAsFullDay: contractRow.halfDayChargedAsFullDay, stationaryCountsTowardMinDays: contractRow.stationaryCountsTowardMinDays, airportTransferIncluded: contractRow.airportTransferIncluded }
      : null;
    const policy = contractCandidate
      ? Object.fromEntries(Object.entries({ halfDayCountsTowardMin: contractCandidate.halfDayCountsTowardMin, halfDayChargedAsFullDay: contractCandidate.halfDayChargedAsFullDay, stationaryCountsTowardMinDays: contractCandidate.stationaryCountsTowardMinDays, airportTransferIncluded: contractCandidate.airportTransferIncluded }).filter(([, v]) => v !== undefined))
      : {};

    const classified = classifyItinerary(inputs, policy);
    const adjustedDays: DayClassification[] = classified.days.map((c, i) => invalidFlags[i] ? { ...c, packageDayWeight: 0, countsAsFullPackageDay: false, countsTowardMinimum: false, billedAs: 'manual-required', retentionCandidate: true } : c);
    const adjusted = { days: adjustedDays, countedFullPackageDays: round(adjustedDays.reduce((s, c) => s + c.packageDayWeight, 0)) };
    const eligibility = evaluatePackageEligibility(adjusted, contractCandidate);

    // Supplier discount (parity with the net persisted baseline).
    let supplierDiscountPercent = 0;
    if (primary.supplierId) {
      const sup = await this.prisma.supplier.findUnique({ where: { id: primary.supplierId }, select: { transportDiscountPercent: true } });
      supplierDiscountPercent = Number((sup as any)?.transportDiscountPercent ?? 0) || 0;
    }

    const fullDayRate = contractRow ? Number(contractRow.fullDayRate ?? 0) || 0 : 0;
    const halfDayRate = contractRow ? Number(contractRow.halfDayRate ?? 0) || 0 : 0;
    const fullDayCount = adjustedDays.filter((c) => c.packageDayWeight === 1).length;
    const halfDayCount = adjustedDays.filter((c) => c.packageDayWeight === 0.5).length;

    // Non-counted transport days keep their persisted route cost (covered in both totals).
    const excludedDays: any[] = [];
    adjustedDays.forEach((c, i) => {
      if (c.packageDayWeight === 0 && c.operationalType !== 'FREE_DAY_NO_VEHICLE' && dayRouteCost[i] > 0) {
        const reason = c.billedAs === 'manual-required' ? 'manual-required' : c.operationalType.startsWith('STATIONARY') ? 'stationary' : c.operationalType === 'STANDBY_WAITING' ? 'standby' : c.operationalType === 'AIRPORT_TRANSFER' ? 'airport' : 'not-counted';
        excludedDays.push({ dayNumber: days[i].dayNumber, operationalType: c.operationalType, routeCost: round(dayRouteCost[i]), reason });
      }
    });
    const excludedRouteCost = round(excludedDays.reduce((s, d) => s + d.routeCost, 0));

    let packageGrossTotal: number | null = null;
    let packageNetTotal: number | null = null;
    let supplierDiscountAmount: number | null = null;
    let difference: number | null = null;
    if (eligibility.eligible) {
      const packageDaysGross = eligibility.billedAtMinimum
        ? round((contractCandidate!.minimumFullDays || 0) * fullDayRate)
        : round(fullDayCount * fullDayRate + halfDayCount * halfDayRate);
      const packageDaysNet = round(packageDaysGross * (1 - supplierDiscountPercent / 100));
      supplierDiscountAmount = round(packageDaysGross - packageDaysNet);
      packageGrossTotal = round(packageDaysGross + excludedRouteCost);
      packageNetTotal = round(packageDaysNet + excludedRouteCost);
      difference = round(packageNetTotal - currentTransportTotal);
    }

    const warnings: string[] = [];
    if (contractRow) warnings.push('standard-large-bus-49-rate-only-not-vip-31-33');
    warnings.push('excludes-driver-overnight');
    if (adjustedDays.some((c) => c.operationalType === 'STATIONARY_FULL_DAY' || c.operationalType === 'STATIONARY_HALF_DAY')) warnings.push('stationary-not-priced-in-pr9');

    // PR10B-2 — read-only persisted selection state (additive). Only populated when the
    // selection flag is ON. NEVER writes. Staleness is recomputed here against the freshly
    // resolved active package contract (contractRow) and the current eligibility result, so a
    // selected contract that is later deactivated/deleted/mismatched/ineligible reads as stale.
    let savedSelection: {
      option: string;
      contractId: string | null;
      isManual: boolean | null;
      at: Date | null;
      byUserId: string | null;
    } | null = null;
    let selectionStale = false;
    if (isPackageOptionSelectionEnabled()) {
      const sel = await this.prisma.quote.findUnique({
        where: { id: quoteId },
        select: {
          selectedTransportPricingOption: true,
          selectedTransportContractId: true,
          transportSelectionIsManual: true,
          transportSelectionAt: true,
          transportSelectionByUserId: true,
        },
      });
      if (sel?.selectedTransportPricingOption) {
        savedSelection = {
          option: sel.selectedTransportPricingOption,
          contractId: sel.selectedTransportContractId ?? null,
          isManual: sel.transportSelectionIsManual ?? null,
          at: sel.transportSelectionAt ?? null,
          byUserId: sel.transportSelectionByUserId ?? null,
        };
        if (sel.selectedTransportPricingOption === 'PACKAGE_MIN_FULL_DAY') {
          // Stale if the active package contract is now missing, no longer eligible, has
          // manual-required days, or no longer matches the stored contract id.
          selectionStale =
            !contractRow ||
            !eligibility.eligible ||
            eligibility.manualRequiredDays > 0 ||
            (sel.selectedTransportContractId ?? null) !== (contractRow?.id ?? null);
        }
      }
    }

    // PR11B-2A — read-only vehicle-aware allowlist decision (DIAGNOSTIC ONLY; does NOT enforce).
    // Resolves the COUNTED-day transport vehicle(s) and reports whether the selected/resolved
    // package contract is allowed to price them. Surfaces the VIP/standard conflation risk before
    // any enforcement (PR 11B-2B). NEVER writes; live apply (computeQuotePackageLiveApply) unchanged.
    const lineVehicle = (qs: any) => {
      const avr = qs.appliedVehicleRate;
      const trp = qs.touringRoutePricing;
      const veh = avr?.vehicle || trp?.vehicle || null;
      return {
        vehicleId: (veh?.id ?? qs.vehicleId) || null,
        vehicleName: veh?.name ?? null,
        supplierId: avr?.supplierId || veh?.resolvedSupplierId || trp?.supplierId || null,
      };
    };
    const dayVehicles = (rawDays as any[]).map((d) => (d.dayItems || []).filter((di: any) => isTransport(di.quoteService || {})).map((di: any) => lineVehicle(di.quoteService || {})));
    const countedVehicles = adjustedDays.flatMap((c, i) => (c.packageDayWeight > 0 ? dayVehicles[i] : []));
    const evalContractId = savedSelection?.contractId ?? contractRow?.id ?? null;
    const allowlist = computePackageAllowlistDecision({
      contractId: evalContractId,
      contractCurrency: (contractRow?.currency ?? null) as string | null,
      quoteCurrency: ((await this.prisma.quote?.findUnique?.({ where: { id: quoteId }, select: { quoteCurrency: true } }))?.quoteCurrency ?? null) as string | null,
      countedVehicles,
    });

    return {
      quoteId,
      flag: PACKAGE_PRICING_SHADOW_COMPARE_FLAG,
      currentTransportTotal,
      packageGrossTotal,
      supplierDiscountPercent,
      supplierDiscountAmount,
      packageNetTotal,
      packageCandidateTotal: packageNetTotal, // the apples-to-apples (net) comparison total
      difference,
      packageEligible: eligibility.eligible,
      packageContractId: contractRow?.id ?? null,
      countedFullPackageDays: eligibility.countedFullPackageDays,
      fullDayCount,
      halfDayCount,
      billableDays: eligibility.billedDays,
      billedAtMinimum: eligibility.billedAtMinimum,
      manualRequiredDays: eligibility.manualRequiredDays,
      excludedDays,
      reason: eligibility.reason,
      dayPlan: adjustedDays.map((c, i) => ({ dayNumber: days[i]?.dayNumber ?? i + 1, metadataInvalid: invalidFlags[i], ...c })),
      warnings,
      savedSelection,
      selectionStale,
      allowlist,
      notApplied: true,
    };
  }

  // PR10B-1 — compute current package eligibility for a quote (flag-independent; used by the
  // save endpoint to hard-block ineligible PACKAGE selections). Read-only.
  private async computeQuoteEligibility(quoteId: string): Promise<{ contractRow: any; eligibility: ReturnType<typeof evaluatePackageEligibility> }> {
    const rawDays = await this.prisma.quoteItineraryDay.findMany({
      where: { quoteId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }],
      select: {
        dayNumber: true, transportDayType: true, vehicleRetained: true, vehicleReleased: true, inRetainedBlock: true,
        dayItems: {
          where: { isActive: true },
          select: {
            quoteService: {
              select: {
                transportServiceTypeId: true, touringRouteId: true, vehicleId: true,
                appliedVehicleRate: { select: { supplierId: true, vehicle: { select: { vehicleClass: true, resolvedSupplierId: true } }, serviceType: { select: { code: true, classification: true } } } },
                touringRoutePricing: { select: { supplierId: true, vehicle: { select: { vehicleClass: true, resolvedSupplierId: true } }, transportServiceType: { select: { code: true, classification: true } } } },
              },
            },
          },
        },
      },
    });
    const days: ShadowDay[] = (rawDays as any[]).map((d) => ({
      dayNumber: d.dayNumber,
      metadata: { transportDayType: d.transportDayType, vehicleRetained: d.vehicleRetained, vehicleReleased: d.vehicleReleased, inRetainedBlock: d.inRetainedBlock },
      items: (d.dayItems || []).map((di: any) => {
        const qs = di.quoteService || {};
        const avr = qs.appliedVehicleRate;
        const trp = qs.touringRoutePricing;
        const st = avr?.serviceType || trp?.transportServiceType || null;
        const veh = avr?.vehicle || trp?.vehicle || null;
        return {
          transportServiceTypeId: qs.transportServiceTypeId ?? null,
          touringRouteId: qs.touringRouteId ?? null,
          vehicleId: qs.vehicleId ?? null,
          serviceTypeCode: st?.code ?? null,
          serviceTypeClassification: st?.classification ?? null,
          vehicleClass: veh?.vehicleClass ?? null,
          supplierId: avr?.supplierId || veh?.resolvedSupplierId || trp?.supplierId || null,
        } as ShadowDayItem;
      }),
    }));
    const { inputs, invalidFlags, primary } = mapShadowDays(days);
    let contractRow: any = null;
    if (primary.supplierId && primary.vehicleClass) {
      contractRow = await this.prisma.transportContract.findFirst({ where: { supplierId: primary.supplierId, vehicleClass: primary.vehicleClass, regime: 'PACKAGE_MIN_FULL_DAY', active: true } });
    }
    const contractCandidate: PackageContractCandidate | null = contractRow
      ? { minimumFullDays: contractRow.minimumFullDays ?? 3, minimumDayPolicy: contractRow.minimumDayPolicy ?? undefined, halfDayCountsTowardMin: contractRow.halfDayCountsTowardMin, halfDayChargedAsFullDay: contractRow.halfDayChargedAsFullDay, stationaryCountsTowardMinDays: contractRow.stationaryCountsTowardMinDays, airportTransferIncluded: contractRow.airportTransferIncluded }
      : null;
    const policy = contractCandidate
      ? Object.fromEntries(Object.entries({ halfDayCountsTowardMin: contractCandidate.halfDayCountsTowardMin, halfDayChargedAsFullDay: contractCandidate.halfDayChargedAsFullDay, stationaryCountsTowardMinDays: contractCandidate.stationaryCountsTowardMinDays, airportTransferIncluded: contractCandidate.airportTransferIncluded }).filter(([, v]) => v !== undefined))
      : {};
    const classified = classifyItinerary(inputs, policy);
    const adjustedDays: DayClassification[] = classified.days.map((c, i) => invalidFlags[i] ? { ...c, packageDayWeight: 0, countsAsFullPackageDay: false, countsTowardMinimum: false, billedAs: 'manual-required', retentionCandidate: true } : c);
    const adjusted = { days: adjustedDays, countedFullPackageDays: Number(adjustedDays.reduce((s, c) => s + c.packageDayWeight, 0).toFixed(2)) };
    return { contractRow, eligibility: evaluatePackageEligibility(adjusted, contractCandidate) };
  }

  // PR10B-1 — save/clear a planner's manual route-vs-package selection. METADATA ONLY:
  // writes only the selection columns on the Quote; NEVER touches quote items, totals,
  // supplier, or method; NEVER recalculates. Ineligible PACKAGE is hard-blocked.
  async saveQuotePackageSelection(
    quoteId: string,
    input: { option: string | null; manualOverride?: boolean },
    actorUserId: string | null,
  ) {
    const option = input.option ?? null;
    if (option !== null && option !== 'ROUTE_TRANSFER' && option !== 'PACKAGE_MIN_FULL_DAY') {
      throw new BadRequestException('Invalid transport pricing option');
    }
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId }, select: { id: true } });
    if (!quote) throw new NotFoundException('Quote not found');

    if (option === null) {
      return this.writeSelection(quoteId, null, null, null, null, null); // clear
    }
    if (option === 'ROUTE_TRANSFER') {
      return this.writeSelection(quoteId, 'ROUTE_TRANSFER', null, false, new Date(), actorUserId);
    }
    // PACKAGE_MIN_FULL_DAY — hard-block ineligible (no manual override in PR10B-1).
    const { contractRow, eligibility } = await this.computeQuoteEligibility(quoteId);
    if (!contractRow) throw new BadRequestException('no-package-contract');
    if (eligibility.manualRequiredDays > 0) throw new BadRequestException('manual-required-days');
    if (!eligibility.eligible) throw new BadRequestException(eligibility.reason || 'below-minimum');
    return this.writeSelection(quoteId, 'PACKAGE_MIN_FULL_DAY', contractRow.id, false, new Date(), actorUserId);
  }

  // Writes ONLY the 5 selection columns. No other quote field is touched.
  private async writeSelection(
    quoteId: string,
    option: string | null,
    contractId: string | null,
    isManual: boolean | null,
    at: Date | null,
    by: string | null,
  ) {
    await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        selectedTransportPricingOption: option,
        selectedTransportContractId: contractId,
        transportSelectionIsManual: isManual,
        transportSelectionAt: at,
        transportSelectionByUserId: by,
      },
    });
    return {
      quoteId,
      selectedTransportPricingOption: option,
      selectedTransportContractId: contractId,
      transportSelectionIsManual: isManual,
      transportSelectionAt: at,
      transportSelectionByUserId: by,
      notApplied: true,
    };
  }

  // PR11A — decide whether a saved PACKAGE selection may be applied LIVE to this quote, and by
  // how much (total-level deltas). Pure decision + math; performs NO writes. The caller
  // (recalculateQuoteTotals) only invokes this when the live-apply flag is ON, and applies the
  // returned deltas at total-assembly time without mutating any QuoteItem. Every gate falls back
  // to `apply:false` (existing pricing) with a reason. Reuses the exact shadow classification +
  // eligibility + pricing logic so "preview" equals "applied".
  async computeQuotePackageLiveApply(
    quoteId: string,
    opts: { pricingIsSlab?: boolean; recalcItemIds?: Set<string> } = {},
  ): Promise<LivePackageApplyResult> {
    const round = (n: number) => Number((Number(n) || 0).toFixed(2));
    const block = (reason: string): LivePackageApplyResult => ({ apply: false, reason, costDelta: 0, sellDelta: 0 });

    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: { quoteCurrency: true, excursionPackageRate: true, selectedTransportPricingOption: true, selectedTransportContractId: true },
    });
    if (!quote) return block('quote-not-found');

    const option = quote.selectedTransportPricingOption ?? null;
    if (option === null) return block('no-selection');
    if (option === 'ROUTE_TRANSFER') return block('route-selected');
    if (option !== 'PACKAGE_MIN_FULL_DAY') return block('unknown-option');

    // Strict pilot pin by contract id (D6). Anything else → existing pricing.
    if (quote.selectedTransportContractId !== PackageEligibilityShadowService.PILOT_PACKAGE_CONTRACT_ID) return block('not-pilot-contract');
    // SLAB sell is slab-driven (decoupled from item costs); a weighted-markup sell delta is
    // meaningless there → not supported in PR11A.
    if (opts.pricingIsSlab) return block('slab-mode-not-supported');
    // Avoid double-charging against the legacy full-day/free-mileage mechanism.
    if (quote.excursionPackageRate) return block('overlap-excursion-package-rate');

    const contract: any = await this.prisma.transportContract.findFirst({ where: { id: quote.selectedTransportContractId } });
    if (!contract || contract.active !== true) return block('contract-inactive-or-missing');
    if (contract.regime !== 'PACKAGE_MIN_FULL_DAY') return block('contract-wrong-regime');
    if (contract.currency !== 'USD') return block('contract-not-usd');
    if ((quote.quoteCurrency ?? null) !== contract.currency) return block('cross-currency');

    // Days with persisted cost + sell + class/supplier/classification (same join the totals use).
    const rawDays: any[] = await this.prisma.quoteItineraryDay.findMany({
      where: { quoteId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }],
      select: {
        dayNumber: true, transportDayType: true, vehicleRetained: true, vehicleReleased: true, inRetainedBlock: true,
        dayItems: {
          where: { isActive: true },
          select: {
            quoteService: {
              select: {
                id: true, optionId: true, transportServiceTypeId: true, touringRouteId: true, vehicleId: true,
                finalCost: true, totalCost: true, totalSell: true, overrideCost: true, useOverride: true,
                appliedVehicleRate: { select: { supplierId: true, vehicle: { select: { vehicleClass: true, resolvedSupplierId: true } }, serviceType: { select: { code: true, classification: true } } } },
                touringRoutePricing: { select: { supplierId: true, vehicle: { select: { vehicleClass: true, resolvedSupplierId: true } }, transportServiceType: { select: { code: true, classification: true } } } },
              },
            },
          },
        },
      },
    });

    const isTransport = (qs: any) => Boolean(qs.transportServiceTypeId || qs.touringRouteId || qs.vehicleId);
    const lineCost = (qs: any) => { const eff = qs.useOverride ? (qs.finalCost ?? qs.overrideCost ?? qs.totalCost) : (qs.finalCost ?? qs.totalCost); return Number(eff) || 0; };
    const lineSell = (qs: any) => Number(qs.totalSell) || 0;

    const days: ShadowDay[] = rawDays.map((d) => ({
      dayNumber: d.dayNumber,
      metadata: { transportDayType: d.transportDayType, vehicleRetained: d.vehicleRetained, vehicleReleased: d.vehicleReleased, inRetainedBlock: d.inRetainedBlock },
      items: (d.dayItems || []).map((di: any) => {
        const qs = di.quoteService || {};
        const avr = qs.appliedVehicleRate; const trp = qs.touringRoutePricing;
        const st = avr?.serviceType || trp?.transportServiceType || null;
        const veh = avr?.vehicle || trp?.vehicle || null;
        return {
          transportServiceTypeId: qs.transportServiceTypeId ?? null,
          touringRouteId: qs.touringRouteId ?? null,
          vehicleId: qs.vehicleId ?? null,
          serviceTypeCode: st?.code ?? null,
          serviceTypeClassification: st?.classification ?? null,
          vehicleClass: veh?.vehicleClass ?? null,
          supplierId: avr?.supplierId || veh?.resolvedSupplierId || trp?.supplierId || null,
        } as ShadowDayItem;
      }),
    }));

    // Per-day persisted transport cost/sell + add-on detection + day-membership check.
    const dayTransport = rawDays.map((d) => {
      let cost = 0, sell = 0, hasAddOn = false, nonRecalcItem = false;
      for (const di of (d.dayItems || [])) {
        const qs = di.quoteService || {};
        if (!isTransport(qs)) continue;
        cost += lineCost(qs); sell += lineSell(qs);
        const cls = String(qs.appliedVehicleRate?.serviceType?.classification || qs.touringRoutePricing?.transportServiceType?.classification || '').toUpperCase();
        if (cls === 'ADD_ON') hasAddOn = true;
        // A counted transport line that the totals path does NOT sum (optionId null but absent
        // from recalc set) would make the delta inconsistent → block + warn.
        if (opts.recalcItemIds && qs.id && qs.optionId == null && !opts.recalcItemIds.has(qs.id)) nonRecalcItem = true;
      }
      return { cost, sell, hasAddOn, nonRecalcItem };
    });

    const { inputs, invalidFlags, primary } = mapShadowDays(days);
    if (!primary.supplierId || !primary.vehicleClass) return block('no-primary-transport');
    if (contract.supplierId !== primary.supplierId || contract.vehicleClass !== primary.vehicleClass) return block('supplier-class-mismatch');

    const contractCandidate: PackageContractCandidate = {
      minimumFullDays: contract.minimumFullDays ?? 3,
      minimumDayPolicy: contract.minimumDayPolicy ?? undefined,
      halfDayCountsTowardMin: contract.halfDayCountsTowardMin,
      halfDayChargedAsFullDay: contract.halfDayChargedAsFullDay,
      stationaryCountsTowardMinDays: contract.stationaryCountsTowardMinDays,
      airportTransferIncluded: contract.airportTransferIncluded,
    };
    const policy = Object.fromEntries(
      Object.entries({
        halfDayCountsTowardMin: contractCandidate.halfDayCountsTowardMin,
        halfDayChargedAsFullDay: contractCandidate.halfDayChargedAsFullDay,
        stationaryCountsTowardMinDays: contractCandidate.stationaryCountsTowardMinDays,
        airportTransferIncluded: contractCandidate.airportTransferIncluded,
      }).filter(([, v]) => v !== undefined),
    );

    const classified = classifyItinerary(inputs, policy);
    const adjustedDays: DayClassification[] = classified.days.map((c, i) => invalidFlags[i] ? { ...c, packageDayWeight: 0, countsAsFullPackageDay: false, countsTowardMinimum: false, billedAs: 'manual-required', retentionCandidate: true } : c);
    const adjusted = { days: adjustedDays, countedFullPackageDays: round(adjustedDays.reduce((s, c) => s + c.packageDayWeight, 0)) };
    const eligibility = evaluatePackageEligibility(adjusted, contractCandidate);

    if (eligibility.manualRequiredDays > 0) return block('manual-required-days');
    if (!eligibility.eligible) return block(eligibility.reason || 'ineligible');

    // Not priced in PR11A: stationary / standby operational days, and driver-overnight /
    // stationary-waiting ADD_ON items → block + fall back to existing pricing.
    if (adjustedDays.some((c) => c.operationalType === 'STATIONARY_FULL_DAY' || c.operationalType === 'STATIONARY_HALF_DAY' || c.operationalType === 'STANDBY_WAITING')) return block('stationary-standby-present');
    if (dayTransport.some((d) => d.hasAddOn)) return block('addon-overnight-present');

    // Counted days (weight > 0) are the ones the package replaces; their persisted cost/sell give
    // the weighted-average transport markup (D1a). Excluded transfer days keep their existing cost
    // (they are NOT in the delta, so they remain untouched in the item-sum totals).
    let countedCost = 0, countedSell = 0, membershipMismatch = false;
    adjustedDays.forEach((c, i) => {
      if (c.packageDayWeight > 0) { countedCost += dayTransport[i].cost; countedSell += dayTransport[i].sell; if (dayTransport[i].nonRecalcItem) membershipMismatch = true; }
    });
    if (membershipMismatch) return block('day-membership-mismatch');
    if (countedCost <= 0) return block('no-counted-cost');

    // Supplier discount (parity with the PR9 shadow), applied EXACTLY ONCE on the package gross.
    const sup: any = await this.prisma.supplier.findUnique({ where: { id: primary.supplierId }, select: { transportDiscountPercent: true } });
    const supplierDiscountPercent = Number(sup?.transportDiscountPercent ?? 0) || 0;

    const fullDayRate = Number(contract.fullDayRate ?? 0) || 0;
    const halfDayRate = Number(contract.halfDayRate ?? 0) || 0;
    const fullDayCount = adjustedDays.filter((c) => c.packageDayWeight === 1).length;
    const halfDayCount = adjustedDays.filter((c) => c.packageDayWeight === 0.5).length;
    const packageGross = eligibility.billedAtMinimum
      ? round((contractCandidate.minimumFullDays || 0) * fullDayRate)
      : round(fullDayCount * fullDayRate + halfDayCount * halfDayRate);
    const packageNet = round(packageGross * (1 - supplierDiscountPercent / 100));

    // Weighted-average markup of the replaced transport lines (sell/cost factor). If sell/cost
    // is missing or non-positive, we cannot safely preserve margin → block + warn (D1).
    const weightedMarkup = countedSell / countedCost;
    if (!isFinite(weightedMarkup) || weightedMarkup <= 0) return block('markup-uncomputable');

    const costDelta = round(packageNet - countedCost);
    const sellDelta = round(packageNet * weightedMarkup - countedSell);
    return {
      apply: true,
      reason: null,
      costDelta,
      sellDelta,
      contractId: contract.id,
      countedCost: round(countedCost),
      countedSell: round(countedSell),
      packageNet,
      weightedMarkupPercent: round((weightedMarkup - 1) * 100),
      supplierDiscountPercent,
      previousTransportTotal: round(countedCost),
      appliedTransportTotal: packageNet,
      warnings: ['standard-large-bus-49-rate-only-not-vip-31-33', 'excludes-driver-overnight'],
    };
  }
}
