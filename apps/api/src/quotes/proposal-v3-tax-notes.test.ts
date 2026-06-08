import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase O — the client proposal must not carry internal pricing-mechanics noise:
//  - no per-hotel "rate basis: per room/night" line
//  - tax/service-charge notes consolidated into ONE clean line (no per-item %)

function hotel(over: any = {}) {
  return {
    id: `h-${Math.round(over.totalSell ?? 100)}-${over.salesTaxPercent ?? 0}`,
    itineraryId: 'day-1',
    service: { name: over.name || 'Corp Amman Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
    hotel: { name: over.name || 'Corp Amman Hotel', city: 'Amman' },
    roomCategory: { name: 'Premium Room' },
    occupancyType: 'DBL',
    mealPlan: 'BB',
    pricingBasis: 'PER_ROOM',
    ratePolicies: [],
    supplements: [],
    totalCost: 100,
    totalSell: 120,
    ...over,
  };
}

function quote(items: any[]) {
  return {
    id: 'q-1',
    quoteCurrency: 'USD',
    title: 'Jordan Explorer',
    createdAt: new Date('2026-04-27T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 2,
    adults: 2,
    children: 0,
    totalCost: 200,
    totalSell: 240,
    pricePerPax: 120,
    quoteOptions: [],
    itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Day 1: Amman', description: 'Overnight in Amman.' }],
    quoteItems: items,
  };
}

function allNotes(vm: any): string[] {
  return [...(vm.investment?.noteLines || []), ...(vm.notes || []), ...(vm.investment?.basisLines || [])];
}

test('no per-hotel rate-basis line is surfaced (per room or per person)', () => {
  const vm: any = mapQuoteToProposalV3(quote([hotel({ pricingBasis: 'PER_ROOM' }), hotel({ name: 'Petra Moon Hotel', pricingBasis: 'PER_PERSON' })]) as any);
  assert.ok(!allNotes(vm).some((l) => /rate basis:/i.test(l)), 'no rate-basis bullet anywhere');
  assert.ok(!JSON.stringify(vm).includes('rate basis'), 'no "rate basis" text in the view model');
});

test('several hotels with different tax/service % collapse to ONE clean note (no percentages)', () => {
  const vm: any = mapQuoteToProposalV3(
    quote([
      hotel({ name: 'A', salesTaxPercent: 7, salesTaxIncluded: true, serviceChargePercent: 10, serviceChargeIncluded: true }),
      hotel({ name: 'B', salesTaxPercent: 8, salesTaxIncluded: true }),
      hotel({ name: 'C', salesTaxPercent: 5, salesTaxIncluded: true, serviceChargePercent: 10, serviceChargeIncluded: true }),
    ]) as any,
  );
  const notes: string[] = vm.notes || [];
  const consolidated = notes.filter((l) => /Taxes and service charges/.test(l));
  assert.equal(consolidated.length, 1, 'exactly one consolidated tax/service note');
  assert.equal(consolidated[0], 'Taxes and service charges are included where applicable.');
  assert.ok(!notes.some((l) => /\d+%/.test(l)), 'no percentage anywhere in the notes');
  assert.ok(!notes.some((l) => /Applicable taxes are|Service charge is/.test(l)), 'old per-item wording gone');
});

test('a not-included tax/service uses the "may apply" wording (still no %)', () => {
  const vm: any = mapQuoteToProposalV3(quote([hotel({ salesTaxPercent: 16, salesTaxIncluded: false, serviceChargePercent: 10, serviceChargeIncluded: false })]) as any);
  const notes: string[] = vm.notes || [];
  assert.ok(notes.includes('Taxes and service charges may apply where applicable.'));
  assert.ok(!notes.some((l) => /\d+%/.test(l)));
});

test('no tax/service note at all when no item carries a tax/service percentage', () => {
  const vm: any = mapQuoteToProposalV3(quote([hotel()]) as any);
  // The generic "government taxes…subject to change" disclaimer always renders;
  // assert specifically that the consolidated tax/service note is absent.
  assert.ok(!(vm.notes || []).some((l: string) => /Taxes and service charges/.test(l)), 'no consolidated tax/service note');
});

test('the consolidated note is localized (PT/ES/AR) — no English leak', () => {
  const items = [hotel({ salesTaxPercent: 7, salesTaxIncluded: true })];
  const pt: any = mapQuoteToProposalV3(quote(items) as any, 'pt');
  const es: any = mapQuoteToProposalV3(quote(items) as any, 'es');
  const ar: any = mapQuoteToProposalV3(quote(items) as any, 'ar');
  assert.ok((pt.notes || []).includes('Impostos e taxas de serviço estão incluídos quando aplicável.'));
  assert.ok((es.notes || []).includes('Los impuestos y cargos por servicio están incluidos cuando corresponda.'));
  assert.ok((ar.notes || []).includes('الضرائب ورسوم الخدمة مشمولة حيثما ينطبق.'));
  for (const vm of [pt, es, ar]) {
    assert.ok(!(vm.notes || []).some((l: string) => /Taxes and service charges/.test(l)), 'no English consolidated note leaks');
  }
});
