import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  PROPOSAL_LOCALES,
  intlLocale,
  joinProseList,
  prosePhrase,
  proposalLabel,
  proposalTextDirection,
  proseTemplate,
  resolveProposalLanguage,
  unitLabel,
} from './proposal-i18n';

// Every label key used by the proposal renderer (kept in sync with the token
// list in proposal-v3.service renderHtml + the mapper). Completeness is asserted
// so a missing translation can never silently fall back mid-document.
const REQUIRED_LABEL_KEYS = [
  'reference', 'prepared', 'preparedFor', 'travelDates', 'duration', 'guests',
  'pricingSummary', 'totalPackagePrice', 'pricePerPerson', 'quoteCurrency',
  'journeyOverview', 'travelers', 'services', 'itinerary', 'highlights', 'keyMoments',
  'accommodation', 'stayOverview', 'tableDay', 'tableHotel', 'tableLocation', 'tableRoom', 'tableNotes',
  'dayByDay', 'finalDetails', 'inclusionsAndPricing', 'included', 'inclusions', 'pricingNotesEyebrow', 'notes',
  'groupStay', 'groupTransfer', 'groupExperience', 'groupMeal', 'groupGuide', 'groupPartnerPackage', 'groupOther',
  'inclAccommodation', 'inclTransport', 'inclExperiences', 'inclGuiding', 'inclPartner',
  'noteAvailability', 'noteAltSimple', 'noteRegulations',
] as const;

test('proposal-i18n: supports exactly en/pt/es/ar', () => {
  assert.deepEqual([...PROPOSAL_LOCALES], ['en', 'pt', 'es', 'ar']);
});

test('proposal-i18n: every label is present + non-empty in all four locales', () => {
  for (const key of REQUIRED_LABEL_KEYS) {
    for (const locale of PROPOSAL_LOCALES) {
      const value = proposalLabel(locale, key as any);
      assert.ok(value && value.trim().length > 0, `missing ${key} for ${locale}`);
    }
  }
});

test('proposal-i18n: resolveProposalLanguage validates + defaults to en', () => {
  assert.equal(resolveProposalLanguage('pt'), 'pt');
  assert.equal(resolveProposalLanguage('AR'), 'ar'); // case-insensitive
  assert.equal(resolveProposalLanguage('es'), 'es');
  assert.equal(resolveProposalLanguage('xx'), 'en'); // unsupported → en
  assert.equal(resolveProposalLanguage(''), 'en');
  assert.equal(resolveProposalLanguage(null), 'en');
  assert.equal(resolveProposalLanguage(undefined), 'en');
});

test('proposal-i18n: intlLocale maps en to en-US (preserves English formatting)', () => {
  assert.equal(intlLocale('en'), 'en-US');
  assert.equal(intlLocale('pt'), 'pt-PT');
  assert.equal(intlLocale('es'), 'es-ES');
  assert.equal(intlLocale('ar'), 'ar');
});

test('proposal-i18n: only Arabic is RTL', () => {
  assert.equal(proposalTextDirection('ar'), 'rtl');
  assert.equal(proposalTextDirection('en'), 'ltr');
  assert.equal(proposalTextDirection('pt'), 'ltr');
  assert.equal(proposalTextDirection('es'), 'ltr');
});

test('proposal-i18n: unit plurals are localized', () => {
  assert.equal(unitLabel('en', 'night', 1), 'night');
  assert.equal(unitLabel('en', 'night', 2), 'nights');
  assert.equal(unitLabel('pt', 'night', 2), 'noites');
  assert.equal(unitLabel('es', 'guest', 1), 'huésped');
  assert.equal(unitLabel('ar', 'day', 3), 'أيام');
});

test('proposal-i18n: English label values are unchanged from the prior hardcoded strings', () => {
  assert.equal(proposalLabel('en', 'journeyOverview'), 'Journey overview');
  assert.equal(proposalLabel('en', 'dayByDay'), 'Day by Day');
  assert.equal(proposalLabel('en', 'totalPackagePrice'), 'Total Package Price');
  assert.equal(proposalLabel('en', 'inclAccommodation'), 'Accommodation as outlined in the itinerary.');
  assert.equal(proposalLabel('en', 'groupStay'), 'Stay');
});

// ---- Phase 3A.1: free-form prose dictionary (intros, summaries, helper titles) ----

// Every prose phrase fragment + sentence template used by the mapper. Completeness
// is asserted across all four locales so a missing translation can never silently
// fall back to English mid-sentence.
const REQUIRED_PROSE_PHRASE_KEYS = [
  'programStays', 'programTransfers', 'programExperiences', 'programPartner', 'programFallback',
  'pillarStays', 'pillarTransport', 'pillarExperiences', 'pillarPartner', 'pillarFallback',
  'focusExperiences', 'focusTransfers', 'focusStays', 'focusFallback',
] as const;

const REQUIRED_PROSE_TEMPLATE_KEYS = [
  'coverIntroWithDest', 'coverIntroNoDest',
  'journeyWithDest', 'journeyNoDest',
  'dayByDayWithDestOvernight', 'dayByDayWithDestServices', 'dayByDayWithDestPlain',
  'dayByDayNoDestServices', 'dayByDayFinalizing',
  'signatureWithDest', 'signatureNoDest',
  'accomByLocation', 'accomRouting',
  'svcStayIn', 'svcStayArrangements', 'svcTransferTo', 'svcTransferArrangements',
  'svcVisit', 'svcExperienceDetails', 'svcDiningIn', 'svcDiningArrangements',
  'svcGuidedTourOf', 'svcGuideArrangements', 'svcProgramDetails',
] as const;

// Required {placeholders} per template — asserts each locale keeps the tokens the
// mapper substitutes, so no locale can drop a variable and render a broken sentence.
const TEMPLATE_REQUIRED_TOKENS: Record<string, string[]> = {
  coverIntroWithDest: ['{dest}', '{program}'],
  coverIntroNoDest: ['{program}'],
  journeyWithDest: ['{dayCount}', '{dest}', '{guests}', '{arrangement}'],
  journeyNoDest: ['{dayCount}', '{guests}', '{arrangement}'],
  dayByDayWithDestOvernight: ['{dayCount}', '{dest}'],
  dayByDayWithDestServices: ['{dayCount}', '{dest}'],
  dayByDayWithDestPlain: ['{dayCount}', '{dest}'],
  dayByDayNoDestServices: ['{dayCount}'],
  signatureWithDest: ['{dest}', '{focus}'],
  signatureNoDest: ['{focus}'],
  accomByLocation: ['{cities}'],
  accomRouting: ['{dest}'],
  svcStayIn: ['{location}'],
  svcTransferTo: ['{location}'],
  svcVisit: ['{location}'],
  svcDiningIn: ['{location}'],
  svcGuidedTourOf: ['{location}'],
};

test('proposal-i18n: every prose phrase fragment is present + non-empty in all four locales', () => {
  for (const key of REQUIRED_PROSE_PHRASE_KEYS) {
    for (const locale of PROPOSAL_LOCALES) {
      const value = prosePhrase(locale, key as any);
      assert.ok(value && value.trim().length > 0, `missing prose phrase ${key} for ${locale}`);
    }
  }
});

test('proposal-i18n: every prose template is present + non-empty in all four locales', () => {
  for (const key of REQUIRED_PROSE_TEMPLATE_KEYS) {
    for (const locale of PROPOSAL_LOCALES) {
      const value = proseTemplate(locale, key as any);
      assert.ok(value && value.trim().length > 0, `missing prose template ${key} for ${locale}`);
    }
  }
});

test('proposal-i18n: each prose template keeps its required {placeholders} in every locale', () => {
  for (const [key, tokens] of Object.entries(TEMPLATE_REQUIRED_TOKENS)) {
    for (const locale of PROPOSAL_LOCALES) {
      const raw = proseTemplate(locale, key as any); // no vars → placeholders remain
      for (const token of tokens) {
        assert.ok(raw.includes(token), `template ${key}/${locale} dropped ${token}`);
      }
    }
  }
});

test('proposal-i18n: proseTemplate substitutes all variables (no leftover {token})', () => {
  for (const locale of PROPOSAL_LOCALES) {
    const out = proseTemplate(locale, 'journeyWithDest', {
      dayCount: 5,
      dest: 'Jordan',
      guests: '2 guests',
      arrangement: 'selected stays',
    });
    assert.ok(out.includes('5'), `dayCount not substituted for ${locale}`);
    assert.ok(out.includes('Jordan'), `dest not substituted for ${locale}`);
    assert.doesNotMatch(out, /\{[a-zA-Z]+\}/, `leftover placeholder for ${locale}: ${out}`);
  }
});

test('proposal-i18n: joinProseList preserves English Oxford-comma behavior', () => {
  // Byte-identical to the prior `arr.join(', ').replace(/, ([^,]*)$/, ', and $1')`.
  assert.equal(joinProseList('en', ['stays']), 'stays');
  assert.equal(joinProseList('en', ['stays', 'transfers']), 'stays, and transfers');
  assert.equal(joinProseList('en', ['stays', 'transfers', 'experiences']), 'stays, transfers, and experiences');
  assert.equal(joinProseList('en', []), '');
  assert.equal(joinProseList('en', ['stays', null, undefined as any, 'experiences']), 'stays, and experiences');
});

test('proposal-i18n: joinProseList uses locale connectors for non-English', () => {
  assert.equal(joinProseList('pt', ['a', 'b', 'c']), 'a, b e c');
  assert.equal(joinProseList('es', ['a', 'b', 'c']), 'a, b y c');
  assert.equal(joinProseList('ar', ['a', 'b']), 'a و b');
});

test('proposal-i18n: English prose values are unchanged from the prior hardcoded strings', () => {
  // Sentence templates (English) reproduce the previous hardcoded copy exactly.
  assert.equal(
    proseTemplate('en', 'coverIntroWithDest', { dest: 'Jordan', program: 'stays, and transfers' }),
    'A destination-aware proposal for Jordan, with stays, and transfers sequenced around the itinerary.',
  );
  assert.equal(
    proseTemplate('en', 'journeyWithDest', { dayCount: 7, dest: 'Jordan', guests: '2 guests', arrangement: 'selected stays' }),
    'A 7-day journey through Jordan for 2 guests, shaped around selected stays.',
  );
  assert.equal(
    proseTemplate('en', 'dayByDayWithDestServices', { dayCount: 3, dest: 'Jordan' }),
    'A 3-day outline following the route through Jordan, with services grouped by day.',
  );
  assert.equal(
    proseTemplate('en', 'dayByDayFinalizing'),
    'The itinerary structure is being finalized and will be shared in the confirmed proposal.',
  );
  assert.equal(
    proseTemplate('en', 'signatureNoDest', { focus: 'well-placed stays' }),
    'Tailored with well-placed stays coordinated into one proposal.',
  );
  assert.equal(proseTemplate('en', 'svcStayIn', { location: 'Amman' }), 'Stay in Amman');
  assert.equal(proseTemplate('en', 'svcProgramDetails'), 'Program details');
  // Phrase fragments (English) unchanged.
  assert.equal(prosePhrase('en', 'programStays'), 'stays');
  assert.equal(prosePhrase('en', 'pillarTransport'), 'private ground arrangements');
  assert.equal(prosePhrase('en', 'focusFallback'), 'the confirmed journey flow');
});
