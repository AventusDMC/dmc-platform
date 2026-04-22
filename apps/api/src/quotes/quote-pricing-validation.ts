import { BadRequestException } from '@nestjs/common';

export type PricingSlabInputValue = {
  id?: string;
  minPax: number;
  maxPax: number | null;
  price: number;
  focPax?: number | null;
  notes?: string | null;
};

export type PricingSlabValidationError = {
  code:
    | 'INVALID_MIN_PAX'
    | 'INVALID_MAX_PAX'
    | 'REVERSED_RANGE'
    | 'INVALID_PRICE'
    | 'INVALID_FOC'
    | 'UNSORTED'
    | 'OVERLAP'
    | 'OPEN_ENDED_NOT_LAST';
  path: string;
  message: string;
};

export function validatePricingSlabs(values: PricingSlabInputValue[]) {
  const errors: PricingSlabValidationError[] = [];

  for (const [index, slab] of values.entries()) {
    const row = index + 1;
    const minPax = Number(slab.minPax);
    const maxPax =
      slab.maxPax === null || slab.maxPax === undefined || slab.maxPax === ('' as unknown)
        ? null
        : Number(slab.maxPax);
    const price = Number(slab.price);
    const focPax = slab.focPax === null || slab.focPax === undefined ? 0 : Number(slab.focPax);

    if (!Number.isFinite(minPax) || minPax < 1 || !Number.isInteger(minPax)) {
      errors.push({
        code: 'INVALID_MIN_PAX',
        path: `pricingSlabs[${index}].minPax`,
        message: `Slab ${row} minimum passengers must be a whole number greater than zero.`,
      });
    }

    if (maxPax !== null && (!Number.isFinite(maxPax) || maxPax < 1 || !Number.isInteger(maxPax))) {
      errors.push({
        code: 'INVALID_MAX_PAX',
        path: `pricingSlabs[${index}].maxPax`,
        message: `Slab ${row} maximum passengers must be a whole number greater than zero.`,
      });
    }

    if (Number.isFinite(minPax) && maxPax !== null && Number.isFinite(maxPax) && minPax > maxPax) {
      errors.push({
        code: 'REVERSED_RANGE',
        path: `pricingSlabs[${index}]`,
        message: `Slab ${row} minimum passengers cannot be greater than maximum passengers.`,
      });
    }

    if (!Number.isFinite(price) || price < 0) {
      errors.push({
        code: 'INVALID_PRICE',
        path: `pricingSlabs[${index}].price`,
        message: `Slab ${row} price must be zero or greater.`,
      });
    }

    if (!Number.isFinite(focPax) || focPax < 0 || !Number.isInteger(focPax)) {
      errors.push({
        code: 'INVALID_FOC',
        path: `pricingSlabs[${index}].focPax`,
        message: `Slab ${row} FOC must be a whole number zero or greater.`,
      });
    } else {
      const smallestGroupSize = Number.isFinite(minPax) ? minPax : 0;
      if (smallestGroupSize > 0 && focPax >= smallestGroupSize) {
        errors.push({
          code: 'INVALID_FOC',
          path: `pricingSlabs[${index}].focPax`,
          message: `Slab ${row} FOC must be lower than the slab group size.`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return errors;
  }

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    const currentRow = index + 1;

    if (current.minPax < previous.minPax) {
      errors.push({
        code: 'UNSORTED',
        path: `pricingSlabs[${index}].minPax`,
        message: `Slabs must be sorted by minimum passengers. Slab ${currentRow} is out of order.`,
      });
    }

    if (previous.maxPax === null) {
      errors.push({
        code: 'OPEN_ENDED_NOT_LAST',
        path: `pricingSlabs[${index - 1}]`,
        message: `Open-ended slab ${index} must be the final slab.`,
      });
      continue;
    }

    if (current.minPax <= previous.maxPax) {
      errors.push({
        code: 'OVERLAP',
        path: `pricingSlabs[${index}]`,
        message: `Slab ${currentRow} overlaps the previous slab.`,
      });
    }
  }

  const openEndedIndex = values.findIndex((slab) => slab.maxPax === null);
  if (openEndedIndex !== -1 && openEndedIndex !== values.length - 1) {
    errors.push({
      code: 'OPEN_ENDED_NOT_LAST',
      path: `pricingSlabs[${openEndedIndex}]`,
      message: `Open-ended slab ${openEndedIndex + 1} must be the final slab.`,
    });
  }

  return errors;
}

export function assertValidPricingSlabs(values: PricingSlabInputValue[]) {
  const errors = validatePricingSlabs(values);

  if (errors.length > 0) {
    throw new BadRequestException({
      code: 'QUOTE_PRICING_SLAB_VALIDATION_FAILED',
      message: 'Pricing slab validation failed.',
      errors,
    });
  }
}
