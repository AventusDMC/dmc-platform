import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { ProposalV3Service } from './proposal-v3.service';

function createPdfQuote(overrides: Record<string, any> = {}) {
  return {
    id: 'quote-1',
    quoteNumber: 'Q-2026-0001',
    quoteCurrency: 'USD',
    title: 'Jordan Family Journey',
    description: 'Family quote',
    inclusionsText: null,
    exclusionsText: null,
    termsNotesText: null,
    createdAt: new Date('2026-04-27T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 2,
    adults: 2,
    children: 1,
    totalCost: 450,
    totalSell: 540,
    pricePerPax: 180,
    quoteOptions: [],
    itineraries: [
      {
        id: 'day-1',
        dayNumber: 1,
        title: 'Day 1: Amman',
        description: 'Arrival and overnight in Amman.',
      },
    ],
    quoteItems: [
      createHotelPdfItem(),
    ],
    ...overrides,
  };
}

function createHotelPdfItem(overrides: Record<string, any> = {}) {
  return {
    id: 'item-1',
    itineraryId: 'day-1',
    serviceDate: new Date('2026-06-01T00:00:00.000Z'),
    service: {
      name: 'Grand Petra Hotel',
      category: 'Hotel',
      serviceType: { name: 'Hotel', code: 'HOTEL' },
    },
    hotel: { name: 'Grand Petra Hotel', city: 'Amman' },
    contract: { name: 'Grand Petra 2026' },
    roomCategory: { name: 'Deluxe' },
    occupancyType: 'DBL',
    mealPlan: 'BB',
    pricingBasis: 'PER_PERSON',
    ratePolicies: [{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 5 }],
    supplements: [],
    totalCost: 450,
    totalSell: 540,
    ...overrides,
  };
}

function createExternalPackagePdfItem(overrides: Record<string, any> = {}) {
  return {
    id: 'external-item-1',
    itineraryId: null,
    serviceDate: new Date('2026-06-03T00:00:00.000Z'),
    service: {
      name: 'External DMC Package',
      category: 'External Package',
      serviceType: { name: 'External Package', code: 'EXTERNAL_PACKAGE' },
    },
    externalPackageCountry: 'Egypt',
    externalSupplierName: 'Cairo Partner DMC',
    externalStartDay: 3,
    externalEndDay: 6,
    externalStartDate: new Date('2026-06-03T00:00:00.000Z'),
    externalEndDate: new Date('2026-06-06T00:00:00.000Z'),
    externalPricingBasis: 'PER_PERSON',
    externalNetCost: 250,
    externalIncludes: 'Private touring and local transfers',
    externalExcludes: 'International flights',
    externalInternalNotes: 'Net cost confirmed by partner',
    externalClientDescription: 'A private Cairo and Giza extension with partner DMC support.',
    pricingDescription: 'Egypt external package | per person',
    totalCost: 1000,
    totalSell: 1200,
    ...overrides,
  };
}

function createTransportPdfItem(overrides: Record<string, any> = {}) {
  return {
    id: 'transport-item-1',
    itineraryId: 'day-1',
    serviceDate: new Date('2026-06-01T10:00:00.000Z'),
    service: {
      name: 'Private arrival transfer',
      category: 'Transport',
      serviceType: { name: 'Transport', code: 'TRANSPORT' },
      supplierId: 'supplier-company-1',
    },
    appliedVehicleRate: {
      routeName: 'QAIA to Petra',
      price: 120,
      currency: 'USD',
      vehicle: {
        id: 'vehicle-1',
        name: 'Mercedes Vito',
        supplierId: 'supplier-company-1',
        supplierName: 'Independent Transport Supplier',
      },
      serviceType: { name: 'Transfer', code: 'TRANSFER' },
    },
    pricingDescription: 'QAIA to Petra | Mercedes Vito | Per vehicle',
    totalCost: 120,
    totalSell: 165,
    ...overrides,
  };
}

function createActivityPdfItem(overrides: Record<string, any> = {}) {
  return {
    id: 'activity-item-1',
    itineraryId: 'day-1',
    serviceDate: new Date('2026-06-01T20:30:00.000Z'),
    startTime: '20:30',
    pickupTime: '19:45',
    pickupLocation: 'Hotel lobby',
    meetingPoint: 'Visitor center',
    participantCount: 4,
    adultCount: 3,
    childCount: 1,
    service: {
      name: 'Petra by Night',
      category: 'Activity',
      supplierId: 'supplier-company-1',
      supplierName: 'Hidden Activity Supplier',
      serviceType: { name: 'Activity', code: 'ACTIVITY' },
    },
    pricingDescription: 'Petra by Night guided experience',
    costBaseAmount: 35,
    costCurrency: 'USD',
    totalCost: 140,
    totalSell: 210,
    ...overrides,
  };
}

test('proposal PDF export shows persisted hotel pricing basis labels', () => {
  const perPerson = mapQuoteToProposalV3(createPdfQuote());
  const perRoom = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [createHotelPdfItem({ pricingBasis: 'PER_ROOM' })],
    }),
  );

  assert.ok(perPerson.investment.noteLines.includes('Grand Petra Hotel rate basis: per person/night'));
  assert.ok(perRoom.investment.noteLines.includes('Grand Petra Hotel rate basis: per room/night'));
});

test('proposal PDF export renders child policies with safe fallback', () => {
  const free = mapQuoteToProposalV3(createPdfQuote());
  const discount = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [createHotelPdfItem({ ratePolicies: [{ policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 }] })],
    }),
  );
  const missing = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [createHotelPdfItem({ ratePolicies: undefined })],
    }),
  );

  assert.ok(free.investment.noteLines.includes('Child policy: Children 0-5 free'));
  assert.ok(discount.investment.noteLines.includes('Child policy: Children 6-11 pay 50%'));
  assert.ok(missing.investment.noteLines.includes('Child policy: No child policy available'));
});

test('proposal PDF export renders selected supplement labels and basis distinctly', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [
        createHotelPdfItem({
          supplements: [
            { type: 'GALA_DINNER', amount: 50, currency: 'USD', chargeBasis: 'PER_PERSON' },
            { type: 'EXTRA_DINNER', amount: 20, currency: 'USD', chargeBasis: 'PER_ROOM' },
            { type: 'EXTRA_BED', amount: 30, currency: 'USD', chargeBasis: 'PER_STAY' },
          ],
        }),
      ],
    }),
  );
  const supplementsLine = proposal.investment.noteLines.find((line) => line.startsWith('Supplements:')) || '';

  assert.match(supplementsLine, /Gala Dinner \$50\.00 per person/);
  assert.match(supplementsLine, /Extra Dinner \$20\.00 per room/);
  assert.match(supplementsLine, /Extra Bed \$30\.00 one-time/);
});

test('proposal PDF export renders external package client content and hides supplier net internal fields', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [createExternalPackagePdfItem()],
      itineraries: [],
      totalCost: 1000,
      totalSell: 1200,
      pricePerPax: 300,
    }),
  );
  const renderedText = JSON.stringify(proposal);

  assert.match(renderedText, /private Cairo and Giza extension/i);
  assert.match(renderedText, /Private touring and local transfers/i);
  assert.match(renderedText, /International flights/i);
  assert.match(renderedText, /Partner Package/);
  assert.doesNotMatch(renderedText, /Cairo Partner DMC/);
  assert.doesNotMatch(renderedText, /Net cost confirmed/);
  assert.doesNotMatch(renderedText, /externalNetCost/);
});

test('proposal PDF export tolerates missing optional external package text and still hides internal fields', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [
        createExternalPackagePdfItem({
          externalSupplierName: 'Malformed Partner Supplier',
          externalIncludes: null,
          externalExcludes: undefined,
          externalInternalNotes: 'Malformed net notes should stay internal',
          externalClientDescription: 'Client-safe partner package copy.',
          externalNetCost: 777,
        }),
      ],
      itineraries: [],
      totalCost: 999,
      totalSell: 1200,
    }),
  );
  const renderedText = JSON.stringify(proposal);

  assert.match(renderedText, /Client-safe partner package copy/);
  assert.doesNotMatch(renderedText, /Malformed Partner Supplier/);
  assert.doesNotMatch(renderedText, /Malformed net notes/);
  assert.doesNotMatch(renderedText, /externalNetCost/);
  assert.doesNotMatch(renderedText, /777/);
});

test('proposal PDF export shows external package totals in quote currency without supplier currency leakage', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteCurrency: 'EUR',
      quoteItems: [
        createExternalPackagePdfItem({
          externalSupplierName: 'Cairo USD Supplier',
          externalNetCost: 100,
          externalInternalNotes: 'USD net cost held internally',
          externalClientDescription: 'Client-safe Egypt extension priced in the proposal currency.',
          externalIncludes: 'Private touring and transfers',
          externalExcludes: 'Flights',
          totalCost: 370.37,
          totalSell: 407.41,
        }),
      ],
      itineraries: [],
      totalCost: 370.37,
      totalSell: 407.41,
      pricePerPax: 101.85,
    }),
  );
  const renderedText = JSON.stringify(proposal);

  assert.equal(proposal.pricingHighlightCurrency, 'EUR');
  assert.ok(proposal.pricingHighlightTotal.includes('407.41'));
  assert.ok(proposal.investment.noteLines.some((line) => line.includes('PDF sell total:') && line.includes('407.41')));
  assert.match(renderedText, /Client-safe Egypt extension priced in the proposal currency/);
  assert.match(renderedText, /Private touring and transfers/);
  assert.doesNotMatch(renderedText, /Cairo USD Supplier/);
  assert.doesNotMatch(renderedText, /USD net cost/);
  assert.doesNotMatch(renderedText, /externalNetCost/);
  assert.doesNotMatch(renderedText, /100 USD|USD 100/);
});

test('proposal PDF export shows transport sell context without leaking supplier company or net fields', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [createTransportPdfItem()],
      totalCost: 120,
      totalSell: 165,
      pricePerPax: 55,
    }),
  );
  const renderedText = JSON.stringify(proposal);

  assert.match(renderedText, /QAIA to Petra/);
  assert.match(renderedText, /165/);
  assert.doesNotMatch(renderedText, /Independent Transport Supplier/);
  assert.doesNotMatch(renderedText, /supplier-company-1/);
  assert.doesNotMatch(renderedText, /supplierCost|netCost|baseCost/i);
});

test('proposal PDF export shows activity details without leaking supplier cost', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [createActivityPdfItem()],
      totalCost: 140,
      totalSell: 210,
      pricePerPax: 52.5,
    }),
  );
  const renderedText = JSON.stringify(proposal);

  assert.match(renderedText, /Petra by Night/);
  assert.match(renderedText, /210/);
  assert.doesNotMatch(renderedText, /Hidden Activity Supplier/);
  assert.doesNotMatch(renderedText, /supplier-company-1/);
  assert.doesNotMatch(renderedText, /costBaseAmount|costCurrency|supplierCost|netCost|baseCost/i);
  assert.doesNotMatch(renderedText, /\b35\b/);
});

test('proposal renders own-operation and external package days as one continuous client itinerary', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Jordan Israel Egypt Journey',
      nightCount: 6,
      totalCost: 2800,
      totalSell: 3300,
      pricePerPax: 825,
      itineraries: [
        {
          id: 'day-1',
          dayNumber: 1,
          title: 'Day 1: Amman',
          description: 'Arrival in Jordan and overnight in Amman.',
        },
        {
          id: 'day-2',
          dayNumber: 2,
          title: 'Day 2: Petra',
          description: 'Visit Petra with private touring.',
        },
      ],
      quoteItems: [
        createHotelPdfItem({
          id: 'jordan-hotel',
          itineraryId: 'day-1',
          hotel: { name: 'Amman Boutique Hotel', city: 'Amman' },
          totalCost: 600,
          totalSell: 720,
        }),
        createExternalPackagePdfItem({
          id: 'israel-package',
          externalPackageCountry: 'Israel',
          externalSupplierName: 'Tel Aviv Partner DMC',
          externalStartDay: 3,
          externalEndDay: 4,
          externalClientDescription: 'Private touring through Jerusalem and Tel Aviv.',
          externalIncludes: 'Guide, touring, and local transfers',
          externalExcludes: 'Border fees',
          externalInternalNotes: 'Partner margin approved internally',
          externalNetCost: 1200,
          totalCost: 1200,
          totalSell: 1380,
        }),
        createExternalPackagePdfItem({
          id: 'egypt-package',
          externalPackageCountry: 'Egypt',
          externalSupplierName: 'Cairo Partner DMC',
          externalStartDay: 5,
          externalEndDay: 7,
          externalClientDescription: 'Cairo and Giza extension with a Nile-side hotel or similar.',
          externalIncludes: 'Pyramids touring and airport transfers',
          externalExcludes: 'International flights',
          externalInternalNotes: 'Do not expose net partner details',
          externalNetCost: 250,
          totalCost: 1000,
          totalSell: 1200,
        }),
      ],
    }),
  );
  const renderedText = JSON.stringify(proposal);

  assert.deepEqual(proposal.days.map((day) => day.dayNumber), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(proposal.days.map((day) => day.dayNumber)).size, 7);
  assert.match(renderedText, /Private touring through Jerusalem and Tel Aviv/);
  assert.match(renderedText, /Cairo and Giza extension with a Nile-side hotel or similar/);
  assert.match(renderedText, /Guide, touring, and local transfers/);
  assert.match(renderedText, /International flights/);
  assert.doesNotMatch(renderedText, /EXTERNAL_PACKAGE/);
  assert.doesNotMatch(renderedText, /Tel Aviv Partner DMC/);
  assert.doesNotMatch(renderedText, /Cairo Partner DMC/);
  assert.doesNotMatch(renderedText, /Do not expose net partner details/);
  assert.doesNotMatch(renderedText, /externalNetCost/);
  assert.equal(proposal.pricingHighlightTotal, '$3,300.00');
  assert.ok(proposal.investment.noteLines.includes('PDF sell total: $3,300.00'));
});

test('proposal renders Egypt-only external package without assuming hotel nights exist', async () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Egypt Private Extension',
      itineraries: [],
      quoteItems: [
        createExternalPackagePdfItem({
          externalStartDay: 1,
          externalEndDay: 3,
          externalClientDescription: 'A polished Cairo program with 5-star hotel or similar accommodation.',
          externalIncludes: 'Private guide, touring, and hotel display text',
          externalExcludes: 'Personal expenses',
          totalCost: 1000,
          totalSell: 1250,
        }),
      ],
      nightCount: 0,
      totalCost: 1000,
      totalSell: 1250,
      pricePerPax: 312.5,
    }),
  );
  const service = new ProposalV3Service({} as any);
  const html = await (service as any).renderHtml(proposal);

  assert.deepEqual(proposal.days.map((day) => day.dayNumber), [1, 2, 3]);
  assert.equal(proposal.accommodationRows.length, 0);
  assert.equal(proposal.totalDaysLabel, '3 itinerary days');
  assert.match(html, /A polished Cairo program with 5-star hotel or similar accommodation/);
  assert.match(html, /Private guide, touring, and hotel display text/);
  assert.match(html, /Personal expenses/);
  assert.match(html, /\$1,250\.00/);
  assert.doesNotMatch(html, /EXTERNAL_PACKAGE/);
  assert.doesNotMatch(html, /Cairo Partner DMC/);
  assert.doesNotMatch(html, /Net cost confirmed/);
  assert.doesNotMatch(html, /externalNetCost/);
});

test('proposal PDF export totals match quote totals, overrides, sell logic, and margin', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      totalCost: 150,
      totalSell: 180,
      quoteItems: [
        createHotelPdfItem({
          totalCost: 200,
          finalCost: 150,
          useOverride: true,
          markupPercent: 20,
          totalSell: 180,
        }),
      ],
    }),
  );

  assert.ok(proposal.investment.noteLines.includes('PDF total cost: $150.00'));
  assert.ok(proposal.investment.noteLines.includes('PDF sell total: $180.00'));
  assert.ok(proposal.investment.noteLines.includes('PDF margin: $30.00 (16.67%)'));
  assert.ok(proposal.investment.noteLines.includes('Manual finalCost override reflected in PDF totals.'));
});

test('proposal PDF export rounds cost, sell, margin, and margin percent consistently with quote summary', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      totalCost: 124.956,
      totalSell: 140.386,
      quoteItems: [
        createHotelPdfItem({
          totalCost: 124.956,
          totalSell: 140.386,
        }),
      ],
    }),
  );

  assert.ok(proposal.investment.noteLines.includes('PDF total cost: $124.96'));
  assert.ok(proposal.investment.noteLines.includes('PDF sell total: $140.39'));
  assert.ok(proposal.investment.noteLines.includes('PDF margin: $15.43 (10.99%)'));
});

test('proposal PDF export keeps tax and service charge notes aligned with calculated totals', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      totalCost: 127.6,
      totalSell: 159.5,
      quoteItems: [
        createHotelPdfItem({
          totalCost: 127.6,
          totalSell: 159.5,
          salesTaxPercent: 16,
          salesTaxIncluded: false,
          serviceChargePercent: 10,
          serviceChargeIncluded: false,
        }),
      ],
    }),
  );

  assert.ok(proposal.investment.noteLines.includes('PDF total cost: $127.60'));
  assert.ok(proposal.investment.noteLines.includes('PDF sell total: $159.50'));
  assert.ok(proposal.notes.some((line) => line === 'Applicable taxes are not included and may apply at 16%.'));
  assert.ok(proposal.notes.some((line) => line === 'Service charge is not included and may apply at 10% where applicable.'));
});

test('proposal PDF export marks included tax without changing manual finalCost override totals', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      totalCost: 120,
      totalSell: 150,
      quoteItems: [
        createHotelPdfItem({
          totalCost: 160,
          finalCost: 120,
          totalSell: 150,
          useOverride: true,
          salesTaxPercent: 16,
          salesTaxIncluded: true,
          serviceChargePercent: 10,
          serviceChargeIncluded: true,
        }),
      ],
    }),
  );

  assert.ok(proposal.investment.noteLines.includes('PDF total cost: $120.00'));
  assert.ok(proposal.investment.noteLines.includes('PDF sell total: $150.00'));
  assert.ok(proposal.investment.noteLines.includes('Manual finalCost override reflected in PDF totals.'));
  assert.ok(proposal.notes.some((line) => line === 'Applicable taxes are included at 16%.'));
  assert.ok(proposal.notes.some((line) => line === 'Service charge is included at 10% where applicable.'));
});

test('proposal PDF export uses quote currency for totals and supplement currency for supplement lines', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteCurrency: 'EUR',
      totalCost: 150,
      totalSell: 180,
      pricePerPax: 60,
      quoteItems: [
        createHotelPdfItem({
          supplements: [{ type: 'GALA_DINNER', amount: 30, currency: 'EUR', chargeBasis: 'PER_PERSON' }],
          totalCost: 150,
          totalSell: 180,
        }),
      ],
    }),
  );
  const supplementsLine = proposal.investment.noteLines.find((line) => line.startsWith('Supplements:')) || '';

  assert.ok(proposal.investment.noteLines.includes('PDF total cost: €150.00'));
  assert.ok(proposal.investment.noteLines.includes('PDF sell total: €180.00'));
  assert.ok(proposal.investment.noteLines.includes('PDF margin: €30.00 (16.67%)'));
  assert.match(supplementsLine, /Gala Dinner €30\.00 per person/);
  assert.doesNotMatch(proposal.investment.noteLines.join('\n'), /\$/);
});

test('proposal PDF export labels JOD supplement currency even when quote currency is EUR', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteCurrency: 'EUR',
      totalCost: 150,
      totalSell: 180,
      quoteItems: [
        createHotelPdfItem({
          supplements: [{ type: 'EXTRA_DINNER', amount: 20, currency: 'JOD', chargeBasis: 'PER_ROOM' }],
          totalCost: 150,
          totalSell: 180,
        }),
      ],
    }),
  );
  const supplementsLine = proposal.investment.noteLines.find((line) => line.startsWith('Supplements:')) || '';

  assert.match(supplementsLine, /Extra Dinner 20\.000 JD per room/);
  assert.ok(proposal.investment.noteLines.includes('PDF total cost: €150.00'));
});

test('proposal PDF export HTML contains the same consistency lines rendered to PDF', async () => {
  const proposal = mapQuoteToProposalV3(createPdfQuote());
  const service = new ProposalV3Service({} as any);
  const html = await (service as any).renderHtml(proposal);

  assert.match(html, /Grand Petra Hotel rate basis: per person\/night/);
  assert.match(html, /Child policy: Children 0-5 free/);
  assert.match(html, /PDF total cost: \$450\.00/);
  assert.match(html, /PDF sell total: \$540\.00/);
  assert.match(html, /PDF margin: \$90\.00 \(16\.67%\)/);
});
