import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const invoiceDetailSource = readFileSync(new URL('./[id]/page.tsx', import.meta.url), 'utf8');
const deliveryActionsSource = readFileSync(new URL('./InvoiceDeliveryActions.tsx', import.meta.url), 'utf8');
const pdfRouteSource = readFileSync(new URL('../api/invoices/[id]/pdf/route.ts', import.meta.url), 'utf8');
const sendRouteSource = readFileSync(new URL('../api/invoices/[id]/send/route.ts', import.meta.url), 'utf8');
const reminderRouteSource = readFileSync(new URL('../api/invoices/[id]/send-reminder/route.ts', import.meta.url), 'utf8');

test('invoice detail exposes PDF download and send controls', () => {
  assert.match(invoiceDetailSource, /Download PDF/);
  assert.match(invoiceDetailSource, /InvoiceDeliveryActions/);
  assert.match(invoiceDetailSource, /defaultEmail=\{invoice\.quote\.contact\.email \|\| null\}/);
  assert.match(deliveryActionsSource, /Email override/);
  assert.match(deliveryActionsSource, /Send Invoice/);
  assert.match(deliveryActionsSource, /Send Reminder/);
  assert.match(deliveryActionsSource, /\/api\/invoices\/\$\{invoiceId\}\/send/);
  assert.match(deliveryActionsSource, /\/api\/invoices\/\$\{invoiceId\}\/send-reminder/);
  assert.match(deliveryActionsSource, /\/api\/invoices\/\$\{invoiceId\}\/pdf/);
});

test('invoice PDF and send admin proxy routes are wired', () => {
  assert.match(pdfRouteSource, /\/invoices\/\$\{id\}\/pdf/);
  assert.match(pdfRouteSource, /forwardProxyContentResponse/);
  assert.match(sendRouteSource, /\/invoices\/\$\{id\}\/send/);
  assert.match(sendRouteSource, /forwardProxyJsonResponse/);
  assert.match(reminderRouteSource, /\/invoices\/\$\{id\}\/send-reminder/);
  assert.match(reminderRouteSource, /forwardProxyJsonResponse/);
});
