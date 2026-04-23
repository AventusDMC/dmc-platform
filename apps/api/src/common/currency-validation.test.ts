import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { normalizeOptionalSupportedCurrency, requireSupportedCurrency } from './crud.helpers';

test('requireSupportedCurrency accepts USD, EUR, and JOD', () => {
  assert.equal(requireSupportedCurrency('USD', 'currency'), 'USD');
  assert.equal(requireSupportedCurrency('EUR', 'currency'), 'EUR');
  assert.equal(requireSupportedCurrency('JOD', 'currency'), 'JOD');
});

test('requireSupportedCurrency rejects invalid currency values', () => {
  for (const value of ['usd', 'EURO', 'JODD']) {
    assert.throws(
      () => requireSupportedCurrency(value, 'currency'),
      (error: unknown) => error instanceof BadRequestException && /USD, EUR, or JOD/.test(error.message),
    );
  }
});

test('normalizeOptionalSupportedCurrency preserves nullish values and validates real ones', () => {
  assert.equal(normalizeOptionalSupportedCurrency(undefined, 'currency'), undefined);
  assert.equal(normalizeOptionalSupportedCurrency(null, 'currency'), null);
  assert.equal(normalizeOptionalSupportedCurrency('USD', 'currency'), 'USD');
});
