import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const invoiceDetailSource = readFileSync(new URL('./[id]/page.tsx', import.meta.url), 'utf8');
const invoicesPageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const deliveryActionsSource = readFileSync(new URL('./InvoiceDeliveryActions.tsx', import.meta.url), 'utf8');
const pdfRouteSource = readFileSync(new URL('../api/invoices/[id]/pdf/route.ts', import.meta.url), 'utf8');
const sendRouteSource = readFileSync(new URL('../api/invoices/[id]/send/route.ts', import.meta.url), 'utf8');
const reminderRouteSource = readFileSync(new URL('../api/invoices/[id]/send-reminder/route.ts', import.meta.url), 'utf8');
const invoicePortalActionsSource = readFileSync(new URL('../invoice/[token]/InvoicePortalActions.tsx', import.meta.url), 'utf8');

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
  assert.doesNotMatch(deliveryActionsSource, /NEXT_PUBLIC_API_URL|dmcapi-production|railway\.app/i);
});

test('invoice PDF and send admin proxy routes are wired', () => {
  assert.match(pdfRouteSource, /\/invoices\/\$\{id\}\/pdf/);
  assert.match(pdfRouteSource, /forwardProxyContentResponse/);
  assert.match(sendRouteSource, /\/invoices\/\$\{id\}\/send/);
  assert.match(sendRouteSource, /forwardProxyJsonResponse/);
  assert.match(reminderRouteSource, /\/invoices\/\$\{id\}\/send-reminder/);
  assert.match(reminderRouteSource, /forwardProxyJsonResponse/);
});

test('invoices list uses same-origin proxy and renders a failed-fetch empty state', () => {
  assert.match(invoicesPageSource, /adminPageFetchJson<Invoice\[\]>\('\/api\/invoices'/);
  assert.match(invoicesPageSource, /catch \(error\)/);
  assert.match(invoicesPageSource, /isNextRedirectError\(error\)/);
  assert.match(invoicesPageSource, /Invoices are temporarily unavailable\./);
  assert.doesNotMatch(invoicesPageSource, /ADMIN_API_BASE_URL|NEXT_PUBLIC_API_URL|dmcapi-production|railway\.app/i);
});

test('public invoice actions use same-origin proxy routes for PDF and proof links', () => {
  assert.match(invoicePortalActionsSource, /fetch\(`\/api\/public\/invoice\/\$\{token\}\/pdf`\)/);
  assert.match(invoicePortalActionsSource, /return `\/api\$\{value\.startsWith\('\/'\) \? value : `\/\$\{value\}`\}`;/);
  assert.doesNotMatch(invoicePortalActionsSource, /NEXT_PUBLIC_API_URL|dmcapi-production|railway\.app/i);
});
