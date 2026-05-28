// Hotels Engine v2 — pure helper for suggesting standardized room codes
// from a free-text room-type name.
//
// Algorithm (matches industry-standard DMC practice for short codes):
//   1. Tokenize by whitespace + - / & .
//   2. Drop stop words ("the", "and", "of", etc.), generic hotel
//      terms ("room", "floor", "bed"), and pure-number tokens like
//      "35-39" or "10-24" (floor ranges aren't useful in a 4-letter
//      identifier).
//   3. Take the first letter of each surviving token, uppercase.
//   4. If only ONE significant word survives, expand to its first
//      4 letters (so "Standard" → STAN, not just S).
//   5. Cap at 6 chars.
//   6. Dedupe against existing codes by appending digit suffix
//      (CSBV → CSBV2 → CSBV3 …) until unique.
//
// Pure function — no I/O, no dependencies. Safe to call from server
// actions, server components, or client components.

const STOP_WORDS = new Set([
  'the',
  'and',
  'with',
  'of',
  'a',
  'an',
  'in',
  'on',
  'at',
  'for',
  'to',
  'from',
  'by',
  'or',
  'as',
  'is',
  'are',
  'be',
]);

const GENERIC_HOTEL_TERMS = new Set([
  'room',
  'rooms',
  'floor',
  'floors',
  'bed',
  'beds',
  'bedroom',
]);

const PURE_NUMBER_RANGE = /^[0-9]+(?:[-–][0-9]+)?$/;

function isMeaningfulToken(token: string): boolean {
  if (!token) return false;
  if (token.length === 0) return false;
  const lower = token.toLowerCase();
  if (STOP_WORDS.has(lower)) return false;
  if (GENERIC_HOTEL_TERMS.has(lower)) return false;
  if (PURE_NUMBER_RANGE.test(token)) return false;
  return true;
}

function makeBaseCode(name: string): string {
  if (!name || typeof name !== 'string') return 'ROOM';
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s\-/&]/g, ' '); // keep alphanumerics + a few separators
  const rawTokens = cleaned.split(/[\s\-/&]+/);
  const significant = rawTokens.filter(isMeaningfulToken);

  if (significant.length === 0) {
    // Fallback: use the first non-empty raw token, up to 4 chars
    const fallback = rawTokens.find((t) => t.length > 0) || 'ROOM';
    return fallback.slice(0, 4);
  }

  if (significant.length === 1) {
    // Single-word room name — take first 4 chars so "Standard" → STAN
    return significant[0].slice(0, 4);
  }

  // Multi-word — first letter of each, capped at 6 to stay code-like
  const initials = significant.map((t) => t[0]).join('');
  return initials.slice(0, 6);
}

/**
 * Suggest a unique short code for a room type given its display name
 * and the set of codes already in use for the same hotel.
 *
 * Always returns a non-empty string. If the algorithm would generate
 * a collision, the result is suffixed with the lowest digit (≥ 2)
 * that produces a unique code.
 */
export function suggestRoomCode(name: string, existingCodes: Iterable<string | null | undefined>): string {
  const taken = new Set<string>();
  for (const c of existingCodes) {
    if (typeof c === 'string' && c.trim().length > 0) {
      taken.add(c.trim().toUpperCase());
    }
  }

  const base = makeBaseCode(name);
  if (!taken.has(base)) {
    return base;
  }

  let n = 2;
  while (taken.has(`${base}${n}`)) {
    n += 1;
    if (n > 999) {
      // Defensive bail-out — astronomically unlikely.
      return `${base}${Date.now().toString(36).slice(-3).toUpperCase()}`;
    }
  }
  return `${base}${n}`;
}
