export type PromotionTypeValue = 'PERCENTAGE_DISCOUNT' | 'FIXED_DISCOUNT' | 'STAY_PAY' | 'FREE_NIGHT';
export type PromotionCombinabilityModeValue = 'EXCLUSIVE' | 'COMBINABLE' | 'BEST_OF_GROUP';
export type PromotionSkipReasonValue = 'blocked_by_exclusive' | 'lower_priority_in_group';

export type PromotionRuleRecord = {
  id: string;
  roomCategoryId: string | null;
  travelDateFrom: Date | string | null;
  travelDateTo: Date | string | null;
  bookingDateFrom: Date | string | null;
  bookingDateTo: Date | string | null;
  boardBasis: string | null;
  minStay: number | null;
  isActive: boolean;
};

export type PromotionRecord = {
  id: string;
  name: string;
  hotelContractId: string;
  type: PromotionTypeValue;
  value: number | null;
  stayPayNights: number | null;
  payNights: number | null;
  freeNightCount: number | null;
  isActive: boolean;
  priority: number;
  combinabilityMode?: PromotionCombinabilityModeValue | null;
  promotionGroup?: string | null;
  combinable: boolean;
  notes: string | null;
  rules: PromotionRuleRecord[];
};

export type PromotionEvaluationEntry = {
  id: string;
  name: string;
  type: PromotionTypeValue;
  priority: number;
  combinabilityMode: PromotionCombinabilityModeValue;
  promotionGroup: string | null;
  combinable: boolean;
  matchedRuleId: string | null;
  effectAmount: number;
  explanation: string;
};

export type PromotionEvaluationInput = {
  hotelContractId: string;
  travelDate?: Date | string | null;
  bookingDate?: Date | string | null;
  roomCategoryId?: string | null;
  boardBasis?: string | null;
  stayNights?: number | null;
  baseCost: number;
  baseSell: number;
  currency?: string | null;
};

export type PromotionEvaluationResult = {
  matchedPromotions: PromotionEvaluationEntry[];
  appliedPromotions: PromotionEvaluationEntry[];
  skippedPromotions: Array<
    PromotionEvaluationEntry & {
      reason: PromotionSkipReasonValue;
    }
  >;
  applicablePromotions: PromotionEvaluationEntry[];
  adjustedPricing: {
    currency: string;
    baseCost: number;
    baseSell: number;
    adjustedCost: number;
    adjustedSell: number;
    discountAmount: number;
    marginAmount: number;
    marginPercent: number;
  };
  explanation: Array<{
    id: string;
    name: string;
    effect: string | null;
    type: PromotionTypeValue;
    minStay: number | null;
    boardBasis: string | null;
  }>;
};

type MatchedPromotion = {
  promotion: PromotionRecord;
  rule: PromotionRuleRecord | null;
};

function getCombinabilityMode(promotion: PromotionRecord): PromotionCombinabilityModeValue {
  if (promotion.combinabilityMode) {
    return promotion.combinabilityMode;
  }

  return promotion.combinable ? 'COMBINABLE' : 'EXCLUSIVE';
}

function asDate(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inRange(value: Date | null, from?: Date | string | null, to?: Date | string | null) {
  if (!value) {
    return false;
  }

  const rangeFrom = asDate(from);
  const rangeTo = asDate(to);

  if (rangeFrom && value < rangeFrom) {
    return false;
  }

  if (rangeTo && value > rangeTo) {
    return false;
  }

  return true;
}

function formatMoney(value: number, currency: string) {
  return `${currency} ${value.toFixed(2)}`;
}

function resolveMatchedRule(promotion: PromotionRecord, input: PromotionEvaluationInput) {
  const activeRules = promotion.rules.filter((rule) => rule.isActive);

  if (activeRules.length === 0) {
    return null;
  }

  const travelDate = asDate(input.travelDate);
  const bookingDate = asDate(input.bookingDate);
  const boardBasis = input.boardBasis?.trim().toUpperCase() || null;

  return (
    activeRules.find((rule) => {
      if (rule.roomCategoryId && rule.roomCategoryId !== input.roomCategoryId) {
        return false;
      }

      if (rule.boardBasis && rule.boardBasis !== boardBasis) {
        return false;
      }

      if (rule.minStay && (input.stayNights || 0) < rule.minStay) {
        return false;
      }

      if ((rule.travelDateFrom || rule.travelDateTo) && !inRange(travelDate, rule.travelDateFrom, rule.travelDateTo)) {
        return false;
      }

      if ((rule.bookingDateFrom || rule.bookingDateTo) && !inRange(bookingDate, rule.bookingDateFrom, rule.bookingDateTo)) {
        return false;
      }

      return true;
    }) || null
  );
}

function calculatePromotionEffect(promotion: PromotionRecord, input: PromotionEvaluationInput) {
  const stayNights = Math.max(input.stayNights || 0, 0);
  const perNightSell = stayNights > 0 ? input.baseSell / stayNights : 0;

  if (promotion.type === 'PERCENTAGE_DISCOUNT') {
    return Math.min(input.baseSell, (input.baseSell * Math.max(promotion.value || 0, 0)) / 100);
  }

  if (promotion.type === 'FIXED_DISCOUNT') {
    return Math.min(input.baseSell, Math.max(promotion.value || 0, 0));
  }

  if (promotion.type === 'STAY_PAY') {
    const stayPayNights = Math.max(promotion.stayPayNights || 0, 0);
    const payNights = Math.max(promotion.payNights || 0, 0);

    if (stayPayNights <= 0 || payNights >= stayPayNights || stayNights < stayPayNights || perNightSell <= 0) {
      return 0;
    }

    const freeNightCount = stayPayNights - payNights;
    const promotionBlocks = Math.floor(stayNights / stayPayNights);
    return Math.min(input.baseSell, perNightSell * freeNightCount * promotionBlocks);
  }

  const freeNightCount = Math.max(promotion.freeNightCount || 0, 0);

  if (freeNightCount <= 0 || stayNights < freeNightCount || perNightSell <= 0) {
    return 0;
  }

  return Math.min(input.baseSell, perNightSell * freeNightCount);
}

function buildExplanation(promotion: PromotionRecord, rule: PromotionRuleRecord | null, effectAmount: number, currency: string) {
  const parts = [promotion.name];

  if (promotion.type === 'PERCENTAGE_DISCOUNT') {
    parts.push(`${promotion.value || 0}% discount`);
  } else if (promotion.type === 'FIXED_DISCOUNT') {
    parts.push(`${formatMoney(promotion.value || 0, currency)} fixed discount`);
  } else if (promotion.type === 'STAY_PAY') {
    parts.push(`stay ${promotion.stayPayNights || 0}, pay ${promotion.payNights || 0}`);
  } else {
    parts.push(`${promotion.freeNightCount || 0} free night`);
  }

  if (rule?.boardBasis) {
    parts.push(`board ${rule.boardBasis}`);
  }

  if (rule?.minStay) {
    parts.push(`min ${rule.minStay} nights`);
  }

  parts.push(`effect ${formatMoney(effectAmount, currency)}`);

  return parts.join(' | ');
}

export function evaluatePromotions(promotions: PromotionRecord[], input: PromotionEvaluationInput): PromotionEvaluationResult {
  const currency = input.currency?.trim().toUpperCase() || 'USD';
  const matchedPromotionRecords: MatchedPromotion[] = promotions
    .filter((promotion) => promotion.isActive && promotion.hotelContractId === input.hotelContractId)
    .map((promotion) => ({
      promotion,
      rule: resolveMatchedRule(promotion, input),
    }))
    .filter(({ promotion, rule }) => promotion.rules.length === 0 || Boolean(rule))
    .sort((left, right) => {
      const priorityComparison = right.promotion.priority - left.promotion.priority;
      if (priorityComparison !== 0) {
        return priorityComparison;
      }

      return left.promotion.name.localeCompare(right.promotion.name);
    });

  const matchedPromotions = matchedPromotionRecords.map(({ promotion, rule }) => {
    const effectAmount = calculatePromotionEffect(promotion, input);

    return {
      id: promotion.id,
      name: promotion.name,
      type: promotion.type,
      priority: promotion.priority,
      combinabilityMode: getCombinabilityMode(promotion),
      promotionGroup: promotion.promotionGroup ?? null,
      combinable: promotion.combinable,
      matchedRuleId: rule?.id || null,
      effectAmount,
      explanation: buildExplanation(promotion, rule, effectAmount, currency),
    };
  });

  let appliedPromotions: PromotionEvaluationEntry[] = [];
  const skippedPromotions: Array<PromotionEvaluationEntry & { reason: PromotionSkipReasonValue }> = [];
  const exclusivePromotions = matchedPromotions.filter((promotion) => promotion.combinabilityMode === 'EXCLUSIVE');

  if (exclusivePromotions.length > 0) {
    const [selectedExclusive, ...remainingExclusive] = exclusivePromotions;
    appliedPromotions = [selectedExclusive];

    for (const promotion of remainingExclusive) {
      skippedPromotions.push({
        ...promotion,
        reason: 'blocked_by_exclusive',
      });
    }

    for (const promotion of matchedPromotions.filter((entry) => entry.combinabilityMode !== 'EXCLUSIVE')) {
      skippedPromotions.push({
        ...promotion,
        reason: 'blocked_by_exclusive',
      });
    }
  } else {
    const bestOfGroupWinners = new Set<string>();

    for (const promotion of matchedPromotions) {
      if (promotion.combinabilityMode !== 'BEST_OF_GROUP') {
        continue;
      }

      const groupKey = promotion.promotionGroup || promotion.id;
      if (!bestOfGroupWinners.has(groupKey)) {
        bestOfGroupWinners.add(groupKey);
        appliedPromotions.push(promotion);
        continue;
      }

      skippedPromotions.push({
        ...promotion,
        reason: 'lower_priority_in_group',
      });
    }

    for (const promotion of matchedPromotions.filter((entry) => entry.combinabilityMode === 'COMBINABLE')) {
      appliedPromotions.push(promotion);
    }
  }

  const applicablePromotions = appliedPromotions;
  const discountAmount = appliedPromotions.reduce((sum, promotion) => sum + promotion.effectAmount, 0);
  const adjustedSell = Math.max(input.baseSell - discountAmount, 0);
  const adjustedCost = input.baseCost;
  const marginAmount = adjustedSell - adjustedCost;
  const marginPercent = adjustedSell > 0 ? (marginAmount / adjustedSell) * 100 : 0;
  const explanation = appliedPromotions.length
    ? appliedPromotions.map((promotion) => {
        const match = matchedPromotionRecords.find((entry) => entry.promotion.id === promotion.id);

        return {
          id: promotion.id,
          name: promotion.explanation,
          effect: null,
          type: promotion.type,
          minStay: match?.rule?.minStay ?? null,
          boardBasis: match?.rule?.boardBasis ?? null,
        };
      })
    : [];

  return {
    matchedPromotions,
    appliedPromotions,
    skippedPromotions,
    applicablePromotions,
    adjustedPricing: {
      currency,
      baseCost: input.baseCost,
      baseSell: input.baseSell,
      adjustedCost,
      adjustedSell,
      discountAmount,
      marginAmount,
      marginPercent,
    },
    explanation,
  };
}
