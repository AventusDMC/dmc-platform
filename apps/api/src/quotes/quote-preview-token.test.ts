import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildPreviewToken, verifyPreviewToken, normalizePayloadHash } from './quote-preview-token';

// Slice B — the shared preview/apply token is now OPAQUE (AES-256-GCM, `v2s`).
// It must round-trip for the server, resist tampering, and — critically — NOT leak
// the projected cost it carries to a client that base64-decodes it. The payload
// shape is unchanged from the old readable v1 token; only the encoding changed.

const SECRET = 'unit-test-preview-secret';
const PAYLOAD = {
  quoteId: 'quote-1',
  itemId: 'item-1',
  companyId: 'company-1',
  optionScope: 'base',
  baseItemCount: 3,
  maxItemUpdatedAt: '2026-06-01T00:00:00.000Z',
  normalizedPayloadHash: normalizePayloadHash({ quantity: 2 }),
  serviceDate: '2026-09-15T00:00:00.000Z',
  projItemCost: 1234.56,
  projItemSell: 1500,
  projQuoteCost: 9999.99,
  projQuoteSell: 12000,
  fxRate: null,
  quoteStatus: 'DRAFT',
  issuedAt: 1000,
  exp: 1900,
};

test('round-trips: a built token decrypts back to the exact payload', () => {
  const token = buildPreviewToken(PAYLOAD, SECRET);
  assert.deepEqual(verifyPreviewToken(token, SECRET), PAYLOAD);
});

test('token format is v2s.<iv>.<authTag>.<ciphertext> (4 opaque parts)', () => {
  const parts = buildPreviewToken(PAYLOAD, SECRET).split('.');
  assert.equal(parts.length, 4);
  assert.equal(parts[0], 'v2s');
});

test('the token does NOT base64-decode to readable JSON or projected cost (opacity)', () => {
  const token = buildPreviewToken(PAYLOAD, SECRET);
  const needles = ['projItemCost', 'projQuoteCost', 'projItemSell', '1234.56', '1234', '9999.99', '9999', 'quoteId', 'normalizedPayloadHash'];
  const haystacks = [token];
  for (const seg of token.split('.')) {
    for (const enc of ['base64', 'base64url'] as const) {
      try {
        haystacks.push(Buffer.from(seg, enc).toString('utf8'));
        haystacks.push(Buffer.from(seg, enc).toString('latin1'));
      } catch {
        /* ignore */
      }
    }
  }
  for (const hay of haystacks) {
    assert.ok(!/\{\s*"[a-zA-Z]+"\s*:/.test(hay), 'token must not expose readable JSON');
    for (const needle of needles) {
      assert.ok(!hay.includes(needle), `opaque token unexpectedly exposed "${needle}"`);
    }
  }
});

test('a tampered ciphertext fails GCM auth and returns null', () => {
  const parts = buildPreviewToken(PAYLOAD, SECRET).split('.');
  const ct = parts[3];
  const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
  assert.equal(verifyPreviewToken([parts[0], parts[1], parts[2], flipped].join('.'), SECRET), null);
});

test('a tampered auth tag returns null', () => {
  const parts = buildPreviewToken(PAYLOAD, SECRET).split('.');
  const tag = parts[2];
  const flipped = (tag[0] === 'A' ? 'B' : 'A') + tag.slice(1);
  assert.equal(verifyPreviewToken([parts[0], parts[1], flipped, parts[3]].join('.'), SECRET), null);
});

test('a wrong secret cannot decrypt the token (returns null)', () => {
  const token = buildPreviewToken(PAYLOAD, SECRET);
  assert.equal(verifyPreviewToken(token, 'a-different-secret'), null);
});

test('malformed / wrong-version / legacy-v1 / non-string tokens return null', () => {
  assert.equal(verifyPreviewToken('v1.seg.sig', SECRET), null); // legacy readable format rejected (clean cut)
  assert.equal(verifyPreviewToken('v2c.a.b.c', SECRET), null); // the 2C create-token prefix is not accepted here
  assert.equal(verifyPreviewToken('v2s.only.three', SECRET), null);
  assert.equal(verifyPreviewToken('not-a-token', SECRET), null);
  assert.equal(verifyPreviewToken('', SECRET), null);
  assert.equal(verifyPreviewToken(undefined, SECRET), null);
  assert.equal(verifyPreviewToken(null, SECRET), null);
  assert.equal(verifyPreviewToken(12345 as unknown as string, SECRET), null);
});

test('random IV: two builds of the same payload differ but both decrypt equal', () => {
  const a = buildPreviewToken(PAYLOAD, SECRET);
  const b = buildPreviewToken(PAYLOAD, SECRET);
  assert.notEqual(a, b, 'a random IV should make ciphertexts differ');
  assert.deepEqual(verifyPreviewToken(a, SECRET), verifyPreviewToken(b, SECRET));
});
