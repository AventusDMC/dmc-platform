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
    ]) {
      assert.match(source, new RegExp(token.replace(/[${}]/g, '\\$&')));
    }
  });
});
