import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ServiceRow } from '../../../components/ops/v2/service-row';
import { VoucherDownloadControl, voucherDownloadPath } from '../../../components/ops/v2/voucher-download-control';
import { buildOperationsBoardVM, type OpsRowVM } from './ops-view-model';
import { SAMPLE_GRID, SAMPLE_READINESS } from './ops-view-model.fixtures';

// Test-only classic-runtime shim (components use the automatic JSX runtime).
(globalThis as unknown as { React?: unknown }).React = React;

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const CONTROL = path.join(HERE, '../../../components/ops/v2/voucher-download-control.tsx');
const PROXY = path.join(HERE, '../../api/operations/v2/[bookingId]/[operationId]/voucher-download/route.ts');
const SERVICE_ROW = path.join(HERE, '../../../components/ops/v2/service-row.tsx');

const controlSrc = readFileSync(CONTROL, 'utf8');
const proxySrc = readFileSync(PROXY, 'utf8');
const serviceRowSrc = readFileSync(SERVICE_ROW, 'utf8');

const byId = Object.fromEntries(
  buildOperationsBoardVM(SAMPLE_GRID, SAMPLE_READINESS).phases.flatMap((p) => p.rows).map((r) => [r.id, r]),
);
const downloadableRow = byId['row-ready']; // voucher ISSUED → downloadable
const notGeneratedRow = byId['row-voucher']; // voucher NOT_GENERATED → not downloadable

function renderRow(row: OpsRowVM, flagOn: boolean): string {
  if (flagOn) process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_DOWNLOAD = 'true';
  else delete process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_DOWNLOAD;
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
    delete process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_DOWNLOAD;
  }
}

function renderControlOpen(): string {
  const stub = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {} };
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider as never,
      { value: stub } as never,
      createElement(VoucherDownloadControl, { bookingId: 'bk-1', operationId: 'op-1', defaultOpen: true } as never),
    ),
  );
}

describe('Phase 2E — downloadable eligibility (view model)', () => {
  it('canDownloadVoucher tracks an existing generated voucher (GENERATED/READY/ISSUED/SENT)', () => {
    assert.equal(downloadableRow.canDownloadVoucher, true); // ISSUED
    assert.equal(notGeneratedRow.canDownloadVoucher, false); // NOT_GENERATED
    assert.equal(byId['row-critical'].canDownloadVoucher, false); // NOT_GENERATED
  });

  it('builds the sanctioned voucher-download proxy path', () => {
    assert.equal(voucherDownloadPath('bk-1', 'op-9'), '/api/operations/v2/bk-1/op-9/voucher-download');
  });
});

describe('Phase 2E — flag gating (service row render)', () => {
  it('flag OFF: "Download — Coming later" stays disabled, no live control', () => {
    const html = renderRow(downloadableRow, false);
    assert.ok(html.includes('Download'));
    assert.ok(html.includes('Coming later'));
    assert.ok(!html.includes('aria-expanded'), 'no live control when flag OFF');
  });

  it('flag ON + downloadable voucher: the live Download control renders', () => {
    const html = renderRow(downloadableRow, true);
    assert.ok(html.includes('Download'));
    assert.ok(html.includes('aria-expanded'), 'live download trigger present');
  });

  it('flag ON + no voucher: Download stays disabled, no live control', () => {
    const html = renderRow(notGeneratedRow, true);
    assert.ok(html.includes('Download'));
    assert.ok(html.includes('Coming later'));
    assert.ok(!html.includes('aria-expanded'), 'no live download for a non-downloadable row');
  });
});

describe('Phase 2E — control panel (read-only download)', () => {
  it('open panel shows the download-only copy + Download PDF + Cancel, and no form/input controls', () => {
    const html = renderControlOpen();
    assert.ok(html.includes('Download voucher PDF only. No email is sent.'));
    assert.ok(html.includes('Download PDF'));
    assert.ok(html.includes('Cancel'));
    for (const bad of ['<form', '<input', '<select', '<textarea']) {
      assert.ok(!html.includes(bad), `panel must not render "${bad}"`);
    }
  });
});

describe('Phase 2E — safety (read-only GET download, no send/status/finance)', () => {
  it('control uses only the voucher-download proxy + blob download; no mutation/send/status endpoints', () => {
    assert.ok(controlSrc.includes('voucher-download'));
    assert.ok(controlSrc.includes('Open in Classic'));
    assert.ok(controlSrc.includes('createObjectURL'), 'uses the allowlisted blob mechanic');
    for (const bad of [
      '/status', '/send', 'send-document-email', 'supplier-confirmation',
      'assign-supplier', '/confirmation', 'voucher/generate', '/preview',
      '/vouchers/', '/voucher/pdf', 'portal-voucher', '/agent/',
      '/invoices', '/payments', '/dispatch', '/start', '/complete', '/issue',
      'window.print', '/export',
      "method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'",
    ]) {
      assert.ok(!controlSrc.includes(bad), `download control must not reference "${bad}"`);
    }
  });

  it('proxy is GET-only: streams the operational voucher PDF via one direct read', () => {
    // GET handler present; no mutating verbs exported.
    assert.ok(proxySrc.includes('export async function GET'));
    for (const verb of ['export async function POST', 'export async function PATCH', 'export async function PUT', 'export async function DELETE']) {
      assert.ok(!proxySrc.includes(verb), `proxy must not export ${verb}`);
    }
    // Single direct call to the operations-scoped operational voucher PDF endpoint
    // (operationId is the primary key — no client-visible voucher id, no 2nd lookup).
    assert.ok(proxySrc.includes('/operations/'), 'proxy targets the operation');
    assert.ok(proxySrc.includes('/voucher/pdf'), 'proxy calls the operational voucher PDF endpoint');
    assert.ok(proxySrc.includes('forwardProxyContentResponse'), 'proxy streams the PDF verbatim');
    // It must NOT resolve through /vouchers/:id/pdf, and must never touch status/
    // send/email/finance/dispatch or the public/agent PDF routes.
    for (const bad of [
      '/vouchers/', '/status', '/send', 'send-document-email', 'supplier-confirmation', 'voucher/generate',
      'portal-voucher', '/agent/', '/invoices', '/payments', '/dispatch', '/start', '/complete', '/issue',
    ]) {
      assert.ok(!proxySrc.includes(bad), `proxy must not reference "${bad}"`);
    }
  });

  it('service row gates the download behind the flag (else: disabled placeholder)', () => {
    assert.ok(serviceRowSrc.includes('isOpsV2VoucherDownloadEnabled'));
    assert.ok(serviceRowSrc.includes('VoucherDownloadControl'));
    assert.ok(serviceRowSrc.includes('label="Download"'), 'keeps the disabled fallback');
  });
});
