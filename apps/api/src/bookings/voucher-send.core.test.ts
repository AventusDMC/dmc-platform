import test = require('node:test');
import assert = require('node:assert/strict');
import { sendOperationalVoucherEmailCore, type VoucherSendDeps } from './voucher-send.core';
import type { VoucherSendPreview } from './voucher-send-preview';

function readyPreview(over: Partial<VoucherSendPreview> = {}): VoucherSendPreview {
  return {
    bookingId: 'bk-1',
    operationId: 'op-1',
    bookingRef: 'BK-2026-0001',
    voucherType: 'HOTEL',
    voucherStatus: 'GENERATED',
    recipient: {
      recipientSource: 'assignedOperationalSupplier',
      supplierId: 'sup-1',
      supplierName: 'TEST Hotel Supplier A',
      email: 'ops@supplier.example',
      emails: ['ops@supplier.example'],
      missingEmail: false,
      invalidEmail: false,
    },
    subject: 'Operational voucher — BK-2026-0001 — HOTEL',
    bodySummary: 'The operational voucher for booking BK-2026-0001 would be emailed to the assigned operational supplier for service delivery. No cost or finance information is included.',
    attachmentName: 'voucher-op-1.pdf',
    readiness: 'READY',
    readinessReason: 'ok',
    blockingReasons: [],
    note: 'Preview only. No email is sent.',
    ...over,
  };
}

function makeDeps(over: Partial<VoucherSendDeps> = {}) {
  const state: any = { events: [], sent: null, audit: null, sendCalls: 0, pdfCalls: 0 };
  const deps: VoucherSendDeps = {
    isFeatureEnabled: () => true,
    getAllowlist: () => ['@supplier.example'],
    getSender: () => 'ops@dmc.example',
    isResendConfigured: () => true,
    loadReadiness: async () => readyPreview(),
    loadVoucherId: async () => 'voucher-1',
    getPdf: async () => { state.pdfCalls += 1; return Buffer.from('%PDF-1.4 fake operational voucher'); },
    recentDuplicateExists: async () => false,
    sendMail: async (opts) => { state.sendCalls += 1; state.sent = opts; state.events.push('send'); return { messageId: 'msg-1' }; },
    audit: async (entry) => { state.audit = entry; state.events.push('audit'); },
    ...over,
  };
  return { deps, state };
}

const INPUT = { bookingId: 'bk-1', operationId: 'op-1' };

test('2F-B core: backend flag OFF blocks send — nothing sent, no audit', async () => {
  const { deps, state } = makeDeps({ isFeatureEnabled: () => false });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.blockedReason, 'feature_disabled');
  assert.equal(r.sent, false);
  assert.equal(state.sendCalls, 0);
  assert.equal(state.audit, null);
});

test('2F-B core: missing/empty allowlist fails closed (recipient_allowlist_required)', async () => {
  const { deps, state } = makeDeps({ getAllowlist: () => [] });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.blockedReason, 'recipient_allowlist_required');
  assert.equal(state.sendCalls, 0);
});

test('2F-B core: missing sender blocks (transport_not_configured)', async () => {
  const { deps, state } = makeDeps({ getSender: () => null });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.blockedReason, 'transport_not_configured');
  assert.equal(state.sendCalls, 0);
});

test('2F-B core: non-Resend transport blocks (transport_not_configured)', async () => {
  const { deps, state } = makeDeps({ isResendConfigured: () => false });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.blockedReason, 'transport_not_configured');
  assert.equal(state.sendCalls, 0);
});

test('2F-B core: readiness not READY blocks (not_ready), nothing sent', async () => {
  const { deps, state } = makeDeps({ loadReadiness: async () => readyPreview({ readiness: 'MISSING_EMAIL' }) });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.blockedReason, 'not_ready');
  assert.equal(r.readiness, 'MISSING_EMAIL');
  assert.equal(state.sendCalls, 0);
  assert.equal(state.audit, null);
});

test('2F-B core: recipient resolved server-side from readiness only (no client input); subject/body server-built', async () => {
  const { deps, state } = makeDeps();
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.sent, true);
  // `to` came from preview.recipient.emails — the core takes NO client recipient/subject/body.
  assert.deepEqual(state.sent.to, ['ops@supplier.example']);
  assert.equal(state.sent.subject, 'Operational voucher — BK-2026-0001 — HOTEL');
  assert.equal(state.sent.from, 'ops@dmc.example');
  assert.ok(typeof state.sent.text === 'string' && state.sent.text.length > 0);
});

test('2F-B core: allowlist blocks an out-of-list recipient (recipient_not_allowed)', async () => {
  const { deps, state } = makeDeps({
    getAllowlist: () => ['@allowed.example'],
    loadReadiness: async () => readyPreview({ recipient: { ...readyPreview().recipient, email: 'ops@supplier.example', emails: ['ops@supplier.example'] } }),
  });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.blockedReason, 'recipient_not_allowed');
  assert.equal(state.sendCalls, 0);
});

test('2F-B core: EVERY recipient must pass allowlist — one out-of-list blocks all', async () => {
  const { deps, state } = makeDeps({
    getAllowlist: () => ['@supplier.example'],
    loadReadiness: async () => readyPreview({ recipient: { ...readyPreview().recipient, email: 'a@supplier.example, b@other.example', emails: ['a@supplier.example', 'b@other.example'] } }),
  });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.blockedReason, 'recipient_not_allowed');
  assert.equal(state.sendCalls, 0);
});

test('2F-B core: sends to ALL valid allowlisted recipients when they all pass', async () => {
  const { deps, state } = makeDeps({
    getAllowlist: () => ['@supplier.example'],
    loadReadiness: async () => readyPreview({ recipient: { ...readyPreview().recipient, emails: ['a@supplier.example', 'b@supplier.example'] } }),
  });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.sent, true);
  assert.deepEqual(state.sent.to, ['a@supplier.example', 'b@supplier.example']);
  assert.equal(r.recipientCount, 2);
});

test('2F-B core: duplicate within 60s blocks (duplicate_recent), nothing sent', async () => {
  const { deps, state } = makeDeps({ recentDuplicateExists: async () => true });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.blockedReason, 'duplicate_recent');
  assert.equal(state.sendCalls, 0);
  assert.equal(state.audit, null);
});

test('2F-B core: PDF failure blocks (pdf_failed), no email, no audit', async () => {
  const { deps, state } = makeDeps({ getPdf: async () => null });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.blockedReason, 'pdf_failed');
  assert.equal(state.sendCalls, 0);
  assert.equal(state.audit, null);
});

test('2F-B core: Resend called only when all gates pass; attaches the operational PDF', async () => {
  const { deps, state } = makeDeps();
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.sent, true);
  assert.equal(state.sendCalls, 1);
  assert.equal(state.pdfCalls, 1);
  const att = state.sent.attachments[0];
  assert.equal(att.filename, 'voucher-op-1.pdf');
  assert.equal(att.contentType, 'application/pdf');
  assert.ok(Buffer.isBuffer(att.content));
});

test('2F-B core: composed email carries no finance/cost/token markers', async () => {
  const { deps, state } = makeDeps();
  await sendOperationalVoucherEmailCore(INPUT, deps);
  const blob = `${state.sent.subject}\n${state.sent.text}`.toLowerCase();
  for (const bad of ['unitcost', 'totalcost', 'payable', 'margin', 'price', 'sell', 'invoice', 'iban', 'bank', 'payment', 'token', 'portal', 'proposal', 'discount']) {
    assert.ok(!blob.includes(bad), `email leaked "${bad}"`);
  }
});

test('2F-B core: audit is written AFTER a successful send (order: send → audit), with safe fields only', async () => {
  const { deps, state } = makeDeps();
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.sent, true);
  assert.deepEqual(state.events, ['send', 'audit']);
  assert.equal(state.audit.action, 'operational_voucher_emailed');
  assert.equal(state.audit.voucherId, 'voucher-1');
  assert.equal(state.audit.supplierName, 'TEST Hotel Supplier A');
  assert.deepEqual(state.audit.recipientDomains, ['@supplier.example']);
  assert.equal(state.audit.recipientCount, 1);
  assert.equal(state.audit.messageId, 'msg-1');
  assert.equal(state.audit.attachedPdf, true);
  // Never audits raw body/pdf/finance.
  const auditBlob = JSON.stringify(state.audit).toLowerCase();
  for (const bad of ['unitcost', 'totalcost', 'payable', 'margin', 'iban', 'bodysummary', '%pdf']) {
    assert.ok(!auditBlob.includes(bad), `audit leaked "${bad}"`);
  }
});

test('2F-B core: send failure writes NO audit and reports send_failed (no partial mutation)', async () => {
  let sendAttempted = 0;
  const { deps, state } = makeDeps({
    sendMail: async () => { sendAttempted += 1; throw new Error('resend_send_failed:boom'); },
  });
  const r = await sendOperationalVoucherEmailCore(INPUT, deps);
  assert.equal(r.blockedReason, 'send_failed');
  assert.equal(r.sent, false);
  assert.equal(sendAttempted, 1); // send WAS attempted…
  assert.equal(state.audit, null); // …and NO audit followed the failure
});
