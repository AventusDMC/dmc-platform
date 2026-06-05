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
  assert.match(cssSource, /--proposal-accent:\s*#1F9ACF/);
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

test('proposal derives a per-day country from the hotel city and groups a multi-country itinerary', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      title: 'Jordan & Egypt Discovery',
      description: null,
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Day 1', description: null },
        { id: 'day-2', dayNumber: 2, title: 'Day 2', description: null },
      ],
      quoteItems: [
        createHotelPdfItem({
          itineraryId: 'day-1',
          hotel: { name: 'Amman Grand', city: 'Amman', cityRecord: { country: 'Jordan' } },
        }),
        createHotelPdfItem({
          id: 'item-2',
          itineraryId: 'day-2',
          hotel: { name: 'Cairo Nile', city: 'Cairo', cityRecord: { country: 'Egypt' } },
        }),
      ],
    }),
  );

  // Derivation: each day's country comes from its hotel's resolved city country.
  assert.equal(proposal.days[0].country, 'Jordan');
  assert.equal(proposal.days[1].country, 'Egypt');

  // Renderer: a multi-country trip shows a country heading per segment.
  const service = new ProposalV3Service({} as any);
  const html = (service as any).renderItineraryDays(proposal);
  assert.match(html, /proposal-country-heading/);
  assert.match(html, />Jordan</);
  assert.match(html, />Egypt</);
});

test('proposal does NOT show country headings for a single-country itinerary', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Day 1', description: null },
        { id: 'day-2', dayNumber: 2, title: 'Day 2', description: null },
      ],
      quoteItems: [
        createHotelPdfItem({
          itineraryId: 'day-1',
          hotel: { name: 'Amman Grand', city: 'Amman', cityRecord: { country: 'Jordan' } },
        }),
        createHotelPdfItem({
          id: 'item-2',
          itineraryId: 'day-2',
          hotel: { name: 'Petra Lodge', city: 'Petra', cityRecord: { country: 'Jordan' } },
        }),
      ],
    }),
  );

  const service = new ProposalV3Service({} as any);
  const html = (service as any).renderItineraryDays(proposal);
  assert.doesNotMatch(html, /proposal-country-heading/);
});

test('a stored manual country override wins over the derived hotel country', () => {
  const proposal = mapQuoteToProposalV3(
    createPdfQuote({
      itineraries: [],
      quoteItems: [],
      quoteItineraryDays: [
        createPlannerDay({
          id: 'planner-day-1',
          country: 'Egypt', // operator override
          dayItems: [
            createPlannerDayItem(
              createHotelPdfItem({
                hotel: { name: 'Amman Grand', city: 'Amman', cityRecord: { country: 'Jordan' } },
              }),
            ),
          ],
        }),
      ],
    }),
  );

  // Hotel city resolves to Jordan, but the manual override must win.
  assert.equal(proposal.days[0].country, 'Egypt');
});

// ---- Phase 3A: multilingual proposal foundation (language only, no POI composition) ----

test('Phase 3A: default (no language) renders English LTR, formatting unchanged', () => {
  const proposal = mapQuoteToProposalV3(createPdfQuote());
  assert.equal(proposal.language, 'en');
  assert.equal(proposal.textDirection, 'ltr');
  // English duration label shape unchanged ("N Day(s) / M Night(s)").
  assert.match(proposal.durationLabel, /\d+ Days? \/ \d+ Nights?/);
});

test('Phase 3A: explicit en === default (regression — English output stable)', () => {
  const def = mapQuoteToProposalV3(createPdfQuote());
  const en = mapQuoteToProposalV3(createPdfQuote(), 'en');
  assert.equal(en.durationLabel, def.durationLabel);
  assert.equal(en.servicesCountLabel, def.servicesCountLabel);
  assert.equal(en.totalDaysLabel, def.totalDaysLabel);
  assert.deepEqual(en.inclusions, def.inclusions);
});

test('Phase 3A: Portuguese localizes labels (LTR)', () => {
  const proposal = mapQuoteToProposalV3(createPdfQuote(), 'pt');
  assert.equal(proposal.language, 'pt');
  assert.equal(proposal.textDirection, 'ltr');
  assert.match(proposal.durationLabel, /Dias?/); // "N Dias / M Noites"
});

test('Phase 3A: Arabic is RTL', () => {
  const proposal = mapQuoteToProposalV3(createPdfQuote(), 'ar');
  assert.equal(proposal.language, 'ar');
  assert.equal(proposal.textDirection, 'rtl');
});

test('Phase 3A: invalid language falls back to English', () => {
  const proposal = mapQuoteToProposalV3(createPdfQuote(), 'xx');
  assert.equal(proposal.language, 'en');
});

test('Phase 3A: explicit language overrides the quote stored proposalLanguage', () => {
  // Stored es, render-time pt override wins.
  const proposal = mapQuoteToProposalV3(createPdfQuote({ proposalLanguage: 'es' }), 'pt');
  assert.equal(proposal.language, 'pt');
  // No explicit language → falls back to the stored value.
  const stored = mapQuoteToProposalV3(createPdfQuote({ proposalLanguage: 'es' }));
  assert.equal(stored.language, 'es');
});

// ---- Phase 3A.1: free-form prose localization (intros / summaries / signature) ----

// A quote whose description is blank so the generated (boilerplate) journey
// summary + cover intro prose are exercised instead of the client-supplied copy.
function createProseQuote(overrides: Record<string, any> = {}) {
  return createPdfQuote({
    description: '',
    title: 'Jordan Family Journey',
    nightCount: 4,
    itineraries: [
      { id: 'day-1', dayNumber: 1, title: 'Day 1: Amman', description: '' },
      { id: 'day-2', dayNumber: 2, title: 'Day 2: Petra', description: '' },
    ],
    ...overrides,
  });
}

test('Phase 3A.1: English prose is unchanged between default and explicit en (regression)', () => {
  const def = mapQuoteToProposalV3(createProseQuote());
  const en = mapQuoteToProposalV3(createProseQuote(), 'en');
  assert.equal(en.coverIntro, def.coverIntro);
  assert.equal(en.journeySummary, def.journeySummary);
  assert.equal(en.dayByDayIntro, def.dayByDayIntro);
  assert.equal(en.coverSignature, def.coverSignature);
});

test('Phase 3A.1: generated English prose matches the prior hardcoded copy', () => {
  const en = mapQuoteToProposalV3(createProseQuote(), 'en');
  // Stable English signatures of each boilerplate sentence (destination-agnostic).
  assert.match(en.coverIntro, /^A destination-aware proposal/);
  assert.match(en.coverIntro, /sequenced around the itinerary\.$/);
  assert.match(en.journeySummary, /journey .* shaped around /);
  assert.match(en.dayByDayIntro, /outline/);
});

test('Phase 3A.1: prose is localized for pt/es/ar and never leaves an unfilled {placeholder}', () => {
  for (const locale of ['pt', 'es', 'ar'] as const) {
    const proposal = mapQuoteToProposalV3(createProseQuote(), locale);
    for (const field of [proposal.coverIntro, proposal.journeySummary, proposal.dayByDayIntro, proposal.coverSignature]) {
      assert.ok(typeof field === 'string', `prose field missing for ${locale}`);
      assert.doesNotMatch(field, /\{[a-zA-Z]+\}/, `leftover placeholder for ${locale}: ${field}`);
    }
  }
  // The localized cover intro must differ from English (proves it was translated).
  const en = mapQuoteToProposalV3(createProseQuote(), 'en');
  const pt = mapQuoteToProposalV3(createProseQuote(), 'pt');
  assert.notEqual(pt.coverIntro, en.coverIntro);
});

test('Phase 3A.1: localized fallback service titles render in the active locale', () => {
  // A bare transport item with no client-safe service name falls back to the
  // generated title; in Portuguese it should not read "Private Transfer".
  const ptProposal = mapQuoteToProposalV3(
    createPdfQuote({
      description: '',
      quoteItems: [
        createTransportPdfItem({
          service: { name: '', category: 'Transport', serviceType: { name: 'Transfer', code: 'TRANSFER' } },
        }),
      ],
    }),
    'pt',
  );
  const text = JSON.stringify(ptProposal);
  assert.doesNotMatch(text, /\{location\}/);
});

// ---- Phase 3B.2: per-locale day narrative composer from ordered POI rows ----

// Builds a quote whose day 1 is an active planner day carrying the given POI
// assignments (so the composer runs). day.notes is the fallback under test.
function createComposerQuote(poiAssignments: any[], dayNotes: string | null = 'Stored day notes.', overrides: Record<string, any> = {}) {
  return createPdfQuote({
    quoteItineraryDays: [
      {
        id: 'day-1',
        dayNumber: 1,
        title: 'Day 1: Amman',
        notes: dayNotes,
        isActive: true,
        dayItems: [],
        poiAssignments,
      },
    ],
    ...overrides,
  });
}

function poiRow(overrides: Record<string, any> = {}) {
  return {
    id: `assign-${overrides.poiId ?? 'x'}-${overrides.sortOrder ?? 0}`,
    poiId: 'poi-a',
    sortOrder: 0,
    fallbackTitle: null,
    fallbackCity: null,
    pointOfInterest: {
      id: 'poi-a',
      name: 'Internal A',
      translations: [{ locale: 'en', title: 'Amman Citadel', shortDescription: null }],
      city: { id: 'c-amman', name: 'Amman', country: 'Jordan' },
    },
    ...overrides,
  };
}

function day1Summary(quote: any, language?: string) {
  const vm = mapQuoteToProposalV3(quote, language);
  return (vm.days.find((d: any) => d.dayNumber === 1) || {}).summary as string | null;
}

test('Phase 3B.2: composes ordered POI visits in order (English)', () => {
  const quote = createComposerQuote([
    poiRow({ poiId: 'poi-b', sortOrder: 1, pointOfInterest: { id: 'poi-b', name: 'B', translations: [{ locale: 'en', title: 'Roman Theatre' }], city: null } }),
    poiRow({ poiId: 'poi-a', sortOrder: 0, pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'en', title: 'Amman Citadel' }], city: null } }),
  ]);
  const summary = day1Summary(quote, 'en') || '';
  assert.match(summary, /Visit Amman Citadel/);
  assert.match(summary, /Visit Roman Theatre/);
  assert.ok(summary.indexOf('Amman Citadel') < summary.indexOf('Roman Theatre'), 'sortOrder must drive order');
});

test('Phase 3B.2: appends a client-safe short description', () => {
  const quote = createComposerQuote([
    poiRow({ pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'en', title: 'Amman Citadel', shortDescription: 'A hilltop archaeological site.' }], city: null } }),
  ]);
  assert.match(day1Summary(quote, 'en') || '', /Visit Amman Citadel — A hilltop archaeological site\./);
});

test('Phase 3B.2: uses the selected-locale POI translation + localized boilerplate', () => {
  const quote = createComposerQuote([
    poiRow({ pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'pt', title: 'Cidadela de Amã' }, { locale: 'en', title: 'Amman Citadel' }], city: null } }),
  ]);
  // pt svcVisit = "Visita a {location}"
  assert.match(day1Summary(quote, 'pt') || '', /Visita a Cidadela de Amã/);
});

test('Phase 3B.2: falls back to the English translation when the selected locale is missing', () => {
  const quote = createComposerQuote([
    poiRow({ pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'en', title: 'Amman Citadel' }], city: null } }),
  ]);
  // es boilerplate + English POI title (acceptable until human translations exist)
  assert.match(day1Summary(quote, 'es') || '', /Visita a Amman Citadel/);
});

test('Phase 3B.2: falls back to the internal POI name when no translation title exists', () => {
  const quote = createComposerQuote([
    poiRow({ pointOfInterest: { id: 'poi-a', name: 'Madaba Mosaic Map', translations: [], city: null } }),
  ]);
  assert.match(day1Summary(quote, 'en') || '', /Visit Madaba Mosaic Map/);
});

test('Phase 3B.2: a deleted POI row (poiId null) uses fallbackTitle/fallbackCity, not skipped', () => {
  const quote = createComposerQuote([
    { id: 'a1', poiId: null, sortOrder: 0, fallbackTitle: 'Snapshot Citadel', fallbackCity: 'Amman', pointOfInterest: null },
  ]);
  assert.match(day1Summary(quote, 'en') || '', /Visit Snapshot Citadel/);
});

test('Phase 3B.2: skips a truly empty row but keeps usable siblings', () => {
  const quote = createComposerQuote([
    { id: 'empty', poiId: null, sortOrder: 0, fallbackTitle: null, fallbackCity: null, pointOfInterest: null },
    poiRow({ poiId: 'poi-a', sortOrder: 1, pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'en', title: 'Amman Citadel' }], city: null } }),
  ]);
  const summary = day1Summary(quote, 'en') || '';
  assert.match(summary, /Visit Amman Citadel/);
  // Only one visit sentence — the empty row contributed nothing.
  assert.equal((summary.match(/Visit /g) || []).length, 1);
});

test('Phase 3B.2: a day whose rows are all unusable falls back to day.notes', () => {
  const quote = createComposerQuote(
    [{ id: 'empty', poiId: null, sortOrder: 0, fallbackTitle: null, fallbackCity: null, pointOfInterest: null }],
    'Arrival and overnight in Amman.',
  );
  assert.equal(day1Summary(quote, 'en'), 'Arrival and overnight in Amman.');
});

test('Phase 3B.2: a day with no POI rows is unchanged — summary stays day.notes (English regression)', () => {
  const withEmptyArray = createComposerQuote([], 'Arrival and overnight in Amman.');
  assert.equal(day1Summary(withEmptyArray, 'en'), 'Arrival and overnight in Amman.');
  // Explicit-en === default (no language) for the no-POI day.
  assert.equal(day1Summary(withEmptyArray), day1Summary(withEmptyArray, 'en'));
});

test('Phase 3B.2: an unsafe short description is dropped while the title is kept', () => {
  const quote = createComposerQuote([
    poiRow({ pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'en', title: 'Amman Citadel', shortDescription: 'Internal Use Only' }], city: null } }),
  ]);
  const summary = day1Summary(quote, 'en') || '';
  assert.match(summary, /Visit Amman Citadel/);
  assert.doesNotMatch(summary, /Internal Use Only/);
});

test('Phase 3B.2: Arabic composes with RTL document direction preserved', () => {
  const quote = createComposerQuote([
    poiRow({ pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'ar', title: 'جبل القلعة' }, { locale: 'en', title: 'Amman Citadel' }], city: null } }),
  ]);
  const vm = mapQuoteToProposalV3(quote, 'ar');
  assert.equal(vm.textDirection, 'rtl');
  const summary = (vm.days.find((d: any) => d.dayNumber === 1) || {}).summary || '';
  assert.match(summary, /زيارة جبل القلعة/); // ar svcVisit = "زيارة {location}"
});

// ---- Phase 3D.1J: route-movement context for touring-route generated days ----

// A day carrying a touring-route transport package whose pricingDescription holds
// the ordered city path (the only place the base city is known at render time).
// Active planner day items are join rows: { isActive, quoteService: <item> }.
function touringTransportDayItem(path: string, dayCount = 1) {
  return {
    id: 'tdi-1',
    isActive: true,
    quoteService: {
      id: 'touring-transport-1',
      itineraryId: 'day-1',
      serviceDate: new Date('2026-06-01T09:00:00.000Z'),
      service: { name: 'Airport Transfer', category: 'Transport', serviceType: { name: 'Transport', code: 'TRANSPORT' }, supplierId: 's1' },
      pricingDescription: `Excursion origin variant | ${path} | Touring route | Sedan 2 | PER_VEHICLE`,
      dayCount,
      touringRouteId: 'tr-1',
      // Mirror prod: the proposal fetch loads the touringRoute relation, so the
      // origin-aware name resolves to the generic service ("Airport Transfer — From …")
      // — the route-path label must still win for the generated package.
      touringRoute: { id: 'tr-1', name: 'Touring Route', startCity: path.split(/\s*->\s*/)[0] || 'Amman' },
      totalCost: 100,
      totalSell: 120,
    },
  };
}

function hotelDayItem(city = 'Amman') {
  return {
    id: 'hdi-1',
    isActive: true,
    quoteService: {
      id: 'hotel-1',
      itineraryId: 'day-1',
      service: { name: 'Hotel stay', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
      hotel: { id: 'h1', name: 'Test Hotel', city },
      nightCount: 1,
      totalCost: 0,
      totalSell: 0,
    },
  };
}

function createMovementQuote(poiAssignments: any[], dayItems: any[]) {
  return createPdfQuote({
    quoteItineraryDays: [
      { id: 'day-1', dayNumber: 1, title: 'Day 1: Amman', notes: 'Stored day notes.', isActive: true, dayItems, poiAssignments },
    ],
  });
}

function jerashAjlounPois() {
  return [
    poiRow({ poiId: 'poi-jerash', sortOrder: 0, pointOfInterest: { id: 'poi-jerash', name: 'Jerash', translations: [{ locale: 'en', title: 'Jerash Archaeological Site' }, { locale: 'pt', title: 'Sítio Arqueológico de Jerash' }, { locale: 'es', title: 'Sitio Arqueológico de Jerash' }, { locale: 'ar', title: 'موقع جرش الأثري' }], city: { id: 'c-jerash', name: 'Jerash', country: 'Jordan' } } }),
    poiRow({ poiId: 'poi-ajloun', sortOrder: 1, pointOfInterest: { id: 'poi-ajloun', name: 'Ajloun', translations: [{ locale: 'en', title: 'Ajloun Castle' }, { locale: 'pt', title: 'Castelo de Ajloun' }, { locale: 'es', title: 'Castillo de Ajloun' }, { locale: 'ar', title: 'قلعة عجلون' }], city: { id: 'c-ajloun', name: 'Ajloun', country: 'Jordan' } } }),
  ];
}

test('Phase 3D.1J: Ajloun & Jerash composes Depart → Visit → Continue → Return (English)', () => {
  const quote = createMovementQuote(jerashAjlounPois(), [touringTransportDayItem('Amman -> Jerash -> Ajloun -> Amman', 1)]);
  const summary = day1Summary(quote, 'en') || '';
  assert.match(summary, /Depart from Amman\./, 'departure from base city');
  assert.match(summary, /Visit Jerash Archaeological Site/, 'first stop = Visit');
  assert.match(summary, /Continue to Ajloun Castle/, 'second stop = Continue to');
  assert.match(summary, /Return to Amman\.?$/, 'single-day circuit returns to base');
  // Order: depart < jerash < ajloun < return
  assert.ok(summary.indexOf('Depart') < summary.indexOf('Jerash'));
  assert.ok(summary.indexOf('Jerash') < summary.indexOf('Ajloun'));
  assert.ok(summary.indexOf('Ajloun') < summary.indexOf('Return'));
});

test('Phase 3D.1J: both POIs always appear in the Ajloun & Jerash narrative', () => {
  const summary = day1Summary(createMovementQuote(jerashAjlounPois(), [touringTransportDayItem('Amman -> Jerash -> Ajloun -> Amman', 1)]), 'en') || '';
  assert.match(summary, /Jerash Archaeological Site/);
  assert.match(summary, /Ajloun Castle/);
});

test('Phase 3D.1J: NO breakfast/meal is invented when the day has no hotel/meal item', () => {
  const summary = day1Summary(createMovementQuote(jerashAjlounPois(), [touringTransportDayItem('Amman -> Jerash -> Ajloun -> Amman', 1)]), 'en') || '';
  assert.doesNotMatch(summary, /breakfast/i);
  assert.doesNotMatch(summary, /lunch|dinner/i);
  // No-hotel wording: plain "Depart from Amman", not "your hotel".
  assert.doesNotMatch(summary, /your hotel/i);
});

test('Phase 3D.1L: with a hotel in the base city, depart "your hotel" + overnight in that city', () => {
  // Updated from 3D.1J: a hotel proves an OVERNIGHT in the hotel's city (here Amman),
  // so the day ends "Overnight in Amman", not "Return to your hotel".
  const quote = createMovementQuote(jerashAjlounPois(), [touringTransportDayItem('Amman -> Jerash -> Ajloun -> Amman', 1), hotelDayItem('Amman')]);
  const summary = day1Summary(quote, 'en') || '';
  assert.match(summary, /Depart from your hotel in Amman/, 'hotel in base → "your hotel in Amman"');
  assert.match(summary, /Overnight in Amman/, 'overnight in the hotel city');
  assert.doesNotMatch(summary, /Return to/, 'a hotel night replaces the day-trip return');
  // Still no invented breakfast even with a hotel present.
  assert.doesNotMatch(summary, /breakfast/i);
});

test('Phase 3D.1J: multi-day route day 1 does NOT wrongly Return to base', () => {
  // Amman → Dana → Petra ON (dayCount 2): day 1 visits Dana; must not "Return to Amman".
  const danaPoi = [poiRow({ poiId: 'poi-dana', sortOrder: 0, pointOfInterest: { id: 'poi-dana', name: 'Dana', translations: [{ locale: 'en', title: 'Dana Biosphere Reserve' }], city: { id: 'c-dana', name: 'Dana', country: 'Jordan' } } })];
  const summary = day1Summary(createMovementQuote(danaPoi, [touringTransportDayItem('Amman -> Dana -> Petra -> Amman', 2)]), 'en') || '';
  assert.match(summary, /Depart from Amman/);
  assert.match(summary, /Visit Dana Biosphere Reserve/);
  assert.doesNotMatch(summary, /Return to/, 'multi-day day 1 must not return to base');
});

test('Phase 3D.1J: no redundant "Depart from X" when the base equals the first stop city', () => {
  // Petra → Wadi Rum ON day 1: base Petra, first stop Petra → skip departure line.
  const petraPoi = [poiRow({ poiId: 'poi-petra', sortOrder: 0, pointOfInterest: { id: 'poi-petra', name: 'Petra', translations: [{ locale: 'en', title: 'Petra Archaeological City' }], city: { id: 'c-petra', name: 'Petra', country: 'Jordan' } } })];
  const summary = day1Summary(createMovementQuote(petraPoi, [touringTransportDayItem('Petra -> Wadi Rum', 2)]), 'en') || '';
  assert.doesNotMatch(summary, /Depart from Petra/);
  assert.match(summary, /Visit Petra Archaeological City/);
});

test('Phase 3D.1J: movement context renders in PT / ES / AR (with RTL)', () => {
  const pois = jerashAjlounPois();
  const path = 'Amman -> Jerash -> Ajloun -> Amman';
  const pt = day1Summary(createMovementQuote(pois, [touringTransportDayItem(path, 1)]), 'pt') || '';
  assert.match(pt, /Partida de Amman/);
  assert.match(pt, /Siga para Castelo de Ajloun/);
  assert.match(pt, /Regresso a Amman/);

  const es = day1Summary(createMovementQuote(pois, [touringTransportDayItem(path, 1)]), 'es') || '';
  assert.match(es, /Salida desde Amman/);
  assert.match(es, /Continúe hacia Castillo de Ajloun/);
  assert.match(es, /Regreso a Amman/);

  const arQuote = createMovementQuote(pois, [touringTransportDayItem(path, 1)]);
  const arVm = mapQuoteToProposalV3(arQuote, 'ar');
  assert.equal(arVm.textDirection, 'rtl');
  const ar = (arVm.days.find((d: any) => d.dayNumber === 1) || {}).summary || '';
  assert.match(ar, /الانطلاق من Amman/);
  assert.match(ar, /العودة إلى Amman/);
});

test('Phase 3D.1J: manual POI day with NO touring transport keeps plain "Visit" (no regression)', () => {
  // Same two POIs but no touring-route transport item → no movement scaffolding.
  const summary = day1Summary(createMovementQuote(jerashAjlounPois(), []), 'en') || '';
  assert.match(summary, /Visit Jerash Archaeological Site/);
  assert.match(summary, /Visit Ajloun Castle/);
  assert.doesNotMatch(summary, /Depart from/);
  assert.doesNotMatch(summary, /Continue to/);
  assert.doesNotMatch(summary, /Return to/);
});

// ---- Phase 3D.1K: localize leftover proposal strings (day label, highlights, dates) ----

test('Phase 3D.1K: day heading label is localized per locale', () => {
  const quote = createComposerQuote([
    poiRow({ pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'en', title: 'Amman Citadel' }], city: { id: 'c', name: 'Amman' } } }),
  ]);
  const label = (q: any, lang?: string) => (mapQuoteToProposalV3(q, lang).days.find((d: any) => d.dayNumber === 1) || {}).dayNumberLabel;
  assert.equal(label(quote, 'en'), 'Day 01');
  assert.equal(label(quote, 'pt'), 'Dia 01');
  assert.equal(label(quote, 'es'), 'Día 01');
  assert.equal(label(quote, 'ar'), 'اليوم 01');
});

test('Phase 3D.1K: deterministic cover highlights are localized (PT) and English-stable (EN)', () => {
  const quote = createComposerQuote([
    poiRow({ pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'en', title: 'Amman Citadel' }], city: { id: 'c', name: 'Amman' } } }),
  ]);
  const en = mapQuoteToProposalV3(quote, 'en').highlights.join(' | ');
  assert.match(en, /Route planned through/, 'EN highlight wording unchanged');

  const pt = mapQuoteToProposalV3(quote, 'pt').highlights.join(' | ');
  assert.match(pt, /Percurso planeado por/, 'PT highlight localized');
  assert.doesNotMatch(pt, /Route planned through/, 'no English leak in PT highlights');
});

test('Phase 3D.1K: Arabic highlights survive the script-aware safety gate', () => {
  const quote = createComposerQuote([
    poiRow({ pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'en', title: 'Amman Citadel' }], city: { id: 'c', name: 'Amman' } } }),
  ]);
  const ar = mapQuoteToProposalV3(quote, 'ar').highlights;
  assert.ok(ar.length > 0, 'Arabic highlights must not be dropped by the ASCII filter');
  assert.ok(ar.some((h: string) => /مسار/.test(h)), 'Arabic route highlight present');
});

test('Phase 3D.1K: "dates to be confirmed" fallback is localized when no travel date', () => {
  const quote = createComposerQuote(
    [poiRow({ pointOfInterest: { id: 'poi-a', name: 'A', translations: [{ locale: 'en', title: 'Amman Citadel' }], city: null } })],
    'Stored day notes.',
    { travelStartDate: null },
  );
  assert.equal(mapQuoteToProposalV3(quote, 'en').travelDatesLabel, 'Dates to be confirmed');
  assert.equal(mapQuoteToProposalV3(quote, 'pt').travelDatesLabel, 'Datas a confirmar');
  assert.equal(mapQuoteToProposalV3(quote, 'es').travelDatesLabel, 'Fechas por confirmar');
});

// ---- Phase 3D.1L: hotel-city movement, accommodation location, route-aware cover, transport label ----

// Amman → Dana → Petra ON (2 days): Day 1 visits Dana with the touring transport
// package; Day 2 visits Petra. A hotel may sit on Day 1 in Petra/Wadi Musa.
function danaPetraTwoDayQuote(opts: { hotelCity?: string } = {}) {
  const danaPoi = poiRow({ poiId: 'poi-dana', sortOrder: 0, pointOfInterest: { id: 'poi-dana', name: 'Dana', translations: [{ locale: 'en', title: 'Dana Biosphere Reserve' }], city: { id: 'c-dana', name: 'Dana' } } });
  const petraPoi = poiRow({ poiId: 'poi-petra', sortOrder: 0, pointOfInterest: { id: 'poi-petra', name: 'Petra', translations: [{ locale: 'en', title: 'Petra Archaeological City' }], city: { id: 'c-petra', name: 'Petra' } } });
  const day1Items: any[] = [touringTransportDayItem('Amman -> Dana -> Petra -> Amman', 2)];
  if (opts.hotelCity) day1Items.push(hotelDayItem(opts.hotelCity));
  return createPdfQuote({
    quoteItineraryDays: [
      { id: 'day-1', dayNumber: 1, title: 'Day 1: Dana', notes: '', isActive: true, dayItems: day1Items, poiAssignments: [danaPoi] },
      { id: 'day-2', dayNumber: 2, title: 'Day 2: Petra', notes: '', isActive: true, dayItems: [], poiAssignments: [petraPoi] },
    ],
  });
}

test('Phase 3D.1L #2: Day 1 with a Petra hotel — depart Amman, continue+overnight in Petra (not Amman)', () => {
  const summary = day1Summary(danaPetraTwoDayQuote({ hotelCity: 'Petra' }), 'en') || '';
  assert.match(summary, /Depart from Amman\b/, 'depart from base (no Amman hotel → plain)');
  assert.doesNotMatch(summary, /Depart from your hotel in Amman/, 'must not claim a hotel in Amman');
  assert.match(summary, /Visit Dana Biosphere Reserve/);
  assert.match(summary, /Continue to Petra/, 'bridge to the hotel city');
  assert.match(summary, /Overnight in Petra/, 'overnight in the hotel city');
  assert.doesNotMatch(summary, /Overnight in Amman/, 'must not overnight in the route base/return city');
});

test('Phase 3D.1L #3: accommodation row location uses the hotel city, not the day location', () => {
  const vm = mapQuoteToProposalV3(danaPetraTwoDayQuote({ hotelCity: 'Petra' }));
  const row = vm.accommodationRows[0];
  assert.ok(row, 'an accommodation row exists');
  assert.equal(row.location, 'Petra', 'Petra hotel on a "Dana" day shows Location: Petra');
});

test('Phase 3D.1L #4: generated touring transport item is titled by route path, not "Airport Transfer"', () => {
  const vm = mapQuoteToProposalV3(danaPetraTwoDayQuote({ hotelCity: 'Petra' }));
  const day1 = vm.days.find((d: any) => d.dayNumber === 1);
  const transferGroup = (day1?.groups || []).find((g: any) => /transfer|transport/i.test(g.label));
  const title = transferGroup?.items?.[0]?.title || '';
  assert.equal(title, 'Amman → Dana → Petra', 'route path label (return-to-origin dropped)');
  assert.doesNotMatch(title, /Airport Transfer/);
});

test('Phase 3D.1L #1: cover destination is route-aware (Dana & Petra), excluding the Amman base', () => {
  const vm = mapQuoteToProposalV3(danaPetraTwoDayQuote({ hotelCity: 'Petra' }));
  assert.match(vm.destinationLine, /Dana/);
  assert.match(vm.destinationLine, /Petra/);
  assert.ok(vm.destinationLine.indexOf('Dana') < vm.destinationLine.indexOf('Petra'), 'day order: Dana before Petra');
  assert.doesNotMatch(vm.destinationLine, /Amman/, 'origin/base excluded when no POI is there');
});

test('Phase 3D.1L: Amman City Sites style — Amman IS the destination when POIs are in Amman', () => {
  const quote = createComposerQuote([
    poiRow({ poiId: 'poi-cit', sortOrder: 0, pointOfInterest: { id: 'poi-cit', name: 'Citadel', translations: [{ locale: 'en', title: 'Amman Citadel' }], city: { id: 'c-amman', name: 'Amman' } } }),
  ]);
  assert.match(mapQuoteToProposalV3(quote).destinationLine, /Amman/, 'Amman kept when it is the visited destination');
});

test('Phase 3D.1L: Ajloun & Jerash day-trip still returns to Amman (no hotel = no overnight invented)', () => {
  const summary = day1Summary(createMovementQuote(jerashAjlounPois(), [touringTransportDayItem('Amman -> Jerash -> Ajloun -> Amman', 1)]), 'en') || '';
  assert.match(summary, /Depart from Amman/);
  assert.match(summary, /Visit Jerash Archaeological Site/);
  assert.match(summary, /Continue to Ajloun Castle/);
  assert.match(summary, /Return to Amman/);
  assert.doesNotMatch(summary, /Overnight/);
  assert.doesNotMatch(summary, /breakfast|hotel/i);
});

// ---- Phase 3D.1L.2: cover destinations from POI-day titles (hotel city must not narrow) ----

test('Phase 3D.1L.2: hotel quote with UNRESOLVED POI cities still covers "Dana · Petra" (from day titles)', () => {
  // Mirrors the real bug: the POI→city relation is absent (city: null), and a Petra
  // hotel sits on day 1. The cover must derive from the POI-day TITLES, not the hotel.
  const danaPoi = poiRow({ poiId: 'poi-dana', sortOrder: 0, pointOfInterest: { id: 'poi-dana', name: 'Dana', translations: [{ locale: 'en', title: 'Dana Biosphere Reserve' }], city: null } });
  const petraPoi = poiRow({ poiId: 'poi-petra', sortOrder: 0, pointOfInterest: { id: 'poi-petra', name: 'Petra', translations: [{ locale: 'en', title: 'Petra Archaeological City' }], city: null } });
  const quote = createPdfQuote({
    quoteItineraryDays: [
      { id: 'day-1', dayNumber: 1, title: 'Day 1: Dana', notes: '', isActive: true, dayItems: [touringTransportDayItem('Amman -> Dana -> Petra -> Amman', 2), hotelDayItem('Petra / Wadi Musa')], poiAssignments: [danaPoi] },
      { id: 'day-2', dayNumber: 2, title: 'Day 2: Petra', notes: '', isActive: true, dayItems: [], poiAssignments: [petraPoi] },
    ],
  });
  const dest = mapQuoteToProposalV3(quote).destinationLine;
  assert.match(dest, /Dana/, 'Dana present (from day-1 title)');
  assert.match(dest, /Petra/, 'Petra present (from day-2 title)');
  assert.ok(dest.indexOf('Dana') < dest.indexOf('Petra'), 'day order');
  assert.doesNotMatch(dest, /Wadi Musa/, 'hotel city must not narrow/override the route-aware title');
  assert.doesNotMatch(dest, /Amman/, 'origin/base excluded (no POI day there)');
});

test('Phase 3D.1L.2: no-POI quote keeps existing hotel/transport destination behavior', () => {
  // A quote with hotels but NO POI assignments: cover still derives from hotel city.
  const quote = createPdfQuote({
    quoteItineraryDays: [
      { id: 'day-1', dayNumber: 1, title: 'Day 1: Petra', notes: '', isActive: true, dayItems: [hotelDayItem('Petra / Wadi Musa')], poiAssignments: [] },
    ],
  });
  assert.match(mapQuoteToProposalV3(quote).destinationLine, /Petra/, 'falls back to hotel city when no POI days');
});
