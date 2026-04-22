import { BadRequestException, Injectable } from '@nestjs/common';
import { blockDelete, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type FindHotelCategoriesInput = {
  search?: string;
  active?: boolean;
};

type CreateHotelCategoryInput = {
  name: string;
  isActive?: boolean;
};

type UpdateHotelCategoryInput = Partial<CreateHotelCategoryInput>;

@Injectable()
export class HotelCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: FindHotelCategoriesInput = {}) {
    const search = filters.search?.trim();

    return this.prisma.hotelCategory.findMany({
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
    const category = await this.prisma.hotelCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            hotels: true,
            quoteOptions: true,
          },
        },
      },
    });

    return throwIfNotFound(category, 'Hotel category');
  }

  async create(data: CreateHotelCategoryInput) {
    const name = requireTrimmedString(data.name, 'name');
    await this.ensureUnique(name);

    return this.prisma.hotelCategory.create({
      data: {
        name,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: UpdateHotelCategoryInput) {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    const existing = await this.findOne(id);
    const name = data.name === undefined ? existing.name : requireTrimmedString(data.name, 'name');
    await this.ensureUnique(name, id);

    return this.prisma.hotelCategory.update({
      where: { id },
      data: {
        name,
        isActive: data.isActive,
      },
    });
  }

  async remove(id: string) {
    const category = await this.findOne(id);

    blockDelete('hotel category', 'hotels', category._count.hotels);
    blockDelete('hotel category', 'quote options', category._count.quoteOptions);

    return this.prisma.hotelCategory.delete({
      where: { id },
    });
  }

  private async ensureUnique(name: string, excludeId?: string) {
    const existing = await this.prisma.hotelCategory.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new BadRequestException('Hotel category already exists');
    }
  }
}
