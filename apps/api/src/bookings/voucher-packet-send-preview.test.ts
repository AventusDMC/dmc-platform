import test = require('node:test');
import assert = require('node:assert/strict');
import {
  buildVoucherPacketSendPreview,
  type VoucherPacketSendPreviewInput,
} from './voucher-packet-send-preview';

/**
 * Supplier Voucher Packet V2 — S7 pure send-preview/readiness builder tests.
 * Covers every blocker branch, READY only when all clear, recipient from the
 * packet supplier only, and finance/PII-free output.
 */

function base(over: Partial<VoucherPacketSendPreviewInput> = {}): VoucherPacketSendPreviewInput {
  return {
    bookingId: 'bk-1',
    packetId: 'packet-1',
    bookingRef: 'BK-2026-0002',
    packetStatus: 'GENERATED',
    isStale: false,
    hasSnapshot: true,
    supplierId: 'sup-1',
    supplierName: 'TEST Hotel Supplier A',
    supplierEmail: 'ops@supplier.example',
    serviceCount: 1,
    memberLabels: ['QA Hotel Service'],
    sendEnabled: true,
    allowlist: ['ops@supplier.example'],
    ...over,
  };
}

test('READY only when every gate clears; recipient resolved from the packet supplier', () => {
  const p = buildVoucherPacketSendPreview(base());
  assert.equal(p.readiness, 'READY');
  assert.deepEqual(p.blockingReasons, []);
  assert.equal(p.supplierName, 'TEST Hotel Supplier A');
  assert.equal(p.recipientEmail, 'ops@supplier.example');
  assert.deepEqual(p.emails, ['ops@supplier.example']);
  assert.equal(p.serviceCount, 1);
  assert.deepEqual(p.memberLabels, ['QA Hotel Service']);
  assert.equal(p.note, 'Preview only. No email is sent.');
});

test('NO_PACKET when status is not GENERATED', () => {
  assert.equal(buildVoucherPacketSendPreview(base({ packetStatus: 'DRAFT' })).readiness, 'NO_PACKET');
  assert.equal(buildVoucherPacketSendPreview(base({ packetStatus: null })).readiness, 'NO_PACKET');
});

test('PACKET_STALE when stale', () => {
  const p = buildVoucherPacketSendPreview(base({ isStale: true }));
  assert.equal(p.readiness, 'PACKET_STALE');
  assert.ok(p.blockingReasons.some((r) => /stale/i.test(r)));
});

test('NO_PDF when no snapshot', () => {
  assert.equal(buildVoucherPacketSendPreview(base({ hasSnapshot: false })).readiness, 'NO_PDF');
});

test('NO_SUPPLIER when supplier not assigned', () => {
  const p = buildVoucherPacketSendPreview(base({ supplierId: null, supplierName: null, supplierEmail: null }));
  assert.equal(p.readiness, 'NO_SUPPLIER');
  assert.equal(p.recipientEmail, null);
});

test('MISSING_EMAIL when supplier has no email', () => {
  assert.equal(buildVoucherPacketSendPreview(base({ supplierEmail: null })).readiness, 'MISSING_EMAIL');
  assert.equal(buildVoucherPacketSendPreview(base({ supplierEmail: '   ' })).readiness, 'MISSING_EMAIL');
});

test('MULTIPLE_EMAILS blocks (packet needs a single recipient)', () => {
  const p = buildVoucherPacketSendPreview(base({ supplierEmail: 'a@x.example, b@y.example' }));
  assert.equal(p.readiness, 'MULTIPLE_EMAILS');
  assert.equal(p.recipientEmail, null);
  assert.deepEqual(p.emails, ['a@x.example', 'b@y.example']);
});

test('INVALID_EMAIL when the single email is malformed', () => {
  const p = buildVoucherPacketSendPreview(base({ supplierEmail: 'not-an-email' }));
  assert.equal(p.readiness, 'INVALID_EMAIL');
  assert.equal(p.recipientEmail, null);
});

test('SEND_DISABLED blocks when backend send is off (primary once data is ready)', () => {
  const p = buildVoucherPacketSendPreview(base({ sendEnabled: false }));
  assert.equal(p.readiness, 'SEND_DISABLED');
  assert.ok(p.blockingReasons.some((r) => /not enabled/i.test(r)));
});

test('RECIPIENT_NOT_ALLOWLISTED when the resolved email is off the allowlist', () => {
  const p = buildVoucherPacketSendPreview(base({ allowlist: ['someone-else@axisdmc.com'] }));
  assert.equal(p.readiness, 'RECIPIENT_NOT_ALLOWLISTED');
  // recipient is still resolved (informative), but blocked
  assert.equal(p.recipientEmail, 'ops@supplier.example');
});

test('allowlist matches by @domain too', () => {
  const p = buildVoucherPacketSendPreview(base({ allowlist: ['@supplier.example'] }));
  assert.equal(p.readiness, 'READY');
});

test('blockingReasons carry ALL applicable blockers (full picture), primary first', () => {
  // stale + no snapshot + send disabled + missing email all at once.
  const p = buildVoucherPacketSendPreview(
    base({ isStale: true, hasSnapshot: false, sendEnabled: false, supplierEmail: null }),
  );
  assert.equal(p.readiness, 'PACKET_STALE', 'primary = highest precedence');
  assert.ok(p.blockingReasons.length >= 4, 'reports every applicable blocker');
});

test('output is finance/PII-free', () => {
  const blob = JSON.stringify(buildVoucherPacketSendPreview(base()));
  for (const forbidden of ['unitCost', 'unitSell', 'totalCost', 'totalSell', 'margin', 'payable', 'passport', 'dateOfBirth', 'contentHash', 'snapshotJson']) {
    assert.ok(!blob.includes(forbidden), `leaked ${forbidden}`);
  }
});
