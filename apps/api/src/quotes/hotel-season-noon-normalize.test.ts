import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';

// Phase H.2A — hotel season-lookup noon-normalization.
// Hotel contract seasons are stored with noon (12:00:00Z) boundaries, while
// operational dates inherit the quote's end-of-day travelStartDate time
// (23:59:59.999Z). The hotel season match must normalize the service date to
// noon of the same calendar day so boundary-day overnights stop falling into
// the ~12h gap. These tests cover the pure helper + the season-match outcome.

function makeService() {
  const prisma: any = {};
  return new QuotesService(prisma, {} as any, {} as any, {} as any, {} as any) as any;
}

// Mirror of the contract noon-boundary convention (confirmed system-wide).
const HIGH = { from: new Date('2026-03-01T12:00:00.000Z'), to: new Date('2026-05-31T12:00:00.000Z') };
const LOW = { from: new Date('2026-06-01T12:00:00.000Z'), to: new Date('2026-08-31T12:00:00.000Z') };

// Replicates the Prisma season filter: seasonFrom <= D <= seasonTo.
function seasonFor(matchDate: Date | null) {
  if (!matchDate) return 'NO_DATE';
  const inHigh = HIGH.from <= matchDate && HIGH.to >= matchDate;
  const inLow = LOW.from <= matchDate && LOW.to >= matchDate;
  if (inHigh) return 'HIGH';
  if (inLow) return 'LOW';
  return 'GAP';
}

test('helper: any time-of-day on a date normalizes to 12:00:00Z of that calendar date', () => {
  const s = makeService();
  for (const iso of [
    '2026-05-31T23:59:59.999Z',
    '2026-05-31T00:00:00.000Z',
    '2026-05-31T12:00:00.000Z',
    '2026-05-31T08:30:15.123Z',
  ]) {
    const out = s.normalizeHotelSeasonMatchDate(new Date(iso));
    assert.equal(out.toISOString(), '2026-05-31T12:00:00.000Z', `${iso} should normalize to noon`);
  }
});

test('helper: null / undefined / invalid input returns null', () => {
  const s = makeService();
  assert.equal(s.normalizeHotelSeasonMatchDate(null), null);
  assert.equal(s.normalizeHotelSeasonMatchDate(undefined), null);
  assert.equal(s.normalizeHotelSeasonMatchDate(new Date('not-a-date')), null);
});

test('boundary: last day of season at end-of-day matches the ending season (was the gap)', () => {
  const s = makeService();
  // Sun City D4 reproduction: end-of-day on the High season's last calendar day.
  const raw = new Date('2026-05-31T23:59:59.999Z');
  assert.equal(seasonFor(raw), 'GAP', 'raw end-of-day falls in the noon-boundary gap (the bug)');
  assert.equal(seasonFor(s.normalizeHotelSeasonMatchDate(raw)), 'HIGH', 'noon-normalized matches High');
});

test('boundary: first day of season at start-of-day matches the starting season', () => {
  const s = makeService();
  const raw = new Date('2026-06-01T00:00:00.000Z');
  assert.equal(seasonFor(raw), 'GAP', 'raw start-of-day falls before the noon season start');
  assert.equal(seasonFor(s.normalizeHotelSeasonMatchDate(raw)), 'LOW', 'noon-normalized matches Low');
});

test('mid-season: outcome unchanged after normalization', () => {
  const s = makeService();
  for (const iso of ['2026-04-15T23:59:59.999Z', '2026-07-10T00:00:00.000Z']) {
    const raw = new Date(iso);
    const expected = iso.startsWith('2026-04') ? 'HIGH' : 'LOW';
    assert.equal(seasonFor(raw), expected, `${iso} already matches ${expected}`);
    assert.equal(seasonFor(s.normalizeHotelSeasonMatchDate(raw)), expected, `${iso} still matches ${expected} after normalization`);
  }
});

test('robust to full-day boundaries too (noon sits safely inside)', () => {
  const s = makeService();
  const FULL = { from: new Date('2026-03-01T00:00:00.000Z'), to: new Date('2026-05-31T23:59:59.999Z') };
  const matchDate = s.normalizeHotelSeasonMatchDate(new Date('2026-05-31T23:59:59.999Z'));
  assert.ok(FULL.from <= matchDate && FULL.to >= matchDate, 'noon stays inside a full-day range');
});
