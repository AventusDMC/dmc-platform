import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildProposalDocumentTitle } from './proposal-v3.mapper';

// P1 (proposal QA, Issue 2) — a client-facing title of "test101" leaked onto the cover.
// The weak-text guard used a bare \btest\b, which misses numeric-suffixed test titles
// ("test101" / "test1") because there is no word boundary between the letters and digits.
// The fix broadens the pattern to \btest\d*\b, so such titles fall back to the
// destination-derived "<Destinations> Travel Proposal". Genuine words that merely contain
// the letters "test" ("Latest", "Greatest") are unaffected.

const DEST = 'Amman · Petra · Wadi Rum';

test('Issue 2: a "test101" title falls back to the destination-derived title', () => {
  const title = buildProposalDocumentTitle({ title: 'test101' } as any, DEST);
  assert.doesNotMatch(title, /test101/i, 'the raw test title must not be used');
  assert.equal(title, `${DEST} Travel Proposal`);
});

test('Issue 2: bare "test" and "test42" are also treated as weak', () => {
  assert.equal(buildProposalDocumentTitle({ title: 'test' } as any, DEST), `${DEST} Travel Proposal`);
  assert.equal(buildProposalDocumentTitle({ title: 'test42' } as any, DEST), `${DEST} Travel Proposal`);
});

test('Issue 2: legitimate titles containing the letters "test" are NOT flagged', () => {
  assert.equal(buildProposalDocumentTitle({ title: 'Latest Jordan Escape' } as any, DEST), 'Latest Jordan Escape');
  assert.equal(buildProposalDocumentTitle({ title: 'Greatest Hits of Jordan' } as any, DEST), 'Greatest Hits of Jordan');
});

test('Issue 2: with no usable title or destination, a safe generic title is used', () => {
  assert.equal(buildProposalDocumentTitle({ title: 'test101' } as any, ''), 'Private Travel Proposal');
});
