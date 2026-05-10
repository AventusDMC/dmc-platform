export type HotelRatePricingBasis =
  | 'PER_ROOM_NIGHT'
  | 'PER_PERSON_NIGHT'
  | 'PER_PERSON_IN_DBL_NIGHT'
  | 'SINGLE_ROOM_NIGHT'
  | 'SINGLE_SUPPLEMENT_ON_DBL'
  | 'TRIPLE_PERSON_NIGHT'
  | 'CHILD_RATE'
  | 'EXTRA_BED'
  | 'PER_ROOM'
  | 'PER_PERSON'
  | string;

export type HotelSupplementBasis =
  | 'PER_PERSON_NIGHT'
  | 'PER_ROOM_NIGHT'
  | 'PER_NIGHT'
  | 'PER_STAY'
  | 'PER_CHILD_NIGHT'
  | 'PER_SINGLE_ROOM_NIGHT'
  | 'PER_PERSON'
  | 'PER_ROOM'
  | string;

export type HotelPricingRate = {
  id?: string | null;
  label?: string | null;
  amount: number;
  basis?: HotelRatePricingBasis | null;
  mealPlan?: string | null;
  roomCategoryId?: string | null;
  occupancyType?: string | null;
  isSelected?: boolean | null;
};

export type HotelPricingSupplement = {
  id?: string | null;
  label?: string | null;
  type?: string | null;
  amount: number;
  basis?: HotelSupplementBasis | null;
  chargeBasis?: HotelSupplementBasis | null;
  mealPlan?: string | null;
  roomCategoryId?: string | null;
  isMandatory?: boolean | null;
  isActive?: boolean | null;
  isSelected?: boolean | null;
};

export type HotelRoomAllocation = {
  singleRooms?: number | null;
  doubleRooms?: number | null;
  twinRooms?: number | null;
  tripleRooms?: number | null;
  extraBeds?: number | null;
  singlePax?: number | null;
  doubleSharingPax?: number | null;
  triplePax?: number | null;
  childPax?: number | null;
};

type NormalizedHotelRoomAllocation = {
  singleRooms: number;
  doubleRooms: number;
  twinRooms: number;
  tripleRooms: number;
  extraBeds: number;
  singlePax: number;
  doubleSharingPax: number;
  triplePax: number;
  childPax: number;
};

export type HotelPricingInput = {
  pax: number;
  rooms: number;
  nights: number;
  adults?: number | null;
  children?: number | null;
  selectedMealPlan?: string | null;
  baseMealPlan?: string | null;
  selectedRoomCategoryId?: string | null;
  rates: HotelPricingRate[];
  supplements?: HotelPricingSupplement[] | null;
  roomAllocation?: HotelRoomAllocation | null;
  markupPercent?: number | null;
  markupAmount?: number | null;
  sellPrice?: number | null;
};

export type HotelPricingBreakdownLine = {
  kind: 'base' | 'single_supplement' | 'meal_supplement' | 'extra_bed' | 'child_rate' | 'mandatory_supplement' | 'supplement' | 'review';
  label: string;
  basis: string;
  unitAmount: number;
  quantity: number;
  nights: number;
  total: number;
  sourceId?: string | null;
};

export type HotelPricingResult = {
  baseCost: number;
  supplementCost: number;
  totalCost: number;
  totalSell: number;
  profit: number;
  margin: number;
  breakdown: HotelPricingBreakdownLine[];
  warnings: string[];
};

export class HotelPricingResolver {
  resolve(input: HotelPricingInput): HotelPricingResult {
    const pax = positive(input.pax, 1);
    const rooms = positive(input.rooms, 1);
    const nights = positive(input.nights, 1);
    const childPax = nonNegative(input.roomAllocation?.childPax ?? input.children ?? 0);
    const allocation = this.normalizeAllocation(input.roomAllocation, pax, rooms, childPax);
    const warnings: string[] = [];

    const baseLines = (input.rates || [])
      .filter((rate) => Number(rate.amount) > 0)
      .map((rate) => this.priceRate(rate, { pax, rooms, nights, allocation, warnings }))
      .filter(isHotelPricingBreakdownLine);

    const baseCost = roundMoney(baseLines.reduce((sum, line) => sum + line.total, 0));
    const supplementLines = (input.supplements || [])
      .filter((supplement) => this.shouldApplySupplement(supplement, input))
      .map((supplement) => this.priceSupplement(supplement, { pax, rooms, nights, allocation, warnings }))
      .filter(isHotelPricingBreakdownLine);
    const supplementCost = roundMoney(supplementLines.reduce((sum, line) => sum + line.total, 0));
    const totalCost = roundMoney(baseCost + supplementCost);
    const totalSell = this.resolveSell(totalCost, input);
    const profit = roundMoney(totalSell - totalCost);
    const margin = totalSell > 0 ? roundMoney((profit / totalSell) * 100) : 0;

    return {
      baseCost,
      supplementCost,
      totalCost,
      totalSell,
      profit,
      margin,
      breakdown: [...baseLines, ...supplementLines],
      warnings,
    };
  }

  normalizeRateBasis(value: HotelRatePricingBasis | null | undefined) {
    const basis = String(value || '').trim().toUpperCase();
    if (basis === 'PER_PERSON') {
      return 'PER_PERSON_NIGHT';
    }
    if (basis === 'PER_ROOM') {
      return 'PER_ROOM_NIGHT';
    }
    return basis || 'PER_ROOM_NIGHT';
  }

  normalizeSupplementBasis(value: HotelSupplementBasis | null | undefined) {
    const basis = String(value || '').trim().toUpperCase();
    if (basis === 'PER_PERSON') {
      return 'PER_PERSON_NIGHT';
    }
    if (basis === 'PER_ROOM') {
      return 'PER_ROOM_NIGHT';
    }
    return basis || 'PER_PERSON_NIGHT';
  }

  private normalizeAllocation(allocation: HotelRoomAllocation | null | undefined, pax: number, rooms: number, childPax: number) {
    const singleRooms = nonNegative(allocation?.singleRooms ?? 0);
    const tripleRooms = nonNegative(allocation?.tripleRooms ?? 0);
    const doubleRooms = nonNegative(allocation?.doubleRooms ?? Math.max(0, rooms - singleRooms - tripleRooms));
    const twinRooms = nonNegative(allocation?.twinRooms ?? 0);
    const singlePax = nonNegative(allocation?.singlePax ?? singleRooms);
    const triplePax = nonNegative(allocation?.triplePax ?? tripleRooms * 3);
    const doubleSharingPax = nonNegative(allocation?.doubleSharingPax ?? Math.max(0, pax - childPax - singlePax - triplePax));
    return {
      singleRooms,
      doubleRooms,
      twinRooms,
      tripleRooms,
      extraBeds: nonNegative(allocation?.extraBeds ?? 0),
      singlePax,
      doubleSharingPax,
      triplePax,
      childPax,
    };
  }

  private priceRate(
    rate: HotelPricingRate,
    context: {
      pax: number;
      rooms: number;
      nights: number;
      allocation: NormalizedHotelRoomAllocation;
      warnings: string[];
    },
  ): HotelPricingBreakdownLine | null {
    const basis = this.normalizeRateBasis(rate.basis);
    const amount = Number(rate.amount || 0);
    const quantity = this.rateQuantity(basis, context);
    if (quantity <= 0 || amount <= 0) {
      return null;
    }
    if (!this.isKnownRateBasis(basis)) {
      context.warnings.push(`Hotel rate ${rate.id || rate.label || 'selected'} has ambiguous pricing basis ${basis}; treated as PER_ROOM_NIGHT.`);
    }
    return {
      kind: this.rateLineKind(basis),
      label: rate.label || this.rateLabel(basis),
      basis,
      unitAmount: amount,
      quantity,
      nights: basis === 'SINGLE_SUPPLEMENT_ON_DBL' ? context.nights : context.nights,
      total: roundMoney(amount * quantity),
      sourceId: rate.id || null,
    };
  }

  private rateQuantity(
    basis: string,
    context: {
      pax: number;
      rooms: number;
      nights: number;
      allocation: NormalizedHotelRoomAllocation;
    },
  ) {
    switch (basis) {
      case 'PER_PERSON_NIGHT':
        return context.pax * context.nights;
      case 'PER_PERSON_IN_DBL_NIGHT':
        return context.allocation.doubleSharingPax * context.nights;
      case 'SINGLE_ROOM_NIGHT':
        return context.allocation.singleRooms * context.nights;
      case 'SINGLE_SUPPLEMENT_ON_DBL':
        return context.allocation.singlePax * context.nights;
      case 'TRIPLE_PERSON_NIGHT':
        return context.allocation.triplePax * context.nights;
      case 'CHILD_RATE':
        return context.allocation.childPax * context.nights;
      case 'EXTRA_BED':
        return context.allocation.extraBeds * context.nights;
      case 'PER_ROOM_NIGHT':
      default:
        return context.rooms * context.nights;
    }
  }

  private priceSupplement(
    supplement: HotelPricingSupplement,
    context: {
      pax: number;
      rooms: number;
      nights: number;
      allocation: NormalizedHotelRoomAllocation;
      warnings: string[];
    },
  ): HotelPricingBreakdownLine | null {
    const basis = this.normalizeSupplementBasis(supplement.basis ?? supplement.chargeBasis);
    const amount = Number(supplement.amount || 0);
    const quantity = this.supplementQuantity(basis, context);
    if (quantity <= 0 || amount <= 0) {
      return null;
    }
    if (!this.isKnownSupplementBasis(basis)) {
      context.warnings.push(`Hotel supplement ${supplement.id || supplement.label || supplement.type || 'selected'} has ambiguous basis ${basis}; treated as PER_PERSON_NIGHT.`);
    }
    return {
      kind: this.supplementLineKind(supplement),
      label: supplement.label || this.supplementLabel(supplement),
      basis,
      unitAmount: amount,
      quantity,
      nights: context.nights,
      total: roundMoney(amount * quantity),
      sourceId: supplement.id || null,
    };
  }

  private supplementQuantity(
    basis: string,
    context: {
      pax: number;
      rooms: number;
      nights: number;
      allocation: NormalizedHotelRoomAllocation;
    },
  ) {
    switch (basis) {
      case 'PER_ROOM_NIGHT':
        return context.rooms * context.nights;
      case 'PER_NIGHT':
        return context.nights;
      case 'PER_STAY':
        return 1;
      case 'PER_CHILD_NIGHT':
        return context.allocation.childPax * context.nights;
      case 'PER_SINGLE_ROOM_NIGHT':
        return context.allocation.singleRooms * context.nights;
      case 'PER_PERSON_NIGHT':
      default:
        return context.pax * context.nights;
    }
  }

  private shouldApplySupplement(supplement: HotelPricingSupplement, input: HotelPricingInput) {
    if (!supplement || supplement.isActive === false) {
      return false;
    }
    if (supplement.roomCategoryId && input.selectedRoomCategoryId && supplement.roomCategoryId !== input.selectedRoomCategoryId) {
      return false;
    }
    if (supplement.isMandatory === true || supplement.isSelected === true) {
      return true;
    }

    const type = String(supplement.type || supplement.label || '').trim().toUpperCase();
    const requestedMealPlan = String(input.selectedMealPlan || '').trim().toUpperCase();
    const baseMealPlan = String(input.baseMealPlan || '').trim().toUpperCase();
    const isHbSupplement = ['MEAL_SUPPLEMENT', 'EXTRA_DINNER', 'HB', 'HALF_BOARD'].includes(type);
    const isFbSupplement = ['FB', 'FULL_BOARD'].includes(type);
    if (requestedMealPlan === baseMealPlan) {
      return false;
    }
    return (requestedMealPlan === 'HB' && baseMealPlan === 'BB' && isHbSupplement) || (requestedMealPlan === 'FB' && baseMealPlan !== 'FB' && (isFbSupplement || isHbSupplement));
  }

  private resolveSell(totalCost: number, input: HotelPricingInput) {
    const explicitSell = optionalNumber(input.sellPrice);
    if (explicitSell !== null) {
      return roundMoney(explicitSell);
    }
    const markupAmount = optionalNumber(input.markupAmount);
    if (markupAmount !== null) {
      return roundMoney(totalCost + markupAmount);
    }
    const markupPercent = optionalNumber(input.markupPercent) ?? 0;
    return roundMoney(totalCost * (1 + markupPercent / 100));
  }

  private isKnownRateBasis(basis: string) {
    return [
      'PER_ROOM_NIGHT',
      'PER_PERSON_NIGHT',
      'PER_PERSON_IN_DBL_NIGHT',
      'SINGLE_ROOM_NIGHT',
      'SINGLE_SUPPLEMENT_ON_DBL',
      'TRIPLE_PERSON_NIGHT',
      'CHILD_RATE',
      'EXTRA_BED',
    ].includes(basis);
  }

  private isKnownSupplementBasis(basis: string) {
    return ['PER_PERSON_NIGHT', 'PER_ROOM_NIGHT', 'PER_NIGHT', 'PER_STAY', 'PER_CHILD_NIGHT', 'PER_SINGLE_ROOM_NIGHT'].includes(basis);
  }

  private rateLineKind(basis: string): HotelPricingBreakdownLine['kind'] {
    if (basis === 'SINGLE_SUPPLEMENT_ON_DBL') {
      return 'single_supplement';
    }
    if (basis === 'EXTRA_BED') {
      return 'extra_bed';
    }
    if (basis === 'CHILD_RATE') {
      return 'child_rate';
    }
    return this.isKnownRateBasis(basis) ? 'base' : 'review';
  }

  private supplementLineKind(supplement: HotelPricingSupplement): HotelPricingBreakdownLine['kind'] {
    const type = String(supplement.type || supplement.label || '').trim().toUpperCase();
    if (['MEAL_SUPPLEMENT', 'EXTRA_DINNER', 'HB', 'FB', 'HALF_BOARD', 'FULL_BOARD'].includes(type)) {
      return 'meal_supplement';
    }
    if (type === 'GALA_DINNER') {
      return 'mandatory_supplement';
    }
    if (type === 'EXTRA_BED') {
      return 'extra_bed';
    }
    if (type === 'CHILD_SUPPLEMENT') {
      return 'child_rate';
    }
    return supplement.isMandatory ? 'mandatory_supplement' : 'supplement';
  }

  private rateLabel(basis: string) {
    return basis
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private supplementLabel(supplement: HotelPricingSupplement) {
    return supplement.type || 'Supplement';
  }
}

function positive(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function nonNegative(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function isHotelPricingBreakdownLine(value: HotelPricingBreakdownLine | null): value is HotelPricingBreakdownLine {
  return value !== null;
}
