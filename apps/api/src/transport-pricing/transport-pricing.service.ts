import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildRouteNormalizedKey, formatRouteName, normalizeRouteName } from '../routes/route-normalization';

type FindTransportRateInput = {
  serviceTypeId: string;
  routeId?: string | null;
  normalizedKey?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  paxCount: number;
  travelDate?: Date;
};

type TransportPricingCandidate = {
  routeId: string | null;
  routeName: string;
  pricingMode: 'per_vehicle' | 'capacity_unit';
  unitCapacity: number | null;
  unitCount: number | null;
  price: number;
  currency: string;
  vehicle: {
    id: string;
    name: string;
    maxPax: number;
    luggageCapacity?: number | null;
  };
  serviceType: {
    id: string;
    name: string;
    code: string;
  };
};

type ResolveTransportPricingRuleInput = {
  routeId?: string | null;
  normalizedKey?: string | null;
  transportServiceTypeId: string;
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
    const rule = await this.prisma.transportPricingRule.findFirst({
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
        transportServiceType: true,
        vehicle: true,
      },
      orderBy: [
        {
          maxPax: 'asc',
        },
        {
          minPax: 'desc',
        },
        {
          baseCost: 'asc',
        },
      ],
    });

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
    const rules = await this.prisma.transportPricingRule.findMany({
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
        transportServiceType: true,
        vehicle: true,
      },
      orderBy: [
        {
          maxPax: 'asc',
        },
        {
          baseCost: 'asc',
        },
        {
          minPax: 'desc',
        },
      ],
    });

    return rules.map((rule) => {
      const discountedBaseCost = Number((rule.baseCost * (1 - rule.discountPercent / 100)).toFixed(2));
      const unitCount =
        rule.pricingMode === 'capacity_unit' && rule.unitCapacity ? Math.ceil(data.pax / rule.unitCapacity) : null;
      const price =
        rule.pricingMode === 'capacity_unit' && unitCount
          ? Number((unitCount * discountedBaseCost).toFixed(2))
          : Number(discountedBaseCost.toFixed(2));

      return {
        routeId: rule.routeId,
        routeName: rule.route.name,
        pricingMode: rule.pricingMode,
        unitCapacity: rule.unitCapacity,
        unitCount,
        price,
        currency: rule.currency,
        vehicle: {
          id: rule.vehicle.id,
          name: rule.vehicle.name,
          maxPax: rule.vehicle.maxPax,
          luggageCapacity: rule.vehicle.luggageCapacity,
        },
        serviceType: {
          id: rule.transportServiceType.id,
          name: rule.transportServiceType.name,
          code: rule.transportServiceType.code,
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
    const rates = await this.prisma.vehicleRate.findMany({
      where: {
        serviceTypeId: data.serviceTypeId,
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

    return rates.map((rate) => ({
      routeId: rate.routeId,
      routeName: rate.routeName,
      pricingMode: 'per_vehicle' as const,
      unitCapacity: null,
      unitCount: null,
      price: rate.price,
      currency: rate.currency,
      vehicle: {
        id: rate.vehicle.id,
        name: rate.vehicle.name,
        maxPax: rate.vehicle.maxPax,
        luggageCapacity: rate.vehicle.luggageCapacity,
      },
      serviceType: {
        id: rate.serviceType.id,
        name: rate.serviceType.name,
        code: rate.serviceType.code,
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

    const rate = await this.prisma.vehicleRate.findFirst({
      where: {
        serviceTypeId: data.serviceTypeId,
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

    if (!rate) {
      throw new NotFoundException('No matching vehicle rate found');
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
          pax: data.paxCount,
        });
        const candidates = await this.resolvePricingRuleCandidates({
          routeId: data.routeId,
          normalizedKey: data.normalizedKey || (data.routeName ? normalizeRouteName(data.routeName) : undefined),
          transportServiceTypeId: data.serviceTypeId,
          pax: data.paxCount,
        });

        return {
          routeId: resolvedPricing.rule.routeId,
          route: resolvedPricing.rule.route,
          routeName: resolvedPricing.rule.route.name,
          paxCount: data.paxCount,
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
            maxPax: resolvedPricing.rule.vehicle.maxPax,
            luggageCapacity: resolvedPricing.rule.vehicle.luggageCapacity,
          },
          serviceType: {
            id: resolvedPricing.rule.transportServiceType.id,
            name: resolvedPricing.rule.transportServiceType.name,
            code: resolvedPricing.rule.transportServiceType.code,
          },
          candidates,
        };
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
      }
    }

    const rate = await this.findMatchingRate(data);
    const candidates = await this.findMatchingRateCandidates(data);

    return {
      vehicleRateId: rate.id,
      routeId: rate.routeId,
      route: rate.route,
      fromPlace: rate.fromPlace,
      toPlace: rate.toPlace,
      routeName: rate.routeName,
      paxCount: data.paxCount,
      pricingMode: 'per_vehicle' as const,
      unitCapacity: null,
      slabRate: rate.price,
      totalPrice: rate.price,
      price: rate.price,
      discountedBaseCost: rate.price,
      currency: rate.currency,
      unitCount: null,
      vehicle: {
        id: rate.vehicle.id,
        name: rate.vehicle.name,
        maxPax: rate.vehicle.maxPax,
        luggageCapacity: rate.vehicle.luggageCapacity,
      },
      serviceType: {
        id: rate.serviceType.id,
        name: rate.serviceType.name,
        code: rate.serviceType.code,
      },
      validFrom: rate.validFrom,
      validTo: rate.validTo,
      candidates,
    };
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
