import { BadRequestException, Injectable } from '@nestjs/common';
import { HotelMealPlan } from '@prisma/client';
import { ensureValidNumber, normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionEvaluationInput, evaluatePromotions } from './promotion-evaluator';

type PromotionTypeValue = 'PERCENTAGE_DISCOUNT' | 'FIXED_DISCOUNT' | 'STAY_PAY' | 'FREE_NIGHT';
type PromotionCombinabilityModeValue = 'EXCLUSIVE' | 'COMBINABLE' | 'BEST_OF_GROUP';

type PromotionRuleInput = {
  roomCategoryId?: string | null;
  travelDateFrom?: Date | null;
  travelDateTo?: Date | null;
  bookingDateFrom?: Date | null;
  bookingDateTo?: Date | null;
  boardBasis?: HotelMealPlan | null;
  minStay?: number | null;
  isActive?: boolean;
};

type CreatePromotionInput = {
  hotelContractId: string;
  name: string;
  type: PromotionTypeValue;
  value?: number | null;
  stayPayNights?: number | null;
  payNights?: number | null;
  freeNightCount?: number | null;
  isActive?: boolean;
  priority?: number;
  combinabilityMode?: PromotionCombinabilityModeValue;
  promotionGroup?: string | null;
  combinable?: boolean;
  notes?: string | null;
  rules?: PromotionRuleInput[];
};

type UpdatePromotionInput = Partial<CreatePromotionInput>;

const PROMOTION_TYPES: PromotionTypeValue[] = ['PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT', 'STAY_PAY', 'FREE_NIGHT'];
const PROMOTION_COMBINABILITY_MODES: PromotionCombinabilityModeValue[] = ['EXCLUSIVE', 'COMBINABLE', 'BEST_OF_GROUP'];
const BOARD_BASIS_VALUES = new Set(['RO', 'BB', 'HB', 'FB', 'AI']);

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  private get promotionModel() {
    return (this.prisma as any).promotion;
  }

  findAll() {
    return this.promotionModel.findMany({
      include: this.getPromotionInclude(),
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const promotion = await this.promotionModel.findUnique({
      where: { id },
      include: this.getPromotionInclude(),
    });

    return throwIfNotFound(promotion, 'Promotion');
  }

  async create(data: CreatePromotionInput) {
    await this.ensureContractExists(data.hotelContractId);
    const normalized = await this.normalizePromotionPayload(data);

    return this.promotionModel.create({
      data: {
        ...normalized,
        rules: normalized.rules.length
          ? {
              create: normalized.rules,
            }
          : undefined,
      },
      include: this.getPromotionInclude(),
    });
  }

  async update(id: string, data: UpdatePromotionInput) {
    const existing = await this.findOne(id);
    const nextPayload: CreatePromotionInput = {
      hotelContractId: data.hotelContractId ?? existing.hotelContractId,
      name: data.name ?? existing.name,
      type: data.type ?? existing.type,
      value: data.value === undefined ? existing.value : data.value,
      stayPayNights: data.stayPayNights === undefined ? existing.stayPayNights : data.stayPayNights,
      payNights: data.payNights === undefined ? existing.payNights : data.payNights,
      freeNightCount: data.freeNightCount === undefined ? existing.freeNightCount : data.freeNightCount,
      isActive: data.isActive === undefined ? existing.isActive : data.isActive,
      priority: data.priority === undefined ? existing.priority : data.priority,
      combinabilityMode:
        data.combinabilityMode === undefined
          ? existing.combinabilityMode ?? this.resolveLegacyCombinabilityMode(existing.combinable)
          : data.combinabilityMode,
      promotionGroup: data.promotionGroup === undefined ? existing.promotionGroup : data.promotionGroup,
      combinable: data.combinable === undefined ? existing.combinable : data.combinable,
      notes: data.notes === undefined ? existing.notes : data.notes,
      rules:
        data.rules === undefined
          ? existing.rules.map((rule: any) => ({
              roomCategoryId: rule.roomCategoryId,
              travelDateFrom: rule.travelDateFrom,
              travelDateTo: rule.travelDateTo,
              bookingDateFrom: rule.bookingDateFrom,
              bookingDateTo: rule.bookingDateTo,
              boardBasis: rule.boardBasis,
              minStay: rule.minStay,
              isActive: rule.isActive,
            }))
          : data.rules,
    };

    await this.ensureContractExists(nextPayload.hotelContractId);
    const normalized = await this.normalizePromotionPayload(nextPayload);

    return this.promotionModel.update({
      where: { id },
      data: {
        ...normalized,
        rules: {
          deleteMany: {},
          ...(normalized.rules.length
            ? {
                create: normalized.rules,
              }
            : {}),
        },
      },
      include: this.getPromotionInclude(),
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.promotionModel.delete({
      where: { id },
    });
  }

  async evaluate(input: PromotionEvaluationInput) {
    ensureValidNumber(input.baseCost, 'baseCost', { min: 0 });
    ensureValidNumber(input.baseSell, 'baseSell', { min: 0 });
    await this.ensureContractExists(input.hotelContractId);

    const promotions = await this.promotionModel.findMany({
      where: {
        hotelContractId: input.hotelContractId,
        isActive: true,
      },
      include: this.getPromotionInclude(),
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return evaluatePromotions(promotions, input);
  }

  private getPromotionInclude() {
    return {
      hotelContract: {
        include: {
          hotel: true,
        },
      },
      rules: {
        include: {
          roomCategory: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      },
    };
  }

  private async ensureContractExists(hotelContractId: string) {
    const contract = await this.prisma.hotelContract.findUnique({
      where: { id: hotelContractId },
    });

    if (!contract) {
      throw new BadRequestException('Hotel contract not found');
    }

    return contract;
  }

  private async normalizePromotionPayload(data: CreatePromotionInput) {
    const type = this.normalizePromotionType(data.type);
    const priority = Math.trunc(ensureValidNumber(data.priority ?? 0, 'priority'));
    const combinabilityMode = this.normalizeCombinabilityMode(data.combinabilityMode, data.combinable);
    const promotionGroup = normalizeOptionalString(data.promotionGroup);
    const value = data.value == null ? null : ensureValidNumber(data.value, 'value', { min: 0 });
    const stayPayNights = data.stayPayNights == null ? null : Math.trunc(ensureValidNumber(data.stayPayNights, 'stayPayNights', { min: 1 }));
    const payNights = data.payNights == null ? null : Math.trunc(ensureValidNumber(data.payNights, 'payNights', { min: 1 }));
    const freeNightCount =
      data.freeNightCount == null ? null : Math.trunc(ensureValidNumber(data.freeNightCount, 'freeNightCount', { min: 1 }));

    if ((type === 'PERCENTAGE_DISCOUNT' || type === 'FIXED_DISCOUNT') && value == null) {
      throw new BadRequestException('Discount promotions require a value');
    }

    if (type === 'STAY_PAY') {
      if (stayPayNights == null || payNights == null) {
        throw new BadRequestException('Stay-pay promotions require stayPayNights and payNights');
      }

      if (payNights >= stayPayNights) {
        throw new BadRequestException('payNights must be lower than stayPayNights');
      }
    }

    if (type === 'FREE_NIGHT' && freeNightCount == null) {
      throw new BadRequestException('Free-night promotions require freeNightCount');
    }

    const rules = await Promise.all((data.rules || []).map((rule) => this.normalizeRule(rule, data.hotelContractId)));

    return {
      hotelContractId: data.hotelContractId,
      name: requireTrimmedString(data.name, 'name'),
      type,
      value: type === 'PERCENTAGE_DISCOUNT' || type === 'FIXED_DISCOUNT' ? value : null,
      stayPayNights: type === 'STAY_PAY' ? stayPayNights : null,
      payNights: type === 'STAY_PAY' ? payNights : null,
      freeNightCount: type === 'FREE_NIGHT' ? freeNightCount : null,
      isActive: data.isActive ?? true,
      priority,
      combinabilityMode,
      promotionGroup,
      combinable: combinabilityMode === 'COMBINABLE',
      notes: normalizeOptionalString(data.notes),
      rules,
    };
  }

  private normalizePromotionType(value: string): PromotionTypeValue {
    if (PROMOTION_TYPES.includes(value as PromotionTypeValue)) {
      return value as PromotionTypeValue;
    }

    throw new BadRequestException('Invalid promotion type');
  }

  private normalizeCombinabilityMode(value?: string | null, combinable?: boolean | null): PromotionCombinabilityModeValue {
    if (value && PROMOTION_COMBINABILITY_MODES.includes(value as PromotionCombinabilityModeValue)) {
      return value as PromotionCombinabilityModeValue;
    }

    return this.resolveLegacyCombinabilityMode(combinable);
  }

  private resolveLegacyCombinabilityMode(combinable?: boolean | null): PromotionCombinabilityModeValue {
    return combinable ? 'COMBINABLE' : 'EXCLUSIVE';
  }

  private async normalizeRule(rule: PromotionRuleInput, hotelContractId: string) {
    const travelDateFrom = rule.travelDateFrom || null;
    const travelDateTo = rule.travelDateTo || null;
    const bookingDateFrom = rule.bookingDateFrom || null;
    const bookingDateTo = rule.bookingDateTo || null;
    const minStay = rule.minStay == null ? null : Math.trunc(ensureValidNumber(rule.minStay, 'minStay', { min: 1 }));
    const boardBasis = this.normalizeBoardBasis(rule.boardBasis);

    if (travelDateFrom && travelDateTo && travelDateFrom > travelDateTo) {
      throw new BadRequestException('travelDateFrom cannot be after travelDateTo');
    }

    if (bookingDateFrom && bookingDateTo && bookingDateFrom > bookingDateTo) {
      throw new BadRequestException('bookingDateFrom cannot be after bookingDateTo');
    }

    if (rule.roomCategoryId) {
      const roomCategory = await this.prisma.hotelRoomCategory.findUnique({
        where: { id: rule.roomCategoryId },
      });
      const contract = await this.prisma.hotelContract.findUnique({
        where: { id: hotelContractId },
      });

      if (!roomCategory || !contract || roomCategory.hotelId !== contract.hotelId) {
        throw new BadRequestException('Room category not found for the selected contract');
      }
    }

    return {
      roomCategoryId: rule.roomCategoryId || null,
      travelDateFrom,
      travelDateTo,
      bookingDateFrom,
      bookingDateTo,
      boardBasis,
      minStay,
      isActive: rule.isActive ?? true,
    };
  }

  private normalizeBoardBasis(value?: HotelMealPlan | null) {
    if (!value) {
      return null;
    }

    if (!BOARD_BASIS_VALUES.has(value)) {
      throw new BadRequestException('Invalid board basis');
    }

    return value;
  }
}
