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
  supplements: {
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
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

const hotelContractSummaryInclude = Prisma.validator<Prisma.HotelContractInclude>()({
  hotel: {
    include: {
      roomCategories: {
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        take: 50,
      },
      _count: {
        select: {
          roomCategories: true,
        },
      },
    },
  },
  _count: {
    select: {
      rates: true,
      quoteItems: true,
      allotments: true,
      supplements: true,
      mealPlans: true,
    },
  },
});

type HotelContractRecord = Prisma.HotelContractGetPayload<{
  include: typeof hotelContractInclude;
}>;

const ENABLE_HOTEL_CONTRACT_TIMING_LOGS = process.env.NODE_ENV !== 'production';

function logHotelContractTiming(message: string, details: Record<string, unknown>) {
  if (ENABLE_HOTEL_CONTRACT_TIMING_LOGS) {
    console.log(message, details);
  }
}

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

  async findOneSummary(id: string) {
    const startedAt = Date.now();
    const [contract, completenessByContractId] = await Promise.all([
      this.prisma.hotelContract.findUnique({
        where: { id },
        include: hotelContractSummaryInclude,
      }),
      this.getContractCompletenessMap([id]),
    ]);
    const resolved = this.attachContractReadiness(throwIfNotFound(contract, 'Hotel contract') as any, completenessByContractId) as any;
    logHotelContractTiming('[hotel-contracts] summary fetch', {
      contractId: id,
      durationMs: Date.now() - startedAt,
      ratesCount: resolved._count?.rates ?? 0,
      roomCategoriesReturned: resolved.hotel?.roomCategories?.length ?? 0,
      roomCategoriesTotal: resolved.hotel?._count?.roomCategories ?? resolved.hotel?.roomCategories?.length ?? 0,
      supplementsCount: resolved._count?.supplements ?? 0,
      mealPlansCount: resolved._count?.mealPlans ?? 0,
    });
    return resolved;
  }

  /**
   * Unified audit trail for a contract. Each edited entity writes to its
   * own audit table (supplements / cancellation / child policy / meal
   * plans / occupancy); this merges them into one reverse-chronological
   * timeline so the workspace can show "who changed what, when" without
   * the operator hopping between five places.
   *
   * Pagination: we fetch up to (offset+limit) rows from each table — the
   * top N of the merged set can't draw more than that from any single
   * table — then merge, sort, and slice. Cheap: contracts carry tens to
   * low-hundreds of audit rows, not millions.
   */
  async getAuditLog(contractId: string, options: { limit?: number | null; offset?: number | null } = {}) {
    const contract = await this.prisma.hotelContract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    throwIfNotFound(contract, 'Hotel contract');

    const limit = this.normalizeAuditLimit(options.limit);
    const offset = this.normalizeAuditOffset(options.offset);
    const cap = limit + offset;
    const p = this.prisma as any;

    const sources: Array<{ entity: string; model: any }> = [
      { entity: 'supplement', model: p.hotelContractSupplementAuditLog },
      { entity: 'cancellation', model: p.hotelContractCancellationAuditLog },
      { entity: 'childPolicy', model: p.hotelContractChildPolicyAuditLog },
      { entity: 'mealPlan', model: p.hotelContractMealPlanAuditLog },
      { entity: 'occupancy', model: p.hotelContractOccupancyAuditLog },
    ];

    const batches = await Promise.all(
      sources.map(({ entity, model }) =>
        model
          .findMany({
            where: { hotelContractId: contractId },
            orderBy: { createdAt: 'desc' },
            take: cap,
          })
          .then((rows: any[]) =>
            rows.map((row) => ({
              entity,
              action: row.action as string,
              oldValue: (row.oldValue ?? null) as string | null,
              newValue: (row.newValue ?? null) as string | null,
              note: (row.note ?? null) as string | null,
              actor: (row.actor ?? null) as string | null,
              actorUserId: (row.actorUserId ?? null) as string | null,
              createdAt: row.createdAt as Date,
            })),
          ),
      ),
    );

    const merged = batches
      .flat()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      total: merged.length,
      limit,
      offset,
      entries: merged.slice(offset, offset + limit),
    };
  }

  private normalizeAuditLimit(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 100;
    }
    return Math.min(500, Math.floor(parsed));
  }

  private normalizeAuditOffset(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  }

  /**
   * Room Types lightweight summary for the contract workspace.
   *
   * Returns one row per `HotelRoomCategory` belonging to this contract's
   * hotel, plus per-room aggregates derived from `HotelRate`:
   *   - rateCount: how many rate rows reference this room category
   *   - occupancyTypes: distinct occupancy buckets (SGL / DBL / TPL / ...)
   *   - mealPlans: distinct meal-plan codes (BB / HB / FB / ...)
   *   - seasonCount: distinct season names
   *   - supplementCount: supplements scoped to this room category
   *   - currencyRange: min/max cost summary (lets the UI surface a price
   *     band without loading every rate row).
   *
   * Crucially this does NOT return any individual rate / supplement /
   * cancellation rule / PDF import blob. The full rate matrix loads only
   * when the operator expands a specific room.
   *
   * The route is ordered: city-anchored hotels often have hundreds of
   * `HotelRate` rows per contract; aggregating in SQL via `groupBy` keeps
   * the payload bounded to N (room category count) regardless of the
   * underlying rate volume.
   */
  async findRoomTypesSummary(id: string) {
    const startedAt = Date.now();
    const contract = await this.prisma.hotelContract.findUnique({
      where: { id },
      select: {
        id: true,
        hotelId: true,
        validFrom: true,
        validTo: true,
        currency: true,
        hotel: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
      },
    });

    throwIfNotFound(contract, 'Hotel contract');

    const [roomCategories, rateGroups, supplementGroups, totalRateCount] = await Promise.all([
      this.prisma.hotelRoomCategory.findMany({
        where: { hotelId: contract!.hotelId },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          isActive: true,
        },
      }),
      // Per-room aggregate over the rate matrix. PostgreSQL handles the
      // count / min / max in SQL — the API never holds individual rate
      // rows in memory just to build the summary.
      this.prisma.hotelRate.groupBy({
        by: ['roomCategoryId'],
        where: { contractId: id },
        _count: { _all: true },
        _min: { cost: true },
        _max: { cost: true },
      }),
      this.prisma.hotelContractSupplement.groupBy({
        by: ['roomCategoryId'],
        where: { hotelContractId: id },
        _count: { _all: true },
      }),
      this.prisma.hotelRate.count({ where: { contractId: id } }),
    ]);

    // Pull distinct occupancy/meal/season per room — one DB query each
    // grouped by roomCategoryId. These are small enums so the result set
    // stays tiny even on contracts with thousands of rates.
    const occupancyGroups = await this.prisma.hotelRate.groupBy({
      by: ['roomCategoryId', 'occupancyType'],
      where: { contractId: id },
      _count: { _all: true },
    });
    const mealPlanGroups = await this.prisma.hotelRate.groupBy({
      by: ['roomCategoryId', 'mealPlan'],
      where: { contractId: id },
      _count: { _all: true },
    });
    const seasonGroups = await this.prisma.hotelRate.groupBy({
      by: ['roomCategoryId', 'seasonName'],
      where: { contractId: id },
      _count: { _all: true },
    });

    const rateByRoom = new Map<string, { count: number; minCost: number | null; maxCost: number | null }>();
    for (const group of rateGroups) {
      rateByRoom.set(group.roomCategoryId, {
        count: group._count._all,
        minCost: group._min.cost ?? null,
        maxCost: group._max.cost ?? null,
      });
    }

    const occupancyByRoom = new Map<string, Set<string>>();
    for (const group of occupancyGroups) {
      const set = occupancyByRoom.get(group.roomCategoryId) || new Set<string>();
      set.add(group.occupancyType);
      occupancyByRoom.set(group.roomCategoryId, set);
    }

    const mealPlanByRoom = new Map<string, Set<string>>();
    for (const group of mealPlanGroups) {
      const set = mealPlanByRoom.get(group.roomCategoryId) || new Set<string>();
      set.add(group.mealPlan);
      mealPlanByRoom.set(group.roomCategoryId, set);
    }

    const seasonByRoom = new Map<string, Set<string>>();
    for (const group of seasonGroups) {
      const set = seasonByRoom.get(group.roomCategoryId) || new Set<string>();
      set.add(group.seasonName);
      seasonByRoom.set(group.roomCategoryId, set);
    }

    const supplementByRoom = new Map<string, number>();
    for (const group of supplementGroups) {
      if (group.roomCategoryId) {
        supplementByRoom.set(group.roomCategoryId, group._count._all);
      }
    }

    // Max occupancy per room from its (active) occupancy rules — the room's
    // highest-capacity rule across occupancy types (e.g. DBL: 2 adults + 1
    // child). Null when the contract has no occupancy rules for that room.
    const occupancyRules = await (this.prisma as any).hotelContractOccupancyRule.findMany({
      where: { hotelContractId: id, isActive: true },
      select: { roomCategoryId: true, maxAdults: true, maxChildren: true, maxOccupants: true },
    });
    const maxOccByRoom = new Map<string, { maxAdults: number; maxChildren: number; maxOccupants: number }>();
    for (const rule of occupancyRules as Array<{ roomCategoryId: string | null; maxAdults: number; maxChildren: number; maxOccupants: number }>) {
      if (!rule.roomCategoryId) continue;
      const cur = maxOccByRoom.get(rule.roomCategoryId);
      if (!cur || rule.maxOccupants > cur.maxOccupants) {
        maxOccByRoom.set(rule.roomCategoryId, { maxAdults: rule.maxAdults, maxChildren: rule.maxChildren, maxOccupants: rule.maxOccupants });
      }
    }

    const rooms = roomCategories.map((room) => {
      const rateInfo = rateByRoom.get(room.id) || { count: 0, minCost: null, maxCost: null };
      return {
        id: room.id,
        name: room.name,
        code: room.code,
        description: room.description,
        isActive: room.isActive,
        rateCount: rateInfo.count,
        minCost: rateInfo.minCost,
        maxCost: rateInfo.maxCost,
        currency: contract!.currency,
        occupancyTypes: Array.from(occupancyByRoom.get(room.id) || []).sort(),
        mealPlans: Array.from(mealPlanByRoom.get(room.id) || []).sort(),
        seasonNames: Array.from(seasonByRoom.get(room.id) || []).sort(),
        supplementCount: supplementByRoom.get(room.id) || 0,
        maxAdults: maxOccByRoom.get(room.id)?.maxAdults ?? null,
        maxChildren: maxOccByRoom.get(room.id)?.maxChildren ?? null,
        maxOccupants: maxOccByRoom.get(room.id)?.maxOccupants ?? null,
      };
    });

    logHotelContractTiming('[hotel-contracts] room-types-summary fetch', {
      contractId: id,
      durationMs: Date.now() - startedAt,
      roomCategories: rooms.length,
      totalRates: totalRateCount,
    });

    return {
      contractId: contract!.id,
      hotelId: contract!.hotelId,
      hotelName: contract!.hotel.name,
      validFrom: contract!.validFrom,
      validTo: contract!.validTo,
      currency: contract!.currency,
      totalRoomCategories: rooms.length,
      totalRates: totalRateCount,
      rooms,
    };
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
