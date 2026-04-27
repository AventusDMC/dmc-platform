import { BadRequestException, Injectable } from '@nestjs/common';
import { HotelMealPlan, HotelOccupancyType, HotelRatePricingBasis } from '@prisma/client';
import { ensureValidNumber, normalizeOptionalSupportedCurrency, requireSupportedCurrency, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

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
  notes?: string | null;
};

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
        mealPlanScore: this.matchDimensionScore(rate.mealPlan, mealPlan, (value) => this.normalizeMealPlan(value)),
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

    const breakdown: Array<{ date: string; adultsCost: number; childrenCost: number; supplementsCost: number; cost: number }> = [];

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
      const pricedNight = this.calculateNightlyGuestCost(
        rate.cost,
        rate.pricingBasis,
        adults,
        childrenAges,
        roomCount,
        this.getRatePolicies(rate, data.selectedSupplementIds),
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
      });
      nightIndex += 1;
    }

    const adultsCost = Number(breakdown.reduce((sum, item) => sum + item.adultsCost, 0).toFixed(2));
    const childrenCost = Number(breakdown.reduce((sum, item) => sum + item.childrenCost, 0).toFixed(2));
    const supplementsCost = Number(breakdown.reduce((sum, item) => sum + item.supplementsCost, 0).toFixed(2));

    return {
      adultsCost,
      childrenCost,
      supplementsCost,
      totalCost: Number((adultsCost + childrenCost + supplementsCost).toFixed(2)),
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

  private getRatePolicies(rate: { contract?: { ratePolicies?: unknown; supplements?: unknown } | null }, selectedSupplementIds?: string[] | null) {
    const policies = rate.contract?.ratePolicies;
    const ratePolicies = Array.isArray(policies) ? (policies as RatePolicy[]) : [];
    return [...ratePolicies, ...this.getIncludedSupplementPolicies(rate.contract?.supplements, selectedSupplementIds)];
  }

  private getIncludedSupplementPolicies(supplements: unknown, selectedSupplementIds?: string[] | null): RatePolicy[] {
    if (!Array.isArray(supplements)) {
      return [];
    }

    const selectedIds = new Set((selectedSupplementIds || []).map((id) => String(id)));
    return supplements
      .filter((supplement): supplement is ContractSupplementPolicy => Boolean(supplement))
      .filter((supplement) => supplement.isActive !== false)
      .filter((supplement) => supplement.isMandatory === true || (supplement.id ? selectedIds.has(String(supplement.id)) : false))
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
