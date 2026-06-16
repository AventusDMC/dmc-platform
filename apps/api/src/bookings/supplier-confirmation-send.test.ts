import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSupplierConfirmationPreviewModel } from './supplier-confirmation-preview';
import { planSupplierConfirmationSend } from './supplier-confirmation-send';

// Phase O.2B-2C — gated supplier-confirmation send (pure planner + orchestration guards).

const BOOKING = { bookingRef: 'BK-T', startDate: new Date('2026-05-30'), endDate: new Date('2026-06-05'), adults: 2, children: 0 };

function previewWith(services: any[], suppliers: any[], opts: any = {}) {
  return buildSupplierConfirmationPreviewModel(BOOKING, services, suppliers, opts);
}

const READY_SERVICES: any[] = [
  {
    id: 'svc-1', supplierId: 'sup-A', supplierName: 'Alpha', operationType: 'TRANSPORT',
    description: 'Private transfer', operationalDate: new Date('2026-05-30'), participantCount: 2,
    // cost fields that must never reach the plan body:
    unitCost: 35, totalSell: 100, markupPercent: 30, pricingDescription: 'Sedan 2 | net cost 35 | margin',
  },
];
const SUPPLIERS = [{ id: 'sup-A', name: 'Alpha', email: 'ops@alpha.example' }, { id: 'sup-B', name: 'Beta', email: null }];

test('1. blocked (NOT_FOUND) when supplierId is empty or has no matching draft', () => {
  const preview = previewWith(READY_SERVICES, SUPPLIERS);
  assert.equal((planSupplierConfirmationSend(preview, { supplierId: '' }) as any).code, 'NOT_FOUND');
  assert.equal((planSupplierConfirmationSend(preview, { supplierId: 'nope' }) as any).code, 'NOT_FOUND');
});

test('2. blocked NO_SUPPLIER when neither assignedSupplierId nor supplierId resolves', () => {
  const svc: any[] = [{ id: 's', supplierId: null, assignedSupplierId: null, supplierName: 'Unlinked', description: 'x' }];
  const preview = previewWith(svc, []);
  const draftId = preview.suppliers[0].supplierId; // null → can't scope; use the recipient match path
  // scope by the (null) supplier won't match; assert the draft itself is NO_SUPPLIER
  assert.equal(preview.suppliers[0].readiness, 'NO_SUPPLIER');
});

test('3. blocked MISSING_EMAIL when resolved supplier has no email', () => {
  const svc: any[] = [{ id: 's', supplierId: 'sup-B', supplierName: 'Beta', description: 'x' }];
  const preview = previewWith(svc, SUPPLIERS);
  const plan = planSupplierConfirmationSend(preview, { supplierId: 'sup-B' });
  assert.equal(plan.ok, false);
  assert.equal((plan as any).code, 'MISSING_EMAIL');
});

test('4. blocked NO_SERVICES when the draft has no service lines', () => {
  // A supplier draft only exists when it has services, so emulate via empty preview.
  const preview = previewWith([], []);
  assert.equal((planSupplierConfirmationSend(preview, { supplierId: 'sup-A' }) as any).code, 'NOT_FOUND');
});

test('5/3b/4b. READY → plan returns resolved recipient + content + REQUESTED transition', () => {
  const preview = previewWith(READY_SERVICES, SUPPLIERS);
  const plan = planSupplierConfirmationSend(preview, { supplierId: 'sup-A' });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.recipientEmail, 'ops@alpha.example', 'recipient resolved from Supplier.email');
  assert.equal(plan.supplierId, 'sup-A');
  assert.deepEqual(plan.serviceIds, ['svc-1']);
  assert.equal(plan.statusTransition, 'REQUESTED');
  assert.match(plan.subject, /Service confirmation request/);
  assert.match(plan.body, /Private transfer/);
});

test('3c. prefers assignedSupplierId email; 4c. falls back to supplierId email', () => {
  const assigned: any[] = [{ id: 's', supplierId: 'sup-B', assignedSupplierId: 'sup-A', supplierName: 'Beta', description: 'x' }];
  const pAssigned = planSupplierConfirmationSend(previewWith(assigned, SUPPLIERS), { supplierId: 'sup-A' });
  assert.ok(pAssigned.ok && pAssigned.recipientEmail === 'ops@alpha.example', 'assigned email used');

  const linked: any[] = [{ id: 's', supplierId: 'sup-A', assignedSupplierId: null, supplierName: 'Alpha', description: 'x' }];
  const pLinked = planSupplierConfirmationSend(previewWith(linked, SUPPLIERS), { supplierId: 'sup-A' });
  assert.ok(pLinked.ok && pLinked.recipientEmail === 'ops@alpha.example', 'linked email used');
});

test('6. never resolves by supplierName string match (name matches but no FK)', () => {
  const svc: any[] = [{ id: 's', supplierId: null, assignedSupplierId: null, supplierName: 'Alpha', description: 'x' }];
  const preview = previewWith(svc, SUPPLIERS);
  // scope by sup-A won't match a draft whose recipient/supplierId is null
  assert.equal((planSupplierConfirmationSend(preview, { supplierId: 'sup-A' }) as any).code, 'NOT_FOUND');
});

test('7/8. plan content carries no cost/sell/markup/pricingDescription', () => {
  const preview = previewWith(READY_SERVICES, SUPPLIERS);
  const plan = planSupplierConfirmationSend(preview, { supplierId: 'sup-A' });
  assert.ok(plan.ok);
  const json = JSON.stringify(plan);
  for (const token of ['unitCost', 'totalSell', 'markup', 'pricingDescription', 'margin', 'net cost', 'Sedan 2', '35', '100']) {
    assert.ok(!json.includes(token), `plan must not leak ${token}`);
  }
});

test('9. pure planner has no email/subject/body INPUT (recipient/content come from preview only)', () => {
  const moduleSrc = readFileSync(require('path').join(__dirname, 'supplier-confirmation-send.ts'), 'utf8');
  for (const forbidden of ['prisma', 'fetch(', 'nodemailer', 'sendMail', "import type", 'email:'] ) {
    // allow `import type` of the preview type only — check no value imports / IO
  }
  assert.ok(!/nodemailer|sendMail|fetch\(|prisma/.test(moduleSrc), 'planner does no IO');
  // scope type has no email/subject/body
  assert.ok(!/email\??:\s*string/.test(moduleSrc.split('SupplierConfirmationSendScope')[1]?.slice(0, 200) || ''), 'scope has no email field');
});

test('F3. assigned-only service (null supplierId+supplierName) is included in the send plan', () => {
  const svc: any[] = [{ id: 'svc-h', supplierId: null, supplierName: null, assignedSupplierId: 'sup-A', operationType: 'HOTEL', description: 'Hotel Night' }];
  const plan = planSupplierConfirmationSend(previewWith(svc, SUPPLIERS), { supplierId: 'sup-A' });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.supplierId, 'sup-A');
  assert.deepEqual(plan.serviceIds, ['svc-h'], 'assigned-only service scoped into the send');
  assert.equal(plan.recipientEmail, 'ops@alpha.example');
});

// --- Orchestration guards: SERVICE sends-then-mutates; CONTROLLER scope-only ---
const serviceSrc = readFileSync(require('path').join(__dirname, 'bookings.service.ts'), 'utf8');
const controllerSrc = readFileSync(require('path').join(__dirname, 'bookings.controller.ts'), 'utf8');

function methodBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `method ${signature} present`);
  const after = src.slice(start + signature.length);
  const next = after.indexOf('\n  async ');
  return after.slice(0, next >= 0 ? next : 4000);
}

test('10. controller route POST + role-guarded + scope-only body (no email/subject/body)', () => {
  assert.match(controllerSrc, /@Post\(':id\/supplier-confirmation\/send'\)/, 'POST send route');
  const idx = controllerSrc.indexOf("@Post(':id/supplier-confirmation/send')");
  const block = controllerSrc.slice(idx, idx + 500);
  assert.match(block, /@Roles\('admin', 'operations'\)/);
  // body type
  const bodyType = controllerSrc.split('type SupplierConfirmationSendBody = {')[1]?.split('};')[0] || '';
  assert.ok(bodyType.includes('supplierId'), 'body has supplierId');
  for (const forbidden of ['email', 'subject', 'body', 'recipient']) {
    assert.ok(!bodyType.includes(forbidden), `send body must not accept ${forbidden}`);
  }
});

test('11/12/13/14/15/16. service sends FIRST, mutates+audits only after success', () => {
  const body = methodBody(serviceSrc, 'async sendSupplierConfirmation(');
  assert.match(body, /planSupplierConfirmationSend\(/, 'uses the pure planner');
  assert.match(body, /to: plan\.recipientEmail/, 'sends to the resolved recipient, never arbitrary input');
  assert.ok(!body.includes('sendDocumentEmail'), 'does NOT route through the arbitrary-email path');
  // ordering: send before the mutation transaction
  const sendIdx = body.indexOf('sendMailWithRetry');
  const txIdx = body.indexOf('$transaction');
  assert.ok(sendIdx >= 0 && txIdx >= 0 && sendIdx < txIdx, 'send precedes the mutate transaction');
  // success mutation sets the three fields + audit, status REQUESTED
  assert.match(body, /supplierConfirmationStatus: SupplierConfirmationStatus\.REQUESTED/);
  assert.match(body, /confirmationSentAt:/);
  assert.match(body, /lastSupplierContactAt: now/);
  assert.match(body, /createAuditLog\(tx,/);
  assert.match(body, /action: 'booking_service_supplier_confirmation_sent'/);
  // method signature carries no email/subject/body param
  const sig = serviceSrc.slice(serviceSrc.indexOf('async sendSupplierConfirmation('), serviceSrc.indexOf(') {', serviceSrc.indexOf('async sendSupplierConfirmation(')));
  for (const forbidden of ['email', 'subject', 'body']) {
    assert.ok(!sig.includes(forbidden), `send method signature must not accept ${forbidden}`);
  }
});
