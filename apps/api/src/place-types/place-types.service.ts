import { BadRequestException, Injectable } from '@nestjs/common';
import { blockDelete, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type FindPlaceTypesInput = {
  search?: string;
  active?: boolean;
};

type CreatePlaceTypeInput = {
  name: string;
  isActive?: boolean;
};

type UpdatePlaceTypeInput = Partial<CreatePlaceTypeInput>;

@Injectable()
export class PlaceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: FindPlaceTypesInput = {}) {
    const search = filters.search?.trim();

    return this.prisma.placeType.findMany({
      where: {
        ...(filters.active === undefined ? {} : { isActive: filters.active }),
        ...(search
          ? {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const placeType = await this.prisma.placeType.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            places: true,
          },
        },
      },
    });

    return throwIfNotFound(placeType, 'Place type');
  }

  async create(data: CreatePlaceTypeInput) {
    const name = requireTrimmedString(data.name, 'name');
    await this.ensureUnique(name);

    return this.prisma.placeType.create({
      data: {
        name,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: UpdatePlaceTypeInput) {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    const existing = await this.findOne(id);
    const name = data.name === undefined ? existing.name : requireTrimmedString(data.name, 'name');
    await this.ensureUnique(name, id);

    const placeType = await this.prisma.placeType.update({
      where: { id },
      data: {
        name,
        isActive: data.isActive,
      },
    });

    if (name !== existing.name) {
      await this.prisma.place.updateMany({
        where: { placeTypeId: id },
        data: { type: name },
      });
    }

    return placeType;
  }

  async remove(id: string) {
    const placeType = await this.findOne(id);

    blockDelete('place type', 'places', placeType._count.places);

    return this.prisma.placeType.delete({
      where: { id },
    });
  }

  private async ensureUnique(name: string, excludeId?: string) {
    const existing = await this.prisma.placeType.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new BadRequestException('Place type already exists');
    }
  }
}
