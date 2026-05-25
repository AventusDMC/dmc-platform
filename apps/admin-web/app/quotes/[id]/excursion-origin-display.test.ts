import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatOriginAwareExcursionName, getExcursionTemplateNameFromOverrideReason } from './excursion-origin-display';

describe('excursion origin display — One Operational Identifier rule', () => {
  it('humanizes code-shaped template names so they do not look like duplicate route codes', () => {
    // Closes the "AMM_PET / PETRA_FULL_DAY_AMMAN" duplicate-codes
    // confusion. The second token is a code-shaped template name —
    // humanize it so the export reads as commercial copy, not as a code.
    assert.equal(
      formatOriginAwareExcursionName({
        templateName: 'PETRA_FULL_DAY_AMMAN',
        originCity: 'Amman',
      }),
      'Petra Full Day — From Amman',
    );
  });

  it('strips JOR-TR canonical prefix + expands type suffix', () => {
    assert.equal(
      formatOriginAwareExcursionName({
        templateName: 'JOR-TR-SOUTH-AMMAN-PETRA-ON',
        originCity: 'Amman',
      }),
      'Petra Overnight — From Amman',
    );
    assert.equal(
      formatOriginAwareExcursionName({
        templateName: 'JOR-TR-CENTRAL-AMMAN-CITY-RT',
        originCity: 'Amman',
      }),
      'City Round Trip — From Amman',
    );
  });

  it('drops trailing originCity from the template name when redundant', () => {
    assert.equal(
      formatOriginAwareExcursionName({
        templateName: 'AMMAN_CITY_TOUR_AMMAN',
        originCity: 'Amman',
      }),
      'Amman City Tour — From Amman',
    );
  });

  it('leaves human-readable template names alone', () => {
    assert.equal(
      formatOriginAwareExcursionName({
        templateName: 'Petra Full Day',
        originCity: 'Amman',
      }),
      'Petra Full Day — From Amman',
    );
  });

  it('still uses touringRoute name + startCity when no template name is present', () => {
    assert.equal(
      formatOriginAwareExcursionName({
        touringRoute: { name: 'Amman City Tour', startCity: 'Amman' },
      }),
      'Amman City Tour — From Amman',
    );
  });

  it('falls back to "Excursion details pending" when nothing is available', () => {
    assert.equal(formatOriginAwareExcursionName({}), 'Excursion details pending');
  });

  it('parses template name out of overrideReason text blob', () => {
    assert.equal(
      getExcursionTemplateNameFromOverrideReason('Excursion template: Petra Full Day | Origin: Amman'),
      'Petra Full Day',
    );
  });

  it('humanizes a code-shaped name pulled from overrideReason', () => {
    assert.equal(
      formatOriginAwareExcursionName({
        overrideReason: 'Excursion template: PETRA_FULL_DAY_AMMAN | Origin: Amman',
        originCity: 'Amman',
      }),
      'Petra Full Day — From Amman',
    );
  });
});
