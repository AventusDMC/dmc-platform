import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const quotePageSource = readFileSync(new URL('./[id]/page.tsx', import.meta.url), 'utf8');
const quoteItemsFormSource = readFileSync(new URL('./[id]/QuoteItemsForm.tsx', import.meta.url), 'utf8');

function expectSourceContains(source: string, snippets: string[]) {
  for (const snippet of snippets) {
    assert.ok(source.includes(snippet), `Expected source to contain: ${snippet}`);
  }
}

describe('quote hotel selector catalog loading', () => {
  it('loads hotel catalog data for the itinerary Add Confirmed Hotel Stay drawer', () => {
    expectSourceContains(quotePageSource, [
      'const shouldLoadHotelPlanningData =',
      "activeTab === 'itinerary'",
      "shouldLoadHotelPlanningData ? safeQuoteDetailFetch('hotels', [] as Hotel[], getHotels) : skippedQuoteDetailFetch('hotels', [] as Hotel[])",
      "safeQuoteDetailFetch('hotel contracts', [] as HotelContract[], getHotelContracts)",
      "skippedQuoteDetailFetch('hotel contracts', [] as HotelContract[])",
      "shouldLoadHotelPlanningData ? safeQuoteDetailFetch('hotel rates', [] as HotelRate[], getHotelRates) : skippedQuoteDetailFetch('hotel rates', [] as HotelRate[])",
      'hotels={hotels}',
    ]);
  });

  it('keeps general quote hotel rates unscoped while contract detail pages scope their own rates', () => {
    expectSourceContains(quotePageSource, [
      'async function getHotelRates(): Promise<HotelRate[]>',
      "return adminPageFetchJson<HotelRate[]>(`${DATA_API_BASE_URL}/hotel-rates`, 'Quote detail hotel rates', {",
    ]);

    assert.doesNotMatch(quotePageSource, /hotel-rates\?contractId/);
    assert.doesNotMatch(quotePageSource, /async function getHotelRates\(contractId/);
  });

  it('renders loaded hotels and keeps room categories available in the drawer', () => {
    expectSourceContains(quoteItemsFormSource, [
      'const selectedHotelRoomCategories = hotels.find((hotel) => hotel.id === hotelId)?.roomCategories || [];',
      '{hotels.length === 0 ? (',
      '{hotels.map((hotel) => {',
      '<option value="">Select hotel</option>',
    ]);
  });

  it('shows HB when a selected contract has an HB supplement even if rates are BB based', () => {
    expectSourceContains(quoteItemsFormSource, [
      'function contractHasHbSupplement(contract: HotelContract | null, roomCategoryId?: string | null, seasonName?: string | null)',
      'function calculateHotelSupplementPreviewTotal(',
      'function isHbMealSupplement(',
      'function roomCategorySortRank(',
      "type === 'EXTRA_DINNER'",
      "mealPlan === 'HB' && baseMealPlan === 'BB' && isHbMealSupplement",
      "basis === 'PER_ROOM' || basis === 'PER_ROOM_NIGHT'",
      "...occupancyFilteredRates.map((rate) => rate.mealPlan)",
      "contractHasHbSupplement(selectedHotelContract, roomCategoryId, effectiveSeasonName) && occupancyFilteredRates.some((rate) => rate.mealPlan === 'BB')",
      "selectedHotelBaseRate",
      "rate.mealPlan === 'BB'",
      'const hotelPreviewSupplementTotal = calculateHotelSupplementPreviewTotal(',
      "hotelPreviewPricingBasis === 'PER_PERSON'",
      'hotelPreviewPax',
      'const hotelPricingBreakdownLines = hotelCostCalculation?.breakdown.flatMap',
      'hotelPreviewUnitRate * hotelPreviewMultiplier * hotelPreviewNights + hotelPreviewSupplementTotal',
      'setHotelCostCalculation(null);',
      'if (isHotelService) {',
      'return Number.isFinite(hotelEffectiveTotalCost) ? hotelEffectiveTotalCost : null;',
    ]);
  });
});
