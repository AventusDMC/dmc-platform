import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { deriveDayCountry, DAY_COUNTRY_UNRESOLVED } from './quote-day-country';

describe('deriveDayCountry', () => {
  it('uses a hotel item\'s resolved city country', () => {
    assert.equal(
      deriveDayCountry({ items: [{ hotelCountry: 'Jordan' }] }),
      'Jordan',
    );
  });

  it('prefers the hotel country over an external-package country', () => {
    assert.equal(
      deriveDayCountry({
        items: [
          { externalPackageCountry: 'Egypt' },
          { hotelCountry: 'Jordan' },
        ],
      }),
      'Jordan',
    );
  });

  it('returns the first non-empty hotel country across items', () => {
    assert.equal(
      deriveDayCountry({
        items: [{ hotelCountry: null }, { hotelCountry: '  Israel ' }, { hotelCountry: 'Jordan' }],
      }),
      'Israel',
    );
  });

  it('falls back to an external-package country when no hotel resolves', () => {
    assert.equal(
      deriveDayCountry({
        items: [{ hotelCountry: '   ' }, { externalPackageCountry: 'Turkey' }],
      }),
      'Turkey',
    );
  });

  it('falls back to the quote-level country when no item resolves', () => {
    assert.equal(
      deriveDayCountry({
        items: [{ hotelCountry: null, externalPackageCountry: '' }],
        quoteFallbackCountry: 'Jordan',
      }),
      'Jordan',
    );
  });

  it('returns null when nothing resolves (caller shows the unresolved label)', () => {
    assert.equal(deriveDayCountry({ items: [] }), null);
    assert.equal(
      deriveDayCountry({ items: [{ hotelCountry: '  ' }], quoteFallbackCountry: '  ' }),
      null,
    );
    // sanity: the label exists for the caller
    assert.equal(typeof DAY_COUNTRY_UNRESOLVED, 'string');
  });
});
