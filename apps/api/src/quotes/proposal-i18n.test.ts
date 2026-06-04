import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  PROPOSAL_LOCALES,
  intlLocale,
  proposalLabel,
  proposalTextDirection,
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
