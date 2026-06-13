import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  classifyItinerary,
  type ItineraryDayInput,
  type OperationalTransportType,
} from '../common/transport-day-classification';
import {
  evaluatePackageEligibility,
  type PackageContractCandidate,
} from './package-eligibility';
import { isPackageEligibilityShadowEnabled, PACKAGE_ELIGIBILITY_SHADOW_FLAG } from './transport-feature-flags';

// PR5 — Package-eligibility SHADOW service (read-only / diagnostic).
//
// Runs the PR3 classifier + PR4 evaluator against a quote's transport days and returns a
// diagnostic verdict. STRICTLY READ-ONLY: no quote/quote-item mutation, no pricing change,
// no persistence. Gated by the `transport.packageEligibilityShadow` flag (default OFF).
// Retention is inferred conservatively (no per-day retention fields exist yet), so the
// shadow under-counts retained P2P until a later schema PR — this is intentional.

// Minimal shape of a loaded transport day-item (subset of QuoteItem) used by the mapper.
export type ShadowDayItem = {
  transportServiceTypeId?: string | null;
  touringRouteId?: string | null;
  vehicleId?: string | null;
  serviceTypeCode?: string | null; // resolved from appliedVehicleRate/touringRoutePricing or batch lookup
  serviceTypeClassification?: string | null;
  vehicleClass?: string | null;
  supplierId?: string | null;
};

export type ShadowDay = { dayNumber: number; items: ShadowDayItem[] };

// Pure: infer the operational transport type for a single day from its transport items.
// Conservative precedence; a day with no transport item is FREE_DAY_NO_VEHICLE.
export function inferOperationalType(items: ShadowDayItem[]): OperationalTransportType {
  const transportItems = items.filter(
    (it) => it.touringRouteId || it.transportServiceTypeId || it.vehicleId,
  );
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
  // ROUTE_TRANSFER / POINT_TO_POINT / generic transport → point-to-point.
  return 'POINT_TO_POINT';
}

// Pure: map loaded days → classifier inputs + the primary supplier/vehicleClass used for
// the contract lookup (first transport day that carries a vehicleClass + supplier).
export function mapShadowDays(days: ShadowDay[]): {
  inputs: ItineraryDayInput[];
  primary: { supplierId: string | null; vehicleClass: string | null };
} {
  let primary: { supplierId: string | null; vehicleClass: string | null } = { supplierId: null, vehicleClass: null };
  const inputs = days.map((day) => {
    const operationalType = inferOperationalType(day.items);
    const carrier = day.items.find((it) => it.vehicleClass || it.supplierId);
    const supplierKey = carrier?.supplierId ?? null;
    const vehicleKey = carrier?.vehicleClass ?? null;
    if (!primary.vehicleClass && (supplierKey || vehicleKey) && operationalType !== 'FREE_DAY_NO_VEHICLE') {
      primary = { supplierId: supplierKey, vehicleClass: vehicleKey };
    }
    // Retention left undefined — conservative (no per-day retention fields exist yet).
    return { operationalType, supplierKey, vehicleKey } as ItineraryDayInput;
  });
  return { inputs, primary };
}

export type PackageEligibilityShadowResult = {
  quoteId: string;
  flag: string;
  contract: { found: boolean; supplierId?: string; vehicleClass?: string; currency?: string; minimumFullDays?: number; minimumDayPolicy?: string | null };
  eligibility: ReturnType<typeof evaluatePackageEligibility>;
  dayPlan: Array<{ dayNumber: number } & ReturnType<typeof classifyItinerary>['days'][number]>;
};

@Injectable()
export class PackageEligibilityShadowService {
  constructor(private readonly prisma: PrismaService) {}

  // Returns null when the flag is OFF (caller treats as disabled). Otherwise computes the
  // read-only diagnostic. Performs ONLY reads.
  async evaluateQuotePackageEligibilityShadow(quoteId: string): Promise<PackageEligibilityShadowResult | null> {
    if (!isPackageEligibilityShadowEnabled()) return null;

    const rawDays = await this.prisma.quoteItineraryDay.findMany({
      where: { quoteId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }],
      include: {
        dayItems: {
          where: { isActive: true },
          include: {
            quoteService: {
              select: {
                transportServiceTypeId: true,
                touringRouteId: true,
                vehicleId: true,
                appliedVehicleRate: {
                  select: {
                    supplierId: true,
                    vehicle: { select: { vehicleClass: true, resolvedSupplierId: true } },
                    serviceType: { select: { code: true, classification: true } },
                  },
                },
                touringRoutePricing: {
                  select: {
                    supplierId: true,
                    vehicle: { select: { vehicleClass: true, resolvedSupplierId: true } },
                    transportServiceType: { select: { code: true, classification: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const days: ShadowDay[] = (rawDays as any[]).map((d) => ({
      dayNumber: d.dayNumber,
      items: (d.dayItems || []).map((di: any) => {
        const qs = di.quoteService || {};
        const avr = qs.appliedVehicleRate;
        const trp = qs.touringRoutePricing;
        const st = avr?.serviceType || trp?.transportServiceType || null;
        const veh = avr?.vehicle || trp?.vehicle || null;
        const supplierId = avr?.supplierId || veh?.resolvedSupplierId || trp?.supplierId || null;
        return {
          transportServiceTypeId: qs.transportServiceTypeId ?? null,
          touringRouteId: qs.touringRouteId ?? null,
          vehicleId: qs.vehicleId ?? null,
          serviceTypeCode: st?.code ?? null,
          serviceTypeClassification: st?.classification ?? null,
          vehicleClass: veh?.vehicleClass ?? null,
          supplierId,
        } as ShadowDayItem;
      }),
    }));

    const { inputs, primary } = mapShadowDays(days);

    // Look up a PACKAGE_MIN_FULL_DAY contract for the quote's primary supplier+vehicleClass.
    // None exist today → contract is null → verdict `no-package-contract`.
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
      ? {
          halfDayCountsTowardMin: contractCandidate.halfDayCountsTowardMin,
          halfDayChargedAsFullDay: contractCandidate.halfDayChargedAsFullDay,
          stationaryCountsTowardMinDays: contractCandidate.stationaryCountsTowardMinDays,
          airportTransferIncluded: contractCandidate.airportTransferIncluded,
        }
      : {};
    // Strip undefined so PR3 defaults survive (see package-eligibility note).
    const cleanPolicy = Object.fromEntries(Object.entries(policy).filter(([, v]) => v !== undefined));

    const classified = classifyItinerary(inputs, cleanPolicy);
    const eligibility = evaluatePackageEligibility(classified, contractCandidate);

    return {
      quoteId,
      flag: PACKAGE_ELIGIBILITY_SHADOW_FLAG,
      contract: contractRow
        ? {
            found: true,
            supplierId: contractRow.supplierId,
            vehicleClass: contractRow.vehicleClass,
            currency: contractRow.currency,
            minimumFullDays: contractRow.minimumFullDays,
            minimumDayPolicy: contractRow.minimumDayPolicy ?? null,
          }
        : { found: false },
      eligibility,
      dayPlan: classified.days.map((c, i) => ({ dayNumber: days[i]?.dayNumber ?? i + 1, ...c })),
    };
  }
}
