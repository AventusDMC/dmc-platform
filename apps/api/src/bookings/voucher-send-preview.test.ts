import test = require('node:test');
import assert = require('node:assert/strict');
import { buildVoucherSendPreview, parseSupplierEmails, type VoucherSendPreviewInput } from './voucher-send-preview';

function baseInput(over: Partial<VoucherSendPreviewInput> = {}): VoucherSendPreviewInput {
  return {
    bookingId: 'bk-1',
    operationId: 'op-1',
    bookingRef: 'BK-2026-0001',
    voucher: { type: 'HOTEL', status: 'GENERATED' },
    assignedSupplierId: 'sup-1',
    assignedSupplier: { id: 'sup-1', name: 'TEST Hotel Supplier A', email: 'ops@supplier.example' },
    ...over,
  };
}

test('send-preview resolves recipient from the ASSIGNED operational supplier and is READY', () => {
  const p = buildVoucherSendPreview(baseInput());
  assert.equal(p.recipient.recipientSource, 'assignedOperationalSupplier');
  assert.equal(p.recipient.supplierId, 'sup-1');
  assert.equal(p.recipient.supplierName, 'TEST Hotel Supplier A');
  assert.equal(p.recipient.email, 'ops@supplier.example');
  assert.deepEqual(p.recipient.emails, ['ops@supplier.example']);
  assert.equal(p.recipient.missingEmail, false);
  assert.equal(p.recipient.invalidEmail, false);
  assert.equal(p.readiness, 'READY');
  assert.deepEqual(p.blockingReasons, []);
  assert.equal(p.attachmentName, 'voucher-op-1.pdf');
  assert.equal(p.note, 'Preview only. No email is sent.');
});

test('send-preview does NOT fall back to a catalog/source supplier — no assigned supplier is NO_SUPPLIER', () => {
  // A voucher exists and even carries a catalog supplier elsewhere, but the
  // OPERATIONAL assignment is null → recipient policy blocks it.
  const p = buildVoucherSendPreview(baseInput({ assignedSupplierId: null, assignedSupplier: null }));
  assert.equal(p.recipient.recipientSource, 'none');
  assert.equal(p.recipient.supplierId, null);
  assert.equal(p.recipient.supplierName, null);
  assert.equal(p.recipient.email, null);
  assert.deepEqual(p.recipient.emails, []);
  assert.equal(p.readiness, 'NO_SUPPLIER');
});

test('send-preview blocks MISSING_EMAIL when the assigned supplier has no email', () => {
  const p = buildVoucherSendPreview(baseInput({ assignedSupplier: { id: 'sup-1', name: 'S', email: null } }));
  assert.equal(p.recipient.missingEmail, true);
  assert.equal(p.recipient.invalidEmail, false);
  assert.equal(p.readiness, 'MISSING_EMAIL');
});

test('send-preview blocks INVALID_EMAIL when a stored email is malformed', () => {
  const p = buildVoucherSendPreview(baseInput({ assignedSupplier: { id: 'sup-1', name: 'S', email: 'not-an-email' } }));
  assert.equal(p.recipient.missingEmail, false);
  assert.equal(p.recipient.invalidEmail, true);
  assert.equal(p.recipient.email, null);
  assert.deepEqual(p.recipient.emails, ['not-an-email']);
  assert.equal(p.readiness, 'INVALID_EMAIL');
});

test('send-preview parses multi-email supplier fields and requires at least one VALID address for READY', () => {
  const p = buildVoucherSendPreview(
    baseInput({ assignedSupplier: { id: 'sup-1', name: 'S', email: 'bad, ops@supplier.example; second@x.co' } }),
  );
  assert.deepEqual(p.recipient.emails, ['bad', 'ops@supplier.example', 'second@x.co']);
  assert.equal(p.recipient.email, 'ops@supplier.example, second@x.co'); // only the valid ones
  assert.equal(p.readiness, 'READY');
});

test('send-preview blocks NO_VOUCHER when no operational voucher exists', () => {
  const p = buildVoucherSendPreview(baseInput({ voucher: null }));
  assert.equal(p.readiness, 'NO_VOUCHER');
  assert.equal(p.voucherType, null);
  assert.equal(p.voucherStatus, null);
  assert.equal(p.attachmentName, null); // nothing to attach
});

test('send-preview blocks VOUCHER_CANCELLED and UNSAFE_STATUS', () => {
  assert.equal(buildVoucherSendPreview(baseInput({ voucher: { type: 'HOTEL', status: 'CANCELLED' } })).readiness, 'VOUCHER_CANCELLED');
  assert.equal(buildVoucherSendPreview(baseInput({ voucher: { type: 'HOTEL', status: 'DRAFT' } })).readiness, 'UNSAFE_STATUS');
});

test('send-preview treats GENERATED/READY/ISSUED/SENT as sendable statuses', () => {
  for (const status of ['GENERATED', 'READY', 'ISSUED', 'SENT']) {
    const p = buildVoucherSendPreview(baseInput({ voucher: { type: 'HOTEL', status } }));
    assert.equal(p.readiness, 'READY', `${status} should be sendable`);
  }
});

test('send-preview output carries NO finance/cost/payment/token/snapshot fields', () => {
  const p = buildVoucherSendPreview(baseInput());
  const json = JSON.stringify(p).toLowerCase();
  for (const bad of ['unitcost', 'totalcost', 'supplierpayable', 'margin', 'price', 'sell', 'payable', 'invoice', 'iban', 'bank', 'payment', 'token', 'portal', 'proposal', 'snapshot', 'discount']) {
    assert.ok(!json.includes(bad), `send-preview leaked "${bad}"`);
  }
});

test('send-preview is pure/deterministic (same input → identical output)', () => {
  const a = buildVoucherSendPreview(baseInput());
  const b = buildVoucherSendPreview(baseInput());
  assert.deepEqual(a, b);
});

test('parseSupplierEmails splits comma/semicolon, trims, dedupes', () => {
  assert.deepEqual(parseSupplierEmails('a@x.co, a@x.co; b@y.co ,'), ['a@x.co', 'b@y.co']);
  assert.deepEqual(parseSupplierEmails(null), []);
  assert.deepEqual(parseSupplierEmails('   '), []);
});
