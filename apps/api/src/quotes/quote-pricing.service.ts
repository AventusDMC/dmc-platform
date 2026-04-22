import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PricingSlabInputValue,
  PricingSlabValidationError,
  validatePricingSlabs,
} from './quote-pricing-validation';

export type QuotePricingMode = 'simple' | 'group';
export type QuotePricingPresentationMode = 'FIXED' | 'SLAB';
export type QuoteFocType = 'none' | 'ratio' | 'fixed';
export type QuoteFocRoomType = 'single' | 'double';

export type QuotePricingMatchedSlab = PricingSlabInputValue & {
  label: string;
  actualPax?: number;
  focPax?: number;
  payingPax?: number;
  totalCost?: number;
  totalSell?: number;
  pricePerPayingPax?: number;
  pricePerActualPax?: number | null;
};

export type QuotePricingSlabValue = PricingSlabInputValue & {
  actualPax?: number;
  focPax?: number;
  payingPax?: number;
  totalCost?: number;
  totalSell?: number;
  pricePerPayingPax?: number;
  pricePerActualPax?: number | null;
};

export type PriceComputationResult = {
  status: 'ok' | 'missing_coverage' | 'invalid_config';
  mode: QuotePricingMode;
  requestedPax: number;
  matchedSlab?: {
    minPax: number;
    maxPax: number | null;
    pricePerPayingPax: number;
    label: string;
    actualPax: number;
    focPax: number;
    payingPax: number;
    totalCost?: number;
    totalSell?: number;
    pricePerActualPax?: number | null;
  };
  totals?: {
    pricePerPayingPax?: number;
    pricePerActualPax?: number;
    totalPrice?: number;
    totalCost?: number;
    totalSell?: number;
    actualPax?: number;
    focPax?: number;
    payingPax?: number;
    focCount?: number;
    payablePax?: number;
    singleSupplement?: number;
  };
  display: {
    summaryLabel: string;
    summaryValue?: string | null;
    pricingText?: string;
    focText?: string;
    singleSupplementText?: string;
    slabLines?: Array<{ label: string; value: string; detail?: string; isSelected?: boolean }>;
    contextLines?: string[];
  };
  warnings: string[];
  errors?: PricingSlabValidationError[];
  foc?: {
    focType: QuoteFocType;
    focRatio: number | null;
    focCount: number | null;
    focRoomType: QuoteFocRoomType | null;
    resolvedFocCount: number;
    resolvedFocRoomType: QuoteFocRoomType | null;
    note: string | null;
  };
};

@Injectable()
export class QuotePricingService {
  validatePricingConfig(values: {
    mode: QuotePricingMode;
    pricingSlabs?: PricingSlabInputValue[] | null;
  }) {
    const errors = values.mode === 'group' ? validatePricingSlabs(values.pricingSlabs || []) : [];

    return {
      status: errors.length > 0 ? ('invalid_config' as const) : ('ok' as const),
      mode: values.mode,
      errors,
      warnings: [] as string[],
    };
  }

  assertValidPricingConfig(values: {
    mode: QuotePricingMode;
    pricingSlabs?: PricingSlabInputValue[] | null;
  }) {
    const validation = this.validatePricingConfig(values);

    if (validation.status === 'invalid_config') {
      throw new BadRequestException({
        code: 'QUOTE_PRICING_SLAB_VALIDATION_FAILED',
        message: 'Pricing slab validation failed.',
        errors: validation.errors,
      });
    }
  }

  resolveApplicableSlab(values: {
    mode: QuotePricingMode;
    requestedPax: number;
    pricingSlabs?: QuotePricingSlabValue[] | null;
    totalSell?: number | null;
    pricePerPax?: number | null;
  }) {
    const requestedPax = Math.max(1, values.requestedPax);
    const totals = {
      totalSell: values.totalSell ?? null,
      pricePerPax: values.pricePerPax ?? null,
    };

    if (values.mode === 'simple') {
      return {
        status: 'ok' as const,
        mode: values.mode,
        requestedPax,
        matchedSlab: null,
        totals,
        warnings: [] as string[],
        errors: [] as PricingSlabValidationError[],
      };
    }

    const validation = this.validatePricingConfig({
      mode: values.mode,
      pricingSlabs: values.pricingSlabs,
    });

    if (validation.status === 'invalid_config') {
      return {
        status: 'invalid_config' as const,
        mode: values.mode,
        requestedPax,
        matchedSlab: null,
        totals,
        warnings: validation.errors.map((error) => error.message),
        errors: validation.errors,
      };
    }

    const matchedSlab =
      (values.pricingSlabs?.find((slab) => requestedPax >= slab.minPax && (slab.maxPax === null || requestedPax <= slab.maxPax)) as QuotePricingMatchedSlab | undefined) ||
      null;

    if (!matchedSlab) {
      return {
        status: 'missing_coverage' as const,
        mode: values.mode,
        requestedPax,
        matchedSlab: null,
        totals,
        warnings: ['Price unavailable for selected passenger count.'],
        errors: [] as PricingSlabValidationError[],
      };
    }

    return {
      status: 'ok' as const,
      mode: values.mode,
      requestedPax,
      matchedSlab: {
        ...matchedSlab,
        label: this.formatPricingSlabLabel(matchedSlab.minPax, matchedSlab.maxPax, matchedSlab.focPax ?? null),
      },
      totals,
      warnings: [] as string[],
      errors: [] as PricingSlabValidationError[],
    };
  }

  calculateFoc(values: {
    adults: number;
    children: number;
    focType?: string | null;
    focRatio?: number | null;
    focCount?: number | null;
    focRoomType?: string | null;
  }) {
    const totalPax = Math.max(0, values.adults + values.children);
    const focType = this.normalizeQuoteFocType(values.focType);
    const focRoomType = this.normalizeQuoteFocRoomType(values.focRoomType);

    if (focType === 'ratio') {
      const ratio = values.focRatio && values.focRatio > 0 ? values.focRatio : null;
      const resolvedFocCount = ratio ? Math.floor(totalPax / ratio) : 0;
      return {
        focType,
        focRatio: ratio,
        focCount: null,
        focRoomType,
        resolvedFocCount,
        resolvedFocRoomType: focRoomType,
        note:
          ratio && resolvedFocCount
            ? `${resolvedFocCount} complimentary place${resolvedFocCount === 1 ? '' : 's'} in ${this.formatFocRoomType(focRoomType)} based on ${Math.min(
                totalPax,
                Math.floor(resolvedFocCount * ratio),
              )} paying guests (1 complimentary place per ${ratio} paying guests).`
            : null,
      };
    }

    if (focType === 'fixed') {
      const count = Math.max(0, Math.floor(values.focCount ?? 0));
      return {
        focType,
        focRatio: null,
        focCount: count,
        focRoomType,
        resolvedFocCount: count,
        resolvedFocRoomType: focRoomType,
        note: count
          ? `${count} complimentary place${count === 1 ? '' : 's'} in ${this.formatFocRoomType(focRoomType)}.`
          : null,
      };
    }

    return {
      focType: 'none' as QuoteFocType,
      focRatio: null,
      focCount: null,
      focRoomType: null,
      resolvedFocCount: 0,
      resolvedFocRoomType: null,
      note: null,
    };
  }

  calculateSingleSupplement(values: { singleSupplement?: number | null; currency?: string }) {
    const amount = values.singleSupplement ?? null;

    return {
      amount,
      note:
        amount !== null
          ? `Single supplement: ${this.formatMoney(amount, values.currency)} per person`
          : 'Single supplement available on request',
    };
  }

  buildClientPricingLines(values: {
    pricingMode?: QuotePricingPresentationMode | string | null;
    pricingType?: string | null;
    pricingSlabs?: QuotePricingSlabValue[] | null;
    totalCost?: number | null;
    adults: number;
    children: number;
    totalSell?: number | null;
    pricePerPax?: number | null;
    fixedPricePerPerson?: number | null;
    singleSupplement?: number | null;
    focType?: string | null;
    focRatio?: number | null;
    focCount?: number | null;
    focRoomType?: string | null;
    currency?: string;
  }) {
    const mode = this.resolvePricingMode(values);
    const requestedPax = Math.max(1, values.adults + values.children);
    const slabResolution = this.resolveApplicableSlab({
      mode,
      requestedPax,
      pricingSlabs: values.pricingSlabs,
      totalSell: values.totalSell ?? null,
      pricePerPax: this.getEffectiveFixedPrice(values),
    });
    const foc = this.calculateFoc(values);
    const singleSupplement = this.calculateSingleSupplement({
      singleSupplement: values.singleSupplement ?? null,
      currency: values.currency,
    });

    if (mode === 'group') {
      const matchedSlab = slabResolution.matchedSlab
        ? {
            minPax: slabResolution.matchedSlab.minPax,
            maxPax: slabResolution.matchedSlab.maxPax,
            pricePerPayingPax: slabResolution.matchedSlab.pricePerPayingPax ?? slabResolution.matchedSlab.price,
            label: slabResolution.matchedSlab.label,
            actualPax: slabResolution.matchedSlab.actualPax ?? requestedPax,
            focPax: slabResolution.matchedSlab.focPax ?? foc.resolvedFocCount,
            payingPax:
              slabResolution.matchedSlab.payingPax ?? Math.max(requestedPax - foc.resolvedFocCount, 0),
            totalCost: slabResolution.matchedSlab.totalCost ?? values.totalCost ?? undefined,
            totalSell:
              slabResolution.matchedSlab.totalSell ??
              Number(
                (((slabResolution.matchedSlab.pricePerPayingPax ?? slabResolution.matchedSlab.price) *
                  Math.max(requestedPax - foc.resolvedFocCount, 0))).toFixed(2),
              ),
            pricePerActualPax:
              slabResolution.matchedSlab.pricePerActualPax ??
              (requestedPax > 0
                ? Number(
                    ((((slabResolution.matchedSlab.pricePerPayingPax ?? slabResolution.matchedSlab.price) *
                      Math.max(requestedPax - foc.resolvedFocCount, 0)) /
                      requestedPax)).toFixed(2),
                  )
                : null),
          }
        : undefined;

      return {
        summaryLabel: 'Group pricing',
        summaryValue: matchedSlab ? this.formatMoney(matchedSlab.pricePerPayingPax, values.currency) : null,
        pricingText: matchedSlab
          ? `${this.formatMoney(matchedSlab.pricePerPayingPax, values.currency)} per paying pax for ${matchedSlab.label}.`
          : 'Price unavailable for selected passenger count.',
        focText: foc.note || undefined,
        singleSupplementText: singleSupplement.note,
        slabLines: (values.pricingSlabs || []).map((slab) => ({
          label: this.formatPricingSlabLabel(slab.minPax, slab.maxPax, slab.focPax ?? 0),
          value: this.formatMoney((slab as QuotePricingMatchedSlab).pricePerPayingPax ?? slab.price, values.currency),
          detail: this.buildSlabDetailLine(
            {
              actualPax: (slab as QuotePricingMatchedSlab).actualPax ?? Math.max(1, slab.minPax),
              focPax: (slab as QuotePricingMatchedSlab).focPax ?? 0,
              payingPax: (slab as QuotePricingMatchedSlab).payingPax ?? Math.max(1, slab.minPax),
              totalCost: (slab as QuotePricingMatchedSlab).totalCost ?? 0,
              totalSell:
                (slab as QuotePricingMatchedSlab).totalSell ??
                Number((((slab as QuotePricingMatchedSlab).pricePerPayingPax ?? slab.price) * Math.max(1, slab.minPax)).toFixed(2)),
              pricePerActualPax: (slab as QuotePricingMatchedSlab).pricePerActualPax ?? null,
            },
            values.currency,
          ) + (slab.notes ? ` | ${slab.notes}` : ''),
          isSelected: matchedSlab ? slab.minPax === matchedSlab.minPax && slab.maxPax === matchedSlab.maxPax : false,
        })),
        contextLines: [
          ...(matchedSlab ? [`Based on ${matchedSlab.label} bracket`] : []),
          ...(matchedSlab
            ? [
                `Selected group size: ${requestedPax} actual pax, ${matchedSlab.focPax} FOC, ${matchedSlab.payingPax} paying pax`,
                `Total sell ${this.formatMoney(matchedSlab.totalSell ?? 0, values.currency)}${matchedSlab.totalCost !== undefined ? ` | Total cost ${this.formatMoney(matchedSlab.totalCost, values.currency)}` : ''}`,
              ]
            : []),
          'Accommodation in double/twin sharing room',
        ],
      };
    }

    return {
      summaryLabel: 'Fixed price',
      summaryValue: this.getEffectiveFixedPrice(values) === null ? null : this.formatMoney(this.getEffectiveFixedPrice(values)!, values.currency),
      pricingText:
        this.getEffectiveFixedPrice(values) === null
          ? undefined
          : `${this.formatMoney(this.getEffectiveFixedPrice(values)!, values.currency)} per person.`,
      focText: foc.note || undefined,
      singleSupplementText: singleSupplement.note,
      contextLines: [`Based on ${requestedPax} guest${requestedPax === 1 ? '' : 's'} sharing`, 'Accommodation in double/twin sharing room'],
    };
  }

  computePriceResult(values: {
    pricingMode?: QuotePricingPresentationMode | string | null;
    pricingType?: string | null;
    pricingSlabs?: QuotePricingSlabValue[] | null;
    totalCost?: number | null;
    adults: number;
    children: number;
    totalSell?: number | null;
    pricePerPax?: number | null;
    fixedPricePerPerson?: number | null;
    singleSupplement?: number | null;
    focType?: string | null;
    focRatio?: number | null;
    focCount?: number | null;
    focRoomType?: string | null;
    currency?: string;
  }): PriceComputationResult {
    const mode = this.resolvePricingMode(values);
    const requestedPax = Math.max(1, values.adults + values.children);
    const slabResolution = this.resolveApplicableSlab({
      mode,
      requestedPax,
      pricingSlabs: values.pricingSlabs,
      totalSell: values.totalSell ?? null,
      pricePerPax: this.getEffectiveFixedPrice(values),
    });
    const foc = this.calculateFoc(values);
    const display = this.buildClientPricingLines(values);

    const actualPax = requestedPax;
    const focPax = foc.resolvedFocCount;
    const payingPax = Math.max(actualPax - focPax, 0);
    const pricePerPayingPax =
      mode === 'group'
        ? (slabResolution.matchedSlab?.pricePerPayingPax ?? slabResolution.matchedSlab?.price) ?? undefined
        : this.getEffectiveFixedPrice(values) ?? undefined;
    const totalCost = mode === 'group' ? values.totalCost ?? undefined : undefined;
    const totalPrice =
      mode === 'group'
        ? slabResolution.matchedSlab
          ? Number((pricePerPayingPax! * payingPax).toFixed(2))
          : undefined
        : pricePerPayingPax !== undefined
          ? Number((pricePerPayingPax * requestedPax).toFixed(2))
          : undefined;
    const pricePerActualPax =
      mode === 'group' && totalPrice !== undefined && actualPax > 0 ? Number((totalPrice / actualPax).toFixed(2)) : undefined;

    return {
      status: slabResolution.status,
      mode,
      requestedPax,
      matchedSlab: slabResolution.matchedSlab
        ? {
            minPax: slabResolution.matchedSlab.minPax,
            maxPax: slabResolution.matchedSlab.maxPax,
            pricePerPayingPax: slabResolution.matchedSlab.pricePerPayingPax ?? slabResolution.matchedSlab.price,
            label: slabResolution.matchedSlab.label,
            actualPax,
            focPax,
            payingPax,
            totalCost,
            totalSell: totalPrice,
            pricePerActualPax,
          }
        : undefined,
      totals: {
        ...(pricePerPayingPax === undefined ? {} : { pricePerPayingPax }),
        ...(pricePerActualPax === undefined ? {} : { pricePerActualPax }),
        ...(totalPrice === undefined ? {} : { totalPrice }),
        ...(totalCost === undefined ? {} : { totalCost }),
        ...(totalPrice === undefined ? {} : { totalSell: totalPrice }),
        ...(mode === 'group' ? { actualPax, focPax, payingPax } : {}),
        ...(foc.resolvedFocCount ? { focCount: foc.resolvedFocCount } : {}),
        ...(requestedPax - foc.resolvedFocCount >= 0 ? { payablePax: Math.max(requestedPax - foc.resolvedFocCount, 0) } : {}),
        ...(values.singleSupplement === null || values.singleSupplement === undefined
          ? {}
          : { singleSupplement: values.singleSupplement }),
      },
      display,
      warnings: [...slabResolution.warnings],
      ...(slabResolution.errors.length > 0 ? { errors: slabResolution.errors } : {}),
      foc,
    };
  }

  formatPricingSlabLabel(minPax: number, maxPax: number | null, focPax?: number | null) {
    const rangeLabel =
      maxPax === null ? `${minPax}+ guests` : minPax === maxPax ? `${minPax} guest${minPax === 1 ? '' : 's'}` : `${minPax}\u2013${maxPax} guests`;
    return focPax && focPax > 0 ? `${rangeLabel} + ${focPax} FOC` : rangeLabel;
  }

  private normalizeQuoteFocType(value: string | undefined | null): QuoteFocType {
    if (value === 'ratio') {
      return 'ratio';
    }

    if (value === 'fixed' || value === 'manual') {
      return 'fixed';
    }

    return 'none';
  }

  private resolvePricingMode(values: {
    pricingMode?: QuotePricingPresentationMode | string | null;
    pricingType?: string | null;
  }): QuotePricingMode {
    if (values.pricingMode === 'SLAB') {
      return 'group';
    }

    if (values.pricingMode === 'FIXED') {
      return 'simple';
    }

    return values.pricingType === 'group' ? 'group' : 'simple';
  }

  private getEffectiveFixedPrice(values: { fixedPricePerPerson?: number | null; pricePerPax?: number | null }) {
    if (values.fixedPricePerPerson !== undefined && values.fixedPricePerPerson !== null) {
      return values.fixedPricePerPerson;
    }

    return values.pricePerPax ?? null;
  }

  private normalizeQuoteFocRoomType(value: string | undefined | null): QuoteFocRoomType | null {
    return value === 'single' || value === 'double' ? value : null;
  }

  private formatFocRoomType(value: string | null | undefined) {
    return value === 'single' ? 'single room' : value === 'double' ? 'double room' : 'room';
  }

  private buildSlabDetailLine(
    values: {
      actualPax: number;
      focPax: number;
      payingPax: number;
      totalCost: number;
      totalSell: number;
      pricePerActualPax?: number | null;
    },
    currency = 'USD',
  ) {
    const parts = [
      `${values.actualPax} actual`,
      `${values.focPax} FOC`,
      `${values.payingPax} paying`,
      `sell ${this.formatMoney(values.totalSell, currency)}`,
      `cost ${this.formatMoney(values.totalCost, currency)}`,
    ];

    if (values.pricePerActualPax !== null && values.pricePerActualPax !== undefined) {
      parts.push(`${this.formatMoney(values.pricePerActualPax, currency)} per actual pax`);
    }

    return parts.join(' | ');
  }

  private formatMoney(amount: number, currency = 'USD') {
    const formattedAmount = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);

    return `${currency} ${formattedAmount}`;
  }
}
