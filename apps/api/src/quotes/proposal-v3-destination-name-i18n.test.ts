import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { localizePlaceName } from './proposal-i18n';

// Phase P.3X-5D — controlled destination/place DISPLAY-name localization.
//
// Dead Sea / Mount Nebo / Bethany must render in the proposal language at the
// controlled display points (destination line / route summary, accommodation
// city, overnight badge). English is byte-identical, and raw free-text day notes
// are NEVER rewritten by a blanket find/replace.

function hotelItem(dayId: string, city: string) {
  return {
    id: `h-${dayId}`,
    itineraryId: dayId,
    service: { name: `${city} Hotel`, category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
    hotel: { name: `${city} Hotel`, city },
    roomCategory: { name: 'Standard Room' },
    occupancyType: 'DBL',
    mealPlan: 'BB',
    pricingBasis: 'PER_ROOM',
    nightCount: 1,
    totalCost: 100,
    totalSell: 120,
  };
}

// A raw operator-authored day note that mentions "Dead Sea" as free text. It must
// pass through unchanged in every locale (no blanket place-name replacement).
const RAW_NOTE = 'A relaxing afternoon by the Dead Sea coast with time to float.';

function quote() {
  return {
    id: 'q-p3x5d',
    quoteCurrency: 'USD',
    quoteNumber: 'Q-P3X5D',
    title: 'Jordan Private Journey',
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 3,
    adults: 2,
    children: 0,
    totalCost: 300,
    totalSell: 360,
    pricePerPax: 180,
    quoteOptions: [],
    itineraries: [
      { id: 'd1', dayNumber: 1, title: 'Dead Sea', description: RAW_NOTE },
      { id: 'd2', dayNumber: 2, title: 'Mount Nebo', description: null },
      { id: 'd3', dayNumber: 3, title: 'Bethany', description: null },
    ],
    quoteItems: [hotelItem('d1', 'Dead Sea'), hotelItem('d2', 'Mount Nebo'), hotelItem('d3', 'Bethany')],
  };
}

function overnightCities(vm: any): string[] {
  return (vm.days || []).map((d: any) => d.overnightLocation).filter(Boolean);
}
function accommodationCities(vm: any): string[] {
  return (vm.accommodationRows || []).map((r: any) => r.location).filter(Boolean);
}

const CASES = {
  es: { localized: ['Mar Muerto', 'Monte Nebo', 'Betania'] },
  pt: { localized: ['Mar Morto', 'Monte Nebo', 'Betânia'] },
  ar: { localized: ['البحر الميت', 'جبل نيبو', 'المغطس'] },
} as const;
const ENGLISH = ['Dead Sea', 'Mount Nebo', 'Bethany'];

for (const [locale, { localized }] of Object.entries(CASES)) {
  test(`P.3X-5D: ${locale} controlled display fields localize the place names`, () => {
    const vm: any = mapQuoteToProposalV3(quote() as any, locale);
    const accom = accommodationCities(vm);
    const overnight = overnightCities(vm);

    for (const name of localized) {
      assert.match(vm.destinationLine, new RegExp(name), `destinationLine has ${name}`);
      assert.ok(accom.includes(name), `accommodation city ${name}`);
      assert.ok(overnight.includes(name), `overnight badge ${name}`);
    }
    // The raw English place names must not survive in these controlled fields.
    for (const en of ENGLISH) {
      assert.doesNotMatch(vm.destinationLine, new RegExp(`\\b${en}\\b`), `destinationLine free of ${en}`);
      assert.ok(!accom.includes(en), `accommodation free of ${en}`);
      assert.ok(!overnight.includes(en), `overnight free of ${en}`);
    }
  });
}

test('P.3X-5D: English controlled display fields are unchanged', () => {
  const vm: any = mapQuoteToProposalV3(quote() as any, 'en');
  const accom = accommodationCities(vm);
  const overnight = overnightCities(vm);
  for (const name of ENGLISH) {
    assert.match(vm.destinationLine, new RegExp(name), `destinationLine has ${name}`);
    assert.ok(accom.includes(name), `accommodation city ${name}`);
    assert.ok(overnight.includes(name), `overnight badge ${name}`);
  }
});

test('P.3X-5D: raw day notes are never rewritten by place-name replacement', () => {
  const en: any = mapQuoteToProposalV3(quote() as any, 'en');
  const es: any = mapQuoteToProposalV3(quote() as any, 'es');
  const enDay1 = en.days.find((d: any) => d.dayNumber === 1);
  const esDay1 = es.days.find((d: any) => d.dayNumber === 1);
  // English note unchanged.
  assert.equal(enDay1.summary, RAW_NOTE);
  // Spanish proposal keeps the free-text note verbatim — "Dead Sea" is NOT translated.
  assert.equal(esDay1.summary, RAW_NOTE);
  assert.match(esDay1.summary, /Dead Sea/);
});

test('P.3X-5D: localizePlaceName maps only the listed names; others pass through', () => {
  assert.equal(localizePlaceName('es', 'Dead Sea'), 'Mar Muerto');
  assert.equal(localizePlaceName('pt', 'Dead Sea'), 'Mar Morto');
  assert.equal(localizePlaceName('ar', 'Dead Sea'), 'البحر الميت');
  assert.equal(localizePlaceName('es', 'Mount Nebo'), 'Monte Nebo');
  assert.equal(localizePlaceName('pt', 'Mount Nebo'), 'Monte Nebo');
  assert.equal(localizePlaceName('ar', 'Mount Nebo'), 'جبل نيبو');
  assert.equal(localizePlaceName('es', 'Bethany'), 'Betania');
  assert.equal(localizePlaceName('pt', 'Bethany'), 'Betânia');
  assert.equal(localizePlaceName('ar', 'Bethany'), 'المغطس');

  // English is byte-identical (short-circuit).
  for (const name of ENGLISH) assert.equal(localizePlaceName('en', name), name);

  // es/pt keep the Jordan destinations as the proper noun (byte-identical
  // pass-through); QAIA is unlisted and passes through in every locale.
  for (const loc of ['es', 'pt'] as const) {
    for (const keep of ['Amman', 'Jerash', 'Madaba', 'Petra', 'Wadi Rum', 'Wadi Musa', 'QAIA']) {
      assert.equal(localizePlaceName(loc, keep), keep);
    }
  }
  // AR2 — the Jordan destinations now carry an Arabic display name; QAIA stays.
  assert.equal(localizePlaceName('ar', 'Amman'), 'عمّان');
  assert.equal(localizePlaceName('ar', 'Jerash'), 'جرش');
  assert.equal(localizePlaceName('ar', 'Madaba'), 'مادبا');
  assert.equal(localizePlaceName('ar', 'Petra'), 'البتراء');
  assert.equal(localizePlaceName('ar', 'Wadi Rum'), 'وادي رم');
  assert.equal(localizePlaceName('ar', 'Wadi Musa'), 'وادي موسى');
  assert.equal(localizePlaceName('ar', 'QAIA'), 'QAIA');

  // Case-insensitive + trimmed exact match; NOT a blanket substring replacement.
  assert.equal(localizePlaceName('es', '  dead sea '), 'Mar Muerto');
  assert.equal(localizePlaceName('es', 'Dead Sea Resort'), 'Dead Sea Resort');
  assert.equal(localizePlaceName('es', ''), '');
});
