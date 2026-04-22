import { BadRequestException, Injectable } from '@nestjs/common';
import {
  blockDelete,
  ensureValidNumber,
  normalizeOptionalString,
  throwIfNotFound,
} from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type FindRoutesInput = {
  search?: string;
  active?: boolean;
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
  return `${fromPlaceName} - ${toPlaceName}`;
}

function buildDuplicateRouteName(name: string) {
  return `${name} (Copy)`;
}

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FindRoutesInput = {}) {
    const search = filters.search?.trim();

    return this.prisma.route.findMany({
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

    return this.prisma.route.create({
      data: resolved,
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });
  }

  async duplicate(id: string) {
    const existing = await this.findOne(id);

    return this.create({
      fromPlaceId: existing.fromPlaceId,
      toPlaceId: existing.toPlaceId,
      name: buildDuplicateRouteName(existing.name),
      routeType: existing.routeType,
      durationMinutes: existing.durationMinutes,
      distanceKm: existing.distanceKm,
      notes: existing.notes,
      isActive: true,
    });
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
      name: normalizeOptionalString(data.name) || buildRouteName(fromPlace.name, toPlace.name),
      routeType: normalizeOptionalString(data.routeType),
      durationMinutes,
      distanceKm,
      notes: normalizeOptionalString(data.notes),
      isActive: data.isActive ?? true,
    };
  }
}
