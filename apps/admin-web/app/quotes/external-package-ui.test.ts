import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildExternalPackagePayload,
  createEmptyExternalPackageFormState,
  EXTERNAL_PACKAGE_PRICING_BASIS_OPTIONS,
  getExternalPackageCalculatedCost,
  getExternalPackageClientLines,
  getExternalPackageInternalLines,
  getExternalPackagePricingBasisLabel,
  isExternalPackageCategory,
  validateExternalPackageFormState,
} from './[id]/external-package-ui';

describe('external package quote builder UI', () => {
  it('recognizes EXTERNAL_PACKAGE services and exposes the expected form fields', () => {
    const state = createEmptyExternalPackageFormState('JOD');

    assert.equal(isExternalPackageCategory('EXTERNAL_PACKAGE'), true);
    assert.equal(isExternalPackageCategory('External Package'), true);
    assert.deepEqual(Object.keys(state), [
      'country',
      'supplierName',
      'startDay',
      'endDay',
      'startDate',
      'endDate',
      'pricingBasis',
      'netCost',
      'currency',
      'includes',
      'excludes',
      'internalNotes',
      'clientDescription',
    ]);
    assert.equal(state.currency, 'JOD');
  });

  it('shows PER_PERSON and PER_GROUP pricing basis options with client-friendly labels', () => {
    assert.deepEqual(EXTERNAL_PACKAGE_PRICING_BASIS_OPTIONS, [
      { value: 'PER_PERSON', label: 'Per person' },
      { value: 'PER_GROUP', label: 'Per group' },
    ]);
    assert.equal(getExternalPackagePricingBasisLabel('PER_PERSON'), 'Per person');
    assert.equal(getExternalPackagePricingBasisLabel('PER_GROUP'), 'Per group');
  });

  it('builds a save payload that preserves all external package fields', () => {
    const payload = buildExternalPackagePayload({
      country: ' Egypt ',
      supplierName: ' Cairo Partner DMC ',
      startDay: '3',
      endDay: '5',
      startDate: '2026-06-03',
      endDate: '2026-06-05',
      pricingBasis: 'PER_PERSON',
      netCost: '250',
      currency: ' usd ',
      includes: ' Private touring ',
      excludes: ' International flights ',
      internalNotes: ' Net confirmed ',
      clientDescription: ' Cairo and Giza extension ',
    });

    assert.equal(payload.country, 'Egypt');
    assert.equal(payload.supplierName, 'Cairo Partner DMC');
    assert.equal(payload.startDay, 3);
    assert.equal(payload.endDay, 5);
    assert.match(String(payload.startDate), /^2026-06-03T/);
    assert.match(String(payload.endDate), /^2026-06-05T/);
    assert.equal(payload.pricingBasis, 'PER_PERSON');
    assert.equal(payload.netCost, 250);
    assert.equal(payload.currency, 'USD');
    assert.equal(payload.includes, 'Private touring');
    assert.equal(payload.excludes, 'International flights');
    assert.equal(payload.internalNotes, 'Net confirmed');
    assert.equal(payload.clientDescription, 'Cairo and Giza extension');
    assert.equal('hotelId' in payload, false);
    assert.equal('contractId' in payload, false);
  });

  it('builds edit payloads without dropping pricing data', () => {
    const payload = buildExternalPackagePayload({
      ...createEmptyExternalPackageFormState('EUR'),
      country: 'Israel',
      pricingBasis: 'PER_GROUP',
      netCost: '900',
      clientDescription: 'Updated partner program.',
    });

    assert.equal(payload.country, 'Israel');
    assert.equal(payload.pricingBasis, 'PER_GROUP');
    assert.equal(payload.netCost, 900);
    assert.equal(payload.currency, 'EUR');
    assert.equal(payload.clientDescription, 'Updated partner program.');
  });

  it('calculates builder preview cost for per-person and per-group packages', () => {
    assert.equal(getExternalPackageCalculatedCost({ pricingBasis: 'PER_PERSON', netCost: '250' }, 4), 1000);
    assert.equal(getExternalPackageCalculatedCost({ pricingBasis: 'PER_GROUP', netCost: '900' }, 4), 900);
    assert.equal(getExternalPackageCalculatedCost({ pricingBasis: 'PER_PERSON', netCost: 'not-a-number' }, 4), null);
  });

  it('validates required numeric date and pricing basis fields before save', () => {
    const invalid = validateExternalPackageFormState({
      country: '',
      supplierName: '',
      startDay: '5',
      endDay: '3',
      startDate: '2026-06-05',
      endDate: '2026-06-03',
      pricingBasis: 'BAD' as any,
      netCost: '',
      currency: '',
      includes: '',
      excludes: '',
      internalNotes: '',
      clientDescription: '',
    });

    assert.ok(invalid.includes('External package country is required.'));
    assert.ok(invalid.includes('External package pricing basis must be Per person or Per group.'));
    assert.ok(invalid.includes('External package net cost must be zero or greater.'));
    assert.ok(invalid.includes('External package currency is required.'));
    assert.ok(invalid.includes('External package client description is required.'));
    assert.ok(invalid.includes('External package end day cannot be before start day.'));
    assert.ok(invalid.includes('External package end date cannot be before start date.'));
  });

  it('flags invalid dates and negative net cost clearly', () => {
    const invalid = validateExternalPackageFormState({
      ...createEmptyExternalPackageFormState('USD'),
      country: 'Egypt',
      pricingBasis: 'PER_PERSON',
      netCost: '-1',
      startDate: 'bad-date',
      clientDescription: 'Cairo program.',
    });

    assert.ok(invalid.includes('External package net cost must be zero or greater.'));
    assert.ok(invalid.includes('External package start date is invalid.'));
  });

  it('keeps internal costing separate from client preview visibility', () => {
    const item = {
      externalPackageCountry: 'Egypt',
      externalSupplierName: 'Cairo Partner DMC',
      externalPricingBasis: 'PER_PERSON',
      externalNetCost: 250,
      externalInternalNotes: 'Net confirmed by supplier',
      externalClientDescription: 'Client-facing Cairo and Giza extension.',
      externalIncludes: 'Private touring',
      externalExcludes: 'International flights',
      currency: 'USD',
    };

    const internalText = getExternalPackageInternalLines(item).join('\n');
    const clientText = getExternalPackageClientLines(item).join('\n');

    assert.match(internalText, /Cairo Partner DMC/);
    assert.match(internalText, /USD 250\.00/);
    assert.match(internalText, /Net confirmed by supplier/);
    assert.match(clientText, /Client-facing Cairo and Giza extension/);
    assert.match(clientText, /Private touring/);
    assert.match(clientText, /International flights/);
    assert.doesNotMatch(clientText, /Cairo Partner DMC/);
    assert.doesNotMatch(clientText, /250/);
    assert.doesNotMatch(clientText, /Net confirmed/);
  });

  it('does not crash client preview helpers when optional package text is missing', () => {
    const item = {
      externalSupplierName: 'Internal Partner',
      externalNetCost: 900,
      externalInternalNotes: 'Internal only',
      externalClientDescription: 'Client-safe package description.',
      externalIncludes: null,
      externalExcludes: undefined,
      currency: 'USD',
    };

    assert.deepEqual(getExternalPackageClientLines(item), ['Client-safe package description.']);
    assert.doesNotThrow(() => getExternalPackageInternalLines(item));
    assert.doesNotMatch(getExternalPackageClientLines(item).join('\n'), /Internal Partner|900|Internal only/);
  });
});
