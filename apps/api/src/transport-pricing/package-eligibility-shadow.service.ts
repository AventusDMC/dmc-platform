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

@Injectable()
export class PackageEligibilityShadowService {
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
                appliedVehicleRate: { select: { supplierId: true, vehicle: { select: { vehicleClass: true, resolvedSupplierId: true } }, serviceType: { select: { code: true, classification: true } } } },
                touringRoutePricing: { select: { supplierId: true, vehicle: { select: { vehicleClass: true, resolvedSupplierId: true } }, transportServiceType: { select: { code: true, classification: true } } } },
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
}
