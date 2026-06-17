import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// P1 (proposal QA, Issue 11) — the footer rendered the website / email twice (footerLine
// previously appended the contact parts AND contactLine repeated them; contactLine also
// fell back to footerLine when empty). After the fix footerLine is the brand IDENTITY
// only and contactLine carries the contact parts exactly once, so neither footer span
// duplicates the other and the per-page running footer no longer echoes the contacts.

function baseQuote(extra: Record<string, unknown>) {
  return {
    id: 'q-footer',
    quoteCurrency: 'USD',
    title: 'Jordan Discovery',
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 1,
    adults: 2,
    children: 0,
    totalCost: 1000,
    totalSell: 1200,
    pricePerPax: 600,
    quoteOptions: [],
    itineraries: [{ id: 'd1', dayNumber: 1, title: 'Day 1: Amman' }],
    quoteItems: [
      {
        id: 'h-d1',
        itineraryId: 'd1',
        service: { name: 'Amman Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
        hotel: { name: 'Amman Hotel', city: 'Amman' },
        roomCategory: { name: 'Standard Room' },
        occupancyType: 'DBL',
        mealPlan: 'BB',
        pricingBasis: 'PER_ROOM',
        totalCost: 100,
        totalSell: 120,
      },
    ],
    ...extra,
  };
}

const WEBSITE = 'https://acme-dmc.example';
const EMAIL = 'hello@acme-dmc.example';
const PHONE = '+962 6 123 4567';

test('Issue 11: footerLine (brand only) does not repeat the website/email that live in contactLine', () => {
  const quote = baseQuote({
    brandCompany: { name: 'Acme DMC', branding: { name: 'Acme DMC', website: WEBSITE, email: EMAIL, phone: PHONE } },
  });
  const vm: any = mapQuoteToProposalV3(quote as any);

  // footerLine carries the brand identity but NOT the contact details.
  assert.doesNotMatch(vm.footerLine, /acme-dmc\.example/i, 'footerLine must not contain the website/email');
  // contactLine carries the contact details exactly once.
  assert.match(vm.contactLine, new RegExp(WEBSITE.replace(/[.]/g, '\\.'), 'i'));
  assert.match(vm.contactLine, new RegExp(EMAIL.replace(/[.]/g, '\\.'), 'i'));
  // The two spans are not identical (no duplicated line).
  assert.notEqual(vm.footerLine, vm.contactLine, 'footerLine and contactLine must differ');
  // The email appears exactly once across the two footer spans.
  const combined = `${vm.footerLine} ${vm.contactLine}`;
  assert.equal(combined.match(/hello@acme-dmc\.example/gi)?.length, 1, 'email appears exactly once');
});

test('Issue 11: with no contact details, contactLine is empty (does not duplicate footerLine)', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote({}) as any);
  assert.ok(vm.footerLine && vm.footerLine.trim().length > 0, 'footerLine is a non-empty brand line');
  assert.equal(vm.contactLine, '', 'contactLine is empty rather than echoing footerLine');
});

test('Issue 11: an explicit branding.footerText is still shown verbatim (no regression)', () => {
  const quote = baseQuote({
    brandCompany: { name: 'Acme DMC', branding: { name: 'Acme DMC', footerText: 'Acme DMC · Bespoke Jordan journeys', website: WEBSITE } },
  });
  const vm: any = mapQuoteToProposalV3(quote as any);
  assert.equal(vm.footerLine, 'Acme DMC · Bespoke Jordan journeys', 'explicit footer text wins');
  assert.match(vm.contactLine, new RegExp(WEBSITE.replace(/[.]/g, '\\.'), 'i'), 'contacts still in contactLine');
});
