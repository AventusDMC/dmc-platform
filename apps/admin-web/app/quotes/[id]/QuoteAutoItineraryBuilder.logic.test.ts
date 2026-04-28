import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildItineraryApplyMessage,
  getAutoItineraryDayTitle,
  mergeExistingItineraryDays,
} from './QuoteAutoItineraryBuilder.logic';

describe('quote auto itinerary builder logic', () => {
  it('labels 4 nights as 5 itinerary days with arrival middle days and departure', () => {
    const totalDays = 4 + 1;

    assert.deepEqual(
      Array.from({ length: totalDays }, (_, index) => getAutoItineraryDayTitle(index + 1, totalDays)),
      ['Arrival', 'Day 2', 'Day 3', 'Day 4', 'Departure'],
    );
  });

  it('keeps existing Day 1 and only reports missing days as added', () => {
    const existingDays = mergeExistingItineraryDays([{ id: 'day-1', dayNumber: 1, title: 'Custom arrival' }]);

    assert.equal(existingDays.get(1)?.title, 'Custom arrival');
    assert.equal(buildItineraryApplyMessage(5, 4), 'Added 4 missing itinerary days.');
  });

  it('preserves customized day labels when merging existing itinerary days', () => {
    const existingDays = mergeExistingItineraryDays([
      { id: 'day-1', dayNumber: 1, title: 'VIP arrival and gala' },
      { id: 'day-2', dayNumber: 2, title: 'Petra leadership retreat' },
    ]);

    assert.equal(existingDays.get(1)?.title, 'VIP arrival and gala');
    assert.equal(existingDays.get(2)?.title, 'Petra leadership retreat');
  });

  it('does not duplicate days when the builder is run again', () => {
    const existingDays = mergeExistingItineraryDays(
      [{ id: 'legacy-day-1', dayNumber: 1, title: 'Legacy arrival' }],
      [
        { id: 'structured-day-1', dayNumber: 1, title: 'Structured arrival' },
        { id: 'structured-day-2', dayNumber: 2, title: 'Day 2' },
      ],
    );

    assert.equal(existingDays.size, 2);
    assert.equal(existingDays.get(1)?.id, 'legacy-day-1');
    assert.equal(buildItineraryApplyMessage(5, 0), '5 itinerary days ready.');
  });
});
