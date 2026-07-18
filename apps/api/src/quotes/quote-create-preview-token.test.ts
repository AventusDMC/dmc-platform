import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildCreatePreviewToken, verifyCreatePreviewToken } from './quote-create-preview-token';

// Slice 2C — the OPAQUE (AES-256-GCM) create-preview token. It must round-trip for
// the server, resist tampering, and — critically — NOT leak the projected cost it
// carries to a client that base64-decodes it.

const SECRET = 'unit-test-secret';
const PAYLOAD = {
  kind: 'v2-activity-create',
  quoteId: 'quote-1',
  dayId: 'day-1',
  activityId: 'act-1',
  activityRateVariantId: 'var-1',
  serviceDate: '2026-08-07T00:00:00.000Z',
  adultCount: 2,
  childCount: 0,
  snapshotHash: 'abc123',
  projected: { itemCost: 1234.56, itemSell: 1500, quoteTotalCost: 9999.99, quoteTotalSell: 12000, currency: 'USD' },
  issuedAt: 1000,
  exp: 1600,
};

test('round-trips: a built token decrypts back to the exact payload', () => {
  const token = buildCreatePreviewToken(PAYLOAD, SECRET);
  const decoded = verifyCreatePreviewToken(token, SECRET);
  assert.deepEqual(decoded, PAYLOAD);
});

test('token format is v2c.<iv>.<tag>.<ciphertext> (4 parts, opaque prefix)', () => {
  const token = buildCreatePreviewToken(PAYLOAD, SECRET);
  const parts = token.split('.');
  assert.equal(parts.length, 4);
  assert.equal(parts[0], 'v2c');
});

test('the token does NOT leak projected cost to a base64 decode (opacity)', () => {
  const token = buildCreatePreviewToken(PAYLOAD, SECRET);
  // The whole token, and every dot-separated segment decoded as base64/base64url,
  // must not contain the cost numbers or the field names.
  const needles = ['1234.56', '1234', '9999.99', '9999', 'itemCost', 'quoteTotalCost', 'projected'];
  const haystacks = [token];
  for (const seg of token.split('.')) {
    for (const enc of ['base64', 'base64url'] as const) {
      try {
        haystacks.push(Buffer.from(seg, enc).toString('utf8'));
        haystacks.push(Buffer.from(seg, enc).toString('latin1'));
      } catch {
        /* ignore undecodable segment */
      }
    }
  }
  for (const hay of haystacks) {
    for (const needle of needles) {
      assert.ok(!hay.includes(needle), `opaque token unexpectedly exposed "${needle}"`);
    }
  }
});

test('a tampered ciphertext fails GCM auth and returns null', () => {
  const token = buildCreatePreviewToken(PAYLOAD, SECRET);
  const parts = token.split('.');
  // Flip a character in the ciphertext segment.
  const ct = parts[3];
  const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
  const tampered = [parts[0], parts[1], parts[2], flipped].join('.');
  assert.equal(verifyCreatePreviewToken(tampered, SECRET), null);
});

test('a tampered auth tag returns null', () => {
  const token = buildCreatePreviewToken(PAYLOAD, SECRET);
  const parts = token.split('.');
  const tag = parts[2];
  const flipped = (tag[0] === 'A' ? 'B' : 'A') + tag.slice(1);
  assert.equal(verifyCreatePreviewToken([parts[0], parts[1], flipped, parts[3]].join('.'), SECRET), null);
});

test('a wrong secret cannot decrypt the token (returns null)', () => {
  const token = buildCreatePreviewToken(PAYLOAD, SECRET);
  assert.equal(verifyCreatePreviewToken(token, 'different-secret'), null);
});

test('malformed / wrong-version / non-string tokens return null', () => {
  assert.equal(verifyCreatePreviewToken('v1.garbage.sig', SECRET), null); // shared apply-token shape
  assert.equal(verifyCreatePreviewToken('v2c.only.three', SECRET), null);
  assert.equal(verifyCreatePreviewToken('not-a-token', SECRET), null);
  assert.equal(verifyCreatePreviewToken('', SECRET), null);
  assert.equal(verifyCreatePreviewToken(undefined, SECRET), null);
  assert.equal(verifyCreatePreviewToken(null, SECRET), null);
  assert.equal(verifyCreatePreviewToken(12345 as unknown as string, SECRET), null);
});

test('two builds of the same payload differ (random IV) but both decrypt equal', () => {
  const a = buildCreatePreviewToken(PAYLOAD, SECRET);
  const b = buildCreatePreviewToken(PAYLOAD, SECRET);
  assert.notEqual(a, b, 'a random IV should make ciphertexts differ');
  assert.deepEqual(verifyCreatePreviewToken(a, SECRET), verifyCreatePreviewToken(b, SECRET));
});
