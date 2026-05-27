import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { blockDelete, normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { resolveOperationalSupplier } from '../common/supplier-resolver';
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

type UpsertHotelFactSheetInput = {
  shortDescription?: string | null;
  highlightsJson?: unknown;
  amenitiesJson?: unknown;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  imageGalleryJson?: unknown;
};

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
    const hotels = await (this.prisma.hotel as any).findMany({
      include: {
        cityRecord: true,
        factSheet: true,
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

    return Promise.all(hotels.map((hotel: any) => this.serializeHotel(hotel)));
  }

  /**
   * Hotels Directory freeze fix — lightweight per-hotel summary used
   * by the /hotels page header + summary strip + directory tab. Mirrors
   * the room-categories-summary pattern from PR #120 but for the parent
   * page itself.
   *
   * Goals:
   *   - Avoid the N+1 supplier resolver loop in findAll()
   *   - Avoid loading the factSheet JSON blob (highlights / amenities /
   *     image gallery) for every hotel
   *   - Avoid loading the full roomCategories list per hotel — just
   *     the count
   *   - Stay under ~50KB even on tenants with hundreds of hotels
   *
   * Returns the minimum the directory page actually needs:
   *   - id / name / city / category / isActive
   *   - confidence summary (max contract confidence per hotel)
   *   - _count of contracts + room categories
   *   - lightweight supplier name (read from hotel.supplierName as
   *     stored, no resolver fan-out)
   */
  async findDirectorySummary() {
    const rows = await (this.prisma.hotel as any).findMany({
      orderBy: [{ name: 'asc' }],
      // The Hotel Prisma model has NO `isActive` column — soft-deletion
      // happens via the relational graph (e.g. removing all active
      // contracts) rather than a flag on the hotel row. Earlier draft
      // of this select clause included `isActive: true` and broke
      // production with Prisma's "Unknown field" validation error.
      // Operators saw "Page Unresponsive" because the controller kept
      // rethrowing the validation exception on every request retry.
      select: {
        id: true,
        name: true,
        city: true,
        category: true,
        supplierId: true,
        supplierName: true,
        cityRecord: { select: { id: true, name: true } },
        hotelCategory: { select: { id: true, name: true } },
        _count: {
          select: {
            contracts: true,
            roomCategories: true,
          },
        },
        // Confidence rollup — pull just the highest-trust contract per
        // hotel so the directory card can show "Operationally trusted"
        // without loading every contract. Take 1 ordered by best
        // confidence (VERIFIED first).
        contracts: {
          select: { confidence: true },
          orderBy: { confidence: 'asc' },
        },
      },
    });

    return (rows as any[]).map((hotel) => {
      const confidences: string[] = (hotel.contracts || []).map((c: any) => c.confidence).filter(Boolean);
      const hasVerifiedContract = confidences.includes('VERIFIED');
      const hasUnverifiedContract = confidences.some(
        (c) => c === 'IMPORTED_UNVERIFIED' || c === 'NEEDS_REVIEW' || c === 'PRICING_INCOMPLETE' ||
          c === 'SUPPLEMENT_REVIEW_REQUIRED' || c === 'SEASON_CONFLICT',
      );
      // Confidence summary label drives the directory chip without
      // surfacing the full enum list.
      const confidenceSummary = hasVerifiedContract
        ? 'verified'
        : confidences.length === 0
          ? 'no-contracts'
          : hasUnverifiedContract
            ? 'needs-review'
            : 'mixed';
      return {
        id: hotel.id,
        name: hotel.name,
        city: hotel.cityRecord?.name || hotel.city || '',
        category: hotel.hotelCategory?.name || hotel.category || '',
        // Hotel rows are always considered active — see schema note in
        // the select clause above. The field is preserved here as `true`
        // so the response shape doesn't break existing consumers (admin
        // page typed `HotelDirectorySummary.isActive: boolean`).
        isActive: true,
        supplierName: hotel.supplierName || null,
        contractCount: hotel._count?.contracts || 0,
        roomCategoryCount: hotel._count?.roomCategories || 0,
        confidenceSummary,
        hasVerifiedContract,
      };
    });
  }

  /**
   * Hotel Master Room Categories freeze fix — lightweight per-room
   * summary used by /hotels?tab=room-categories. Designed to AVOID:
   *
   *   - the N+1 supplier resolution that runs in findAll().serializeHotel
   *   - eager loading of factSheet / hotelCategory / contracts / rates
   *   - the duplicate /api/hotels fetch the old admin page made on the
   *     room-categories tab
   *
   * Returns one row per HotelRoomCategory with the hotel name/city,
   * active flag, basic timestamps, and (via _count) the number of
   * linked hotelRates + quoteItems. The per-category rate matrix and
   * full contract data load only when the operator expands a row.
   *
   * Optional `hotelId` lets the same service back the spec-mandated
   * /hotels/:id/room-categories-summary route without duplicating the
   * aggregation logic.
   */
  async findRoomCategoriesSummary(filters: { hotelId?: string } = {}) {
    const categories = await (this.prisma.hotelRoomCategory as any).findMany({
      where: filters.hotelId ? { hotelId: filters.hotelId } : undefined,
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' },
      ],
      // Narrow select — no description blob, no nested rates / contracts.
      select: {
        id: true,
        hotelId: true,
        name: true,
        code: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        hotel: {
          select: {
            id: true,
            name: true,
            city: true,
            cityRecord: { select: { name: true } },
            _count: { select: { contracts: true } },
          },
        },
        _count: {
          select: {
            hotelRates: true,
            quoteItems: true,
          },
        },
      },
    });

    // Phase 0 hardening — filter out invalid rows BEFORE returning to
    // the UI. A bad contract import can leave categories with null
    // hotel relation or null/empty name; those rows used to crash the
    // client-side sort during hydration and blank the page. Log every
    // skipped row so operators can identify them in Vercel logs and
    // clean them via POST /hotels/admin/cleanup-invalid-room-categories.
    const isCategoryValid = (category: any): boolean => {
      if (!category?.id) return false;
      if (!category?.name || typeof category.name !== 'string' || !category.name.trim()) return false;
      if (!category?.hotel?.id) return false;
      if (!category?.hotel?.name || !category.hotel.name.trim()) return false;
      return true;
    };
    const invalidRows = (categories as any[]).filter((c) => !isCategoryValid(c));
    if (invalidRows.length > 0) {
      console.warn(
        `[hotels.findRoomCategoriesSummary] dropping ${invalidRows.length} invalid row(s) — likely bad contract imports`,
        invalidRows.map((row) => ({
          id: row.id,
          hotelId: row.hotelId,
          name: row.name,
          hotelName: row.hotel?.name,
        })),
      );
    }
    const validCategories = (categories as any[]).filter(isCategoryValid);

    return validCategories.map((category) => ({
      id: category.id,
      hotelId: category.hotelId,
      name: category.name,
      code: category.code,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      hotelName: category.hotel?.name || 'Unknown',
      hotelCity: category.hotel?.cityRecord?.name || category.hotel?.city || '',
      hotelContractCount: category.hotel?._count?.contracts || 0,
      // Linked rate count — drives the safe-mode banner heuristic and
      // is shown next to the category name so operators can spot a
      // category referenced by many rates before they touch it.
      linkedRateCount: category._count?.hotelRates || 0,
      linkedQuoteItemCount: category._count?.quoteItems || 0,
    }));
  }

  /**
   * Per-category detail — fired when the operator expands a row. Pulls
   * only the data needed for the expanded view: small contract list +
   * a capped sample of rate rows. Pricing engine never reads this.
   */
  async findRoomCategoryDetail(categoryId: string) {
    const category = await (this.prisma.hotelRoomCategory as any).findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        isActive: true,
        hotelId: true,
        hotel: {
          select: { id: true, name: true, city: true },
        },
        _count: {
          select: {
            hotelRates: true,
            quoteItems: true,
            supplements: true,
            allotments: true,
          },
        },
      },
    });
    throwIfNotFound(category, 'Hotel room category');

    // Pull only distinct contract names referencing this category via
    // rates. SQL groupBy keeps the result bounded to N contracts even
    // on rate matrices with thousands of rows.
    const rateGroups = await (this.prisma.hotelRate as any).groupBy({
      by: ['contractId'],
      where: { roomCategoryId: categoryId },
      _count: { _all: true },
    });
    const contractIds = (rateGroups as any[]).map((g) => g.contractId);
    const contracts = contractIds.length
      ? await (this.prisma.hotelContract as any).findMany({
          where: { id: { in: contractIds } },
          select: {
            id: true,
            name: true,
            validFrom: true,
            validTo: true,
            currency: true,
            confidence: true,
          },
        })
      : [];
    const rateCountByContract = new Map<string, number>(
      (rateGroups as any[]).map((g) => [g.contractId, g._count._all]),
    );

    return {
      id: category!.id,
      hotelId: category!.hotelId,
      name: category!.name,
      code: category!.code,
      description: category!.description,
      isActive: category!.isActive,
      hotel: category!.hotel,
      counts: {
        rates: category!._count?.hotelRates || 0,
        quoteItems: category!._count?.quoteItems || 0,
        supplements: category!._count?.supplements || 0,
        allotments: category!._count?.allotments || 0,
      },
      contracts: (contracts as any[]).map((contract) => ({
        id: contract.id,
        name: contract.name,
        validFrom: contract.validFrom,
        validTo: contract.validTo,
        currency: contract.currency,
        confidence: contract.confidence,
        rateCount: rateCountByContract.get(contract.id) || 0,
      })),
    };
  }

  async findOne(id: string) {
    const hotel = await (this.prisma.hotel as any).findUnique({
      where: { id },
      include: {
        cityRecord: true,
        factSheet: true,
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

    return this.serializeHotel(throwIfNotFound(hotel, 'Hotel') as any);
  }

  async create(data: CreateHotelInput) {
    const cityDetails = await this.resolveCity(data);
    const categoryDetails = await this.resolveHotelCategory({
      category: data.category,
      hotelCategoryId: data.hotelCategoryId,
    });
    await this.warnUnresolvedSupplierId(data.supplierId, 'create');

    const hotel = await (this.prisma.hotel as any).create({
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
        factSheet: true,
        hotelCategory: true,
      },
    });

    return this.serializeHotel(hotel as any);
  }

  async update(id: string, data: UpdateHotelInput) {
    const existing = (await this.findOne(id)) as any;
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
    if (data.supplierId !== undefined) {
      await this.warnUnresolvedSupplierId(data.supplierId, 'update');
    }

    const hotel = await (this.prisma.hotel as any).update({
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
        factSheet: true,
        hotelCategory: true,
      },
    });

    return this.serializeHotel(hotel as any);
  }

  async upsertFactSheet(hotelId: string, data: UpsertHotelFactSheetInput) {
    await this.findOne(hotelId);

    return (this.prisma as any).hotelFactSheet.upsert({
      where: { hotelId },
      create: {
        hotelId,
        ...this.buildFactSheetData(data),
      },
      update: this.buildFactSheetData(data),
    });
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
    const quoteHotelOptionCount = await (this.prisma as any).quoteHotelOption.count({
      where: {
        roomCategoryId: categoryId,
      },
    });
    if (quoteHotelOptionCount > 0) {
      throw new BadRequestException('This room category is used in quote hotel options and cannot be deleted.');
    }

    return this.prisma.hotelRoomCategory.delete({
      where: { id: categoryId },
    });
  }

  /**
   * Hotel Engine Phase 0 — read-only health audit. Counts the records
   * that look like bad imports OR orphans (parent missing) so an
   * operator can see the damage before triggering a wipe. Safe to
   * call from any UI / cron / smoke test — does not write to the DB.
   */
  async getEngineHealth() {
    // Wrap each Prisma count in its own try/catch so a single broken
    // query doesn't take down the whole audit. Filters like
    // `{ name: null }` can throw at runtime if Prisma considers the
    // column non-nullable in the generated client, even when the DB
    // column actually permits it.
    const safeCount = async (label: string, queryFn: () => Promise<number>): Promise<number> => {
      try {
        return await queryFn();
      } catch (caughtError) {
        console.warn(`[hotels.getEngineHealth] count "${label}" threw`, caughtError);
        return 0;
      }
    };

    const [
      hotels,
      contracts,
      rates,
      allotments,
      roomCategories,
      roomCategoriesEmptyName,
      roomCategoriesNoHotel,
    ] = await Promise.all([
      safeCount('hotels', () => this.prisma.hotel.count()),
      safeCount('contracts', () => (this.prisma as any).hotelContract.count()),
      safeCount('rates', () => (this.prisma as any).hotelRate.count()),
      safeCount('allotments', () => (this.prisma as any).hotelAllotment.count()),
      safeCount('roomCategories', () => (this.prisma as any).hotelRoomCategory.count()),
      // Categories with empty-string name. Prisma rejects `name: null`
      // for non-nullable columns at runtime, so we limit to empty
      // string here and check truly-orphan rows via the raw SQL
      // probe below. Empty string is the realistic bad-import shape.
      safeCount('roomCategoriesEmptyName', () =>
        (this.prisma as any).hotelRoomCategory.count({ where: { name: '' } }),
      ),
      // Orphaned categories — uses raw SQL because Prisma's typed
      // `where: { hotel: null }` syntax is unreliable for relation
      // filters. Casts to bigint defensively (Prisma returns BigInt
      // from $queryRaw for COUNT in some adapter versions).
      safeCount('roomCategoriesNoHotel', async () => {
        const rows = await (this.prisma as any).$queryRawUnsafe(
          `SELECT COUNT(*)::bigint AS c FROM hotel_room_categories rc LEFT JOIN hotels h ON h.id = rc."hotelId" WHERE h.id IS NULL`,
        );
        const raw = Array.isArray(rows) && rows.length > 0 ? rows[0].c : 0;
        return typeof raw === 'bigint' ? Number(raw) : Number(raw || 0);
      }),
    ]);

    return {
      counts: {
        hotels,
        contracts,
        rates,
        allotments,
        roomCategories,
      },
      problems: {
        roomCategoriesWithEmptyName: roomCategoriesEmptyName,
        roomCategoriesWithoutHotel: roomCategoriesNoHotel,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Hotel Engine Phase 0 — destructive cleanup. Wipes every hotel
   * contract (cascading to rates, allotments, supplements, policies,
   * promotions, audit logs via the schema's onDelete: Cascade rules).
   * Hotels themselves and HotelRoomCategory rows survive.
   *
   * Used to drop test contract data before rebuilding the commercial
   * layer. Requires `confirm: "wipe-all-contracts"` in the body to
   * prevent accidental triggers.
   */
  async wipeAllContracts(confirmToken: string) {
    if (confirmToken !== 'wipe-all-contracts') {
      throw new BadRequestException(
        'Confirmation token required. POST body must include { "confirm": "wipe-all-contracts" }',
      );
    }
    const before = await (this.prisma as any).hotelContract.count();
    const result = await (this.prisma as any).hotelContract.deleteMany({});
    console.warn(`[hotels.wipeAllContracts] deleted ${result.count} hotel contracts (cascaded to rates/allotments/supplements)`, {
      contractCountBefore: before,
      deleted: result.count,
    });
    return {
      deletedContracts: result.count,
      contractCountBefore: before,
      cascadedTo: ['hotel_rates', 'hotel_allotments', 'hotel_contract_supplements', 'hotel_contract_meal_plans', 'hotel_contract_occupancy_rules', 'hotel_contract_child_policies', 'hotel_contract_cancellation_policies', 'promotions'],
    };
  }

  /**
   * Hotel Engine Phase 0 — destructive cleanup of malformed room
   * categories left by bad contract imports (null/empty name, or
   * pointing at a hotel that no longer exists). Hotels are preserved.
   */
  async wipeInvalidRoomCategories(confirmToken: string) {
    if (confirmToken !== 'wipe-invalid-room-categories') {
      throw new BadRequestException(
        'Confirmation token required. POST body must include { "confirm": "wipe-invalid-room-categories" }',
      );
    }
    const result = await (this.prisma as any).hotelRoomCategory.deleteMany({
      where: { OR: [{ name: '' }, { name: null as any }] },
    });
    console.warn(`[hotels.wipeInvalidRoomCategories] deleted ${result.count} room categories with empty/null name`);
    return {
      deletedRoomCategories: result.count,
    };
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

  private buildFactSheetData(data: UpsertHotelFactSheetInput) {
    return {
      shortDescription: data.shortDescription === undefined ? undefined : normalizeOptionalString(data.shortDescription),
      highlightsJson: data.highlightsJson === undefined ? undefined : this.normalizeOptionalJson(data.highlightsJson),
      amenitiesJson: data.amenitiesJson === undefined ? undefined : this.normalizeOptionalJson(data.amenitiesJson),
      checkInTime: data.checkInTime === undefined ? undefined : normalizeOptionalString(data.checkInTime),
      checkOutTime: data.checkOutTime === undefined ? undefined : normalizeOptionalString(data.checkOutTime),
      imageGalleryJson: data.imageGalleryJson === undefined ? undefined : this.normalizeOptionalJson(data.imageGalleryJson),
    };
  }

  private normalizeOptionalJson(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    return value;
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

  private async serializeHotel<
    T extends {
      category: string;
      city: string;
      supplierId: string;
      supplierName?: string | null;
      resolvedSupplierId?: string | null;
      cityRecord: { id: string; name: string; country: string | null; isActive: boolean } | null;
      hotelCategory: { id: string; name: string; isActive: boolean } | null;
    },
  >(
    hotel: T,
  ) {
    const supplier = await resolveOperationalSupplier({
      supplierId: hotel.resolvedSupplierId ?? hotel.supplierId,
      supplierName: hotel.supplierName ?? hotel.supplierId,
      prisma: this.prisma,
    });

    return {
      ...hotel,
      city: hotel.cityRecord?.name || hotel.city,
      category: hotel.hotelCategory?.name || hotel.category,
      supplierName: supplier.supplierName,
      supplierStatus: supplier.supplierStatus,
    };
  }

  private async warnUnresolvedSupplierId(supplierId: string | null | undefined, action: 'create' | 'update') {
    const supplier = await resolveOperationalSupplier({
      supplierId,
      prisma: this.prisma,
    });

    if (supplier.supplierStatus === 'unresolved') {
      console.warn('[hotels] unresolved supplierId on catalog write', {
        action,
        supplierId,
      });
    }
  }
}
