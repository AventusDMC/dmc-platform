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

// --- O.2B-2F: assigned-only grouping + multi-email parsing ---
import { parseRecipientEmails } from './supplier-confirmation-preview';

const SUP_F = [
  { id: 'sup-A', name: 'Alpha', email: 'reservation@alpha-jo.com;  n.aldimyati@alpha-jo.com' }, // semicolon + double space
  { id: 'sup-B', name: 'Corp Amman', email: 'corp@amman.example, sales@amman.example' }, // comma
  { id: 'sup-C', name: 'No Email Co', email: null },
];

test('F1/F2. assigned-only service (null supplierId+supplierName) appears and is READY', () => {
  const svc: any[] = [{ id: 's1', supplierId: null, supplierName: null, assignedSupplierId: 'sup-B', description: 'Jordan Contracted Hotel Night' }];
  const out = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUP_F);
  assert.equal(out.suppliers.length, 1, 'assigned-only service surfaces as a draft');
  const d = out.suppliers[0];
  assert.equal(d.recipientSource, 'assignedSupplierId');
  assert.equal(d.recipient.supplierId, 'sup-B');
  assert.equal(d.readiness, 'READY');
});

test('F4. assignedSupplierId preferred over supplierId; F5. supplierId works alone', () => {
  const both: any[] = [{ id: 's', supplierId: 'sup-C', assignedSupplierId: 'sup-A', supplierName: 'x', description: 'y' }];
  const dBoth = buildSupplierConfirmationPreviewModel(BOOKING, both, SUP_F).suppliers[0];
  assert.equal(dBoth.recipientSource, 'assignedSupplierId');
  assert.equal(dBoth.recipient.supplierId, 'sup-A');
  const linked: any[] = [{ id: 's', supplierId: 'sup-A', assignedSupplierId: null, supplierName: 'x', description: 'y' }];
  const dLinked = buildSupplierConfirmationPreviewModel(BOOKING, linked, SUP_F).suppliers[0];
  assert.equal(dLinked.recipientSource, 'supplierId');
});

test('F6/F7. no FK → NO_SUPPLIER even when supplierName matches a supplier by name', () => {
  const svc: any[] = [{ id: 's', supplierId: null, assignedSupplierId: null, supplierName: 'Alpha', description: 'y' }];
  const d = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUP_F).suppliers[0];
  assert.equal(d.recipientSource, 'none');
  assert.equal(d.readiness, 'NO_SUPPLIER');
  assert.equal(d.recipient.email, null, 'name match never resolves an email');
});

test('F9. semicolon-separated Supplier.email parses into a clean recipient list', () => {
  const svc: any[] = [{ id: 's', assignedSupplierId: 'sup-A', supplierName: 'Alpha', description: 'y' }];
  const d = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUP_F).suppliers[0];
  assert.deepEqual(d.recipient.emails, ['reservation@alpha-jo.com', 'n.aldimyati@alpha-jo.com']);
  assert.equal(d.recipient.email, 'reservation@alpha-jo.com, n.aldimyati@alpha-jo.com', 'joined comma-safe for mail to');
  assert.equal(d.readiness, 'READY');
});

test('F10. comma-separated Supplier.email still works; F11. missing email → MISSING_EMAIL', () => {
  const commaSvc: any[] = [{ id: 's', supplierId: 'sup-B', supplierName: 'Corp Amman', description: 'y' }];
  const dComma = buildSupplierConfirmationPreviewModel(BOOKING, commaSvc, SUP_F).suppliers[0];
  assert.deepEqual(dComma.recipient.emails, ['corp@amman.example', 'sales@amman.example']);
  const noneSvc: any[] = [{ id: 's', supplierId: 'sup-C', supplierName: 'No Email Co', description: 'y' }];
  const dNone = buildSupplierConfirmationPreviewModel(BOOKING, noneSvc, SUP_F).suppliers[0];
  assert.equal(dNone.readiness, 'MISSING_EMAIL');
  assert.equal(dNone.recipient.email, null);
});

test('F (helper). parseRecipientEmails handles comma/semicolon/whitespace/dupes/empties', () => {
  assert.deepEqual(parseRecipientEmails('a@x;  b@x , a@x ,,'), ['a@x', 'b@x']);
  assert.deepEqual(parseRecipientEmails(''), []);
  assert.deepEqual(parseRecipientEmails(null), []);
  assert.deepEqual(parseRecipientEmails('  solo@x  '), ['solo@x']);
});

// --- O.2B-2B: recipient resolution (assignedSupplierId ?? supplierId) + readiness ---

const SUPPLIERS_2 = [
  { id: 'sup-A', name: 'Alpha Transport', email: 'ops@alpha.example' },
  { id: 'sup-B', name: 'Petra Moon Hotel', email: null },
];

test('O.2B-2B-1. prefers assignedSupplierId over supplierId for the recipient', () => {
  const svc: any[] = [
    { id: 's1', supplierId: 'sup-B', assignedSupplierId: 'sup-A', supplierName: 'Petra Moon Hotel', description: 'Service', operationType: 'TRANSPORT' },
  ];
  const out = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUPPLIERS_2);
  const d = out.suppliers[0];
  assert.equal(d.recipientSource, 'assignedSupplierId');
  assert.equal(d.recipient.supplierId, 'sup-A');
  assert.equal(d.recipient.email, 'ops@alpha.example');
  assert.equal(d.recipientEmail, 'ops@alpha.example', 'back-compat field mirrors recipient.email');
  assert.equal(d.readiness, 'READY');
  assert.match(d.readinessReason, /Supplier assigned and email found/);
});

test('O.2B-2B-2. falls back to supplierId when assignedSupplierId is null', () => {
  const svc: any[] = [{ id: 's1', supplierId: 'sup-A', assignedSupplierId: null, supplierName: 'Alpha Transport', description: 'Service' }];
  const out = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUPPLIERS_2);
  const d = out.suppliers[0];
  assert.equal(d.recipientSource, 'supplierId');
  assert.equal(d.recipient.supplierId, 'sup-A');
  assert.equal(d.readiness, 'READY');
  assert.match(d.readinessReason, /Supplier linked and email found/);
});

test('O.2B-2B-3. NO_SUPPLIER when neither assignedSupplierId nor supplierId exists (name only)', () => {
  const svc: any[] = [{ id: 's1', supplierId: null, assignedSupplierId: null, supplierName: 'Some Unlinked Supplier', description: 'Service' }];
  const out = buildSupplierConfirmationPreviewModel(BOOKING, svc, []);
  const d = out.suppliers[0];
  assert.equal(d.recipientSource, 'none');
  assert.equal(d.recipient.supplierId, null);
  assert.equal(d.readiness, 'NO_SUPPLIER');
  assert.match(d.readinessReason, /Assign a supplier first/);
});

test('O.2B-2B-4. MISSING_EMAIL when the resolved supplier has no email', () => {
  const svc: any[] = [{ id: 's1', supplierId: 'sup-B', supplierName: 'Petra Moon Hotel', description: 'Service' }];
  const out = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUPPLIERS_2);
  const d = out.suppliers[0];
  assert.equal(d.recipientSource, 'supplierId');
  assert.equal(d.readiness, 'MISSING_EMAIL');
  assert.equal(d.recipient.missingEmail, true);
  assert.match(d.readinessReason, /Supplier email missing/);
});

test('O.2B-2B-5. never resolves the recipient by supplierName string match', () => {
  // supplierName matches a supplier row by name, but there is NO supplierId/assignedSupplierId FK.
  const svc: any[] = [{ id: 's1', supplierId: null, assignedSupplierId: null, supplierName: 'Alpha Transport', description: 'Service' }];
  const out = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUPPLIERS_2);
  const d = out.suppliers[0];
  assert.equal(d.recipientSource, 'none', 'name match must NOT resolve a recipient');
  assert.equal(d.recipient.email, null);
  assert.equal(d.readiness, 'NO_SUPPLIER');
});

// --- O.2B-2G: card heading reflects the RESOLVED recipient; free-text is display-only ---

test('G1. heading + subject + greeting use the ASSIGNED supplier name, not the free-text label', () => {
  // Real-world case: service labelled "Almushtari Logistics Services" but assigned to Corp Amman.
  const svc: any[] = [{ id: 's', assignedSupplierId: 'sup-B', supplierId: null, supplierName: 'Almushtari Logistics Services', description: 'Hotel Night' }];
  const d = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUP_F).suppliers[0];
  assert.equal(d.supplierName, 'Corp Amman', 'heading = resolved Supplier.name');
  assert.equal(d.recipient.supplierName, 'Corp Amman');
  assert.equal(d.serviceSupplierName, 'Almushtari Logistics Services', 'differing free-text surfaced as display-only label');
  assert.match(d.subject, /— Corp Amman$/, 'subject uses resolved name');
  assert.match(d.body, /Dear Corp Amman,/, 'greeting uses resolved name');
  assert.ok(!d.subject.includes('Almushtari'), 'free-text label not in subject');
  assert.ok(!d.body.includes('Almushtari'), 'free-text label not in greeting');
});

test('G2. heading uses the LINKED supplier name when assignedSupplierId is null', () => {
  const svc: any[] = [{ id: 's', supplierId: 'sup-A', assignedSupplierId: null, supplierName: 'Stale Label Co', description: 'y' }];
  const d = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUP_F).suppliers[0];
  assert.equal(d.supplierName, 'Alpha', 'heading = linked Supplier.name');
  assert.equal(d.serviceSupplierName, 'Stale Label Co');
});

test('G3. heading falls back to free-text supplierName ONLY when no FK resolves', () => {
  const svc: any[] = [{ id: 's', supplierId: null, assignedSupplierId: null, supplierName: 'Local Guide Co', description: 'y' }];
  const d = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUP_F).suppliers[0];
  assert.equal(d.recipientSource, 'none');
  assert.equal(d.supplierName, 'Local Guide Co', 'free-text used as display-only heading');
  assert.equal(d.serviceSupplierName, null, 'no redundant source label when heading already is the free-text');
});

test('G4. a free-text label matching the resolved name (case-insensitive) is not duplicated', () => {
  const svc: any[] = [{ id: 's', supplierId: 'sup-A', supplierName: 'alpha', description: 'y' }]; // matches 'Alpha'
  const d = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUP_F).suppliers[0];
  assert.equal(d.supplierName, 'Alpha');
  assert.equal(d.serviceSupplierName, null, 'case-insensitive match → no redundant label');
});

test('G6. the heading/free-text is NEVER used to resolve a recipient (FK only)', () => {
  // free-text equals supplier sup-B's name but there is NO FK → must NOT resolve sup-B.
  const svc: any[] = [{ id: 's', supplierId: null, assignedSupplierId: null, supplierName: 'Corp Amman', description: 'y' }];
  const d = buildSupplierConfirmationPreviewModel(BOOKING, svc, SUP_F).suppliers[0];
  assert.equal(d.recipient.supplierId, null);
  assert.equal(d.recipient.email, null, 'name match never resolves an email');
  assert.equal(d.readiness, 'NO_SUPPLIER');
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
