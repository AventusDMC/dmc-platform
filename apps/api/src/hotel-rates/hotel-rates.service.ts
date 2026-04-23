import { BadRequestException, Injectable } from '@nestjs/common';
import { HotelMealPlan, HotelOccupancyType } from '@prisma/client';
import { ensureValidNumber, normalizeOptionalSupportedCurrency, requireSupportedCurrency, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type TourismFeeMode = 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM';
type HotelRatePricingMode = 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT';

type CreateHotelRateInput = {
  contractId: string;
  seasonId?: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: HotelOccupancyType;
  mealPlan: HotelMealPlan;
  pricingMode?: HotelRatePricingMode | null;
  currency: string;
  cost: number;
  costBaseAmount?: number;
  costCurrency?: string;
  salesTaxPercent?: number;
  salesTaxIncluded?: boolean;
  serviceChargePercent?: number;
  serviceChargeIncluded?: boolean;
  tourismFeeAmount?: number | null;
  tourismFeeCurrency?: string | null;
  tourismFeeMode?: TourismFeeMode | null;
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
    const costBaseAmount = ensureValidNumber(data.costBaseAmount ?? data.cost, 'costBaseAmount', { min: 0 });
    const costCurrency = requireSupportedCurrency(data.costCurrency || data.currency, 'currency');

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
        pricingMode: this.normalizePricingMode(data.pricingMode),
        currency: costCurrency,
        cost: costBaseAmount,
        costBaseAmount,
        costCurrency,
        salesTaxPercent: ensureValidNumber(data.salesTaxPercent ?? 0, 'salesTaxPercent', { min: 0 }),
        salesTaxIncluded: Boolean(data.salesTaxIncluded),
        serviceChargePercent: ensureValidNumber(data.serviceChargePercent ?? 0, 'serviceChargePercent', { min: 0 }),
        serviceChargeIncluded: Boolean(data.serviceChargeIncluded),
        tourismFeeAmount:
          data.tourismFeeAmount === undefined || data.tourismFeeAmount === null
            ? null
            : ensureValidNumber(data.tourismFeeAmount, 'tourismFeeAmount', { min: 0 }),
        tourismFeeCurrency: normalizeOptionalSupportedCurrency(data.tourismFeeCurrency ?? null, 'tourismFeeCurrency'),
        tourismFeeMode: data.tourismFeeMode ?? null,
      } as any,
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
    const costBaseAmount = ensureValidNumber(data.costBaseAmount ?? data.cost ?? (existing as any).costBaseAmount ?? existing.cost, 'costBaseAmount', {
      min: 0,
    });
    const costCurrency = requireSupportedCurrency(
      data.costCurrency ?? data.currency ?? (existing as any).costCurrency ?? existing.currency,
      'currency',
    );

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
        pricingMode: data.pricingMode === undefined ? undefined : this.normalizePricingMode(data.pricingMode),
        currency: costCurrency,
        cost: costBaseAmount,
        costBaseAmount,
        costCurrency,
        salesTaxPercent:
          data.salesTaxPercent === undefined ? undefined : ensureValidNumber(data.salesTaxPercent, 'salesTaxPercent', { min: 0 }),
        salesTaxIncluded: data.salesTaxIncluded === undefined ? undefined : Boolean(data.salesTaxIncluded),
        serviceChargePercent:
          data.serviceChargePercent === undefined
            ? undefined
            : ensureValidNumber(data.serviceChargePercent, 'serviceChargePercent', { min: 0 }),
        serviceChargeIncluded:
          data.serviceChargeIncluded === undefined ? undefined : Boolean(data.serviceChargeIncluded),
        tourismFeeAmount:
          data.tourismFeeAmount === undefined
            ? undefined
            : data.tourismFeeAmount === null
              ? null
              : ensureValidNumber(data.tourismFeeAmount, 'tourismFeeAmount', { min: 0 }),
        tourismFeeCurrency:
          data.tourismFeeCurrency === undefined
            ? undefined
            : normalizeOptionalSupportedCurrency(data.tourismFeeCurrency, 'tourismFeeCurrency'),
        tourismFeeMode: data.tourismFeeMode === undefined ? undefined : data.tourismFeeMode,
      } as any,
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

  private normalizePricingMode(value: HotelRatePricingMode | null | undefined) {
    if (value === undefined || value === null) {
      return null;
    }

    if (value === 'PER_ROOM_PER_NIGHT' || value === 'PER_PERSON_PER_NIGHT') {
      return value;
    }

    throw new BadRequestException('Unsupported hotel rate pricing mode');
  }
}
