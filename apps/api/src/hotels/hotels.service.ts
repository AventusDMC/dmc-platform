import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { blockDelete, normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateHotelInput = {
  name: string;
  city?: string;
  cityId?: string | null;
  category?: string;
  hotelCategoryId?: string | null;
  supplierId: string;
};

type UpdateHotelInput = Partial<CreateHotelInput>;

type CreateHotelRoomCategoryInput = {
  hotelId: string;
  name: string;
  code?: string;
  description?: string;
  isActive?: boolean;
};

type UpdateHotelRoomCategoryInput = Partial<Omit<CreateHotelRoomCategoryInput, 'hotelId'>>;

@Injectable()
export class HotelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const hotels = await this.prisma.hotel.findMany({
      include: {
        cityRecord: true,
        hotelCategory: true,
        roomCategories: {
          orderBy: [
            {
              isActive: 'desc',
            },
            {
              name: 'asc',
            },
          ],
        },
        _count: {
          select: {
            contracts: true,
            roomCategories: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return hotels.map((hotel) => this.serializeHotel(hotel));
  }

  async findOne(id: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id },
      include: {
        cityRecord: true,
        hotelCategory: true,
        roomCategories: {
          include: {
            _count: {
              select: {
                hotelRates: true,
                quoteItems: true,
              },
            },
          },
          orderBy: [
            {
              isActive: 'desc',
            },
            {
              name: 'asc',
            },
          ],
        },
        _count: {
          select: {
            contracts: true,
            roomCategories: true,
            quoteItems: true,
          },
        },
      },
    });

    return this.serializeHotel(throwIfNotFound(hotel, 'Hotel'));
  }

  async create(data: CreateHotelInput) {
    const cityDetails = await this.resolveCity(data);
    const categoryDetails = await this.resolveHotelCategory({
      category: data.category,
      hotelCategoryId: data.hotelCategoryId,
    });

    const hotel = await this.prisma.hotel.create({
      data: {
        name: requireTrimmedString(data.name, 'name'),
        cityId: cityDetails.cityId,
        city: cityDetails.cityName,
        category: categoryDetails.categoryName,
        hotelCategoryId: categoryDetails.hotelCategoryId,
        supplierId: requireTrimmedString(data.supplierId, 'supplierId'),
      },
      include: {
        cityRecord: true,
        hotelCategory: true,
      },
    });

    return this.serializeHotel(hotel);
  }

  async update(id: string, data: UpdateHotelInput) {
    const existing = await this.findOne(id);
    const cityDetails =
      data.city !== undefined || data.cityId !== undefined
        ? await this.resolveCity({
            city: data.city,
            cityId: data.cityId,
          })
        : { cityId: existing.cityId, cityName: existing.city };
    const categoryDetails =
      data.category !== undefined || data.hotelCategoryId !== undefined
        ? await this.resolveHotelCategory({
            category: data.category,
            hotelCategoryId: data.hotelCategoryId,
            fallbackCategoryName: existing.category,
          })
        : { hotelCategoryId: existing.hotelCategoryId, categoryName: existing.category };

    const hotel = await this.prisma.hotel.update({
      where: { id },
      data: {
        name: data.name === undefined ? undefined : requireTrimmedString(data.name, 'name'),
        cityId: cityDetails.cityId,
        city: cityDetails.cityName,
        category: categoryDetails.categoryName,
        hotelCategoryId: categoryDetails.hotelCategoryId,
        supplierId: data.supplierId === undefined ? undefined : requireTrimmedString(data.supplierId, 'supplierId'),
      },
      include: {
        cityRecord: true,
        hotelCategory: true,
      },
    });

    return this.serializeHotel(hotel);
  }

  async remove(id: string) {
    const hotel = await this.findOne(id);

    blockDelete('hotel', 'contracts', hotel._count.contracts);
    blockDelete('hotel', 'room categories', hotel._count.roomCategories);
    blockDelete('hotel', 'quote items', hotel._count.quoteItems);

    return this.prisma.hotel.delete({
      where: { id },
    });
  }

  async createRoomCategory(data: CreateHotelRoomCategoryInput) {
    await this.findOne(data.hotelId);

    return this.prisma.hotelRoomCategory.create({
      data: {
        hotelId: data.hotelId,
        name: data.name.trim(),
        code: data.code?.trim() || null,
        description: data.description?.trim() || null,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateRoomCategory(hotelId: string, categoryId: string, data: UpdateHotelRoomCategoryInput) {
    const category = await this.prisma.hotelRoomCategory.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: {
            hotelRates: true,
            quoteItems: true,
          },
        },
      },
    });

    const existingCategory = throwIfNotFound(category, 'Hotel room category');

    if (existingCategory.hotelId !== hotelId) {
      throw new NotFoundException('Hotel room category not found');
    }

    return this.prisma.hotelRoomCategory.update({
      where: { id: categoryId },
      data: {
        name: data.name === undefined ? undefined : data.name.trim(),
        code: data.code === undefined ? undefined : data.code.trim() || null,
        description: data.description === undefined ? undefined : data.description.trim() || null,
        isActive: data.isActive,
      },
    });
  }

  async removeRoomCategory(hotelId: string, categoryId: string) {
    const category = await this.prisma.hotelRoomCategory.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: {
            hotelRates: true,
            quoteItems: true,
          },
        },
      },
    });

    const existingCategory = throwIfNotFound(category, 'Hotel room category');

    if (existingCategory.hotelId !== hotelId) {
      throw new NotFoundException('Hotel room category not found');
    }

    blockDelete('hotel room category', 'hotel rates', existingCategory._count.hotelRates);
    blockDelete('hotel room category', 'quote items', existingCategory._count.quoteItems);

    return this.prisma.hotelRoomCategory.delete({
      where: { id: categoryId },
    });
  }

  private async resolveCity(data: { city?: string | null; cityId?: string | null }) {
    const trimmedCity = data.city?.trim() || '';

    if (data.cityId) {
      const city = await this.prisma.city.findUnique({
        where: { id: data.cityId },
      });

      if (!city) {
        throw new BadRequestException('City not found');
      }

      return {
        cityId: city.id,
        cityName: city.name,
      };
    }

    if (!trimmedCity) {
      throw new BadRequestException('city is required');
    }

    return {
      cityId: null,
      cityName: trimmedCity,
    };
  }

  private async resolveHotelCategory(data: {
    category?: string | null;
    hotelCategoryId?: string | null;
    fallbackCategoryName?: string;
  }) {
    if (data.hotelCategoryId) {
      const hotelCategory = await this.prisma.hotelCategory.findUnique({
        where: { id: data.hotelCategoryId },
      });

      if (!hotelCategory) {
        throw new BadRequestException('Hotel category not found');
      }

      return {
        hotelCategoryId: hotelCategory.id,
        categoryName: hotelCategory.name,
      };
    }

    const category = normalizeOptionalString(data.category);

    if (category) {
      return {
        hotelCategoryId: null,
        categoryName: category,
      };
    }

    if (data.fallbackCategoryName) {
      return {
        hotelCategoryId: null,
        categoryName: data.fallbackCategoryName,
      };
    }

    throw new BadRequestException('category is required');
  }

  private serializeHotel<
    T extends {
      category: string;
      city: string;
      cityRecord: { id: string; name: string; country: string | null; isActive: boolean } | null;
      hotelCategory: { id: string; name: string; isActive: boolean } | null;
    },
  >(
    hotel: T,
  ) {
    return {
      ...hotel,
      city: hotel.cityRecord?.name || hotel.city,
      category: hotel.hotelCategory?.name || hotel.category,
    };
  }
}
