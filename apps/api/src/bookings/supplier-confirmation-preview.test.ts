import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSupplierConfirmationPreviewModel } from './supplier-confirmation-preview';

// Phase O.2B-1 — read-only supplier-confirmation preview.

const BOOKING = {
  bookingRef: 'BK-2026-0004',
  startDate: new Date('2026-05-30T00:00:00.000Z'),
  endDate: new Date('2026-06-05T00:00:00.000Z'),
  adults: 2,
  children: 0,
};

// Services carry EXTRA cost/internal fields (as any) to prove they never leak.
const SERVICES: any[] = [
  {
    id: 'svc-1',
    supplierId: 'sup-A',
    supplierName: 'Alpha Transport',
    operationType: 'TRANSPORT',
    description: 'Private transfer QAIA → Amman',
    operationalDate: new Date('2026-05-30T00:00:00.000Z'),
    pickupTime: '14:00',
    pickupLocation: 'QAIA Arrivals',
    participantCount: 2,
    notes: 'Meet & greet',
    confirmationDeadline: new Date('2026-05-20T00:00:00.000Z'),
    // forbidden — must never appear in output:
    unitCost: 35, unitSell: 50, totalCost: 70, totalSell: 100,
    supplierPayableAmount: 70, markupPercent: 30, pricingDescription: 'Sedan 2 | net cost USD 35 | margin',
  },
  {
    id: 'svc-2',
    supplierId: 'sup-B',
    supplierName: 'Petra Moon Hotel',
    operationType: 'HOTEL',
    description: 'Standard Room',
    serviceDate: new Date('2026-06-01T00:00:00.000Z'),
    nights: 2,
    mealPlan: 'HB',
    participantCount: 0, // falls back to booking pax
    totalSell: 400, markupAmount: 120,
  },
];

const SUPPLIERS = [
  { id: 'sup-A', name: 'Alpha Transport', email: 'ops@alpha.example' },
  { id: 'sup-B', name: 'Petra Moon Hotel', email: null }, // no email
];

test('1. returns a draft per supplier with recipient, subject, body, and service lines', () => {
  const out = buildSupplierConfirmationPreviewModel(BOOKING, SERVICES, SUPPLIERS);
  assert.equal(out.bookingRef, 'BK-2026-0004');
  assert.equal(out.pax, 2);
  assert.equal(out.travelStartDate, '2026-05-30');
  assert.equal(out.suppliers.length, 2);
  const alpha = out.suppliers.find((s) => s.supplierId === 'sup-A')!;
  assert.equal(alpha.recipientEmail, 'ops@alpha.example');
  assert.equal(alpha.missingEmail, false);
  assert.match(alpha.subject, /Service confirmation request — BK-2026-0004 — Alpha Transport/);
  assert.match(alpha.body, /Dear Alpha Transport/);
  assert.match(alpha.body, /Private transfer QAIA → Amman/);
  assert.equal(alpha.services.length, 1);
  assert.equal(alpha.services[0].serviceType, 'TRANSPORT');
  assert.equal(alpha.services[0].serviceDate, '2026-05-30');
  assert.equal(alpha.services[0].timing, '14:00 / QAIA Arrivals');
  assert.equal(alpha.services[0].pax, 2);
});

test('2. missing supplier email → missingEmail=true, recipientEmail=null, body still built', () => {
  const out = buildSupplierConfirmationPreviewModel(BOOKING, SERVICES, SUPPLIERS);
  const hotel = out.suppliers.find((s) => s.supplierId === 'sup-B')!;
  assert.equal(hotel.recipientEmail, null);
  assert.equal(hotel.missingEmail, true);
  assert.match(hotel.body, /Dear Petra Moon Hotel/);
  assert.equal(hotel.services[0].nights, 2);
  assert.equal(hotel.services[0].mealPlan, 'HB');
  assert.equal(hotel.services[0].pax, 2, 'participantCount 0 falls back to booking pax');
});

test('3. scoping by supplierId returns only that supplier; by serviceId returns only that service', () => {
  const bySupplier = buildSupplierConfirmationPreviewModel(BOOKING, SERVICES, SUPPLIERS, { supplierId: 'sup-A' });
  assert.equal(bySupplier.suppliers.length, 1);
  assert.equal(bySupplier.suppliers[0].supplierId, 'sup-A');
  const byService = buildSupplierConfirmationPreviewModel(BOOKING, SERVICES, SUPPLIERS, { serviceId: 'svc-2' });
  assert.equal(byService.suppliers.length, 1);
  assert.equal(byService.suppliers[0].supplierId, 'sup-B');
  assert.equal(byService.suppliers[0].services.length, 1);
});

test('4. NO cost/sell/markup/internal data leaks into the preview output', () => {
  const out = buildSupplierConfirmationPreviewModel(BOOKING, SERVICES, SUPPLIERS);
  const json = JSON.stringify(out);
  for (const token of ['unitCost', 'unitSell', 'totalCost', 'totalSell', 'supplierPayableAmount', 'markup', 'pricingDescription', 'margin', 'net cost', 'Sedan 2', '"35"', '"50"', '"70"', '"100"', '"400"', '"120"']) {
    assert.ok(!json.includes(token), `preview must not leak ${token}`);
  }
  // also the raw numbers shouldn't appear as values
  assert.ok(!/\b35\b|\b400\b/.test(json.replace(/2026-\d\d-\d\d/g, '')), 'no raw cost numbers');
});

test('5. empty / no-supplier services → empty suppliers list, no crash', () => {
  assert.deepEqual(buildSupplierConfirmationPreviewModel(BOOKING, [], []).suppliers, []);
  const orphan: any[] = [{ id: 'x', description: 'No supplier', supplierId: null, supplierName: null }];
  assert.deepEqual(buildSupplierConfirmationPreviewModel(BOOKING, orphan, []).suppliers, []);
});

// --- Source-grep guards: the SERVICE method + CONTROLLER route are read-only ---
const serviceSrc = readFileSync(require('path').join(__dirname, 'bookings.service.ts'), 'utf8');
const controllerSrc = readFileSync(require('path').join(__dirname, 'bookings.controller.ts'), 'utf8');

function methodBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `method ${signature} present`);
  // grab a generous slice (method is short); stop at the next "  async " sibling
  const after = src.slice(start + signature.length);
  const next = after.indexOf('\n  async ');
  return after.slice(0, next >= 0 ? next : 2000);
}

test('6. backend route is GET + admin/operations role only', () => {
  assert.match(controllerSrc, /@Get\(':id\/supplier-confirmation\/preview'\)/, 'GET preview route present');
  const idx = controllerSrc.indexOf("@Get(':id/supplier-confirmation/preview')");
  const block = controllerSrc.slice(idx, idx + 400);
  assert.match(block, /@Roles\('admin', 'operations'\)/, 'role-guarded');
  assert.match(block, /buildSupplierConfirmationPreview\(/, 'calls the read-only service method');
});

test('7. service method performs no mutation / no email / no audit', () => {
  const body = methodBody(serviceSrc, 'async buildSupplierConfirmationPreview(');
  // read-only data access only
  assert.match(body, /this\.findOne\(/, 'reads via findOne');
  assert.match(body, /supplier as any\)\.findMany/, 'reads supplier emails via findMany');
  for (const forbidden of ['.update(', '.create(', '.delete(', '.upsert(', 'updateMany', 'deleteMany', 'createMailTransport', 'sendMailWithRetry', 'sendDocumentEmail', 'createAuditLog']) {
    assert.ok(!body.includes(forbidden), `preview method must not call ${forbidden}`);
  }
});

test('8. pure module performs no IO (no prisma/fetch/mail)', () => {
  const moduleSrc = readFileSync(require('path').join(__dirname, 'supplier-confirmation-preview.ts'), 'utf8');
  for (const forbidden of ['prisma', 'fetch(', 'nodemailer', 'sendMail', 'import ']) {
    assert.ok(!moduleSrc.includes(forbidden), `pure module must not reference ${forbidden}`);
  }
});
