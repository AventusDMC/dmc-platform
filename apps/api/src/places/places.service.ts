import { BadRequestException, Injectable } from '@nestjs/common';
import { blockDelete, normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type FindPlacesInput = {
  search?: string;
  active?: boolean;
};

type CreatePlaceInput = {
  name: string;
  type?: string;
  placeTypeId?: string | null;
  cityId?: string | null;
  city?: string | null;
  country?: string | null;
  isActive?: boolean;
};

type UpdatePlaceInput = Partial<CreatePlaceInput>;

@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FindPlacesInput = {}) {
    const search = filters.search?.trim();

    const places = await this.prisma.place.findMany({
      where: {
        ...(filters.active === undefined ? {} : { isActive: filters.active }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { type: { contains: search, mode: 'insensitive' } },
                { placeType: { is: { name: { contains: search, mode: 'insensitive' } } } },
                { city: { contains: search, mode: 'insensitive' } },
                { country: { contains: search, mode: 'insensitive' } },
                { cityRecord: { is: { name: { contains: search, mode: 'insensitive' } } } },
                { cityRecord: { is: { country: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: {
        placeType: true,
        cityRecord: true,
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { city: 'asc' }],
    });

    return places.map((place) => this.serializePlace(place));
  }

  async findOne(id: string) {
    const place = await this.prisma.place.findUnique({
      where: { id },
      include: {
        placeType: true,
        cityRecord: true,
        _count: {
          select: {
            fromVehicleRates: true,
            toVehicleRates: true,
          },
        },
      },
    });

    return this.serializePlace(throwIfNotFound(place, 'Place'));
  }

  async create(data: CreatePlaceInput) {
    const cityDetails = await this.resolveCity(data);
    const typeDetails = await this.resolvePlaceType({
      type: data.type,
      placeTypeId: data.placeTypeId,
    });

    const place = await this.prisma.place.create({
      data: {
        name: requireTrimmedString(data.name, 'name'),
        type: typeDetails.typeName,
        placeTypeId: typeDetails.placeTypeId,
        cityId: cityDetails.cityId,
        city: cityDetails.cityName,
        country: cityDetails.country,
        isActive: data.isActive ?? true,
      },
      include: {
        placeType: true,
        cityRecord: true,
      },
    });

    return this.serializePlace(place);
  }

  async update(id: string, data: UpdatePlaceInput) {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    const existing = await this.findOne(id);
    const cityDetails =
      data.city !== undefined || data.cityId !== undefined || data.country !== undefined
        ? await this.resolveCity({
            cityId: data.cityId,
            city: data.city,
            country: data.country,
          })
        : {
            cityId: existing.cityId,
            cityName: existing.city,
            country: existing.country,
          };
    const typeDetails =
      data.type !== undefined || data.placeTypeId !== undefined
        ? await this.resolvePlaceType({
            type: data.type,
            placeTypeId: data.placeTypeId,
            fallbackTypeName: existing.type,
          })
        : {
            placeTypeId: existing.placeTypeId,
            typeName: existing.type,
          };

    const place = await this.prisma.place.update({
      where: { id },
      data: {
        name: data.name === undefined ? undefined : requireTrimmedString(data.name, 'name'),
        type: typeDetails.typeName,
        placeTypeId: typeDetails.placeTypeId,
        cityId: cityDetails.cityId,
        city: cityDetails.cityName,
        country: cityDetails.country,
        isActive: data.isActive,
      },
      include: {
        placeType: true,
        cityRecord: true,
      },
    });

    return this.serializePlace(place);
  }

  async remove(id: string) {
    const place = await this.findOne(id);
    const usageCount = place._count.fromVehicleRates + place._count.toVehicleRates;

    blockDelete('place', 'vehicle rates', usageCount);

    return this.prisma.place.delete({
      where: { id },
    });
  }

  private async resolveCity(data: { cityId?: string | null; city?: string | null; country?: string | null }) {
    const manualCity = normalizeOptionalString(data.city);
    const manualCountry = normalizeOptionalString(data.country);

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
        country: manualCountry ?? city.country ?? null,
      };
    }

    return {
      cityId: null,
      cityName: manualCity,
      country: manualCountry,
    };
  }

  private async resolvePlaceType(data: {
    type?: string | null;
    placeTypeId?: string | null;
    fallbackTypeName?: string;
  }) {
    if (data.placeTypeId) {
      const placeType = await this.prisma.placeType.findUnique({
        where: { id: data.placeTypeId },
      });

      if (!placeType) {
        throw new BadRequestException('Place type not found');
      }

      return {
        placeTypeId: placeType.id,
        typeName: placeType.name,
      };
    }

    const type = normalizeOptionalString(data.type);

    if (type) {
      return {
        placeTypeId: null,
        typeName: type,
      };
    }

    if (data.fallbackTypeName) {
      return {
        placeTypeId: null,
        typeName: data.fallbackTypeName,
      };
    }

    throw new BadRequestException('type is required');
  }

  private serializePlace<
    T extends {
      city: string | null;
      country: string | null;
      placeTypeId: string | null;
      type: string;
      placeType: { id: string; name: string; isActive: boolean } | null;
      cityRecord: { id: string; name: string; country: string | null; isActive: boolean } | null;
    },
  >(place: T) {
    return {
      ...place,
      type: place.placeType?.name || place.type,
      city: place.cityRecord?.name || place.city,
      country: place.country ?? place.cityRecord?.country ?? null,
    };
  }
}
