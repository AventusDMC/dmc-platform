import { BadRequestException, Injectable } from '@nestjs/common';
import {
  blockDelete,
  ensureValidNumber,
  normalizeOptionalString,
  throwIfNotFound,
} from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { buildRouteNormalizedKey, formatRouteName, normalizeRouteDisplayName } from './route-normalization';

type FindRoutesInput = {
  search?: string;
  active?: boolean;
  type?: string;
};

type CreateRouteInput = {
  fromPlaceId: string;
  toPlaceId: string;
  name?: string | null;
  routeType?: string | null;
  durationMinutes?: number | null;
  distanceKm?: number | null;
  notes?: string | null;
  isActive?: boolean;
};

type UpdateRouteInput = Partial<CreateRouteInput>;

function buildRouteName(fromPlaceName: string, toPlaceName: string) {
  return formatRouteName(fromPlaceName, toPlaceName);
}

function isSpecialPricingRouteText(value: string) {
  const normalized = value.toLowerCase();
  const specialPatterns = [
    'extra km',
    'extra kilometer',
    'stationary',
    'per hour',
    'hourly',
    'extra hour',
    'driver overnight',
    'deduct transfer',
    'not part of program',
  ];

  return specialPatterns.some((pattern) => normalized.includes(pattern));
}

function isValidTransferRoute(route: {
  fromPlaceId: string;
  toPlaceId: string;
  name: string;
  routeType: string | null;
  notes: string | null;
  isActive: boolean;
  fromPlace?: { name: string } | null;
  toPlace?: { name: string } | null;
}) {
  if (!route.isActive) {
    return false;
  }

  if (!route.fromPlaceId || !route.toPlaceId || !route.fromPlace?.name || !route.toPlace?.name) {
    return false;
  }

  const routeType = (route.routeType || '').trim().toLowerCase();
  const routeText = [route.name, route.routeType, route.fromPlace.name, route.toPlace.name, route.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    ['extra-km', 'stationary', 'extra-hour', 'driver-overnight', 'transfer-deduction'].includes(routeType) ||
    isSpecialPricingRouteText(routeText)
  ) {
    return false;
  }

  if (routeType && !/(transfer|airport|border|intercity|excursion|private|local)/.test(routeType)) {
    return false;
  }

  return true;
}

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FindRoutesInput = {}) {
    const search = filters.search?.trim();
    const type = filters.type?.trim().toLowerCase();

    if (type && !['all', 'debug', 'transfer'].includes(type)) {
      throw new BadRequestException('Unsupported route type filter');
    }

    const routes = await this.prisma.route.findMany({
      where: {
        ...(filters.active === undefined ? {} : { isActive: filters.active }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { routeType: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } },
                { fromPlace: { is: { name: { contains: search, mode: 'insensitive' } } } },
                { toPlace: { is: { name: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: {
        fromPlace: true,
        toPlace: true,
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    if (type === 'transfer') {
      return routes.filter(isValidTransferRoute);
    }

    return routes;
  }

  async findOne(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: {
        fromPlace: true,
        toPlace: true,
        _count: {
          select: {
            vehicleRates: true,
          },
        },
      },
    });

    return throwIfNotFound(route, 'Route');
  }

  async create(data: CreateRouteInput) {
    const resolved = await this.resolveRouteDetails(data);
    const existing = await this.prisma.route.findUnique({
      where: { normalizedKey: resolved.normalizedKey },
    });

    if (existing) {
      return this.prisma.route.update({
        where: { id: existing.id },
        data: resolved,
        include: {
          fromPlace: true,
          toPlace: true,
        },
      });
    }

    return this.prisma.route.create({
      data: resolved,
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });
  }

  async duplicate(id: string) {
    await this.findOne(id);
    throw new BadRequestException('Routes are unique by origin and destination and cannot be duplicated');
  }

  async update(id: string, data: UpdateRouteInput) {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    const existing = await this.findOne(id);
    const resolved = await this.resolveRouteDetails({
      fromPlaceId: data.fromPlaceId ?? existing.fromPlaceId,
      toPlaceId: data.toPlaceId ?? existing.toPlaceId,
      name: data.name === undefined ? existing.name : data.name,
      routeType: data.routeType === undefined ? existing.routeType : data.routeType,
      durationMinutes: data.durationMinutes === undefined ? existing.durationMinutes : data.durationMinutes,
      distanceKm: data.distanceKm === undefined ? existing.distanceKm : data.distanceKm,
      notes: data.notes === undefined ? existing.notes : data.notes,
      isActive: data.isActive === undefined ? existing.isActive : data.isActive,
    });
    const duplicate = await this.prisma.route.findUnique({
      where: { normalizedKey: resolved.normalizedKey },
      select: { id: true },
    });

    if (duplicate && duplicate.id !== id) {
      throw new BadRequestException('Route already exists for this origin and destination');
    }

    return this.prisma.route.update({
      where: { id },
      data: resolved,
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });
  }

  async remove(id: string) {
    const route = await this.findOne(id);

    blockDelete('route', 'vehicle rates', route._count.vehicleRates);

    return this.prisma.route.delete({
      where: { id },
    });
  }

  private async resolveRouteDetails(data: CreateRouteInput) {
    const [fromPlace, toPlace] = await Promise.all([
      this.prisma.place.findUnique({
        where: { id: data.fromPlaceId },
        select: { id: true, name: true },
      }),
      this.prisma.place.findUnique({
        where: { id: data.toPlaceId },
        select: { id: true, name: true },
      }),
    ]);

    if (!fromPlace) {
      throw new BadRequestException('From place not found');
    }

    if (!toPlace) {
      throw new BadRequestException('To place not found');
    }

    const durationMinutes =
      data.durationMinutes === undefined || data.durationMinutes === null
        ? null
        : Math.trunc(ensureValidNumber(data.durationMinutes, 'durationMinutes', { min: 0 }));
    const distanceKm =
      data.distanceKm === undefined || data.distanceKm === null
        ? null
        : ensureValidNumber(data.distanceKm, 'distanceKm', { min: 0 });

    return {
      fromPlaceId: fromPlace.id,
      toPlaceId: toPlace.id,
      name: normalizeRouteDisplayName(data.name, fromPlace.name, toPlace.name),
      normalizedKey: buildRouteNormalizedKey(fromPlace.name, toPlace.name),
      routeType: normalizeOptionalString(data.routeType),
      durationMinutes,
      distanceKm,
      notes: normalizeOptionalString(data.notes),
      isActive: data.isActive ?? true,
    };
  }
}
