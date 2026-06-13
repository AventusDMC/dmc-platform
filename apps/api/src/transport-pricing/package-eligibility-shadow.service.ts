import { Injectable } from '@nestjs/common';
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
import { isPackageEligibilityShadowEnabled, PACKAGE_ELIGIBILITY_SHADOW_FLAG } from './transport-feature-flags';

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
}
