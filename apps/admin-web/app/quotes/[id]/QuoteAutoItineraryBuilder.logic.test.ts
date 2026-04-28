import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildItineraryApplyMessage,
  generateItineraryDays,
  getAutoItineraryDayTitle,
  mergeExistingItineraryDays,
} from './QuoteAutoItineraryBuilder.logic';

describe('quote auto itinerary builder logic', () => {
  it('4 nights creates 5 days via the draft generator', () => {
    const days = generateItineraryDays('2026-05-10', 4);

    assert.deepEqual(
      days.map((day) => day.title),
      ['Arrival', 'Day 2', 'Day 3', 'Day 4', 'Departure'],
    );
    assert.deepEqual(
      days.map((day) => day.date),
      ['2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14'],
    );
    assert.equal(buildItineraryApplyMessage(days.length, days.length), '5 itinerary days ready.');
  });

  it('existing Day 1 does not block generation of missing days', () => {
    const existingDays = mergeExistingItineraryDays([{ id: 'day-1', dayNumber: 1, title: 'Custom arrival' }]);
    const generatedDays = generateItineraryDays('2026-05-10', 4);
    const missingDays = generatedDays.filter((day) => !existingDays.has(day.dayNumber));

    assert.equal(existingDays.get(1)?.title, 'Custom arrival');
    assert.deepEqual(
      missingDays.map((day) => day.dayNumber),
      [2, 3, 4, 5],
    );
    assert.equal(buildItineraryApplyMessage(generatedDays.length, missingDays.length), '5 itinerary days ready.');
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

  it('works without pricing, services, or cost data', () => {
    const days = generateItineraryDays(null, 4);

    assert.equal(days.length, 5);
    assert.deepEqual(Object.keys(days[0]).sort(), ['date', 'dayNumber', 'title']);
    assert.equal(days[0].date, null);
    assert.equal(days[4].title, 'Departure');
  });

  it('still exposes the individual title helper used by generated days', () => {
    assert.equal(getAutoItineraryDayTitle(1, 5), 'Arrival');
    assert.equal(getAutoItineraryDayTitle(5, 5), 'Departure');
  });
});
