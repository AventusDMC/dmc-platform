import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRouteIntelligence, mapQuoteToProposalV3, parseTransportRouteSegments } from './proposal-v3.mapper';
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

function createGuidePdfItem(overrides: Record<string, any> = {}) {
  return {
    id: 'guide-item-1',
    itineraryId: 'day-1',
    serviceDate: new Date('2026-06-01T09:00:00.000Z'),
    service: {
      name: 'Licensed local guide',
      category: 'Guide',
      serviceType: { name: 'Guide', code: 'GUIDE' },
    },
    pricingDescription: 'Full-day guide service',
    totalCost: 100,
    totalSell: 150,
    ...overrides,
  };
}

function createMealPdfItem(overrides: Record<string, any> = {}) {
  return {
    id: 'meal-item-1',
    itineraryId: 'day-1',
    serviceDate: new Date('2026-06-01T13:00:00.000Z'),
    service: {
      name: 'Lunch at local restaurant',
      category: 'Meal',
      serviceType: { name: 'Meal', code: 'MEAL' },
    },
    pricingDescription: 'Set menu lunch',
    totalCost: 60,
    totalSell: 90,
    ...overrides,
  };
}

function createEntrancePdfItem(overrides: Record<string, any> = {}) {
  return {
    id: 'entrance-item-1',
    itineraryId: 'day-1',
    serviceDate: new Date('2026-06-01T11:00:00.000Z'),
    service: {
      name: 'Jerash Entrance Ticket',
      category: 'Entrance',
      serviceType: { name: 'Entrance', code: 'ENTRANCE' },
    },
    pricingDescription: 'Entrance tickets',
    totalCost: 40,
    totalSell: 70,
    ...overrides,
  };
}

function createPlannerDayItem(quoteService: Record<string, any>, overrides: Record<string, any> = {}) {
  return {
    id: `planner-item-${quoteService.id}`,
    dayId: 'planner-day-1',
    quoteServiceId: quoteService.id,
    sortOrder: 0,
    notes: null,
    isActive: true,
    quoteService,
    ...overrides,
  };
}

function createPlannerDay(overrides: Record<string, any> = {}) {
  return {
    id: 'planner-day-1',
    dayNumber: 1,
    title: 'Day 1: Amman',
    notes: 'Arrival and overnight in Amman.',
    sortOrder: 0,
    isActive: true,
    dayItems: [],
    ...overrides,
  };
}

function createHotelOptionSet(overrides: Record<string, any> = {}) {
  return {
    id: 'hotel-option-set-1',
    kind: 'HOTEL_OPTION_SET',
    name: '4 Star STD',
    notes: 'Client can select the preferred stay.',
    hotelOptions: [
      {
        id: 'hotel-option-1',
        city: 'Amman',
        hotelNameSnapshot: 'Amman Central Hotel',
        roomType: 'Standard Room',
        mealPlan: 'BB',
        mealPlanCode: 'BB',
        nights: 2,
        isPrimary: true,
        roomCategory: { name: 'Deluxe Room', code: 'DLX' },
        hotel: {
          name: 'Amman Central Hotel',
          city: 'Amman',
          factSheet: {
            shortDescription: 'A central Amman stay close to restaurants and galleries.',
            highlightsJson: ['Downtown location', 'Rooftop views'],
            amenitiesJson: ['Wi-Fi', 'Pool', 'Breakfast room'],
          },
        },
      },
    ],
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

test('proposal PDF export skips null quote items while preserving service rendering and external package detection', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [
        createHotelPdfItem(),
        null,
        createTransportPdfItem(),
        undefined,
        createActivityPdfItem(),
        createExternalPackagePdfItem(),
      ],
      totalCost: 1710,
      totalSell: 2115,
      pricePerPax: 705,
    }),
  );
  const renderedText = JSON.stringify(proposal);

  assert.equal(proposal.servicesCountLabel, '4 services');
  assert.match(renderedText, /Grand Petra Hotel/);
  assert.match(renderedText, /QAIA to Petra/);
  assert.match(renderedText, /Petra by Night/);
  assert.match(renderedText, /Partner Package/);
  assert.match(renderedText, /private Cairo and Giza extension/i);
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
  assert.ok(proposal.investment.noteLines.some((line) => line.includes('Total Package Price:') && line.includes('407.41')));
  assert.match(renderedText, /Client-safe Egypt extension priced in the proposal currency/);
  assert.match(renderedText, /Private touring and transfers/);
  assert.doesNotMatch(renderedText, /Cairo USD Supplier/);
  assert.doesNotMatch(renderedText, /USD net cost/);
  assert.doesNotMatch(renderedText, /externalNetCost/);
  assert.doesNotMatch(renderedText, /100 USD|USD 100/);
});

test('proposal V3 maps normalized hotel option sets with room categories and fact sheets', async () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [],
      quoteOptions: [createHotelOptionSet()],
    }),
  );
  const service = new ProposalV3Service({} as any);
  const accommodationHtml = (service as any).renderAccommodationRows(proposal);
  const hotelOptionsHtml = (service as any).renderHotelOptionSets(proposal);

  assert.equal(proposal.accommodationRows.length, 0);
  assert.equal(proposal.hotelOptionSets.length, 1);
  assert.equal(proposal.hotelOptionSets[0].name, '4 Star STD');
  assert.equal(proposal.hotelOptionSets[0].options[0].hotelName, 'Amman Central Hotel');
  assert.equal(proposal.hotelOptionSets[0].options[0].room, 'Deluxe Room');
  assert.equal(proposal.hotelOptionSets[0].options[0].mealPlan, 'BB');
  assert.equal(proposal.hotelOptionSets[0].options[0].nights, 2);
  assert.equal(proposal.hotelOptionSets[0].options[0].isPrimary, true);
  assert.deepEqual(proposal.hotelOptionSets[0].options[0].highlights, ['Downtown location', 'Rooftop views']);
  assert.deepEqual(proposal.hotelOptionSets[0].options[0].amenities, ['Wi-Fi', 'Pool', 'Breakfast room']);
  assert.match(accommodationHtml, /Hotel options are outlined below/);
  assert.doesNotMatch(accommodationHtml, /Accommodation details will be confirmed with the final operating revision/);
  assert.match(hotelOptionsHtml, /Accommodation Options/);
  assert.match(hotelOptionsHtml, /Recommended/);
  assert.match(hotelOptionsHtml, /Deluxe Room/);
  assert.match(hotelOptionsHtml, /A central Amman stay/);
  assert.match(hotelOptionsHtml, /Downtown location/);
  assert.match(hotelOptionsHtml, /Wi-Fi, Pool, Breakfast room/);
});

test('proposal V3 renders each hotel option row night count instead of total quote nights', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      nightCount: 7,
      quoteItems: [],
      quoteOptions: [
        createHotelOptionSet({
          hotelOptions: [
            {
              id: 'hotel-option-one-night',
              city: 'Amman',
              hotelNameSnapshot: 'Amman One Night Hotel',
              roomType: 'Standard Room',
              mealPlan: 'BB',
              mealPlanCode: 'BB',
              nights: 1,
              isPrimary: true,
              roomCategory: { name: 'Standard Room', code: 'STD' },
              hotel: null,
            },
            {
              id: 'hotel-option-three-nights',
              city: 'Petra',
              hotelNameSnapshot: 'Petra Three Night Hotel',
              roomType: 'Deluxe Room',
              mealPlan: 'HB',
              mealPlanCode: 'HB',
              nights: 3,
              isPrimary: false,
              roomCategory: { name: 'Deluxe Room', code: 'DLX' },
              hotel: null,
            },
          ],
        }),
      ],
    }),
  );
  const service = new ProposalV3Service({} as any);
  const hotelOptionsHtml = (service as any).renderHotelOptionSets(proposal);

  assert.equal(proposal.hotelOptionSets[0].options[0].nights, 1);
  assert.equal(proposal.hotelOptionSets[0].options[1].nights, 3);
  assert.match(hotelOptionsHtml, /Amman One Night Hotel/);
  assert.match(hotelOptionsHtml, /Amman[\s\S]*Standard Room[\s\S]*BB[\s\S]*1 night/);
  assert.match(hotelOptionsHtml, /Petra Three Night Hotel/);
  assert.match(hotelOptionsHtml, /Petra[\s\S]*Deluxe Room[\s\S]*HB[\s\S]*3 nights/);
  assert.doesNotMatch(hotelOptionsHtml, /7 nights/);
});

test('proposal V3 builds accommodation matrix grouped by city and option set', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [],
      quoteOptions: [
        createHotelOptionSet({
          id: 'set-std',
          name: '4 Star STD',
          hotelOptions: [
            {
              id: 'std-amman',
              city: 'Amman',
              hotelNameSnapshot: 'Amman Standard Hotel',
              roomType: 'Standard Room',
              mealPlan: 'BB',
              mealPlanCode: 'BB',
              nights: 2,
              isPrimary: true,
              roomCategory: { name: 'Standard Room', code: 'STD' },
              hotel: null,
            },
            {
              id: 'std-petra',
              city: 'Petra',
              hotelNameSnapshot: 'Petra Standard Hotel',
              roomType: 'Classic Room',
              mealPlan: 'HB',
              mealPlanCode: 'HB',
              nights: 1,
              isPrimary: true,
              roomCategory: null,
              hotel: null,
            },
          ],
        }),
        createHotelOptionSet({
          id: 'set-dlx',
          name: '4 Star DLX',
          hotelOptions: [
            {
              id: 'dlx-amman',
              city: 'Amman',
              hotelNameSnapshot: 'Amman Deluxe Hotel',
              roomType: 'Deluxe Room',
              mealPlan: 'BB',
              mealPlanCode: 'BB',
              nights: 2,
              isPrimary: true,
              roomCategory: { name: 'Deluxe Room', code: 'DLX' },
              hotel: null,
            },
            {
              id: 'dlx-petra',
              city: 'Petra',
              hotelNameSnapshot: 'Petra Deluxe Hotel',
              roomType: 'Junior Suite',
              mealPlan: 'HB',
              mealPlanCode: 'HB',
              nights: 1,
              isPrimary: true,
              roomCategory: null,
              hotel: null,
            },
          ],
        }),
      ],
    }),
  );
  const service = new ProposalV3Service({} as any);
  const hotelOptionsHtml = (service as any).renderHotelOptionSets(proposal);

  assert.ok(proposal.accommodationMatrix);
  assert.deepEqual(proposal.accommodationMatrix.optionSets.map((optionSet) => optionSet.name), ['4 Star STD', '4 Star DLX']);
  assert.deepEqual(proposal.accommodationMatrix.rows.map((row) => row.city), ['Amman', 'Petra']);
  assert.equal(proposal.accommodationMatrix.rows[0].cells[0].primaryHotel, 'Amman Standard Hotel');
  assert.equal(proposal.accommodationMatrix.rows[0].cells[1].primaryHotel, 'Amman Deluxe Hotel');
  assert.match(hotelOptionsHtml, /Accommodation Comparison/);
  assert.match(hotelOptionsHtml, /Amman Standard Hotel/);
  assert.match(hotelOptionsHtml, /Amman Deluxe Hotel/);
  assert.match(hotelOptionsHtml, /Recommended/);
});

test('proposal V3 keeps hotel option cards as fallback when matrix is not eligible', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [],
      quoteOptions: [createHotelOptionSet()],
    }),
  );
  const service = new ProposalV3Service({} as any);
  const hotelOptionsHtml = (service as any).renderHotelOptionSets(proposal);

  assert.equal(proposal.accommodationMatrix, null);
  assert.doesNotMatch(hotelOptionsHtml, /Accommodation Comparison/);
  assert.match(hotelOptionsHtml, /proposal-hotel-option-card/);
  assert.match(hotelOptionsHtml, /Amman Central Hotel/);
});

test('proposal V3 does not render accommodation matrix when option sets have no shared cities', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [],
      quoteOptions: [
        createHotelOptionSet({
          id: 'set-amman',
          name: 'Amman Only',
          hotelOptions: [
            {
              id: 'amman-only',
              city: 'Amman',
              hotelNameSnapshot: 'Amman Only Hotel',
              roomType: 'Standard Room',
              mealPlan: 'BB',
              mealPlanCode: 'BB',
              nights: 1,
              isPrimary: true,
              roomCategory: null,
              hotel: null,
            },
          ],
        }),
        createHotelOptionSet({
          id: 'set-petra',
          name: 'Petra Only',
          hotelOptions: [
            {
              id: 'petra-only',
              city: 'Petra',
              hotelNameSnapshot: 'Petra Only Hotel',
              roomType: 'Classic Room',
              mealPlan: 'HB',
              mealPlanCode: 'HB',
              nights: 1,
              isPrimary: true,
              roomCategory: null,
              hotel: null,
            },
          ],
        }),
      ],
    }),
  );

  assert.equal(proposal.accommodationMatrix, null);
});

test('proposal V3 accommodation matrix keeps long alternative hotel lists compact', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [],
      quoteOptions: [
        createHotelOptionSet({
          id: 'set-std',
          name: '4 Star STD',
          hotelOptions: [
            {
              id: 'std-primary',
              city: 'Amman',
              hotelNameSnapshot: 'Amman Primary Hotel',
              roomType: 'Standard Room',
              mealPlan: 'BB',
              mealPlanCode: 'BB',
              nights: 2,
              isPrimary: true,
              roomCategory: null,
              hotel: null,
            },
            ...['One', 'Two', 'Three', 'Four'].map((label, index) => ({
              id: `std-alt-${index}`,
              city: 'Amman',
              hotelNameSnapshot: `Amman Alternative ${label}`,
              roomType: 'Standard Room',
              mealPlan: 'BB',
              mealPlanCode: 'BB',
              nights: 2,
              isPrimary: false,
              roomCategory: null,
              hotel: null,
            })),
          ],
        }),
        createHotelOptionSet({
          id: 'set-dlx',
          name: '4 Star DLX',
          hotelOptions: [
            {
              id: 'dlx-primary',
              city: 'Amman',
              hotelNameSnapshot: 'Amman Deluxe Primary Hotel',
              roomType: 'Deluxe Room',
              mealPlan: 'BB',
              mealPlanCode: 'BB',
              nights: 2,
              isPrimary: true,
              roomCategory: null,
              hotel: null,
            },
          ],
        }),
      ],
    }),
  );
  const service = new ProposalV3Service({} as any);
  const hotelOptionsHtml = (service as any).renderHotelOptionSets(proposal);
  const firstCell = proposal.accommodationMatrix?.rows[0].cells[0];

  assert.ok(firstCell);
  assert.deepEqual(firstCell.alternativeHotels, ['Amman Alternative One', 'Amman Alternative Two']);
  assert.equal(firstCell.hasMoreAlternatives, true);
  assert.match(hotelOptionsHtml, /Amman Alternative One/);
  assert.match(hotelOptionsHtml, /Amman Alternative Two/);
  assert.match(hotelOptionsHtml, /Alternatives available/);
  assert.match(hotelOptionsHtml, /Amman Alternative Four/);
});

test('proposal V3 maps legacy snapshot-only hotel option rows safely', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [],
      quoteOptions: [
        createHotelOptionSet({
          name: 'Custom Hotels',
          hotelOptions: [
            {
              id: 'legacy-hotel-option',
              city: 'Petra',
              hotelNameSnapshot: 'Petra Hotel or Similar',
              roomType: 'Classic Room',
              mealPlan: 'Half Board',
              mealPlanCode: null,
              nights: 1,
              isPrimary: false,
              roomCategory: null,
              hotel: null,
            },
          ],
        }),
      ],
    }),
  );

  assert.equal(proposal.hotelOptionSets[0].name, 'Custom Hotels');
  assert.equal(proposal.hotelOptionSets[0].options[0].city, 'Petra');
  assert.equal(proposal.hotelOptionSets[0].options[0].hotelName, 'Petra Hotel or Similar');
  assert.equal(proposal.hotelOptionSets[0].options[0].room, 'Classic Room');
  assert.equal(proposal.hotelOptionSets[0].options[0].mealPlan, 'Half Board');
});

test('proposal V3 renders an empty hotel option set fallback', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [],
      quoteOptions: [createHotelOptionSet({ hotelOptions: [] })],
    }),
  );
  const service = new ProposalV3Service({} as any);
  const hotelOptionsHtml = (service as any).renderHotelOptionSets(proposal);

  assert.equal(proposal.hotelOptionSets.length, 1);
  assert.equal(proposal.hotelOptionSets[0].options.length, 0);
  assert.match(hotelOptionsHtml, /Accommodation options to be confirmed/);
});

test('proposal V3 keeps confirmed hotel quote items in Stay Overview alongside hotel option sets', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [createHotelPdfItem()],
      quoteOptions: [createHotelOptionSet()],
    }),
  );

  assert.equal(proposal.accommodationRows.length, 1);
  assert.equal(proposal.accommodationRows[0].hotelName, 'Grand Petra Hotel');
  assert.equal(proposal.hotelOptionSets.length, 1);
});

test('proposal V3 maps active planner hotel stays into Stay Overview and Day by Day', () => {
  const hotelItem = createHotelPdfItem({
    id: 'active-hotel-item',
    itineraryId: null,
    hotel: { name: 'Active Planner Hotel', city: 'Amman' },
    service: {
      name: 'Active Planner Hotel',
      category: 'Hotel',
      serviceType: { name: 'Hotel', code: 'HOTEL' },
    },
  });
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [hotelItem],
      itineraries: [
        {
          id: 'legacy-day-1',
          dayNumber: 1,
          title: 'Day 1: Legacy Day',
          description: 'Legacy day should not drive active planner grouping.',
        },
      ],
      quoteItineraryDays: [
        createPlannerDay({
          id: 'planner-day-1',
          title: 'Day 1: Active Amman',
          dayItems: [createPlannerDayItem(hotelItem)],
        }),
      ],
    }),
  );

  assert.equal(proposal.accommodationRows.length, 1);
  assert.equal(proposal.accommodationRows[0].hotelName, 'Active Planner Hotel');
  assert.equal(proposal.days[0].title, 'Day 1: Active Amman');
  const stayGroup = proposal.days[0].groups.find((group) => group.label === 'Stay');
  assert.ok(stayGroup);
  assert.equal(stayGroup.items[0].title, 'Active Planner Hotel');
});

test('proposal V3 maps active planner guide transport meal activity and entrance services into Day by Day', () => {
  const transportItem = createTransportPdfItem({ id: 'active-transport-item', itineraryId: null });
  const guideItem = createGuidePdfItem({ id: 'active-guide-item', itineraryId: null });
  const mealItem = createMealPdfItem({ id: 'active-meal-item', itineraryId: null });
  const activityItem = createActivityPdfItem({ id: 'active-activity-item', itineraryId: null });
  const entranceItem = createEntrancePdfItem({ id: 'active-entrance-item', itineraryId: null });
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [transportItem, guideItem, mealItem, activityItem, entranceItem],
      quoteItineraryDays: [
        createPlannerDay({
          dayItems: [
            createPlannerDayItem(transportItem, { sortOrder: 1 }),
            createPlannerDayItem(guideItem, { sortOrder: 2 }),
            createPlannerDayItem(mealItem, { sortOrder: 3 }),
            createPlannerDayItem(activityItem, { sortOrder: 4 }),
            createPlannerDayItem(entranceItem, { sortOrder: 5 }),
          ],
        }),
      ],
    }),
  );

  const labels = proposal.days[0].groups.map((group) => group.label);
  assert.deepEqual(labels, ['Transfer', 'Experience', 'Meal', 'Guide']);
  assert.match(JSON.stringify(proposal.days[0]), /QAIA to Petra/);
  assert.match(JSON.stringify(proposal.days[0]), /Licensed local guide/);
  assert.match(JSON.stringify(proposal.days[0]), /Lunch at local restaurant/);
  assert.match(JSON.stringify(proposal.days[0]), /Petra by Night/);
  const experienceGroup = proposal.days[0].groups.find((group) => group.label === 'Experience');
  assert.ok(experienceGroup);
  assert.ok(experienceGroup.items.some((item) => item.title === 'Jerash Entrance Ticket'));
});

test('proposal V3 renders excursion origin variants with origin-aware titles', () => {
  const excursionTransportItem = createTransportPdfItem({
    id: 'excursion-transport-aqaba',
    appliedVehicleRate: null,
    service: {
      name: 'Touring route transport',
      category: 'Transport',
      serviceType: { name: 'Transport', code: 'TRANSPORT' },
    },
    overrideReason: 'Excursion template: Petra Guided Experience | Origin: Aqaba | Excursion origin variant pricing',
    touringRoute: {
      name: 'Aqaba Petra Full Day',
      startCity: 'Aqaba',
    },
  });
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [excursionTransportItem],
      quoteItineraryDays: [
        createPlannerDay({
          dayItems: [createPlannerDayItem(excursionTransportItem, { sortOrder: 1 })],
        }),
      ],
    }),
  );

  const transferGroup = proposal.days[0].groups.find((group) => group.label === 'Transfer');
  assert.ok(transferGroup);
  assert.equal(transferGroup.items[0].title, 'Petra Guided Experience — From Aqaba');
});

test('proposal V3 falls back to legacy QuoteItem itineraryId mapping when active planner days are absent', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [createHotelPdfItem()],
      quoteItineraryDays: [],
    }),
  );

  assert.equal(proposal.accommodationRows.length, 1);
  assert.equal(proposal.accommodationRows[0].hotelName, 'Grand Petra Hotel');
  const stayGroup = proposal.days[0].groups.find((group) => group.label === 'Stay');
  assert.ok(stayGroup);
  assert.equal(stayGroup.items[0].title, 'Grand Petra Hotel');
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
  assert.ok(proposal.investment.noteLines.includes('Total Package Price: $3,300.00'));
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

test('proposal PDF export totals show sell price without exposing internal cost or margin', () => {
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

  assert.ok(proposal.investment.noteLines.includes('Total Package Price: $180.00'));
  assert.doesNotMatch(proposal.investment.noteLines.join('\n'), /PDF sell total|finalCost override/i);
  assert.doesNotMatch(JSON.stringify(proposal), /PDF total cost|PDF margin|totalCost|supplierCost|gross profit|\bprofit\b|\bmargin\b/i);
});

test('proposal PDF export rounds sell total consistently without exposing internal profit fields', () => {
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

  assert.ok(proposal.investment.noteLines.includes('Total Package Price: $140.39'));
  assert.doesNotMatch(JSON.stringify(proposal), /PDF total cost|PDF margin|totalCost|supplierCost|gross profit|\bprofit\b|\bmargin\b/i);
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

  assert.ok(proposal.investment.noteLines.includes('Total Package Price: $159.50'));
  assert.ok(proposal.notes.some((line) => line === 'Applicable taxes are not included and may apply at 16%.'));
  assert.ok(proposal.notes.some((line) => line === 'Service charge is not included and may apply at 10% where applicable.'));
});

test('proposal PDF export marks included tax without exposing manual override wording', () => {
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

  assert.ok(proposal.investment.noteLines.includes('Total Package Price: $150.00'));
  assert.doesNotMatch(proposal.investment.noteLines.join('\n'), /PDF sell total|finalCost override/i);
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

  assert.ok(proposal.investment.noteLines.includes('Total Package Price: €180.00'));
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
  assert.ok(proposal.investment.noteLines.includes('Total Package Price: €180.00'));
});

test('proposal PDF export HTML contains client-safe consistency lines rendered to PDF', async () => {
  const proposal = mapQuoteToProposalV3(createPdfQuote());
  const service = new ProposalV3Service({} as any);
  const html = await (service as any).renderHtml(proposal);

  assert.match(html, /Grand Petra Hotel rate basis: per person\/night/);
  assert.match(html, /Child policy: Children 0-5 free/);
  assert.match(html, /Total Package Price: \$540\.00/);
  assert.match(html, /AXIS Destination Management/);
  assert.match(html, /proposal-brand-logo/);
  assert.doesNotMatch(html, /Aventus DMC|PDF sell total|finalCost override|PDF total cost|PDF margin|supplierCost|totalCost|gross profit/i);
});

test('proposal PDF template supports dynamic branding without warm palette colors', () => {
  const cssSource = readFileSync(resolve(__dirname, 'proposal-v3.css'), 'utf8');
  const templateSource = readFileSync(resolve(__dirname, 'proposal-v3.hbs'), 'utf8');
  const serviceSource = readFileSync(resolve(__dirname, 'proposal-v3.service.ts'), 'utf8');
  const mapperSource = readFileSync(resolve(__dirname, 'proposal-v3.mapper.ts'), 'utf8');

  assert.match(templateSource, /proposal-brand-logo/);
  assert.match(templateSource, /hotelOptionSetsHtml/);
  assert.match(templateSource, /alt="\{\{brandName\}\}"/);
  assert.match(templateSource, /footerLine/);
  assert.match(serviceSource, /footerLine/);
  assert.match(mapperSource, /AXIS_LOGO_URL/);
  assert.match(cssSource, /--proposal-accent:\s*#1FA3D6/);
  assert.match(cssSource, /\.proposal-hotel-options/);
  assert.match(cssSource, /\.proposal-footer/);
  assert.match(cssSource, /\.proposal-brand-logo-stage\s*\{[\s\S]*background:\s*#F3F4F6/);
  assert.doesNotMatch(cssSource, /#F5EFE6|#F3E8D0|#fffdfa|#f5efe6|#fcf8f2|#f9f3ea|#c8a96a|#8a6a3a|rgba\(200,\s*169,\s*106|rgba\(138,\s*106,\s*58|proposal-brand-logo-stage\s*\{[\s\S]*#061B33/i);
  assert.doesNotMatch(serviceSource + mapperSource, /Aventus DMC|PDF sell total|finalCost override|Desert Compass Jordan/i);
});

test('proposal PDF uses dynamic brand company metadata when available', async () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      brandCompany: {
        name: 'Levant Journeys',
        website: 'https://levant.example',
        logoUrl: 'https://cdn.example/fallback-logo.png',
        primaryColor: '#123456',
        branding: {
          displayName: 'Levant Signature DMC',
          logoUrl: 'https://cdn.example/brand-logo.png',
          primaryColor: '#005F73',
          headerSubtitle: 'Tailored journeys across Jordan and the Levant.',
          footerText: 'Levant Signature DMC | Bespoke travel design',
          website: 'https://levant.example',
          email: 'sales@levant.example',
          phone: '+962 6 000 0000',
        },
      },
    }),
  );
  const service = new ProposalV3Service({} as any);
  const html = await (service as any).renderHtml(proposal);

  assert.equal(proposal.brandName, 'Levant Signature DMC');
  assert.equal(proposal.logoUrl, 'https://cdn.example/brand-logo.png');
  assert.equal(proposal.accentColor, '#005F73');
  assert.equal(proposal.coverIntro, 'Tailored journeys across Jordan and the Levant.');
  assert.equal(proposal.footerLine, 'Levant Signature DMC | Bespoke travel design');
  assert.equal(proposal.contactLine, 'https://levant.example | sales@levant.example | +962 6 000 0000');
  assert.match(html, /Levant Signature DMC/);
  assert.match(html, /https:\/\/cdn\.example\/brand-logo\.png/);
  assert.match(html, /Levant Signature DMC \| Bespoke travel design/);
  assert.match(html, /sales@levant\.example/);
});

test('proposal PDF brand name falls back to AXIS instead of demo brand labels', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      brandCompany: {
        name: 'Brand - Desert Compass Jordan',
        branding: {
          displayName: null,
          primaryColor: '#1FA3D6',
        },
      },
    }),
  );

  assert.equal(proposal.brandName, 'AXIS Destination Management');
  assert.equal(proposal.logoUrl, 'https://axisdmc.com/wp-content/uploads/2024/09/Axis-white-logo-2-1024x482.png');
  assert.equal(proposal.footerLine, 'AXIS Destination Management');
});

test('proposal PDF subtitle generation follows destinations instead of hardcoded routing', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      nightCount: 1,
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Day 1: Amman', description: 'Arrival.' },
        { id: 'day-2', dayNumber: 2, title: 'Day 2: Aqaba', description: 'Red Sea stay.' },
      ],
      quoteItems: [
        createHotelPdfItem({ itineraryId: 'day-1', hotel: { name: 'Amman Hotel', city: 'Amman' } }),
        createHotelPdfItem({ id: 'item-2', itineraryId: 'day-2', hotel: { name: 'Aqaba Hotel', city: 'Aqaba' } }),
      ],
    }),
  );

  assert.equal(proposal.coverSubtitle, 'Amman · Aqaba');
  assert.notEqual(proposal.coverSubtitle, 'Amman · Petra · Wadi Rum');
});

test('proposal route intelligence uses hotel cities over generic day titles', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Demo QA quote',
      description: null,
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Day 1', description: null },
        { id: 'day-2', dayNumber: 2, title: 'Leisure day', description: null },
      ],
      quoteItems: [
        createHotelPdfItem({ itineraryId: 'day-1', hotel: { name: 'Capital Hotel', city: 'Cairo' } }),
        createHotelPdfItem({ id: 'item-2', itineraryId: 'day-2', hotel: { name: 'Red Sea Resort', city: 'Hurghada' } }),
      ],
    }),
  );

  assert.equal(proposal.destinationLine, 'Cairo and Hurghada');
  assert.match(proposal.coverSubtitle, /Cairo.*Hurghada/);
  assert.equal(proposal.documentTitle, 'Cairo and Hurghada Travel Proposal');
});

test('proposal route intelligence uses primary hotel option cities when confirmed stays are absent', () => {
  const route = buildRouteIntelligence(
    createPdfQuote({
      quoteItems: [],
      itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Program details', description: null }],
    }) as any,
    [
      {
        id: 'set-1',
        name: '4 Star STD',
        notes: null,
        options: [
          {
            id: 'option-1',
            city: 'Muscat',
            hotelName: 'Muscat Hotel',
            room: 'Standard',
            mealPlan: 'BB',
            nights: 2,
            isPrimary: true,
            shortDescription: null,
            highlights: [],
            amenities: [],
          },
        ],
      },
    ],
  );

  assert.deepEqual(route.overnightAnchors, ['Muscat']);
  assert.deepEqual(route.routeAnchors, ['Muscat']);
  assert.equal(route.destinationLine, 'Muscat');
});

test('proposal route intelligence enriches route from conservative transport names', () => {
  const route = buildRouteIntelligence(
    createPdfQuote({
      quoteItems: [
        createTransportPdfItem({
          appliedVehicleRate: {
            routeName: 'Lima Airport to Sacred Valley',
            vehicle: { name: 'Private van' },
            serviceType: { name: 'Transfer', code: 'TRANSFER' },
          },
        }),
      ],
      itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Arrival', description: null }],
    }) as any,
    [],
  );

  assert.deepEqual(parseTransportRouteSegments('Amman - Petra'), [{ from: 'Amman', to: 'Petra' }]);
  assert.deepEqual(parseTransportRouteSegments('Petra → Wadi Rum'), [{ from: 'Petra', to: 'Wadi Rum' }]);
  assert.deepEqual(route.transportSegments, [{ from: 'Lima', to: 'Sacred Valley' }]);
  assert.deepEqual(route.routeAnchors, ['Lima', 'Sacred Valley']);
});

test('proposal route intelligence falls back to useful day titles when no better data exists', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      quoteItems: [],
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Day 1: Bangkok', description: null },
        { id: 'day-2', dayNumber: 2, title: 'Day 2: Chiang Mai', description: null },
      ],
    }),
  );

  assert.equal(proposal.destinationLine, 'Bangkok and Chiang Mai');
  assert.match(proposal.coverSubtitle, /Bangkok.*Chiang Mai/);
});

test('proposal route intelligence preserves external package countries and filters placeholders', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Regional Journey',
      description: null,
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Arrival', description: null },
        { id: 'day-2', dayNumber: 2, title: 'Program details', description: null },
      ],
      quoteItems: [
        createExternalPackagePdfItem({ externalPackageCountry: 'Egypt' }),
        createTransportPdfItem({
          appliedVehicleRate: {
            routeName: 'General / All Routes',
            vehicle: { name: 'Vehicle' },
            serviceType: { name: 'Transfer', code: 'TRANSFER' },
          },
        }),
      ],
    }),
  );

  assert.equal(proposal.destinationLine, 'Egypt');
  assert.doesNotMatch(proposal.coverSubtitle, /Arrival|Program details|General/);
});

test('proposal cover and overview use route intelligence instead of generic day titles', async () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Biblical Tour Draft',
      description: null,
      nightCount: 3,
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Arrival', description: 'Overnight Cairo.' },
        { id: 'day-2', dayNumber: 2, title: 'Day 2', description: 'Overnight Mt. Sinai.' },
        { id: 'day-3', dayNumber: 3, title: 'Day 3', description: 'Overnight Petra.' },
      ],
      quoteItems: [
        createHotelPdfItem({
          id: 'hotel-cairo',
          itineraryId: 'day-1',
          hotel: { name: 'Cairo Hotel', city: 'Cairo' },
          service: { name: 'Cairo Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
        }),
        createHotelPdfItem({
          id: 'hotel-sinai',
          itineraryId: 'day-2',
          hotel: { name: 'Sinai Hotel', city: 'Mt. Sinai' },
          service: { name: 'Sinai Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
        }),
        createHotelPdfItem({
          id: 'hotel-petra',
          itineraryId: 'day-3',
          hotel: { name: 'Petra Hotel', city: 'Petra' },
          service: { name: 'Petra Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
        }),
      ],
    }),
  );
  const service = new ProposalV3Service({} as any);
  const html = await (service as any).renderHtml(proposal);

  assert.equal(proposal.destinationLine, 'Cairo, Mt. Sinai, and Petra');
  assert.match(proposal.coverSubtitle, /Cairo.*Mt\. Sinai.*Petra/);
  assert.doesNotMatch(proposal.coverSubtitle, /Arrival|Day 2|Day 3/);
  assert.match(html, /<p class="proposal-cover-destination">Cairo[\s\S]*Mt\. Sinai[\s\S]*Petra<\/p>/);
  assert.match(html, /<h2>Cairo, Mt\. Sinai, and Petra<\/h2>/);
  assert.doesNotMatch(html, /<p class="proposal-cover-destination">[^<]*(Arrival|Day 2|Day 3)/);
});

test('proposal storytelling uses destination-aware fallback for non-Jordan itineraries', async () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Peru Family Journey',
      description: null,
      nightCount: 3,
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Day 1: Lima', description: null },
        { id: 'day-2', dayNumber: 2, title: 'Day 2: Cusco', description: null },
      ],
      quoteItems: [
        createTransportPdfItem({
          itineraryId: 'day-1',
          appliedVehicleRate: {
            routeName: 'Lima Airport to Miraflores',
            vehicle: { name: 'Private van' },
            serviceType: { name: 'Transfer', code: 'TRANSFER' },
          },
        }),
      ],
    }),
  );
  const service = new ProposalV3Service({} as any);
  const html = await (service as any).renderHtml(proposal);

  assert.equal(proposal.documentTitle, 'Peru Family Journey');
  assert.match(proposal.coverSubtitle, /Lima.*Miraflores/);
  assert.match(proposal.journeySummary, /4-day journey through Lima and Miraflores/);
  assert.match(proposal.coverSignature, /Lima and Miraflores/);
  assert.match(proposal.dayByDayIntro, /Lima and Miraflores/);
  assert.doesNotMatch(html, /Jordan's cultural landmarks|proposed Jordan journey|Jordan Travel Proposal/);
});

test('proposal storytelling supports multi-country itinerary and external package destinations', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Levant and Egypt Journey',
      description: null,
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Day 1: Amman', description: null },
        { id: 'day-2', dayNumber: 2, title: 'Day 2: Jerusalem', description: null },
      ],
      quoteItems: [
        createHotelPdfItem({ itineraryId: 'day-1' }),
        createExternalPackagePdfItem({ externalPackageCountry: 'Egypt', externalStartDay: 3, externalEndDay: 4 }),
      ],
    }),
  );

  assert.match(proposal.destinationLine, /Amman/);
  assert.match(proposal.destinationLine, /Egypt/);
  assert.match(proposal.journeySummary, /partner DMC services/);
  assert.ok(proposal.highlights.some((highlight) => /Amman.*Egypt/.test(highlight)));
});

test('proposal storytelling uses client-safe activity descriptions in highlights and day copy', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      description: null,
      quoteItems: [
        createActivityPdfItem({
          activity: {
            id: 'activity-1',
            name: 'Petra by Night',
            description: 'Walk through the candlelit Siq before the treasury reveal.',
          },
          pricingDescription: 'Supplier net cost USD 35 internal margin note',
        }),
      ],
    }),
  );
  const experienceGroup = proposal.days[0].groups.find((group) => group.label === 'Experience');

  assert.ok(proposal.highlights.includes('Walk through the candlelit Siq before the treasury reveal.'));
  assert.ok(experienceGroup);
  assert.equal(experienceGroup.items[0].description, 'Walk through the candlelit Siq before the treasury reveal.');
  assert.doesNotMatch(JSON.stringify(proposal), /Supplier net cost|internal margin/i);
});

test('proposal storytelling uses hotel fact sheet highlights for accommodation story', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      description: null,
      quoteItems: [],
      quoteOptions: [
        createHotelOptionSet({
          hotelOptions: [
            {
              id: 'hotel-option-1',
              city: 'Aqaba',
              hotelNameSnapshot: 'Aqaba Beach Resort',
              roomType: 'Sea View Room',
              mealPlan: 'BB',
              mealPlanCode: 'BB',
              nights: 2,
              isPrimary: true,
              roomCategory: null,
              hotel: {
                name: 'Aqaba Beach Resort',
                city: 'Aqaba',
                factSheet: {
                  shortDescription: null,
                  highlightsJson: ['Red Sea beachfront setting', 'Walkable marina location'],
                  amenitiesJson: ['Pool'],
                },
              },
            },
          ],
        }),
      ],
    }),
  );

  assert.equal(proposal.coverSignature, 'Red Sea beachfront setting.');
  assert.ok(proposal.highlights.includes('Red Sea beachfront setting.'));
});

test('proposal storytelling filters placeholder and internal copy before using fallbacks', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Demo QA quote',
      description: 'Internal supplier net cost and margin note',
      quoteItems: [
        createActivityPdfItem({
          activity: {
            id: 'activity-unsafe',
            name: 'Supplier Cost Activity',
            description: 'Supplier net cost USD 35 internal margin note',
          },
          pricingDescription: 'Service to be confirmed',
        }),
      ],
    }),
  );
  const renderedText = JSON.stringify(proposal);

  assert.equal(proposal.documentTitle, 'Amman Travel Proposal');
  assert.match(proposal.journeySummary, /journey through Amman/);
  assert.doesNotMatch(renderedText, /Internal supplier net cost|Supplier net cost USD|Service to be confirmed/i);
});

test('proposal does not leak Guided Quote Builder taxonomy into the journey overview', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Amman + Petra + Wadi Rum + Dead Sea (7 nights)',
      description:
        'Built via Guided Quote Builder. Cities: Amman → Petra → Wadi Rum → Dead Sea Pax: 2 adults Nights: 7 Market: Latin America Budget: Standard Style: Comfort',
      nightCount: 7,
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Day 1: Amman', description: null },
        { id: 'day-2', dayNumber: 2, title: 'Day 2: Petra', description: null },
      ],
      quoteItems: [createHotelPdfItem({ itineraryId: 'day-1', hotel: { name: 'Amman Grand', city: 'Amman' } })],
    }),
  );
  const renderedText = JSON.stringify(proposal);

  assert.doesNotMatch(renderedText, /Built via Guided Quote Builder/i);
  assert.doesNotMatch(renderedText, /Market:|Budget:|Style:/i);
  assert.match(proposal.journeySummary, /journey through Amman/);
});

test('proposal strips internal style decoration from the hero title', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Amman + Petra + Wadi Rum + Dead Sea (7 nights) · Comfort',
      description: null,
    }),
  );

  assert.equal(proposal.documentTitle, 'Amman + Petra + Wadi Rum + Dead Sea (7 nights)');
  assert.doesNotMatch(proposal.documentTitle, /Comfort/i);
});

test('proposal journey summary never echoes internal Guided Builder description taxonomy', () => {
  // Reproduces the exact leaked copy seen on a real client proposal: the
  // Guided Quote Builder used to write the quote description with internal
  // planning lines, and the v3 proposal echoed it verbatim into the journey
  // overview. isClientSafeCopy must now reject it and fall back to a generated
  // human sentence.
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Amman + Petra + Wadi Rum + Dead Sea (7 nights) · Comfort 2',
      description:
        'Built via Guided Quote Builder. Cities: Amman → Petra → Wadi Rum → Dead Sea Pax: 2 adults Nights: 7 Market: Latin America Budget. Standard Style: Comfort',
    }),
  );

  // Title decoration stripped.
  assert.doesNotMatch(proposal.documentTitle, /Comfort/i);
  // None of the internal taxonomy reaches the client-facing journey overview.
  assert.doesNotMatch(proposal.journeySummary, /Built via/i);
  assert.doesNotMatch(proposal.journeySummary, /Guided Quote Builder/i);
  assert.doesNotMatch(proposal.journeySummary, /Market:/i);
  assert.doesNotMatch(proposal.journeySummary, /Standard Style/i);
  // And a real client sentence was generated instead of an empty string.
  assert.ok(proposal.journeySummary.length > 0);
});

test('quote PDF renderer exposes premium client-ready sections without internal pricing labels', () => {
  const rendererSource = readFileSync(resolve(__dirname, 'proposal-v2.renderer.ts'), 'utf8');

  assert.match(rendererSource, /Client Info/);
  assert.match(rendererSource, /Trip Overview/);
  assert.match(rendererSource, /Services \/ Itinerary/);
  assert.match(rendererSource, /Pricing Summary/);
  assert.doesNotMatch(rendererSource, /supplierCost|gross profit|PDF total cost|PDF margin/i);
});
