import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { suggestRoomCode } from './room-code-suggester';

// Pure-helper tests for the v2 room-code suggester. Locks in the
// "initials of significant tokens, deduped" algorithm so future
// refactors don't silently change the codes operators see.

describe('suggestRoomCode — multi-word names', () => {
  it('returns initials of significant words', () => {
    assert.equal(suggestRoomCode('Crown Suite Boulevard View', []), 'CSBV');
  });

  it('drops floor-range tokens like "35-39" and the literal word "Floor"', () => {
    assert.equal(suggestRoomCode('Crown Suite Boulevard View 35-39 Floor', []), 'CSBV');
  });

  it('drops generic terms "Room" and "Bed"', () => {
    assert.equal(suggestRoomCode('High Floor Room - King & Twin 25-32 Floor', []), 'HKT');
  });

  it('drops stopwords like "with" and "&"', () => {
    assert.equal(suggestRoomCode('King/Twin Bed with Club Lounge 32-40 Floor', []), 'KTCL');
  });

  it('caps the result at 6 chars', () => {
    const code = suggestRoomCode(
      'Large Corner Club Lounge Access King Bed 32-40 Floor',
      [],
    );
    assert.ok(code.length <= 6, `expected ≤ 6 chars, got "${code}" (${code.length})`);
    // First 6 initials of meaningful tokens: L C C L A K → "LCCLAK"
    assert.equal(code, 'LCCLAK');
  });

  it('handles slashes and ampersands as separators', () => {
    assert.equal(suggestRoomCode('Guest Room City View - King & Twin', []), 'GCVKT');
  });
});

describe('suggestRoomCode — single-word names', () => {
  it('expands a single word to its first 4 chars', () => {
    assert.equal(suggestRoomCode('Standard', []), 'STAN');
    assert.equal(suggestRoomCode('Deluxe', []), 'DELU');
    assert.equal(suggestRoomCode('Suite', []), 'SUIT');
  });

  it('handles a single short word (≤ 4 chars) by using it whole', () => {
    assert.equal(suggestRoomCode('King', []), 'KING');
  });
});

describe('suggestRoomCode — deduplication', () => {
  it('returns the base when no collision', () => {
    assert.equal(suggestRoomCode('Standard Double', new Set()), 'SD');
  });

  it('appends "2" on first collision', () => {
    assert.equal(suggestRoomCode('Standard Double', ['SD']), 'SD2');
  });

  it('appends "3" if base and "2" are both taken', () => {
    assert.equal(suggestRoomCode('Standard Double', ['SD', 'SD2']), 'SD3');
  });

  it('is case-insensitive on the dedupe check', () => {
    assert.equal(suggestRoomCode('Standard Double', ['sd']), 'SD2');
  });

  it('ignores blank/null entries in the existing-codes set', () => {
    assert.equal(suggestRoomCode('Standard Double', ['', null as any, undefined as any]), 'SD');
  });
});

describe('suggestRoomCode — defensive edge cases', () => {
  it('returns a fallback when the name is empty', () => {
    assert.equal(suggestRoomCode('', []), 'ROOM');
  });

  it('returns a fallback when only stop-words / generics are present', () => {
    assert.equal(suggestRoomCode('The Room', []), 'THE');
    // Both "The" and "Room" are filtered, falls back to first raw token
  });

  it('handles names that are only numbers and floors', () => {
    const code = suggestRoomCode('35-39 Floor', []);
    // Both tokens filtered → fallback to first raw, capped at 4
    assert.ok(code.length > 0);
  });

  it('handles a non-string defensively', () => {
    // @ts-expect-error — testing runtime safety
    assert.equal(suggestRoomCode(null, []), 'ROOM');
  });
});

describe('suggestRoomCode — Jordan catalog examples', () => {
  const cases: Array<[string, string]> = [
    ['Crown Suite Boulevard View 35-39 Floor', 'CSBV'],
    ['Guest Room City View - King & Twin 10-24 Floor', 'GCVKT'],
    ['High Floor Room - King & Twin 25-32 Floor', 'HKT'],
    ['King/Twin Bed with Club Lounge 32-40 Floor', 'KTCL'],
    ['Royal Suite Boulevard View 40-41 Floors', 'RSBV'],
    ['Spacious Room King Bed 35-40 Floor', 'SK'],
    ['One Bedroom Suite 10-14 Floor', 'OS'],
  ];
  for (const [name, expected] of cases) {
    it(`"${name}" → ${expected}`, () => {
      assert.equal(suggestRoomCode(name, []), expected);
    });
  }
});
