import { BadRequestException, Injectable } from '@nestjs/common';
import { HotelMealPlan, HotelOccupancyType, HotelRatePricingBasis } from '@prisma/client';
import { ensureValidNumber, normalizeOptionalSupportedCurrency, requireSupportedCurrency, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { HotelPricingResolver } from '../hotel-pricing/hotel-pricing.resolver';

type TourismFeeMode = 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM';
type HotelRatePricingMode = 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT';

type CreateHotelRateInput = {
  contractId: string;
  seasonId?: string;
  seasonName: string;
  seasonFrom?: Date | null;
  seasonTo?: Date | null;
  roomCategoryId: string;
  occupancyType: HotelOccupancyType;
  mealPlan: HotelMealPlan;
  pricingMode?: HotelRatePricingMode | null;
  pricingBasis?: HotelRatePricingBasis | string | null;
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

type FindHotelRatesOptions = {
  contractId?: string | null;
  // Room Types freeze fix — narrow the rate query to a single room
  // category. The Room Types expandable panel uses this so opening a
  // single room never fans out to the whole contract's rate matrix.
  roomCategoryId?: string | null;
  limit?: number | null;
  offset?: number | null;
};

type LookupHotelRateInput = {
  hotelId: string;
  contractId?: string | null;
  date: Date | string;
  occupancy: HotelOccupancyType;
  mealPlan: HotelMealPlan;
  roomCategoryId?: string | null;
  pax?: number | null;
};

type CalculateHotelCostInput = {
  hotelId: string;
  contractId?: string | null;
  checkInDate: Date | string;
  checkOutDate: Date | string;
  occupancy: HotelOccupancyType;
  mealPlan: HotelMealPlan;
  pax: number;
  roomCount?: number | null;
  adults?: number | null;
  childrenAges?: number[] | null;
  roomCategoryId?: string | null;
  selectedSupplementIds?: string[] | null;
};

type RatePolicy = {
  policyType?: string | null;
  appliesTo?: string | null;
  ageFrom?: number | string | null;
  ageTo?: number | string | null;
  amount?: number | string | null;
  percent?: number | string | null;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | string | null;
  mealPlan?: string | null;
  notes?: string | null;
};

type ContractSupplementPolicy = {
  id?: string | null;
  type?: string | null;
  amount?: number | string | null;
  chargeBasis?: string | null;
  isMandatory?: boolean | null;
  isActive?: boolean | null;
  roomCategoryId?: string | null;
  notes?: string | null;
};

const ENABLE_HOTEL_RATE_TIMING_LOGS = process.env.NODE_ENV !== 'production';

function logHotelRateTiming(message: string, details: Record<string, unknown>) {
  if (ENABLE_HOTEL_RATE_TIMING_LOGS) {
    console.log(message, details);
  }
}

@Injectable()
export class HotelRatesService {
  private readonly hotelPricingResolver = new HotelPricingResolver();

  constructor(private readonly prisma: PrismaService) {}

  async findAll(options: FindHotelRatesOptions = {}) {
    const startedAt = Date.now();
    const limit = this.normalizePageLimit(options.limit);
    const offset = this.normalizePageOffset(options.offset);
    logHotelRateTiming('[hotel-rates] findAll:start', {
      contractId: options.contractId || null,
      limit,
      offset,
    });
    const queryStartedAt = Date.now();
    const where: { contractId?: string; roomCategoryId?: string } = {};
    if (options.contractId) where.contractId = options.contractId;
    if (options.roomCategoryId) where.roomCategoryId = options.roomCategoryId;
    const rows = await this.prisma.hotelRate.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
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
      take: limit,
      skip: offset,
    });
    logHotelRateTiming('[hotel-rates] findAll:done', {
      contractId: options.contractId || null,
      rowsReturned: rows.length,
      queryMs: Date.now() - queryStartedAt,
      durationMs: Date.now() - startedAt,
    });
    return rows;
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
        hotelId: contract.hotelId,
        seasonId: data.seasonId || null,
        seasonName: data.seasonName.trim(),
        seasonFrom: data.seasonFrom ?? contract.validFrom,
        seasonTo: data.seasonTo ?? contract.validTo,
        roomCategoryId: data.roomCategoryId,
        occupancyType: this.normalizeOccupancyType(data.occupancyType),
        mealPlan: this.normalizeMealPlan(data.mealPlan),
        pricingMode: this.normalizePricingMode(data.pricingMode),
        pricingBasis: this.normalizePricingBasis(data.pricingBasis),
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
        hotelId: contract.hotelId,
        seasonId: data.seasonId === undefined ? undefined : data.seasonId || null,
        seasonName: data.seasonName === undefined ? undefined : data.seasonName.trim(),
        seasonFrom: data.seasonFrom === undefined ? undefined : data.seasonFrom ?? contract.validFrom,
        seasonTo: data.seasonTo === undefined ? undefined : data.seasonTo ?? contract.validTo,
        roomCategoryId,
        occupancyType: data.occupancyType === undefined ? undefined : this.normalizeOccupancyType(data.occupancyType),
        mealPlan: data.mealPlan === undefined ? undefined : this.normalizeMealPlan(data.mealPlan),
        pricingMode: data.pricingMode === undefined ? undefined : this.normalizePricingMode(data.pricingMode),
        pricingBasis: data.pricingBasis === undefined ? undefined : this.normalizePricingBasis(data.pricingBasis),
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

  async lookup(data: LookupHotelRateInput) {
    const pax = Math.max(1, Number(data.pax ?? 1));
    const date = this.normalizeLookupDate(data.date);
    const occupancy = this.normalizeOccupancyType(data.occupancy);
    const mealPlan = this.normalizeMealPlan(data.mealPlan);
    console.log('Hotel rate lookup requested', {
      hotelId: data.hotelId,
      lookupDate: date,
    });
    const rates = await this.prisma.hotelRate.findMany({
      where: {
        hotelId: data.hotelId,
        ...(data.contractId ? { contractId: data.contractId } : {}),
      },
      include: {
        contract: { include: { hotel: true, supplements: true } },
        roomCategory: true,
      },
      orderBy: [{ cost: 'asc' }, { createdAt: 'desc' }],
    });
    console.log('Hotel rate lookup hotel row count', {
      hotelId: data.hotelId,
      count: rates.length,
    });
    console.log(
      'Hotel rate lookup DB sample',
      rates.slice(0, 5).map((rate) => ({
        hotelId: rate.hotelId,
        seasonFrom: rate.seasonFrom,
        seasonTo: rate.seasonTo,
        occupancyType: rate.occupancyType,
        mealPlan: rate.mealPlan,
        cost: rate.cost,
        pricingBasis: rate.pricingBasis,
      })),
    );
    const dateDebug = rates.map((rate) => {
      const from = this.normalizeDateForLookupComparison(rate.seasonFrom);
      const to = this.normalizeDateForLookupComparison(rate.seasonTo);
      return {
        hotelId: rate.hotelId,
        seasonFrom: rate.seasonFrom,
        seasonTo: rate.seasonTo,
        normalizedSeasonFrom: from,
        normalizedSeasonTo: to,
        lookupDate: date,
        insideRange: date >= from && date <= to,
      };
    });
    const dateMatchedRates = rates.filter((rate) => this.lookupDateInSeason(date, rate.seasonFrom, rate.seasonTo));

    if (dateMatchedRates.length === 0) {
      console.log('Hotel rate lookup date mismatch', dateDebug);
      throw new BadRequestException('No rates found for this hotel and date');
    }

    const matchedRates = dateMatchedRates
      .filter((rate) => !data.roomCategoryId || rate.roomCategoryId === data.roomCategoryId)
      .filter((rate) => rate.roomCategory.isActive)
      .map((rate) => ({
        rate,
        occupancyScore: this.matchDimensionScore(rate.occupancyType, occupancy, (value) => this.normalizeOccupancyType(value)),
        mealPlanScore: this.matchMealPlanScore(rate.mealPlan, mealPlan, rate.contract?.supplements, rate.roomCategoryId, rate.seasonName),
      }))
      .filter((match) => match.occupancyScore !== null && match.mealPlanScore !== null);

    if (matchedRates.length === 0) {
      console.log('Hotel rate lookup mismatch', {
        requested: {
          occupancy,
          mealPlan,
          roomCategoryId: data.roomCategoryId || null,
        },
        availableOccupancyTypes: Array.from(new Set(dateMatchedRates.map((rate) => rate.occupancyType))),
        availableMealPlans: Array.from(new Set(dateMatchedRates.map((rate) => rate.mealPlan))),
      });
      throw new BadRequestException('Rates exist but occupancy/mealPlan mismatch');
    }

    const pricedRates = matchedRates
      .map((match) => ({
        ...match.rate,
        occupancyScore: match.occupancyScore ?? 0,
        mealPlanScore: match.mealPlanScore ?? 0,
        seasonSpecificityMs: this.seasonSpecificityMs(match.rate.seasonFrom, match.rate.seasonTo),
        createdAtMs: this.dateTimeMs(match.rate.createdAt),
        finalPrice: this.calculateFinalPrice(match.rate.cost, match.rate.pricingBasis, pax),
      }))
      .sort(
        (left, right) =>
          right.occupancyScore - left.occupancyScore ||
          right.mealPlanScore - left.mealPlanScore ||
          left.seasonSpecificityMs - right.seasonSpecificityMs ||
          right.createdAtMs - left.createdAtMs ||
          left.cost - right.cost,
      );

    if (this.hasAmbiguousTopRate(pricedRates)) {
      throw new BadRequestException('Ambiguous hotel rates match the selected date, occupancy, meal plan, and room category');
    }

    const selected = pricedRates[0];
    if (!selected) {
      throw new BadRequestException('Matching hotel rate not found for the selected date, occupancy, and meal plan');
    }

    return selected;
  }

  async calculateHotelCost(data: CalculateHotelCostInput) {
    const checkInDate = this.normalizeLookupDate(data.checkInDate);
    const checkOutDate = this.normalizeLookupDate(data.checkOutDate);
    const childrenAges = this.normalizeChildrenAges(data.childrenAges);
    const adults = this.normalizeAdults(data.adults, data.pax, childrenAges.length);
    const pax = Math.max(1, adults + childrenAges.length);
    const roomCount = this.normalizeRoomCount(data.roomCount);
    const occupancy = this.normalizeOccupancyType(data.occupancy);
    const mealPlan = this.normalizeMealPlan(data.mealPlan);

    if (checkOutDate <= checkInDate) {
      throw new BadRequestException('checkOutDate must be after checkInDate');
    }

    const breakdown: Array<{
      date: string;
      adultsCost: number;
      childrenCost: number;
      supplementsCost: number;
      cost: number;
      lines?: Array<{ kind: string; label: string; basis: string; unitAmount: number; quantity: number; total: number }>;
      warnings?: string[];
    }> = [];

    // Accumulate service charge + sales tax across nights. Each night's
    // rate carries its own % + included flags; a "not included" % is added
    // on top of that night's cost (room + supplements), service first then
    // sales (matching the quote engine's order).
    let serviceChargeTotal = 0;
    let salesTaxTotal = 0;
    let nightIndex = 0;
    for (let current = new Date(checkInDate); current < checkOutDate; current = this.addDays(current, 1)) {
      const rate = await this.lookup({
        hotelId: data.hotelId,
        contractId: data.contractId || null,
        date: current,
        occupancy,
        mealPlan,
        roomCategoryId: data.roomCategoryId || null,
        pax,
      });
      // Gate dated supplements to the night they cover. A supplement with
      // an appliesFrom/appliesTo window (e.g. a 31 Dec gala dinner) is
      // only offered on nights inside that window; undated supplements
      // pass through unchanged. Build a per-night view of the contract
      // supplements and feed it to both pricing paths.
      const nightSupplements = this.supplementsApplicableOn(rate.contract?.supplements, current);
      const rateForNight = rate.contract
        ? { ...rate, contract: { ...rate.contract, supplements: nightSupplements } }
        : rate;
      const canUseMasterResolver = childrenAges.length === 0 && !Array.isArray(rate.contract?.ratePolicies);
      if (canUseMasterResolver) {
        const pricedNight = this.hotelPricingResolver.resolve({
          pax,
          rooms: roomCount,
          nights: 1,
          adults,
          children: 0,
          selectedMealPlan: mealPlan,
          baseMealPlan: this.normalizeMealPlan(rate.mealPlan),
          selectedRoomCategoryId: rate.roomCategoryId,
          rates: [
            {
              id: rate.id,
              label: `${rate.roomCategory?.name || 'Room'} ${rate.occupancyType} ${rate.mealPlan}`,
              amount: rate.cost,
              basis: rate.pricingBasis,
              mealPlan: rate.mealPlan,
              roomCategoryId: rate.roomCategoryId,
              occupancyType: rate.occupancyType,
              isSelected: true,
            },
          ],
          supplements: this.toHotelPricingSupplements(
            nightSupplements,
            data.selectedSupplementIds,
            mealPlan,
            this.normalizeMealPlan(rate.mealPlan),
            rate.roomCategoryId,
            rate.seasonName,
          ),
        });
        breakdown.push({
          date: this.formatDateOnly(current),
          adultsCost: pricedNight.baseCost,
          childrenCost: 0,
          supplementsCost: pricedNight.supplementCost,
          cost: pricedNight.totalCost,
          lines: pricedNight.breakdown,
          warnings: pricedNight.warnings,
        });
      } else {
        const pricedNight = this.calculateNightlyGuestCost(
          rate.cost,
          rate.pricingBasis,
          adults,
          childrenAges,
          roomCount,
          this.getRatePolicies(rateForNight, data.selectedSupplementIds, mealPlan, this.normalizeMealPlan(rate.mealPlan), rate.roomCategoryId, rate.seasonName),
          occupancy,
          mealPlan,
          nightIndex === 0,
        );
        breakdown.push({
          date: this.formatDateOnly(current),
          adultsCost: pricedNight.adultsCost,
          childrenCost: pricedNight.childrenCost,
          supplementsCost: pricedNight.supplementsCost,
          cost: pricedNight.totalCost,
          lines: [
            { kind: 'base', label: 'Room/person base', basis: String(rate.pricingBasis || ''), unitAmount: rate.cost, quantity: 1, total: pricedNight.adultsCost + pricedNight.childrenCost },
            { kind: 'supplement', label: 'Supplements', basis: 'POLICY', unitAmount: pricedNight.supplementsCost, quantity: 1, total: pricedNight.supplementsCost },
          ].filter((line) => line.total > 0),
          warnings: [],
        });
      }

      // Tax this night's cost (room + supplements) using the night's rate.
      const nightCost = breakdown[breakdown.length - 1].cost;
      const svcPct = Number((rate as any).serviceChargePercent ?? 0);
      const svcAmt = (rate as any).serviceChargeIncluded || svcPct <= 0 ? 0 : nightCost * (svcPct / 100);
      const salesPct = Number((rate as any).salesTaxPercent ?? 0);
      const salesAmt = (rate as any).salesTaxIncluded || salesPct <= 0 ? 0 : (nightCost + svcAmt) * (salesPct / 100);
      serviceChargeTotal += svcAmt;
      salesTaxTotal += salesAmt;

      nightIndex += 1;
    }

    const adultsCost = Number(breakdown.reduce((sum, item) => sum + item.adultsCost, 0).toFixed(2));
    const childrenCost = Number(breakdown.reduce((sum, item) => sum + item.childrenCost, 0).toFixed(2));
    const supplementsCost = Number(breakdown.reduce((sum, item) => sum + item.supplementsCost, 0).toFixed(2));

    const netSubtotal = Number((adultsCost + childrenCost + supplementsCost).toFixed(2));
    const serviceCharge = Number(serviceChargeTotal.toFixed(2));
    const salesTax = Number(salesTaxTotal.toFixed(2));
    return {
      adultsCost,
      childrenCost,
      supplementsCost,
      totalCost: netSubtotal,
      // Tax breakdown (added on top of net rates) + the gross guest total.
      serviceCharge,
      salesTax,
      grossTotal: Number((netSubtotal + serviceCharge + salesTax).toFixed(2)),
      nights: breakdown.length,
      breakdown,
    };
  }

  calculateFinalPrice(cost: number, pricingBasis: HotelRatePricingBasis | null | undefined, passengers: number) {
    if (pricingBasis === HotelRatePricingBasis.PER_PERSON) {
      return Number((cost * Math.max(1, passengers)).toFixed(2));
    }

    return Number(cost.toFixed(2));
  }

  private calculateNightlyGuestCost(
    adultRate: number,
    pricingBasis: HotelRatePricingBasis | null | undefined,
    adults: number,
    childrenAges: number[],
    roomCount: number,
    policies: RatePolicy[],
    occupancy: HotelOccupancyType,
    mealPlan: HotelMealPlan,
    applyOneTimeSupplements: boolean,
  ) {
    const supplementsCost = this.calculateSupplementsCost(adultRate, adults, childrenAges, roomCount, policies, occupancy, mealPlan, applyOneTimeSupplements);

    if (pricingBasis !== HotelRatePricingBasis.PER_PERSON) {
      const roomCost = Number((adultRate * roomCount).toFixed(2));
      return {
        adultsCost: roomCost,
        childrenCost: 0,
        supplementsCost,
        totalCost: Number((roomCost + supplementsCost).toFixed(2)),
      };
    }

    const adultsCost = Number((adultRate * Math.max(0, adults)).toFixed(2));
    const childrenCost = Number(
      childrenAges.reduce((sum, age) => sum + this.calculateChildCost(age, adultRate, policies), 0).toFixed(2),
    );

    return {
      adultsCost,
      childrenCost,
      supplementsCost,
      totalCost: Number((adultsCost + childrenCost + supplementsCost).toFixed(2)),
    };
  }

  private calculateSupplementsCost(
    adultRate: number,
    adults: number,
    childrenAges: number[],
    roomCount: number,
    policies: RatePolicy[],
    occupancy: HotelOccupancyType,
    mealPlan: HotelMealPlan,
    applyOneTimeSupplements: boolean,
  ) {
    const standardBedCapacity = Math.max(1, roomCount) * 2;
    const totalExtraBedCount = Math.max(0, adults + childrenAges.length - standardBedCapacity);
    const childExtraBedCount = Math.min(childrenAges.length, totalExtraBedCount);
    const adultExtraBedCount = Math.max(0, totalExtraBedCount - childExtraBedCount);
    const thirdPersonCount = Math.max(0, adults + childrenAges.length - standardBedCapacity);
    const charges = [
      this.sumPolicyCharges('CHILD_EXTRA_BED', policies, adultRate, childExtraBedCount, mealPlan, applyOneTimeSupplements, roomCount, childrenAges),
      this.sumPolicyCharges('ADULT_EXTRA_BED', policies, adultRate, adultExtraBedCount, mealPlan, applyOneTimeSupplements, roomCount),
      this.sumPolicyCharges('CHILD_EXTRA_MEAL', policies, adultRate, childrenAges.length, mealPlan, applyOneTimeSupplements, roomCount, childrenAges),
      this.sumPolicyCharges('ADULT_EXTRA_MEAL', policies, adultRate, adults, mealPlan, applyOneTimeSupplements, roomCount),
      occupancy === HotelOccupancyType.SGL ? this.sumPolicyCharges('SINGLE_SUPPLEMENT', policies, adultRate, 1, mealPlan, applyOneTimeSupplements, roomCount) : 0,
      thirdPersonCount > 0 || occupancy === HotelOccupancyType.TPL
        ? this.sumPolicyCharges('THIRD_PERSON_SUPPLEMENT', policies, adultRate, Math.max(1, thirdPersonCount), mealPlan, applyOneTimeSupplements, roomCount)
        : 0,
    ];

    return Number(charges.reduce((sum, value) => sum + value, 0).toFixed(2));
  }

  private sumPolicyCharges(
    policyType: string,
    policies: RatePolicy[],
    adultRate: number,
    quantity: number,
    mealPlan: HotelMealPlan,
    applyOneTimeSupplements: boolean,
    roomCount: number,
    ages?: number[],
  ) {
    if (quantity <= 0) {
      return 0;
    }

    return policies
      .filter((policy) => String(policy.policyType || '').trim().toUpperCase() === policyType)
      .filter((policy) => this.policyMatchesMealPlan(policy, mealPlan))
      .reduce((sum, policy) => {
        const matchedQuantity = ages ? Math.min(quantity, ages.filter((age) => this.policyMatchesAge(policy, age)).length) : quantity;
        if (matchedQuantity <= 0) {
          return sum;
        }

        return sum + this.calculatePolicyCharge(policy, adultRate, matchedQuantity, applyOneTimeSupplements, roomCount);
      }, 0);
  }

  private calculatePolicyCharge(policy: RatePolicy, adultRate: number, quantity: number, applyOneTimeSupplements: boolean, roomCount: number) {
    const amount = this.optionalNumber(policy.amount);
    const percent = this.optionalNumber(policy.percent);
    const unitCost = amount !== null ? amount : percent !== null ? adultRate * this.normalizePolicyPercent(percent) : 0;
    const pricingBasis = String(policy.pricingBasis || '').trim().toUpperCase();
    if (pricingBasis === 'PER_STAY' && !applyOneTimeSupplements) {
      return 0;
    }
    const multiplier = pricingBasis === 'PER_ROOM' ? roomCount : pricingBasis === 'PER_STAY' ? 1 : quantity;
    return Number((unitCost * multiplier).toFixed(2));
  }

  private policyMatchesMealPlan(policy: RatePolicy, mealPlan: HotelMealPlan) {
    if (!policy.mealPlan) {
      return true;
    }

    try {
      return this.normalizeMealPlan(policy.mealPlan) === mealPlan;
    } catch {
      return false;
    }
  }

  private policyMatchesAge(policy: RatePolicy, age: number) {
    const ageFrom = this.optionalNumber(policy.ageFrom);
    const ageTo = this.optionalNumber(policy.ageTo);
    return (ageFrom === null || age >= ageFrom) && (ageTo === null || age <= ageTo);
  }

  private calculateChildCost(age: number, adultRate: number, policies: RatePolicy[]) {
    if (this.findChildPolicy(age, policies, 'CHILD_FREE')) {
      return 0;
    }

    const discountPolicy = this.findChildPolicy(age, policies, 'CHILD_DISCOUNT');
    if (discountPolicy) {
      return Number((adultRate * this.normalizePolicyPercent(discountPolicy.percent)).toFixed(2));
    }

    return adultRate;
  }

  private matchDimensionScore<T extends string>(value: T | string | null | undefined, requested: T, normalize: (value: T | string) => T) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return 0;
    }

    try {
      return normalize(value) === requested ? 1 : null;
    } catch {
      return null;
    }
  }

  private matchMealPlanScore(
    value: HotelMealPlan | string | null | undefined,
    requested: HotelMealPlan,
    supplements: unknown,
    roomCategoryId?: string | null,
    seasonName?: string | null,
  ) {
    const exactScore = this.matchDimensionScore(value, requested, (entry) => this.normalizeMealPlan(entry));
    if (exactScore !== null) {
      return exactScore;
    }

    try {
      const baseMealPlan = this.normalizeMealPlan(value || '');
      return this.hasDerivedMealPlanSupplement(supplements, requested, baseMealPlan, roomCategoryId, seasonName) ? 0 : null;
    } catch {
      return null;
    }
  }

  private hasAmbiguousTopRate(rates: Array<{ occupancyScore: number; mealPlanScore: number; seasonSpecificityMs: number; createdAtMs: number; cost: number }>) {
    if (rates.length < 2) {
      return false;
    }

    const [first, second] = rates;
    return (
      first.occupancyScore === second.occupancyScore &&
      first.mealPlanScore === second.mealPlanScore &&
      first.seasonSpecificityMs === second.seasonSpecificityMs &&
      first.createdAtMs === second.createdAtMs &&
      first.cost === second.cost
    );
  }

  private findChildPolicy(age: number, policies: RatePolicy[], policyType: 'CHILD_FREE' | 'CHILD_DISCOUNT') {
    return policies.find((policy) => {
      if (String(policy.policyType || '').trim().toUpperCase() !== policyType) {
        return false;
      }

      const ageFrom = this.optionalNumber(policy.ageFrom);
      const ageTo = this.optionalNumber(policy.ageTo);
      return (ageFrom === null || age >= ageFrom) && (ageTo === null || age <= ageTo);
    });
  }

  private getRatePolicies(
    rate: { contract?: { ratePolicies?: unknown; supplements?: unknown } | null },
    selectedSupplementIds?: string[] | null,
    requestedMealPlan?: HotelMealPlan,
    baseMealPlan?: HotelMealPlan,
    roomCategoryId?: string | null,
    seasonName?: string | null,
  ) {
    const policies = rate.contract?.ratePolicies;
    const ratePolicies = Array.isArray(policies) ? (policies as RatePolicy[]) : [];
    return [
      ...ratePolicies,
      ...this.getIncludedSupplementPolicies(rate.contract?.supplements, selectedSupplementIds, requestedMealPlan, baseMealPlan, roomCategoryId, seasonName),
    ];
  }

  private getIncludedSupplementPolicies(
    supplements: unknown,
    selectedSupplementIds?: string[] | null,
    requestedMealPlan?: HotelMealPlan,
    baseMealPlan?: HotelMealPlan,
    roomCategoryId?: string | null,
    seasonName?: string | null,
  ): RatePolicy[] {
    if (!Array.isArray(supplements)) {
      return [];
    }

    const selectedIds = new Set((selectedSupplementIds || []).map((id) => String(id)));
    return supplements
      .filter((supplement): supplement is ContractSupplementPolicy => Boolean(supplement))
      .filter((supplement) => supplement.isActive !== false)
      .filter(
        (supplement) =>
          (supplement.isMandatory === true && !this.isExcludedAutomaticSupplement(supplement)) ||
          (supplement.id ? selectedIds.has(String(supplement.id)) : false) ||
          this.isDerivedMealPlanSupplement(supplement, requestedMealPlan, baseMealPlan, roomCategoryId, seasonName),
      )
      .map((supplement): RatePolicy | null => {
        const policyType = this.contractSupplementPolicyType(supplement.type);
        if (!policyType) {
          return null;
        }

        return {
          policyType,
          amount: supplement.amount ?? null,
          pricingBasis: this.contractSupplementPricingBasis(supplement.chargeBasis),
          notes: supplement.notes ?? null,
        };
      })
      .filter((policy): policy is RatePolicy => Boolean(policy));
  }

  private toHotelPricingSupplements(
    supplements: unknown,
    selectedSupplementIds?: string[] | null,
    requestedMealPlan?: HotelMealPlan,
    baseMealPlan?: HotelMealPlan,
    roomCategoryId?: string | null,
    seasonName?: string | null,
  ) {
    if (!Array.isArray(supplements)) {
      return [];
    }

    const selectedIds = new Set((selectedSupplementIds || []).map((id) => String(id)));
    return supplements
      .filter((supplement: ContractSupplementPolicy) => {
        const isSelected = supplement.id ? selectedIds.has(String(supplement.id)) : false;
        return (
          isSelected ||
          this.isDerivedMealPlanSupplement(supplement, requestedMealPlan, baseMealPlan, roomCategoryId, seasonName) ||
          (supplement.isMandatory === true && !this.isExcludedAutomaticSupplement(supplement))
        );
      })
      .map((supplement: ContractSupplementPolicy) => ({
        id: supplement.id ?? null,
        label: supplement.notes ?? supplement.type ?? null,
        type: supplement.type ?? null,
        // mealPlanCode is the new canonical tag — feed it through so
        // the pricing resolver can prefer it over type-string inference.
        mealPlanCode: (supplement as any).mealPlanCode ?? null,
        amount: Number(supplement.amount || 0),
        basis: supplement.chargeBasis ?? (supplement as any).basis ?? (supplement as any).pricingBasis ?? null,
        chargeBasis: supplement.chargeBasis ?? null,
        pricingBasis: (supplement as any).pricingBasis ?? null,
        mealPlan: this.supplementMealPlan(supplement),
        roomCategoryId: supplement.roomCategoryId ?? null,
        isMandatory: supplement.isMandatory ?? false,
        isActive: supplement.isActive ?? true,
        isSelected: true,
      }));
  }

  private hasDerivedMealPlanSupplement(
    supplements: unknown,
    requestedMealPlan: HotelMealPlan,
    baseMealPlan: HotelMealPlan,
    roomCategoryId?: string | null,
    seasonName?: string | null,
  ) {
    return Array.isArray(supplements)
      ? supplements.some((supplement) =>
          this.isDerivedMealPlanSupplement(supplement as ContractSupplementPolicy, requestedMealPlan, baseMealPlan, roomCategoryId, seasonName),
        )
      : false;
  }

  private isDerivedMealPlanSupplement(
    supplement: ContractSupplementPolicy,
    requestedMealPlan?: HotelMealPlan,
    baseMealPlan?: HotelMealPlan,
    roomCategoryId?: string | null,
    seasonName?: string | null,
  ) {
    if (!requestedMealPlan || !baseMealPlan || requestedMealPlan === baseMealPlan || supplement.isActive === false) {
      return false;
    }

    const appliesToRoom = !supplement.roomCategoryId || !roomCategoryId || supplement.roomCategoryId === roomCategoryId;
    if (!appliesToRoom) return false;
    if (!this.supplementAppliesToSeason(supplement, seasonName)) return false;

    // PREFERRED PATH: explicit mealPlanCode tag persisted on the row.
    // When set, this supplement is auto-included iff its code matches
    // the requested meal plan — no inference needed, no type-string
    // games. Lets one contract carry distinct HB / FB supplements
    // without one bleeding into the other.
    const explicitMealPlan = String((supplement as any).mealPlanCode || '').trim().toUpperCase();
    if (explicitMealPlan) {
      return explicitMealPlan === String(requestedMealPlan).toUpperCase();
    }

    // LEGACY FALLBACK: original BB→HB inference for un-tagged
    // supplements created before the mealPlanCode column existed.
    // Treats type=EXTRA_DINNER as the HB add-on. Preserved verbatim
    // so existing rate calculations don't drift on this PR.
    const normalizedType = String(supplement.type || '').trim().toUpperCase();
    const supplementMealPlan = this.supplementMealPlan(supplement);
    const mealPlanMatches = !supplementMealPlan || supplementMealPlan === requestedMealPlan;
    return (
      requestedMealPlan === HotelMealPlan.HB &&
      baseMealPlan === HotelMealPlan.BB &&
      normalizedType === 'EXTRA_DINNER' &&
      mealPlanMatches
    );
  }

  private supplementMealPlan(supplement: ContractSupplementPolicy) {
    const directMealPlan = String((supplement as any).mealPlan || '').trim().toUpperCase();
    if (directMealPlan) {
      return directMealPlan as HotelMealPlan;
    }

    const notes = String(supplement.notes || '');
    const match = notes.match(/\bMeal(?:\s*Plan)?\s*:\s*(RO|BB|HB|FB|AI)\b/i);
    return match ? (match[1].toUpperCase() as HotelMealPlan) : null;
  }

  private supplementAppliesToSeason(supplement: ContractSupplementPolicy, seasonName?: string | null) {
    const notes = String(supplement.notes || '');
    const match = notes.match(/\bSeason\s*:\s*([A-Z0-9_\-\s]+?)(?:\s*\||$)/i);
    const seasonScope = String((supplement as any).seasonCode || match?.[1] || '').trim().toUpperCase();
    if (!seasonScope || ['ALL_SEASONS', 'GLOBAL', 'ANY'].includes(seasonScope)) {
      return true;
    }

    const normalizedScope = this.normalizeSeasonScope(seasonScope);
    const normalizedSeason = this.normalizeSeasonScope(seasonName || '');
    return Boolean(normalizedSeason && (normalizedSeason === normalizedScope || normalizedSeason.includes(normalizedScope) || normalizedScope.includes(normalizedSeason)));
  }

  private normalizeSeasonScope(value: string) {
    return String(value || '')
      .toUpperCase()
      .replace(/\bSEASON\b/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private normalizePageLimit(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 50;
    }
    return Math.min(250, Math.floor(parsed));
  }

  private normalizePageOffset(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  }

  private isExcludedAutomaticSupplement(supplement: ContractSupplementPolicy) {
    const normalizedType = String(supplement.type || '').trim().toUpperCase();
    return [
      'NEW_YEAR_GALA_DINNER',
      'CHRISTMAS_GALA_DINNER',
      'ROOM_CATEGORY_SUPPLEMENT',
      'BREAKFAST_EXTRA_PERSON',
      'LUNCH',
      'ROLLAWAY_BED',
      'THIRD_PERSON_REDUCTION',
    ].includes(normalizedType);
  }

  private contractSupplementPolicyType(type: string | null | undefined) {
    const normalized = String(type || '').trim().toUpperCase();
    if (normalized === 'EXTRA_BED') {
      return 'THIRD_PERSON_SUPPLEMENT';
    }

    if (['EXTRA_BREAKFAST', 'EXTRA_LUNCH', 'EXTRA_DINNER', 'GALA_DINNER'].includes(normalized)) {
      return 'ADULT_EXTRA_MEAL';
    }

    return null;
  }

  private contractSupplementPricingBasis(chargeBasis: string | null | undefined) {
    const normalized = String(chargeBasis || '').trim().toUpperCase();
    if (normalized === 'PER_PERSON') {
      return 'PER_PERSON';
    }
    if (normalized === 'PER_STAY') {
      return 'PER_STAY';
    }
    return 'PER_ROOM';
  }

  private normalizeChildrenAges(value: number[] | null | undefined) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((age) => Number(age)).filter((age) => Number.isFinite(age) && age >= 0);
  }

  private normalizeAdults(adults: number | null | undefined, pax: number, childCount: number) {
    const normalizedAdults = Number(adults);
    if (Number.isFinite(normalizedAdults) && normalizedAdults >= 0) {
      return Math.floor(normalizedAdults);
    }

    return Math.max(0, Math.floor(Number(pax || 1)) - childCount);
  }

  private normalizeRoomCount(value: number | null | undefined) {
    const normalized = Number(value);
    if (Number.isFinite(normalized) && normalized > 0) {
      return Math.floor(normalized);
    }

    return 1;
  }

  private normalizePolicyPercent(value: number | string | null | undefined) {
    const percent = Number(value);
    if (!Number.isFinite(percent) || percent <= 0) {
      return 0;
    }

    return percent > 1 ? percent / 100 : percent;
  }

  private optionalNumber(value: number | string | null | undefined) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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

  private normalizePricingBasis(value: HotelRatePricingBasis | string | null | undefined) {
    if (value === undefined || value === null || value === '') {
      return HotelRatePricingBasis.PER_ROOM;
    }

    const raw = String(value).trim();
    if (/\bper\s+person\b|\bpp\b|\bper\s+pax\b/i.test(raw)) return HotelRatePricingBasis.PER_PERSON;
    if (/\bper\s+room\b|\bper\s+unit\b/i.test(raw)) return HotelRatePricingBasis.PER_ROOM;

    const normalized = raw.replace(/[\s-]+/g, '_').toUpperCase();
    if (normalized === HotelRatePricingBasis.PER_PERSON || normalized === 'PERSON' || normalized === 'PAX') {
      return HotelRatePricingBasis.PER_PERSON;
    }
    if (normalized === HotelRatePricingBasis.PER_ROOM || normalized === 'ROOM' || normalized === 'UNIT') {
      return HotelRatePricingBasis.PER_ROOM;
    }

    return HotelRatePricingBasis.PER_ROOM;
  }

  private normalizeOccupancyType(value: HotelOccupancyType | string) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return HotelOccupancyType.DBL;
    if (normalized === HotelOccupancyType.SGL || normalized === 'SINGLE') return HotelOccupancyType.SGL;
    if (normalized === HotelOccupancyType.DBL || normalized === 'DOUBLE' || normalized === 'TWIN') return HotelOccupancyType.DBL;
    if (normalized === HotelOccupancyType.TPL || normalized === 'TRP' || normalized === 'TRIPLE') return HotelOccupancyType.TPL;
    throw new BadRequestException('Unsupported hotel occupancy type');
  }

  private normalizeMealPlan(value: HotelMealPlan | string) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return HotelMealPlan.BB;
    if (normalized === HotelMealPlan.RO) return HotelMealPlan.RO;
    if (normalized === HotelMealPlan.BB || normalized === 'BED_BREAKFAST') return HotelMealPlan.BB;
    if (normalized === HotelMealPlan.HB || normalized === 'HALF_BOARD') return HotelMealPlan.HB;
    if (normalized === HotelMealPlan.FB) return HotelMealPlan.FB;
    if (normalized === HotelMealPlan.AI) return HotelMealPlan.AI;
    throw new BadRequestException('Unsupported hotel meal plan');
  }

  private normalizeLookupDate(value: Date | string) {
    if (typeof value === 'string') {
      const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
      if (dateOnly) {
        return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 0, 0, 0, 0);
      }
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('A valid lookup date is required');
    }

    const lookupDate = new Date(parsed);
    lookupDate.setHours(0, 0, 0, 0);
    return lookupDate;
  }

  private addDays(value: Date, days: number) {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private formatDateOnly(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Filter a contract's supplements to those that cover a given night.
  // Supplements with no appliesFrom/appliesTo window pass through (legacy
  // behaviour); dated ones (e.g. a 31 Dec gala) only survive on nights
  // inside their window. Date-only comparison so a one-day window matches.
  private supplementsApplicableOn(supplements: unknown, night: Date): unknown {
    if (!Array.isArray(supplements)) {
      return supplements;
    }
    const nightKey = this.formatDateOnly(night);
    return supplements.filter((supplement: any) => {
      const fromRaw = supplement?.appliesFrom;
      const toRaw = supplement?.appliesTo;
      if (!fromRaw && !toRaw) {
        return true;
      }
      const from = fromRaw ? this.formatDateOnly(new Date(fromRaw)) : null;
      const to = toRaw ? this.formatDateOnly(new Date(toRaw)) : null;
      if (from && nightKey < from) {
        return false;
      }
      if (to && nightKey > to) {
        return false;
      }
      return true;
    });
  }

  private lookupDateInSeason(lookupDate: Date, seasonFrom: Date, seasonTo: Date) {
    const from = this.normalizeDateForLookupComparison(seasonFrom);
    const to = this.normalizeDateForLookupComparison(seasonTo);
    return lookupDate >= from && lookupDate <= to;
  }

  private normalizeDateForLookupComparison(value: Date | string) {
    if (typeof value === 'string') {
      const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
      if (dateOnly) {
        return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 0, 0, 0, 0);
      }
    }

    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private seasonSpecificityMs(seasonFrom: Date | string, seasonTo: Date | string) {
    const from = this.normalizeDateForLookupComparison(seasonFrom);
    const to = this.normalizeDateForLookupComparison(seasonTo);
    return Math.max(0, to.getTime() - from.getTime());
  }

  private dateTimeMs(value: Date | string | null | undefined) {
    const date = value ? new Date(value) : new Date(0);
    const time = date.getTime();
    return Number.isFinite(time) ? time : 0;
  }
}
