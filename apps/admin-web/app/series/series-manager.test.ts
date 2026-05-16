import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(join(process.cwd(), 'app/series/SeriesManager.tsx'), 'utf8');

describe('series manager operations UI', () => {
  it('exposes operational actions on each series row', () => {
    for (const token of ['Add Departure', 'Clone Departure', 'Open Series', 'Open Departure']) {
      assert.match(source, new RegExp(token));
    }
  });

  it('renders visible submit actions for add and clone forms', () => {
    for (const token of ['Create Departure', 'Execute Clone Departure', 'series-departure-actions']) {
      assert.match(source, new RegExp(token));
    }

    assert.match(source, /form id=\{`add-departure-\$\{item\.id\}`\}/);
    assert.match(source, /form id=\{`clone-departure-\$\{item\.id\}`\}/);
  });

  it('shows upcoming departures and operational counts', () => {
    for (const token of ['Upcoming departures', 'Pax:', 'Rooming:', 'Vouchers pending:', 'Confirmations pending:']) {
      assert.match(source, new RegExp(token));
    }
  });

  it('wires departure creation and clone actions to existing endpoints', () => {
    for (const token of [
      'addDeparture',
      'cloneDeparture',
      '/api/series/${seriesId}/departures',
      '/api/series/${seriesId}/departures/${departureId}/clone',
      'bookingId',
      'departureDate',
      'lowOccupancyThreshold',
      'totalCapacity',
      'guaranteedMinimumPax',
      'sharedCoachCapacity',
    ]) {
      assert.match(source, new RegExp(token.replace(/[${}]/g, '\\$&')));
    }
  });

  it('exposes departure capacity fields and seat counts', () => {
    for (const token of [
      'Total capacity',
      'Guaranteed minimum pax',
      'Shared coach capacity',
      'Seats remaining:',
      'Guaranteed minimum:',
      'cloneTotalCapacity',
      'cloneGuaranteedMinimumPax',
      'cloneSharedCoachCapacity',
    ]) {
      assert.match(source, new RegExp(token));
    }
  });

  it('submits clone source departure id while showing the departure code label', () => {
    assert.match(source, /<select name="departureId" defaultValue="">/);
    assert.match(source, /<option key=\{departure\.id\} value=\{departure\.id\} data-departure-code=\{departure\.departureCode \|\| ''\}>/);
    assert.match(source, /getDepartureLabel\(departure\)/);
    assert.match(source, /clone submits the source departure ID/);
  });

  it('surfaces exact backend errors for departure actions', () => {
    assert.match(source, /async function readActionError\(response: Response, fallback: string\)/);
    assert.match(source, /setError\(await readActionError\(response, 'Departure could not be cloned\.'\)\)/);
    assert.match(source, /setError\(await readActionError\(response, 'Departure could not be created\. Check the booking ID and try again\.'\)\)/);
  });
});
