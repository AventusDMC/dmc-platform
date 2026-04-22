import { BadRequestException, Injectable } from '@nestjs/common';
import { HotelMealPlan, HotelOccupancyType } from '@prisma/client';
import { ensureValidNumber, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateHotelRateInput = {
  contractId: string;
  seasonId?: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: HotelOccupancyType;
  mealPlan: HotelMealPlan;
  currency: string;
  cost: number;
};

type UpdateHotelRateInput = Partial<CreateHotelRateInput>;

@Injectable()
export class HotelRatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.hotelRate.findMany({
      include: {
        contract: {
          include: {
            hotel: true,
          },
        },
        roomCategory: true,
      },
      orderBy: [
        {
          seasonName: 'asc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const hotelRate = await this.prisma.hotelRate.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            hotel: true,
          },
        },
        roomCategory: true,
      },
    });

    return throwIfNotFound(hotelRate, 'Hotel rate');
  }

  async create(data: CreateHotelRateInput) {
    ensureValidNumber(data.cost, 'cost', { min: 0 });

    const contract = await this.prisma.hotelContract.findUnique({
      where: { id: data.contractId },
      include: {
        hotel: true,
      },
    });

    if (!contract) {
      throw new BadRequestException('Hotel contract not found');
    }

    const roomCategory = await this.prisma.hotelRoomCategory.findUnique({
      where: { id: data.roomCategoryId },
    });

    if (!roomCategory || roomCategory.hotelId !== contract.hotelId) {
      throw new BadRequestException('Hotel room category not found for the selected contract hotel');
    }

    return this.prisma.hotelRate.create({
      data: {
        contractId: data.contractId,
        seasonId: data.seasonId || null,
        seasonName: data.seasonName.trim(),
        roomCategoryId: data.roomCategoryId,
        occupancyType: data.occupancyType,
        mealPlan: data.mealPlan,
        currency: data.currency.trim().toUpperCase(),
        cost: ensureValidNumber(data.cost, 'cost', { min: 0 }),
      },
      include: {
        contract: {
          include: {
            hotel: true,
          },
        },
        roomCategory: true,
      },
    });
  }

  async update(id: string, data: UpdateHotelRateInput) {
    const existing = await this.findOne(id);
    const contractId = data.contractId ?? existing.contractId;

    ensureValidNumber(data.cost ?? existing.cost, 'cost', { min: 0 });

    const contract = await this.prisma.hotelContract.findUnique({
      where: { id: contractId },
      include: {
        hotel: true,
      },
    });

    if (!contract) {
      throw new BadRequestException('Hotel contract not found');
    }

    const roomCategoryId = data.roomCategoryId ?? existing.roomCategoryId;
    const roomCategory = await this.prisma.hotelRoomCategory.findUnique({
      where: { id: roomCategoryId },
    });

    if (!roomCategory || roomCategory.hotelId !== contract.hotelId) {
      throw new BadRequestException('Hotel room category not found for the selected contract hotel');
    }

    return this.prisma.hotelRate.update({
      where: { id },
      data: {
        contractId,
        seasonId: data.seasonId === undefined ? undefined : data.seasonId || null,
        seasonName: data.seasonName === undefined ? undefined : data.seasonName.trim(),
        roomCategoryId,
        occupancyType: data.occupancyType,
        mealPlan: data.mealPlan,
        currency: data.currency === undefined ? undefined : data.currency.trim().toUpperCase(),
        cost: data.cost === undefined ? undefined : ensureValidNumber(data.cost, 'cost', { min: 0 }),
      },
      include: {
        contract: {
          include: {
            hotel: true,
          },
        },
        roomCategory: true,
      },
    });
  }

  remove(id: string) {
    return this.prisma.hotelRate.delete({
      where: { id },
    });
  }
}
