import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ServiceRow } from '../../../components/ops/v2/service-row';
import {
  VoucherSendPreviewControl,
  voucherSendPreviewPath,
  type VoucherSendPreviewVM,
} from '../../../components/ops/v2/voucher-send-preview-control';
import { buildOperationsBoardVM, type OpsRowVM } from './ops-view-model';
import { SAMPLE_GRID, SAMPLE_READINESS } from './ops-view-model.fixtures';

// Test-only classic-runtime shim (components use the automatic JSX runtime).
(globalThis as unknown as { React?: unknown }).React = React;

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const CONTROL = path.join(HERE, '../../../components/ops/v2/voucher-send-preview-control.tsx');
const PROXY = path.join(HERE, '../../api/operations/v2/[bookingId]/[operationId]/voucher-send-preview/route.ts');
const FLAG = 'NEXT_PUBLIC_OPS_V2_VOUCHER_SEND_PREVIEW';

const controlSrc = readFileSync(CONTROL, 'utf8');
const proxySrc = readFileSync(PROXY, 'utf8');

const byId = Object.fromEntries(
  buildOperationsBoardVM(SAMPLE_GRID, SAMPLE_READINESS).phases.flatMap((p) => p.rows).map((r) => [r.id, r]),
);
const previewableRow = byId['row-ready']; // voucher ISSUED → previewable/send-previewable
const notGeneratedRow = byId['row-voucher']; // voucher NOT_GENERATED → not previewable

function renderRow(row: OpsRowVM, flagOn: boolean): string {
  if (flagOn) process.env[FLAG] = 'true';
  else delete process.env[FLAG];
  try {
    const stub = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {} };
    return renderToStaticMarkup(
      createElement(
        AppRouterContext.Provider as never,
        { value: stub } as never,
        createElement(ServiceRow, { row, bookingId: 'bk-1' }),
      ),
    );
  } finally {
    delete process.env[FLAG];
  }
}

const SAMPLE_VM: VoucherSendPreviewVM = {
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
  subject: 'Operational voucher — BK-2026-0001 — TEST Hotel Supplier A',
  bodySummary: 'The operational voucher would be emailed to the assigned operational supplier.',
  attachmentName: 'voucher-op-1.pdf',
  readiness: 'READY',
  readinessReason: 'Assigned supplier has a valid email — a voucher email could be sent.',
  blockingReasons: [],
  note: 'Preview only. No email is sent.',
};

function renderControlOpen(): string {
  const stub = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {} };
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider as never,
      { value: stub } as never,
      createElement(VoucherSendPreviewControl, {
        bookingId: 'bk-1',
        operationId: 'op-1',
        defaultOpen: true,
      } as never),
    ),
  );
}

describe('Phase 2F-A — send-preview flag gating (service row render)', () => {
  it('flag OFF: "Send preview — Coming later" stays disabled, no live control', () => {
    const html = renderRow(previewableRow, false);
    assert.ok(html.includes('Send preview'));
    assert.ok(html.includes('Coming later'));
    assert.ok(!html.includes('aria-expanded'), 'no live control when flag OFF');
  });

  it('flag ON + generated voucher: the live Send preview control renders', () => {
    const html = renderRow(previewableRow, true);
    assert.ok(html.includes('Send preview'));
    assert.ok(html.includes('aria-expanded'), 'live send-preview trigger present');
  });

  it('flag ON + no voucher: Send preview stays disabled, no live control', () => {
    const html = renderRow(notGeneratedRow, true);
    assert.ok(html.includes('Send preview'));
    assert.ok(html.includes('Coming later'));
    assert.ok(!html.includes('aria-expanded'), 'no live send-preview for a non-generated row');
  });
});

describe('Phase 2F-A — control panel (read-only, no send)', () => {
  it('open panel shows the preview-only copy + Close, and no form/input/mutation controls', () => {
    const html = renderControlOpen();
    assert.ok(html.includes('Preview only. No email is sent.'));
    assert.ok(html.includes('Close'));
    for (const bad of ['<form', '<input', '<select', '<textarea']) {
      assert.ok(!html.includes(bad), `panel must not render "${bad}"`);
    }
  });

  it('builds the send-preview proxy path', () => {
    assert.equal(voucherSendPreviewPath('bk-1', 'op-9'), '/api/operations/v2/bk-1/op-9/voucher-send-preview');
  });
});

describe('Phase 2F-A — safety (read-only GET, no send/mutation/finance)', () => {
  it('control is a read-only GET; no send/mutation/download/finance affordance', () => {
    assert.ok(controlSrc.includes('voucher-send-preview'));
    assert.ok(controlSrc.includes('Open in Classic'));
    for (const bad of [
      '.pdf', 'download=', '/export', 'window.print', 'createObjectURL',
      '/vouchers/', '/status', '/send', 'send-document-email', 'supplier-confirmation',
      'assign-supplier', '/confirmation', 'voucher/generate', '/voucher/pdf',
      '/invoices', '/payments', '/dispatch', '/start', '/complete', '/issue',
      "method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'",
    ]) {
      assert.ok(!controlSrc.includes(bad), `send-preview control must not reference "${bad}"`);
    }
  });

  it('proxy is a GET to the read-only backend send-preview; no mutation/send/pdf endpoints', () => {
    assert.ok(proxySrc.includes('export async function GET'));
    assert.ok(proxySrc.includes("method: 'GET'"), 'proxy calls the backend with GET');
    assert.ok(proxySrc.includes('/voucher/send-preview'), 'proxy targets the send-preview read');
    for (const verb of ['export async function POST', 'export async function PATCH', 'export async function PUT', 'export async function DELETE']) {
      assert.ok(!proxySrc.includes(verb), `proxy must not export ${verb}`);
    }
    // Note: the proxy URL legitimately contains "/voucher/send-preview" (so "/send"
    // is not bannable here); ban the specific mutation/send/pdf mechanics instead.
    for (const bad of [
      '.pdf', '/voucher/pdf', '/status', 'send-document-email', 'supplier-confirmation',
      'voucher/generate', '/invoices', '/payments', '/dispatch', '/start', '/complete', '/issue',
      'forwardProxyContentResponse',
      "method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'",
    ]) {
      assert.ok(!proxySrc.includes(bad), `send-preview proxy must not reference "${bad}"`);
    }
  });

  it('service row gates the send-preview behind the flag (else: disabled placeholder)', () => {
    const serviceRowSrc = readFileSync(path.join(HERE, '../../../components/ops/v2/service-row.tsx'), 'utf8');
    assert.ok(serviceRowSrc.includes('isOpsV2VoucherSendPreviewEnabled'));
    assert.ok(serviceRowSrc.includes('VoucherSendPreviewControl'));
    assert.ok(serviceRowSrc.includes('label="Send preview"'), 'keeps the disabled fallback');
  });

  it('the sample readiness VM shape carries no finance/cost/token fields', () => {
    const json = JSON.stringify(SAMPLE_VM).toLowerCase();
    for (const bad of ['unitcost', 'totalcost', 'payable', 'margin', 'price', 'snapshot', 'iban', 'bank', 'payment', 'discount']) {
      assert.ok(!json.includes(bad), `send-preview VM leaked "${bad}"`);
    }
  });
});
