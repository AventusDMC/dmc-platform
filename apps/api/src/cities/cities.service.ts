import { BadRequestException, Injectable } from '@nestjs/common';
import { blockDelete, normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type FindCitiesInput = {
  search?: string;
  active?: boolean;
};

type CreateCityInput = {
  name: string;
  country?: string | null;
  isActive?: boolean;
};

type UpdateCityInput = Partial<CreateCityInput>;

@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: FindCitiesInput = {}) {
    const search = filters.search?.trim();

    return this.prisma.city.findMany({
      where: {
        ...(filters.active === undefined ? {} : { isActive: filters.active }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { country: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const city = await this.prisma.city.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            hotels: true,
            places: true,
          },
        },
      },
    });

    return throwIfNotFound(city, 'City');
  }

  async create(data: CreateCityInput) {
    const name = requireTrimmedString(data.name, 'name');
    const country = normalizeOptionalString(data.country) ?? null;

    await this.ensureUnique(name, country);

    return this.prisma.city.create({
      data: {
        name,
        country,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: UpdateCityInput) {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    const existing = await this.findOne(id);
    const name = data.name === undefined ? existing.name : requireTrimmedString(data.name, 'name');
    const country = data.country === undefined ? existing.country : normalizeOptionalString(data.country) ?? null;

    await this.ensureUnique(name, country, id);

    return this.prisma.city.update({
      where: { id },
      data: {
        name,
        country,
        isActive: data.isActive,
      },
    });
  }

  async remove(id: string) {
    const city = await this.findOne(id);

    blockDelete('city', 'hotels', city._count.hotels);
    blockDelete('city', 'places', city._count.places);

    return this.prisma.city.delete({
      where: { id },
    });
  }

  private async ensureUnique(name: string, country: string | null, excludeId?: string) {
    const existing = await this.prisma.city.findFirst({
      where: {
        name,
        country,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new BadRequestException('City already exists');
    }
  }
}
