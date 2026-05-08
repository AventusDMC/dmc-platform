import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildRouteNormalizedKey, formatRouteName, normalizeRouteName } from '../routes/route-normalization';
import { normalizeVehicleTypeLabel } from '../common/vehicle-type-normalization';

type FindTransportRateInput = {
  serviceTypeId: string;
  vehicleRateId?: string | null;
  vehicleId?: string | null;
  routeId?: string | null;
  normalizedKey?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  paxCount: number;
  travelDate?: Date;
};

type TransportPricingCandidate = {
  vehicleRateId?: string | null;
  routeId: string | null;
  routeName: string;
  classification?: TransportServiceClassification;
  pricingMode: 'per_vehicle' | 'capacity_unit';
  unitCapacity: number | null;
  unitCount: number | null;
  price: number;
  currency: string;
  vehicle: {
    id: string;
    name: string;
    vehicleType?: string | null;
    maxPax: number;
    luggageCapacity?: number | null;
  };
  serviceType: {
    id: string;
    name: string;
    code: string;
    classification?: TransportServiceClassification;
  };
  supplier?: {
    id: string | null;
    name: string;
  };
};

type TransportServiceClassification = 'ROUTE_TRANSFER' | 'FULL_DAY' | 'HALF_DAY' | 'DAILY_PACKAGE' | 'ADD_ON';

type TransportPricingAddOn = {
  rateId: string;
  serviceTypeId: string;
  name: string;
  classification: 'ADD_ON';
  addOnType: 'DRIVER_OVERNIGHT' | 'STATIONARY_WAITING' | 'OTHER';
  supplierId: string | null;
  supplierName: string;
  vehicleId: string;
  vehicleName: string;
  unitCapacity: number;
  unitCost: number;
  currency: string;
  defaultQuantity: number;
};

type ResolveTransportPricingRuleInput = {
  routeId?: string | null;
  normalizedKey?: string | null;
  transportServiceTypeId: string;
  vehicleId?: string | null;
  pax: number;
};

type UpsertTransportPricingRuleInput = {
  routeId: string;
  transportServiceTypeId: string;
  vehicleId: string;
  supplierId?: string | null;
  pricingMode: 'per_vehicle' | 'capacity_unit';
  minPax: number;
  maxPax: number;
  unitCapacity?: number | null;
  baseCost: number;
  discountPercent?: number;
  currency: string;
  isActive?: boolean;
};

function buildRouteName(fromPlaceName: string, toPlaceName: string) {
  return formatRouteName(fromPlaceName, toPlaceName);
}

@Injectable()
export class TransportPricingService {
  constructor(private readonly prisma: PrismaService) {}

  findAllRules() {
    return this.prisma.transportPricingRule.findMany({
      include: {
        route: true,
        supplier: true,
        transportServiceType: true,
        vehicle: true,
      },
      orderBy: [{ routeId: 'asc' }, { transportServiceTypeId: 'asc' }, { minPax: 'asc' }, { maxPax: 'asc' }],
    });
  }

  createRule(data: UpsertTransportPricingRuleInput) {
    return this.prisma.transportPricingRule.create({
      data: {
        routeId: data.routeId,
        transportServiceTypeId: data.transportServiceTypeId,
        vehicleId: data.vehicleId,
        supplierId: data.supplierId ?? null,
        pricingMode: data.pricingMode,
        minPax: data.minPax,
        maxPax: data.maxPax,
        unitCapacity: data.unitCapacity ?? null,
        baseCost: data.baseCost,
        discountPercent: data.discountPercent ?? 0,
        currency: data.currency.trim().toUpperCase(),
        isActive: data.isActive ?? true,
      },
      include: {
        route: true,
        supplier: true,
        transportServiceType: true,
        vehicle: true,
      },
    });
  }

  updateRule(id: string, data: UpsertTransportPricingRuleInput) {
    return this.prisma.transportPricingRule.update({
      where: { id },
      data: {
        routeId: data.routeId,
        transportServiceTypeId: data.transportServiceTypeId,
        vehicleId: data.vehicleId,
        supplierId: data.supplierId ?? null,
        pricingMode: data.pricingMode,
        minPax: data.minPax,
        maxPax: data.maxPax,
        unitCapacity: data.unitCapacity ?? null,
        baseCost: data.baseCost,
        discountPercent: data.discountPercent ?? 0,
        currency: data.currency.trim().toUpperCase(),
        isActive: data.isActive ?? true,
      },
      include: {
        route: true,
        supplier: true,
        transportServiceType: true,
        vehicle: true,
      },
    });
  }

  deleteRule(id: string) {
    return this.prisma.transportPricingRule.delete({
      where: { id },
    });
  }

  async resolvePricingRule(data: ResolveTransportPricingRuleInput) {
    if (!data.transportServiceTypeId) {
      throw new BadRequestException('transportServiceTypeId is required');
    }

    if (data.pax < 1) {
      throw new BadRequestException('pax must be at least 1');
    }

    const route = await this.resolveRouteReference(data);
    let rule = await this.prisma.transportPricingRule.findFirst({
      where: {
        routeId: route.id,
        transportServiceTypeId: data.transportServiceTypeId,
        ...(data.vehicleId ? { vehicleId: data.vehicleId } : {}),
        isActive: true,
        minPax: {
          lte: data.pax,
        },
        maxPax: {
          gte: data.pax,
        },
      },
      include: {
        route: true,
        supplier: true,
        transportServiceType: true,
        vehicle: true,
      },
      orderBy: [
        {
          unitCapacity: 'asc',
        },
        {
          baseCost: 'asc',
        },
        {
          vehicleId: 'asc',
        },
      ],
    });

    if (!rule && data.vehicleId) {
      const selectedVehicleType = await this.getCanonicalVehicleTypeForVehicleId(data.vehicleId);
      const candidateRules = await this.prisma.transportPricingRule.findMany({
        where: {
          routeId: route.id,
          transportServiceTypeId: data.transportServiceTypeId,
          isActive: true,
          minPax: { lte: data.pax },
          maxPax: { gte: data.pax },
        },
        include: {
          route: true,
          supplier: true,
          transportServiceType: true,
          vehicle: true,
        },
        orderBy: [{ unitCapacity: 'asc' }, { baseCost: 'asc' }, { vehicleId: 'asc' }],
      });
      rule = candidateRules.find((entry: any) => this.vehicleMatchesCanonicalType(entry.vehicle, selectedVehicleType)) || null;
    }

    if (!rule) {
      throw new NotFoundException('No matching transport pricing rule found');
    }

    const discountedBaseCost = Number((rule.baseCost * (1 - rule.discountPercent / 100)).toFixed(2));

    if (rule.pricingMode === 'capacity_unit') {
      if (!rule.unitCapacity || rule.unitCapacity < 1) {
        throw new BadRequestException('capacity_unit pricing requires unitCapacity');
      }

      const unitCount = Math.ceil(data.pax / rule.unitCapacity);

      return {
        rule,
        discountedBaseCost,
        calculatedCost: Number((unitCount * discountedBaseCost).toFixed(2)),
        unitCount,
      };
    }

    return {
      rule,
      discountedBaseCost,
      calculatedCost: Number(discountedBaseCost.toFixed(2)),
      unitCount: null,
    };
  }

  async resolvePricingRuleCandidates(data: ResolveTransportPricingRuleInput): Promise<TransportPricingCandidate[]> {
    if (!data.transportServiceTypeId) {
      throw new BadRequestException('transportServiceTypeId is required');
    }

    if (data.pax < 1) {
      throw new BadRequestException('pax must be at least 1');
    }

    const route = await this.resolveRouteReference(data);
    const allRules = await this.prisma.transportPricingRule.findMany({
      where: {
        routeId: route.id,
        transportServiceTypeId: data.transportServiceTypeId,
        isActive: true,
        minPax: {
          lte: data.pax,
        },
        maxPax: {
          gte: data.pax,
        },
      },
      include: {
        route: true,
        supplier: true,
        transportServiceType: true,
        vehicle: true,
      },
      orderBy: [
        {
          unitCapacity: 'asc',
        },
        {
          baseCost: 'asc',
        },
        {
          vehicleId: 'asc',
        },
      ],
    });
    let rules = allRules;
    if (data.vehicleId) {
      const exactRules = allRules.filter((rule: any) => rule.vehicleId === data.vehicleId);
      if (exactRules.length > 0) {
        rules = exactRules;
      } else {
        const selectedVehicleType = await this.getCanonicalVehicleTypeForVehicleId(data.vehicleId);
        rules = allRules.filter((rule: any) => this.vehicleMatchesCanonicalType(rule.vehicle, selectedVehicleType));
      }
    }
    return rules.map((rule) => {
      const discountedBaseCost = Number((rule.baseCost * (1 - rule.discountPercent / 100)).toFixed(2));
      const unitCount =
        rule.pricingMode === 'capacity_unit' && rule.unitCapacity ? Math.ceil(data.pax / rule.unitCapacity) : null;
      const price =
        rule.pricingMode === 'capacity_unit' && unitCount
          ? Number((unitCount * discountedBaseCost).toFixed(2))
          : Number(discountedBaseCost.toFixed(2));

      return {
        vehicleRateId: null,
        routeId: rule.routeId,
        routeName: rule.route.name,
        classification: (rule.transportServiceType as any).classification || 'ROUTE_TRANSFER',
        pricingMode: rule.pricingMode,
        unitCapacity: rule.unitCapacity,
        unitCount,
        price,
        currency: rule.currency,
        vehicle: {
          id: rule.vehicle.id,
          name: rule.vehicle.name,
          vehicleType: rule.vehicle.vehicleType,
          maxPax: rule.vehicle.maxPax,
          luggageCapacity: rule.vehicle.luggageCapacity,
        },
        serviceType: {
          id: rule.transportServiceType.id,
          name: rule.transportServiceType.name,
          code: rule.transportServiceType.code,
          classification: (rule.transportServiceType as any).classification || 'ROUTE_TRANSFER',
        },
        supplier: {
          id: rule.supplierId ?? null,
          name: (rule as any).supplier?.name || 'Supplier pending',
        },
      };
    });
  }

  async findMatchingRateCandidates(data: FindTransportRateInput): Promise<TransportPricingCandidate[]> {
    if (!data.serviceTypeId) {
      throw new BadRequestException('serviceTypeId is required');
    }

    if (data.paxCount < 1) {
      throw new BadRequestException('paxCount must be at least 1');
    }

    const routeFilter = await this.buildRouteFilter(data);
    const pricingDate = data.travelDate ?? new Date();

    const allRates = await this.prisma.vehicleRate.findMany({
      where: {
        serviceTypeId: data.serviceTypeId,
        active: true,
        ...routeFilter,
        minPax: {
          lte: data.paxCount,
        },
        maxPax: {
          gte: data.paxCount,
        },
        validFrom: {
          lte: pricingDate,
        },
        validTo: {
          gte: pricingDate,
        },
      },
      include: {
        vehicle: true,
        serviceType: true,
        supplier: true,
      },
      orderBy: [
        {
          maxPax: 'asc',
        },
        {
          price: 'asc',
        },
        {
          minPax: 'desc',
        },
      ],
    });
    let rates = allRates;
    if (data.vehicleId) {
      const exactRates = allRates.filter((rate: any) => rate.vehicleId === data.vehicleId);
      if (exactRates.length > 0) {
        rates = exactRates;
      } else {
        const selectedVehicleType = await this.getCanonicalVehicleTypeForVehicleId(data.vehicleId);
        rates = allRates.filter((rate: any) => this.vehicleMatchesCanonicalType(rate.vehicle, selectedVehicleType));
      }
    }

    return rates.map((rate) => ({
      vehicleRateId: rate.id,
      routeId: rate.routeId,
      routeName: rate.routeName,
      classification: (rate.serviceType as any).classification || 'ROUTE_TRANSFER',
      pricingMode: 'capacity_unit' as const,
      unitCapacity: rate.maxPax,
      unitCount: Math.ceil(data.paxCount / rate.maxPax),
      price: Number((Math.ceil(data.paxCount / rate.maxPax) * rate.price).toFixed(2)),
      currency: rate.currency,
      vehicle: {
        id: rate.vehicle.id,
        name: rate.vehicle.name,
        vehicleType: rate.vehicle.vehicleType,
        maxPax: rate.vehicle.maxPax,
        luggageCapacity: rate.vehicle.luggageCapacity,
      },
      serviceType: {
        id: rate.serviceType.id,
        name: rate.serviceType.name,
        code: rate.serviceType.code,
        classification: (rate.serviceType as any).classification || 'ROUTE_TRANSFER',
      },
      supplier: {
        id: rate.supplierId ?? null,
        name: (rate as any).supplier?.name || 'Supplier pending',
      },
    }));
  }

  async findMatchingRate(data: FindTransportRateInput) {
    if (!data.serviceTypeId) {
      throw new BadRequestException('serviceTypeId is required');
    }

    if (data.paxCount < 1) {
      throw new BadRequestException('paxCount must be at least 1');
    }

    const routeFilter = await this.buildRouteFilter(data);
    const pricingDate = data.travelDate ?? new Date();

    if (data.vehicleRateId) {
      const selectedRate = await this.prisma.vehicleRate.findFirst({
        where: {
          id: data.vehicleRateId,
          serviceTypeId: data.serviceTypeId,
          active: true,
          minPax: { lte: data.paxCount },
          maxPax: { gte: data.paxCount },
          validFrom: { lte: pricingDate },
          validTo: { gte: pricingDate },
        },
        include: {
          vehicle: true,
          serviceType: true,
          supplier: true,
          route: {
            include: {
              fromPlace: true,
              toPlace: true,
            },
          },
          fromPlace: true,
          toPlace: true,
        },
      });

      if (selectedRate) {
        return selectedRate;
      }
    }

    let rate = await this.prisma.vehicleRate.findFirst({
      where: {
        serviceTypeId: data.serviceTypeId,
        ...(data.vehicleId ? { vehicleId: data.vehicleId } : {}),
        active: true,
        ...routeFilter,
        minPax: {
          lte: data.paxCount,
        },
        maxPax: {
          gte: data.paxCount,
        },
        validFrom: {
          lte: pricingDate,
        },
        validTo: {
          gte: pricingDate,
        },
      },
      include: {
        vehicle: true,
        serviceType: true,
        supplier: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        toPlace: true,
      },
      orderBy: [
        {
          maxPax: 'asc',
        },
        {
          price: 'asc',
        },
        {
          minPax: 'desc',
        },
      ],
    });

    if (!rate && data.vehicleId) {
      const selectedVehicleType = await this.getCanonicalVehicleTypeForVehicleId(data.vehicleId);
      const candidateRates = await this.prisma.vehicleRate.findMany({
        where: {
          serviceTypeId: data.serviceTypeId,
          active: true,
          ...routeFilter,
          minPax: { lte: data.paxCount },
          maxPax: { gte: data.paxCount },
          validFrom: { lte: pricingDate },
          validTo: { gte: pricingDate },
        },
        include: {
          vehicle: true,
          serviceType: true,
          supplier: true,
          route: {
            include: {
              fromPlace: true,
              toPlace: true,
            },
          },
          fromPlace: true,
          toPlace: true,
        },
        orderBy: [{ maxPax: 'asc' }, { price: 'asc' }, { minPax: 'desc' }],
      });
      rate = candidateRates.find((entry: any) => this.vehicleMatchesCanonicalType(entry.vehicle, selectedVehicleType)) || null;
    }

    if (!rate && (data.routeId || data.normalizedKey || data.routeName?.trim())) {
      const route = await this.resolveRouteReference({
        routeId: data.routeId,
        normalizedKey: data.normalizedKey || (data.routeName ? normalizeRouteName(data.routeName) : undefined),
      });
      const selectedVehicleType = data.vehicleId ? await this.getCanonicalVehicleTypeForVehicleId(data.vehicleId) : '';
      const broadCandidateRates = await this.prisma.vehicleRate.findMany({
        where: {
          serviceTypeId: data.serviceTypeId,
          active: true,
          minPax: { lte: data.paxCount },
          maxPax: { gte: data.paxCount },
          validFrom: { lte: pricingDate },
          validTo: { gte: pricingDate },
        },
        include: {
          vehicle: true,
          serviceType: true,
          supplier: true,
          route: {
            include: {
              fromPlace: true,
              toPlace: true,
            },
          },
          fromPlace: true,
          toPlace: true,
        },
        orderBy: [{ maxPax: 'asc' }, { price: 'asc' }, { minPax: 'desc' }],
      });
      const routeMatchedRates = broadCandidateRates.filter((entry: any) => this.rateMatchesRouteOrServiceArea(entry, route, data));
      const exactVehicleRate = data.vehicleId ? routeMatchedRates.find((entry: any) => entry.vehicleId === data.vehicleId) : null;
      rate =
        exactVehicleRate ||
        (selectedVehicleType
          ? routeMatchedRates.find((entry: any) => this.vehicleMatchesCanonicalType(entry.vehicle, selectedVehicleType))
          : routeMatchedRates[0]) ||
        null;
    }

    if (!rate) {
      throw new NotFoundException(
        `No matching vehicle rate found for serviceTypeId=${data.serviceTypeId}, routeId=${data.routeId || 'none'}, routeName=${data.routeName || data.normalizedKey || 'none'}, vehicleId=${data.vehicleId || 'none'}, vehicleRateId=${data.vehicleRateId || 'none'}, pax=${data.paxCount}`,
      );
    }

    return rate;
  }

  async calculate(data: FindTransportRateInput) {
    if (data.routeId || data.normalizedKey || data.routeName?.trim()) {
      try {
        const resolvedPricing = await this.resolvePricingRule({
          routeId: data.routeId,
          normalizedKey: data.normalizedKey || (data.routeName ? normalizeRouteName(data.routeName) : undefined),
          transportServiceTypeId: data.serviceTypeId,
          vehicleId: data.vehicleId,
          pax: data.paxCount,
        });
        const candidates = await this.resolvePricingRuleCandidates({
          routeId: data.routeId,
          normalizedKey: data.normalizedKey || (data.routeName ? normalizeRouteName(data.routeName) : undefined),
          transportServiceTypeId: data.serviceTypeId,
          vehicleId: data.vehicleId,
          pax: data.paxCount,
        });

        return {
          routeId: resolvedPricing.rule.routeId,
          route: resolvedPricing.rule.route,
          routeName: resolvedPricing.rule.route.name,
          paxCount: data.paxCount,
          classification: (resolvedPricing.rule.transportServiceType as any).classification || 'ROUTE_TRANSFER',
          pricingMode: resolvedPricing.rule.pricingMode,
          unitCapacity: resolvedPricing.rule.unitCapacity,
          discountedBaseCost: resolvedPricing.discountedBaseCost,
          totalPrice: resolvedPricing.calculatedCost,
          price: resolvedPricing.calculatedCost,
          currency: resolvedPricing.rule.currency,
          unitCount: resolvedPricing.unitCount,
          vehicle: {
            id: resolvedPricing.rule.vehicle.id,
            name: resolvedPricing.rule.vehicle.name,
            vehicleType: resolvedPricing.rule.vehicle.vehicleType,
            maxPax: resolvedPricing.rule.vehicle.maxPax,
            luggageCapacity: resolvedPricing.rule.vehicle.luggageCapacity,
          },
          serviceType: {
            id: resolvedPricing.rule.transportServiceType.id,
            name: resolvedPricing.rule.transportServiceType.name,
            code: resolvedPricing.rule.transportServiceType.code,
            classification: (resolvedPricing.rule.transportServiceType as any).classification || 'ROUTE_TRANSFER',
          },
          supplier: {
            id: resolvedPricing.rule.supplierId ?? null,
            name: (resolvedPricing.rule as any).supplier?.name || 'Supplier pending',
          },
          candidates,
          optionalAddOns: await this.findTransportAddOns({
            supplierId: resolvedPricing.rule.supplierId,
            paxCount: data.paxCount,
            routeName: resolvedPricing.rule.route.name,
            travelDate: data.travelDate,
          }),
        };
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
      }
    }

    const rate = await this.findMatchingRate(data);
    const candidates = await this.findMatchingRateCandidates(data);
    const unitCount = Math.ceil(data.paxCount / rate.maxPax);

    return {
      vehicleRateId: rate.id,
      routeId: rate.routeId,
      route: rate.route,
      fromPlace: rate.fromPlace,
      toPlace: rate.toPlace,
      routeName: rate.routeName,
      paxCount: data.paxCount,
      pricingMode: 'capacity_unit' as const,
      unitCapacity: rate.maxPax,
      slabRate: rate.price,
      totalPrice: Number((unitCount * rate.price).toFixed(2)),
      price: Number((unitCount * rate.price).toFixed(2)),
      discountedBaseCost: rate.price,
      currency: rate.currency,
      unitCount,
      vehicle: {
        id: rate.vehicle.id,
        name: rate.vehicle.name,
        vehicleType: rate.vehicle.vehicleType,
        maxPax: rate.vehicle.maxPax,
        luggageCapacity: rate.vehicle.luggageCapacity,
      },
      serviceType: {
        id: rate.serviceType.id,
        name: rate.serviceType.name,
        code: rate.serviceType.code,
        classification: (rate.serviceType as any).classification || 'ROUTE_TRANSFER',
      },
      supplier: {
        id: rate.supplierId ?? null,
        name: (rate as any).supplier?.name || 'Supplier pending',
      },
      validFrom: rate.validFrom,
      validTo: rate.validTo,
      candidates,
      optionalAddOns: await this.findTransportAddOns({
        supplierId: rate.supplierId,
        vehicleId: rate.vehicleId,
        paxCount: data.paxCount,
        routeName: rate.routeName,
        travelDate: data.travelDate,
      }),
    };
  }

  async findTransportAddOns(data: {
    supplierId?: string | null;
    vehicleId?: string | null;
    paxCount: number;
    routeName?: string | null;
    travelDate?: Date;
  }): Promise<TransportPricingAddOn[]> {
    const pricingDate = data.travelDate ?? new Date();
    const destinationText = String(data.routeName || '').toLowerCase();
    const destinationSuggestsAddOn = /(petra|wadi\s*rum|aqaba|outside\s+amman)/i.test(destinationText);
    const rates = await this.prisma.vehicleRate.findMany({
      where: {
        active: true,
        ...(data.supplierId ? { supplierId: data.supplierId } : {}),
        ...(data.vehicleId ? { vehicleId: data.vehicleId } : {}),
        validFrom: { lte: pricingDate },
        validTo: { gte: pricingDate },
        serviceType: {
          classification: 'ADD_ON' as any,
        },
      },
      include: {
        vehicle: true,
        supplier: true,
        serviceType: true,
      },
      orderBy: [{ price: 'asc' }],
    } as any);

    return rates.map((rate: any) => {
      const text = `${rate.serviceType?.name || ''} ${rate.routeName || ''}`.toLowerCase();
      const addOnType = /overnight/.test(text)
        ? 'DRIVER_OVERNIGHT'
        : /stationary|waiting/.test(text)
          ? 'STATIONARY_WAITING'
          : 'OTHER';

      return {
        rateId: rate.id,
        serviceTypeId: rate.serviceTypeId,
        name: rate.serviceType?.name || rate.routeName || 'Transport add-on',
        classification: 'ADD_ON',
        addOnType,
        supplierId: rate.supplierId ?? null,
        supplierName: rate.supplier?.name || 'Supplier pending',
        vehicleId: rate.vehicleId,
        vehicleName: rate.vehicle?.name || 'Vehicle',
        unitCapacity: rate.maxPax,
        unitCost: rate.price,
        currency: rate.currency,
        defaultQuantity: destinationSuggestsAddOn ? 1 : 0,
      };
    });
  }

  private async getCanonicalVehicleTypeForVehicleId(vehicleId: string | null | undefined) {
    if (!vehicleId) {
      return '';
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        name: true,
        vehicleType: true,
      },
    });

    return this.getCanonicalVehicleType(vehicle);
  }

  private getCanonicalVehicleType(vehicle: { name?: string | null; vehicleType?: string | null } | null | undefined) {
    return normalizeVehicleTypeLabel(vehicle?.vehicleType) || normalizeVehicleTypeLabel(vehicle?.name);
  }

  private vehicleMatchesCanonicalType(
    vehicle: { name?: string | null; vehicleType?: string | null } | null | undefined,
    canonicalVehicleType: string,
  ) {
    return Boolean(canonicalVehicleType && this.getCanonicalVehicleType(vehicle) === canonicalVehicleType);
  }

  private rateMatchesRouteOrServiceArea(
    rate: {
      routeId?: string | null;
      routeName?: string | null;
      fromPlaceId?: string | null;
      toPlaceId?: string | null;
      route?: { id: string; name: string; fromPlaceId?: string | null; toPlaceId?: string | null } | null;
    },
    route: { id: string; name: string; normalizedKey?: string | null; fromPlaceId: string | null; toPlaceId: string | null; fromPlace: { name: string }; toPlace: { name: string } },
    data: FindTransportRateInput,
  ) {
    if (rate.routeId && rate.routeId === route.id) {
      return true;
    }

    if (rate.fromPlaceId && rate.toPlaceId && rate.fromPlaceId === route.fromPlaceId && rate.toPlaceId === route.toPlaceId) {
      return true;
    }

    const requestedLabels = [
      route.name,
      route.normalizedKey || '',
      data.routeName || '',
      route.fromPlace?.name && route.toPlace?.name ? `${route.fromPlace.name} ${route.toPlace.name}` : '',
      route.fromPlace?.name && route.toPlace?.name ? `${route.fromPlace.name} to ${route.toPlace.name}` : '',
      route.fromPlace?.name && route.toPlace?.name ? `${route.fromPlace.name} ${route.toPlace.name}` : '',
      route.fromPlace?.name === route.toPlace?.name ? `${route.fromPlace.name} City` : '',
      route.fromPlace?.name === route.toPlace?.name ? route.fromPlace.name : '',
    ]
      .map((label) => normalizeRouteName(label))
      .filter(Boolean);
    const rateLabels = [rate.routeName || '', rate.route?.name || ''].map((label) => normalizeRouteName(label)).filter(Boolean);

    return rateLabels.some((rateLabel) =>
      requestedLabels.some(
        (requestedLabel) =>
          rateLabel === requestedLabel ||
          rateLabel.includes(requestedLabel) ||
          requestedLabel.includes(rateLabel),
      ),
    );
  }

  private async buildRouteFilter(data: FindTransportRateInput) {
    if (data.routeId || data.normalizedKey || data.routeName?.trim()) {
      const route = await this.resolveRouteReference({
        routeId: data.routeId,
        normalizedKey: data.normalizedKey || (data.routeName ? normalizeRouteName(data.routeName) : undefined),
      });

      return {
        OR: [
          {
            routeId: route.id,
          },
          {
            fromPlaceId: route.fromPlaceId,
            toPlaceId: route.toPlaceId,
          },
          {
            AND: [
              { routeName: { contains: route.fromPlace.name, mode: 'insensitive' as const } },
              { routeName: { contains: route.toPlace.name, mode: 'insensitive' as const } },
            ],
          },
        ],
      };
    }

    const hasFromPlace = Boolean(data.fromPlaceId);
    const hasToPlace = Boolean(data.toPlaceId);

    if (hasFromPlace !== hasToPlace) {
      throw new BadRequestException('fromPlaceId and toPlaceId must be provided together');
    }

    if (hasFromPlace && hasToPlace) {
      const [fromPlace, toPlace] = await Promise.all([
        this.prisma.place.findUnique({
          where: { id: data.fromPlaceId! },
          select: { id: true, name: true },
        }),
        this.prisma.place.findUnique({
          where: { id: data.toPlaceId! },
          select: { id: true, name: true },
        }),
      ]);

      if (!fromPlace) {
        throw new BadRequestException('From place not found');
      }

      if (!toPlace) {
        throw new BadRequestException('To place not found');
      }

      const route = await this.prisma.route.findUnique({
        where: { normalizedKey: buildRouteNormalizedKey(fromPlace.name, toPlace.name) },
        select: { id: true, fromPlaceId: true, toPlaceId: true },
      });

      return {
        OR: [
          ...(route ? [{ routeId: route.id }] : []),
          {
            fromPlaceId: fromPlace.id,
            toPlaceId: toPlace.id,
          },
          {
            AND: [
              { routeName: { contains: fromPlace.name, mode: 'insensitive' as const } },
              { routeName: { contains: toPlace.name, mode: 'insensitive' as const } },
            ],
          },
        ],
      };
    }

    throw new BadRequestException('routeId or normalizedKey is required');
  }

  private async resolveRouteReference(data: { routeId?: string | null; normalizedKey?: string | null }) {
    const routeId = data.routeId?.trim();
    const normalizedKey = data.normalizedKey?.trim();

    if (!routeId && !normalizedKey) {
      throw new BadRequestException('routeId or normalizedKey is required');
    }

    const route = await this.prisma.route.findUnique({
      where: routeId ? { id: routeId } : { normalizedKey },
      include: {
        fromPlace: {
          select: { id: true, name: true },
        },
        toPlace: {
          select: { id: true, name: true },
        },
      },
    });

    if (!route) {
      throw new BadRequestException('Route not found');
    }

    return route;
  }
}
