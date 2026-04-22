import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type FindTransportRateInput = {
  serviceTypeId: string;
  routeId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  paxCount: number;
  travelDate?: Date;
};

type ResolveTransportPricingRuleInput = {
  routeId: string;
  transportServiceTypeId: string;
  pax: number;
};

type UpsertTransportPricingRuleInput = {
  routeId: string;
  transportServiceTypeId: string;
  vehicleId: string;
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
  return `${fromPlaceName} - ${toPlaceName}`;
}

@Injectable()
export class TransportPricingService {
  constructor(private readonly prisma: PrismaService) {}

  findAllRules() {
    return this.prisma.transportPricingRule.findMany({
      include: {
        route: true,
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
    if (!data.routeId) {
      throw new BadRequestException('routeId is required');
    }

    if (!data.transportServiceTypeId) {
      throw new BadRequestException('transportServiceTypeId is required');
    }

    if (data.pax < 1) {
      throw new BadRequestException('pax must be at least 1');
    }

    const rule = await this.prisma.transportPricingRule.findFirst({
      where: {
        routeId: data.routeId,
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
    if (data.routeId) {
      try {
        const resolvedPricing = await this.resolvePricingRule({
          routeId: data.routeId,
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
        };
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
      }
    }

    const rate = await this.findMatchingRate(data);

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
    };
  }

  private async buildRouteFilter(data: FindTransportRateInput) {
    if (data.routeId) {
      const route = await this.prisma.route.findUnique({
        where: { id: data.routeId },
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
            routeName: {
              equals: route.name || buildRouteName(route.fromPlace.name, route.toPlace.name),
              mode: 'insensitive' as const,
            },
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

      return {
        OR: [
          {
            fromPlaceId: fromPlace.id,
            toPlaceId: toPlace.id,
          },
          {
            routeName: {
              equals: buildRouteName(fromPlace.name, toPlace.name),
              mode: 'insensitive' as const,
            },
          },
        ],
      };
    }

    const routeName = data.routeName?.trim();

    if (!routeName) {
      throw new BadRequestException('routeName is required when places are not provided');
    }

    return {
      routeName: {
        equals: routeName,
        mode: 'insensitive' as const,
      },
    };
  }
}
