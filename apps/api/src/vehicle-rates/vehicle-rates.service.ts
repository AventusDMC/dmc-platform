import { BadRequestException, Injectable } from '@nestjs/common';
import { blockDelete, ensureValidNumber, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateVehicleRateInput = {
  vehicleId: string;
  serviceTypeId: string;
  routeId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  minPax: number;
  maxPax: number;
  price: number;
  currency: string;
  validFrom: Date;
  validTo: Date;
};

type UpdateVehicleRateInput = {
  vehicleId?: string;
  serviceTypeId?: string;
  routeId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  minPax?: number;
  maxPax?: number;
  price?: number;
  currency?: string;
  validFrom?: Date;
  validTo?: Date;
};

function buildRouteName(fromPlaceName: string, toPlaceName: string) {
  return `${fromPlaceName} - ${toPlaceName}`;
}

@Injectable()
export class VehicleRatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.vehicleRate.findMany({
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
          routeName: 'asc',
        },
        {
          minPax: 'asc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const vehicleRate = await this.prisma.vehicleRate.findUnique({
      where: { id },
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
        _count: {
          select: {
            quoteItems: true,
          },
        },
      },
    });

    return throwIfNotFound(vehicleRate, 'Vehicle rate');
  }

  async create(data: CreateVehicleRateInput) {
    if (data.minPax > data.maxPax) {
      throw new BadRequestException('minPax cannot be greater than maxPax');
    }

    if (data.validFrom > data.validTo) {
      throw new BadRequestException('validFrom cannot be after validTo');
    }

    const [vehicle, serviceType, route, fromPlace, toPlace] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: data.vehicleId },
      }),
      this.prisma.transportServiceType.findUnique({
        where: { id: data.serviceTypeId },
      }),
      data.routeId
        ? this.prisma.route.findUnique({
            where: { id: data.routeId },
            include: {
              fromPlace: {
                select: { id: true, name: true },
              },
              toPlace: {
                select: { id: true, name: true },
              },
            },
          })
        : Promise.resolve(null),
      data.fromPlaceId
        ? this.prisma.place.findUnique({
            where: { id: data.fromPlaceId },
          })
        : Promise.resolve(null),
      data.toPlaceId
        ? this.prisma.place.findUnique({
            where: { id: data.toPlaceId },
          })
        : Promise.resolve(null),
    ]);

    if (!vehicle) {
      throw new BadRequestException('Vehicle not found');
    }

    if (!serviceType) {
      throw new BadRequestException('Transport service type not found');
    }

    const routeData = this.resolveRouteFields(
      {
        routeId: data.routeId,
        fromPlaceId: data.fromPlaceId,
        toPlaceId: data.toPlaceId,
        routeName: data.routeName,
      },
      route,
      fromPlace,
      toPlace,
    );

    return this.prisma.vehicleRate.create({
      data: {
        vehicleId: data.vehicleId,
        serviceTypeId: data.serviceTypeId,
        routeId: routeData.routeId,
        fromPlaceId: routeData.fromPlaceId,
        toPlaceId: routeData.toPlaceId,
        routeName: routeData.routeName,
        minPax: data.minPax,
        maxPax: data.maxPax,
        price: ensureValidNumber(data.price, 'price', { min: 0 }),
        currency: data.currency.trim().toUpperCase(),
        validFrom: data.validFrom,
        validTo: data.validTo,
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
    });
  }

  async duplicate(id: string) {
    const existing = await this.findOne(id);

    return this.create({
      vehicleId: existing.vehicleId,
      serviceTypeId: existing.serviceTypeId,
      routeId: existing.routeId,
      fromPlaceId: existing.fromPlaceId,
      toPlaceId: existing.toPlaceId,
      routeName: existing.routeName,
      minPax: existing.minPax,
      maxPax: existing.maxPax,
      price: existing.price,
      currency: existing.currency,
      validFrom: existing.validFrom,
      validTo: existing.validTo,
    });
  }

  async update(id: string, data: UpdateVehicleRateInput) {
    const existing = await this.findOne(id);
    const vehicleId = data.vehicleId ?? existing.vehicleId;
    const serviceTypeId = data.serviceTypeId ?? existing.serviceTypeId;
    const routeId = data.routeId === undefined ? existing.routeId : data.routeId;
    const minPax = data.minPax ?? existing.minPax;
    const maxPax = data.maxPax ?? existing.maxPax;
    const validFrom = data.validFrom ?? existing.validFrom;
    const validTo = data.validTo ?? existing.validTo;
    const fromPlaceId = data.fromPlaceId === undefined ? existing.fromPlaceId : data.fromPlaceId;
    const toPlaceId = data.toPlaceId === undefined ? existing.toPlaceId : data.toPlaceId;

    if (minPax > maxPax) {
      throw new BadRequestException('minPax cannot be greater than maxPax');
    }

    if (validFrom > validTo) {
      throw new BadRequestException('validFrom cannot be after validTo');
    }

    const [vehicle, serviceType, route, fromPlace, toPlace] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
      }),
      this.prisma.transportServiceType.findUnique({
        where: { id: serviceTypeId },
      }),
      routeId
        ? this.prisma.route.findUnique({
            where: { id: routeId },
            include: {
              fromPlace: {
                select: { id: true, name: true },
              },
              toPlace: {
                select: { id: true, name: true },
              },
            },
          })
        : Promise.resolve(null),
      fromPlaceId
        ? this.prisma.place.findUnique({
            where: { id: fromPlaceId },
          })
        : Promise.resolve(null),
      toPlaceId
        ? this.prisma.place.findUnique({
            where: { id: toPlaceId },
          })
        : Promise.resolve(null),
    ]);

    if (!vehicle) {
      throw new BadRequestException('Vehicle not found');
    }

    if (!serviceType) {
      throw new BadRequestException('Transport service type not found');
    }

    const routeData = this.resolveRouteFields(
      {
        routeId,
        fromPlaceId,
        toPlaceId,
        routeName: data.routeName ?? existing.routeName,
      },
      route,
      fromPlace,
      toPlace,
    );

    return this.prisma.vehicleRate.update({
      where: { id },
      data: {
        vehicleId,
        serviceTypeId,
        routeId: routeData.routeId,
        fromPlaceId: routeData.fromPlaceId,
        toPlaceId: routeData.toPlaceId,
        routeName: routeData.routeName,
        minPax,
        maxPax,
        price: data.price === undefined ? undefined : ensureValidNumber(data.price, 'price', { min: 0 }),
        currency: data.currency === undefined ? undefined : data.currency.trim().toUpperCase(),
        validFrom,
        validTo,
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
    });
  }

  async remove(id: string) {
    const vehicleRate = await this.findOne(id);

    blockDelete('vehicle rate', 'quote items', vehicleRate._count.quoteItems);

    return this.prisma.vehicleRate.delete({
      where: { id },
    });
  }

  private resolveRouteFields(
    data: { routeId?: string | null; fromPlaceId?: string | null; toPlaceId?: string | null; routeName?: string },
    route:
      | {
          id: string;
          name: string;
          fromPlaceId: string;
          toPlaceId: string;
          fromPlace: { id: string; name: string };
          toPlace: { id: string; name: string };
        }
      | null,
    fromPlace: { id: string; name: string } | null,
    toPlace: { id: string; name: string } | null,
  ) {
    if (data.routeId) {
      if (!route) {
        throw new BadRequestException('Route not found');
      }

      return {
        routeId: route.id,
        fromPlaceId: route.fromPlaceId,
        toPlaceId: route.toPlaceId,
        routeName: route.name || buildRouteName(route.fromPlace.name, route.toPlace.name),
      };
    }

    const hasFromPlace = Boolean(data.fromPlaceId);
    const hasToPlace = Boolean(data.toPlaceId);

    if (hasFromPlace !== hasToPlace) {
      throw new BadRequestException('fromPlaceId and toPlaceId must be provided together');
    }

    if (hasFromPlace && hasToPlace) {
      if (!fromPlace) {
        throw new BadRequestException('From place not found');
      }

      if (!toPlace) {
        throw new BadRequestException('To place not found');
      }

      return {
        routeId: null,
        fromPlaceId: fromPlace.id,
        toPlaceId: toPlace.id,
        routeName: buildRouteName(fromPlace.name, toPlace.name),
      };
    }

    return {
      routeId: null,
      fromPlaceId: null,
      toPlaceId: null,
      routeName: requireTrimmedString(data.routeName || '', 'routeName'),
    };
  }
}
