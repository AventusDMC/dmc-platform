import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { blockDelete, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildHotelAllotmentConsumptionRecords,
  calculateHotelAllotmentConsumptionForDate,
  calculateHotelAllotmentPeakConsumption,
} from './hotel-allotment-consumption';
import { evaluateHotelAllotment } from './hotel-allotment-evaluator';

type CreateHotelContractInput = {
  hotelId: string;
  name: string;
  validFrom: Date;
  validTo: Date;
  currency: string;
};

type UpdateHotelContractInput = Partial<CreateHotelContractInput>;

type CreateHotelAllotmentInput = {
  roomCategoryId: string;
  dateFrom: Date;
  dateTo: Date;
  allotment: number;
  releaseDays: number;
  stopSale: boolean;
  notes?: string | null;
  isActive: boolean;
};

type UpdateHotelAllotmentInput = Partial<CreateHotelAllotmentInput>;

const hotelContractInclude = Prisma.validator<Prisma.HotelContractInclude>()({
  hotel: {
    include: {
      roomCategories: {
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      },
    },
  },
  allotments: {
    include: {
      roomCategory: true,
    },
    orderBy: [{ dateFrom: 'asc' }, { createdAt: 'asc' }],
  },
  cancellationPolicy: {
    include: {
      rules: {
        orderBy: [{ deadlineUnit: 'asc' }, { windowFromValue: 'asc' }, { createdAt: 'asc' }],
      },
    },
  },
  _count: {
    select: {
      rates: true,
      quoteItems: true,
      allotments: true,
    },
  },
});

type HotelContractRecord = Prisma.HotelContractGetPayload<{
  include: typeof hotelContractInclude;
}>;

@Injectable()
export class HotelContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const [contracts, bookingConsumptionSources] = await Promise.all([
      this.prisma.hotelContract.findMany({
        include: hotelContractInclude,
        orderBy: [
          {
            validFrom: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
      }),
      this.getHotelConsumptionBookingSources(),
    ]);
    const completenessByContractId = await this.getContractCompletenessMap(contracts.map((contract) => contract.id));
    const consumptionRecords = buildHotelAllotmentConsumptionRecords(bookingConsumptionSources);

    return contracts.map((contract) => this.attachContractReadiness(this.attachAllotmentConsumption(contract, consumptionRecords), completenessByContractId));
  }

  async findOne(id: string) {
    const [contract, bookingConsumptionSources, completenessByContractId] = await Promise.all([
      this.prisma.hotelContract.findUnique({
        where: { id },
      include: hotelContractInclude,
      }),
      this.getHotelConsumptionBookingSources(),
      this.getContractCompletenessMap([id]),
    ]);

    return this.attachContractReadiness(
      this.attachAllotmentConsumption(throwIfNotFound(contract, 'Hotel contract'), buildHotelAllotmentConsumptionRecords(bookingConsumptionSources)),
      completenessByContractId,
    );
  }

  async create(data: CreateHotelContractInput) {
    if (data.validFrom > data.validTo) {
      throw new BadRequestException('validFrom cannot be after validTo');
    }

    const hotel = await this.prisma.hotel.findUnique({
      where: { id: data.hotelId },
    });

    if (!hotel) {
      throw new BadRequestException('Hotel not found');
    }

    return this.prisma.hotelContract.create({
      data: {
        hotelId: data.hotelId,
        name: data.name.trim(),
        validFrom: data.validFrom,
        validTo: data.validTo,
        currency: data.currency.trim().toUpperCase(),
      },
      include: {
        ...hotelContractInclude,
      },
    });
  }

  async update(id: string, data: UpdateHotelContractInput) {
    const existing = await this.findOne(id);
    const hotelId = data.hotelId ?? existing.hotelId;
    const validFrom = data.validFrom ?? existing.validFrom;
    const validTo = data.validTo ?? existing.validTo;

    if (validFrom > validTo) {
      throw new BadRequestException('validFrom cannot be after validTo');
    }

    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
    });

    if (!hotel) {
      throw new BadRequestException('Hotel not found');
    }

    if (hotelId !== existing.hotelId && existing._count.quoteItems > 0) {
      throw new BadRequestException('Cannot move hotel contract because linked quote items exist');
    }

    return this.prisma.hotelContract.update({
      where: { id },
      data: {
        hotelId,
        name: data.name === undefined ? undefined : data.name.trim(),
        validFrom,
        validTo,
        currency: data.currency === undefined ? undefined : data.currency.trim().toUpperCase(),
      },
      include: {
        ...hotelContractInclude,
      },
    });
  }

  async remove(id: string) {
    const contract = await this.findOne(id);

    blockDelete('hotel contract', 'quote items', contract._count.quoteItems);

    return this.prisma.hotelContract.delete({
      where: { id },
    });
  }

  async createAllotment(contractId: string, data: CreateHotelAllotmentInput) {
    const contract = await this.findOne(contractId);
    this.validateAllotmentInput(contract, data);

    return this.prisma.hotelAllotment.create({
      data: {
        hotelContractId: contractId,
        roomCategoryId: data.roomCategoryId,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        allotment: data.allotment,
        releaseDays: data.releaseDays,
        stopSale: data.stopSale,
        notes: data.notes?.trim() || null,
        isActive: data.isActive,
      },
      include: {
        roomCategory: true,
      },
    });
  }

  async updateAllotment(contractId: string, allotmentId: string, data: UpdateHotelAllotmentInput) {
    const contract = await this.findOne(contractId);
    const existing = contract.allotments.find((allotment) => allotment.id === allotmentId);

    if (!existing) {
      throw new BadRequestException('Hotel allotment not found');
    }

    const nextData: CreateHotelAllotmentInput = {
      roomCategoryId: data.roomCategoryId ?? existing.roomCategoryId,
      dateFrom: data.dateFrom ?? existing.dateFrom,
      dateTo: data.dateTo ?? existing.dateTo,
      allotment: data.allotment ?? existing.allotment,
      releaseDays: data.releaseDays ?? existing.releaseDays,
      stopSale: data.stopSale ?? existing.stopSale,
      notes: data.notes === undefined ? existing.notes : data.notes,
      isActive: data.isActive ?? existing.isActive,
    };

    this.validateAllotmentInput(contract, nextData);

    return this.prisma.hotelAllotment.update({
      where: { id: allotmentId },
      data: {
        roomCategoryId: nextData.roomCategoryId,
        dateFrom: nextData.dateFrom,
        dateTo: nextData.dateTo,
        allotment: nextData.allotment,
        releaseDays: nextData.releaseDays,
        stopSale: nextData.stopSale,
        notes: nextData.notes?.trim() || null,
        isActive: nextData.isActive,
      },
      include: {
        roomCategory: true,
      },
    });
  }

  async removeAllotment(contractId: string, allotmentId: string) {
    const contract = await this.findOne(contractId);
    const existing = contract.allotments.find((allotment) => allotment.id === allotmentId);

    if (!existing) {
      throw new BadRequestException('Hotel allotment not found');
    }

    return this.prisma.hotelAllotment.delete({
      where: { id: allotmentId },
    });
  }

  async evaluateAllotment(contractId: string, roomCategoryId: string, stayDate: Date, bookingDate?: Date) {
    const [contract, bookingConsumptionSources] = await Promise.all([this.findOne(contractId), this.getHotelConsumptionBookingSources()]);
    const roomCategory = contract.hotel.roomCategories.find((entry) => entry.id === roomCategoryId);

    if (!roomCategory) {
      throw new BadRequestException('Room category does not belong to this hotel contract');
    }

    const matchingAllotment =
      contract.allotments
        .filter(
          (allotment) =>
            allotment.roomCategoryId === roomCategoryId &&
            stayDate >= allotment.dateFrom &&
            stayDate <= allotment.dateTo,
        )
        .sort((left, right) => right.dateFrom.getTime() - left.dateFrom.getTime())[0] || null;

    const consumption =
      matchingAllotment
        ? calculateHotelAllotmentConsumptionForDate(
            {
              hotelContractId: matchingAllotment.hotelContractId,
              roomCategoryId: matchingAllotment.roomCategoryId,
              dateFrom: matchingAllotment.dateFrom,
              dateTo: matchingAllotment.dateTo,
              allotment: matchingAllotment.allotment,
            },
            buildHotelAllotmentConsumptionRecords(bookingConsumptionSources),
            stayDate,
          )
        : null;

    return evaluateHotelAllotment({
      allotments: contract.allotments.map((allotment) => ({
        id: allotment.id,
        hotelContractId: allotment.hotelContractId,
        roomCategoryId: allotment.roomCategoryId,
        dateFrom: allotment.dateFrom,
        dateTo: allotment.dateTo,
        allotment: allotment.allotment,
        releaseDays: allotment.releaseDays,
        stopSale: allotment.stopSale,
        notes: allotment.notes,
        isActive: allotment.isActive,
        createdAt: allotment.createdAt,
        updatedAt: allotment.updatedAt,
      })),
      roomCategoryId,
      stayDate,
      bookingDate,
      consumption,
    });
  }

  async getAllotmentDailySummary(contractId: string, allotmentId: string, bookingDate?: Date) {
    const [contract, bookingConsumptionSources] = await Promise.all([this.findOne(contractId), this.getHotelConsumptionBookingSources()]);
    const allotment = contract.allotments.find((entry) => entry.id === allotmentId);

    if (!allotment) {
      throw new BadRequestException('Hotel allotment not found');
    }

    const consumptionRecords = buildHotelAllotmentConsumptionRecords(bookingConsumptionSources);
    const evaluatorAllotments = contract.allotments.map((entry) => ({
      id: entry.id,
      hotelContractId: entry.hotelContractId,
      roomCategoryId: entry.roomCategoryId,
      dateFrom: entry.dateFrom,
      dateTo: entry.dateTo,
      allotment: entry.allotment,
      releaseDays: entry.releaseDays,
      stopSale: entry.stopSale,
      notes: entry.notes,
      isActive: entry.isActive,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
    const dailySummary: Array<{
      date: string;
      configuredAllotment: number;
      consumed: number;
      remainingAvailability: number;
      stopSaleActive: boolean;
      insideReleaseWindow: boolean;
      status: 'not_configured' | 'inactive' | 'stop_sale' | 'release_window' | 'sold_out' | 'available';
    }> = [];

    for (
      let cursor = this.startOfDay(allotment.dateFrom);
      cursor <= this.startOfDay(allotment.dateTo);
      cursor = this.addDays(cursor, 1)
    ) {
      const consumption = calculateHotelAllotmentConsumptionForDate(
        {
          hotelContractId: allotment.hotelContractId,
          roomCategoryId: allotment.roomCategoryId,
          dateFrom: allotment.dateFrom,
          dateTo: allotment.dateTo,
          allotment: allotment.allotment,
        },
        consumptionRecords,
        cursor,
      );
      const evaluation = evaluateHotelAllotment({
        allotments: evaluatorAllotments,
        roomCategoryId: allotment.roomCategoryId,
        stayDate: cursor,
        bookingDate,
        consumption,
      });

      dailySummary.push({
        date: cursor.toISOString().slice(0, 10),
        configuredAllotment: evaluation.configuredAllotment,
        consumed: evaluation.consumed,
        remainingAvailability: evaluation.remainingAvailability,
        stopSaleActive: evaluation.stopSaleActive,
        insideReleaseWindow: evaluation.insideReleaseWindow,
        status: evaluation.status,
      });
    }

    return {
      allotmentId: allotment.id,
      contractId: contract.id,
      contractName: contract.name,
      roomCategory: {
        id: allotment.roomCategory.id,
        name: allotment.roomCategory.name,
        code: allotment.roomCategory.code,
      },
      dateFrom: allotment.dateFrom.toISOString().slice(0, 10),
      dateTo: allotment.dateTo.toISOString().slice(0, 10),
      dailySummary,
    };
  }

  async getContractDailySummary(
    contractId: string,
    options?: {
      roomCategoryId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      bookingDate?: Date;
    },
  ) {
    const [contract, bookingConsumptionSources] = await Promise.all([this.findOne(contractId), this.getHotelConsumptionBookingSources()]);
    const filteredAllotments = contract.allotments.filter((allotment) =>
      options?.roomCategoryId ? allotment.roomCategoryId === options.roomCategoryId : true,
    );

    if (options?.roomCategoryId && filteredAllotments.length === 0) {
      throw new BadRequestException('Room category does not belong to this hotel contract allotment set');
    }

    const rangeStart = this.startOfDay(
      options?.dateFrom ||
        filteredAllotments.reduce(
          (current, allotment) => (allotment.dateFrom < current ? allotment.dateFrom : current),
          filteredAllotments[0]?.dateFrom || contract.validFrom,
        ),
    );
    const rangeEnd = this.startOfDay(
      options?.dateTo ||
        filteredAllotments.reduce(
          (current, allotment) => (allotment.dateTo > current ? allotment.dateTo : current),
          filteredAllotments[0]?.dateTo || contract.validTo,
        ),
    );

    if (rangeStart > rangeEnd) {
      throw new BadRequestException('dateFrom cannot be after dateTo');
    }

    const evaluatorAllotments = contract.allotments.map((entry) => ({
      id: entry.id,
      hotelContractId: entry.hotelContractId,
      roomCategoryId: entry.roomCategoryId,
      dateFrom: entry.dateFrom,
      dateTo: entry.dateTo,
      allotment: entry.allotment,
      releaseDays: entry.releaseDays,
      stopSale: entry.stopSale,
      notes: entry.notes,
      isActive: entry.isActive,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
    const consumptionRecords = buildHotelAllotmentConsumptionRecords(bookingConsumptionSources);
    const roomCategories = new Map(
      filteredAllotments.map((allotment) => [
        allotment.roomCategoryId,
        {
          id: allotment.roomCategory.id,
          name: allotment.roomCategory.name,
          code: allotment.roomCategory.code,
        },
      ]),
    );
    const dailySummary: Array<{
      date: string;
      roomCategoryId: string;
      roomCategoryName: string;
      configuredAllotment: number;
      consumed: number;
      remainingAvailability: number;
      stopSaleActive: boolean;
      insideReleaseWindow: boolean;
      status: 'not_configured' | 'inactive' | 'stop_sale' | 'release_window' | 'sold_out' | 'available';
    }> = [];

    for (let cursor = rangeStart; cursor <= rangeEnd; cursor = this.addDays(cursor, 1)) {
      for (const [roomCategoryId, roomCategory] of roomCategories.entries()) {
        const matchingAllotment =
          filteredAllotments
            .filter(
              (allotment) =>
                allotment.roomCategoryId === roomCategoryId &&
                cursor >= this.startOfDay(allotment.dateFrom) &&
                cursor <= this.startOfDay(allotment.dateTo),
            )
            .sort((left, right) => right.dateFrom.getTime() - left.dateFrom.getTime())[0] || null;
        const consumption = matchingAllotment
          ? calculateHotelAllotmentConsumptionForDate(
              {
                hotelContractId: matchingAllotment.hotelContractId,
                roomCategoryId: matchingAllotment.roomCategoryId,
                dateFrom: matchingAllotment.dateFrom,
                dateTo: matchingAllotment.dateTo,
                allotment: matchingAllotment.allotment,
              },
              consumptionRecords,
              cursor,
            )
          : null;
        const evaluation = evaluateHotelAllotment({
          allotments: evaluatorAllotments,
          roomCategoryId,
          stayDate: cursor,
          bookingDate: options?.bookingDate,
          consumption,
        });

        dailySummary.push({
          date: cursor.toISOString().slice(0, 10),
          roomCategoryId,
          roomCategoryName: roomCategory.code ? `${roomCategory.name} (${roomCategory.code})` : roomCategory.name,
          configuredAllotment: evaluation.configuredAllotment,
          consumed: evaluation.consumed,
          remainingAvailability: evaluation.remainingAvailability,
          stopSaleActive: evaluation.stopSaleActive,
          insideReleaseWindow: evaluation.insideReleaseWindow,
          status: evaluation.status,
        });
      }
    }

    return {
      contractId: contract.id,
      contractName: contract.name,
      dateFrom: rangeStart.toISOString().slice(0, 10),
      dateTo: rangeEnd.toISOString().slice(0, 10),
      roomCategoryId: options?.roomCategoryId || null,
      dailySummary,
    };
  }

  private validateAllotmentInput(contract: HotelContractRecord, data: CreateHotelAllotmentInput) {
    if (data.dateFrom > data.dateTo) {
      throw new BadRequestException('dateFrom cannot be after dateTo');
    }

    if (data.allotment < 0) {
      throw new BadRequestException('allotment cannot be negative');
    }

    if (data.releaseDays < 0) {
      throw new BadRequestException('releaseDays cannot be negative');
    }

    if (data.dateFrom < contract.validFrom || data.dateTo > contract.validTo) {
      throw new BadRequestException('Allotment dates must stay within the contract validity range');
    }

    const roomCategory = contract.hotel.roomCategories.find((entry) => entry.id === data.roomCategoryId);

    if (!roomCategory) {
      throw new BadRequestException('Room category does not belong to this hotel contract');
    }
  }

  private async getHotelConsumptionBookingSources() {
    return this.prisma.booking.findMany({
      where: {
        status: {
          not: 'cancelled',
        },
      },
      select: {
        id: true,
        status: true,
        snapshotJson: true,
        services: {
          select: {
            sourceQuoteItemId: true,
            status: true,
          },
        },
      },
    }).then((bookings) =>
      bookings.map((booking) => ({
        bookingId: booking.id,
        status: booking.status,
        snapshotJson: booking.snapshotJson,
        services: booking.services,
      })),
    );
  }

  private attachAllotmentConsumption(contract: HotelContractRecord, consumptionRecords: ReturnType<typeof buildHotelAllotmentConsumptionRecords>) {
    return {
      ...contract,
      allotments: contract.allotments.map((allotment) => ({
        ...allotment,
        consumption: calculateHotelAllotmentPeakConsumption(
          {
            hotelContractId: allotment.hotelContractId,
            roomCategoryId: allotment.roomCategoryId,
            dateFrom: allotment.dateFrom,
            dateTo: allotment.dateTo,
            allotment: allotment.allotment,
          },
          consumptionRecords,
        ),
      })),
    };
  }

  private async getContractCompletenessMap(contractIds: string[]) {
    if (contractIds.length === 0) {
      return new Map<
        string,
        {
          hasOccupancyRules: boolean;
          hasChildPolicy: boolean;
          hasMealPlans: boolean;
          hasSupplements: boolean;
          hasCancellationPolicy: boolean;
        }
      >();
    }

    const [occupancyRules, childPolicies, mealPlans, supplements, cancellationPolicies] = await Promise.all([
      (this.prisma as any).hotelContractOccupancyRule?.findMany({
        where: {
          hotelContractId: {
            in: contractIds,
          },
          isActive: true,
        },
        select: {
          hotelContractId: true,
          id: true,
        },
      }),
      (this.prisma as any).hotelContractChildPolicy?.findMany({
        where: {
          hotelContractId: {
            in: contractIds,
          },
        },
        select: {
          hotelContractId: true,
          id: true,
          bands: {
            where: {
              isActive: true,
            },
            select: {
              id: true,
            },
          },
        },
      }),
      (this.prisma as any).hotelContractMealPlan?.findMany({
        where: {
          hotelContractId: {
            in: contractIds,
          },
          isActive: true,
        },
        select: {
          hotelContractId: true,
          id: true,
        },
      }),
      (this.prisma as any).hotelContractSupplement?.findMany({
        where: {
          hotelContractId: {
            in: contractIds,
          },
          isActive: true,
        },
        select: {
          hotelContractId: true,
          id: true,
        },
      }),
      (this.prisma as any).hotelContractCancellationPolicy?.findMany({
        where: {
          hotelContractId: {
            in: contractIds,
          },
        },
        select: {
          hotelContractId: true,
          id: true,
          noShowPenaltyType: true,
          rules: {
            where: {
              isActive: true,
            },
            select: {
              id: true,
            },
          },
        },
      }),
    ]);

    const completeness = new Map<
      string,
      {
        hasOccupancyRules: boolean;
        hasChildPolicy: boolean;
        hasMealPlans: boolean;
        hasSupplements: boolean;
        hasCancellationPolicy: boolean;
      }
    >();

    for (const rule of occupancyRules || []) {
      const existing = completeness.get(rule.hotelContractId) || {
        hasOccupancyRules: false,
        hasChildPolicy: false,
        hasMealPlans: false,
        hasSupplements: false,
        hasCancellationPolicy: false,
      };
      existing.hasOccupancyRules = true;
      completeness.set(rule.hotelContractId, existing);
    }

    for (const policy of childPolicies || []) {
      const existing = completeness.get(policy.hotelContractId) || {
        hasOccupancyRules: false,
        hasChildPolicy: false,
        hasMealPlans: false,
        hasSupplements: false,
        hasCancellationPolicy: false,
      };
      existing.hasChildPolicy = Boolean(policy.bands?.length);
      completeness.set(policy.hotelContractId, existing);
    }

    for (const mealPlan of mealPlans || []) {
      const existing = completeness.get(mealPlan.hotelContractId) || {
        hasOccupancyRules: false,
        hasChildPolicy: false,
        hasMealPlans: false,
        hasSupplements: false,
        hasCancellationPolicy: false,
      };
      existing.hasMealPlans = true;
      completeness.set(mealPlan.hotelContractId, existing);
    }

    for (const supplement of supplements || []) {
      const existing = completeness.get(supplement.hotelContractId) || {
        hasOccupancyRules: false,
        hasChildPolicy: false,
        hasMealPlans: false,
        hasSupplements: false,
        hasCancellationPolicy: false,
      };
      existing.hasSupplements = true;
      completeness.set(supplement.hotelContractId, existing);
    }

    for (const cancellationPolicy of cancellationPolicies || []) {
      const existing = completeness.get(cancellationPolicy.hotelContractId) || {
        hasOccupancyRules: false,
        hasChildPolicy: false,
        hasMealPlans: false,
        hasSupplements: false,
        hasCancellationPolicy: false,
      };
      existing.hasCancellationPolicy = Boolean(cancellationPolicy.noShowPenaltyType || cancellationPolicy.rules?.length);
      completeness.set(cancellationPolicy.hotelContractId, existing);
    }

    return completeness;
  }

  private attachContractReadiness(
    contract: ReturnType<HotelContractsService['attachAllotmentConsumption']>,
    completenessByContractId: Map<
      string,
      {
        hasOccupancyRules: boolean;
        hasChildPolicy: boolean;
        hasMealPlans: boolean;
        hasSupplements: boolean;
        hasCancellationPolicy: boolean;
      }
    >,
  ) {
    const completeness = completenessByContractId.get(contract.id) || {
      hasOccupancyRules: false,
      hasChildPolicy: false,
      hasMealPlans: false,
      hasSupplements: false,
      hasCancellationPolicy: false,
    };
    const readiness = {
      hasRates: contract._count.rates > 0,
      hasOccupancyRules: completeness.hasOccupancyRules,
      hasChildPolicy: completeness.hasChildPolicy,
      hasMealPlans: completeness.hasMealPlans,
      hasSupplements: completeness.hasSupplements,
      hasCancellationPolicy: completeness.hasCancellationPolicy,
    };
    const readinessChecks = Object.values(readiness);
    const readinessStatus = readinessChecks.every(Boolean) ? 'ready' : readinessChecks.some(Boolean) ? 'in_progress' : 'draft';

    return {
      ...contract,
      ...readiness,
      readinessStatus,
    };
  }

  private startOfDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private addDays(value: Date, days: number) {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return next;
  }
}
