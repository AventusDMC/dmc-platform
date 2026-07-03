import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ServiceRow } from '../../../components/ops/v2/service-row';
import { VoucherSendControl } from '../../../components/ops/v2/voucher-send-control';
import { buildVoucherSendRequest, voucherSendPath } from './ops-voucher-send-request';
import { buildOperationsBoardVM, type OpsRowVM } from './ops-view-model';
import { SAMPLE_GRID, SAMPLE_READINESS } from './ops-view-model.fixtures';

// Test-only classic-runtime shim (components use the automatic JSX runtime).
(globalThis as unknown as { React?: unknown }).React = React;

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const CONTROL = path.join(HERE, '../../../components/ops/v2/voucher-send-control.tsx');
const REQUEST = path.join(HERE, 'ops-voucher-send-request.ts');
const PROXY = path.join(HERE, '../../api/operations/v2/[bookingId]/[operationId]/voucher-send/route.ts');
const FLAG = 'NEXT_PUBLIC_OPS_V2_VOUCHER_SEND';

const controlSrc = readFileSync(CONTROL, 'utf8');
const requestSrc = readFileSync(REQUEST, 'utf8');
const proxySrc = readFileSync(PROXY, 'utf8');

const byId = Object.fromEntries(
  buildOperationsBoardVM(SAMPLE_GRID, SAMPLE_READINESS).phases.flatMap((p) => p.rows).map((r) => [r.id, r]),
);
const generatedRow = byId['row-ready']; // voucher ISSUED → canPreviewVoucher
const notGeneratedRow = byId['row-voucher']; // voucher NOT_GENERATED

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

function renderControlOpen(): string {
  const stub = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {} };
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider as never,
      { value: stub } as never,
      createElement(VoucherSendControl, { bookingId: 'bk-1', operationId: 'op-1', defaultOpen: true } as never),
    ),
  );
}

describe('Phase 2F-B — send flag gating (service row render)', () => {
  it('flag OFF: "Send — Coming later" stays disabled, no live control', () => {
    const html = renderRow(generatedRow, false);
    assert.ok(html.includes('Send'));
    assert.ok(html.includes('Coming later'));
    assert.ok(!html.includes('aria-expanded'), 'no live control when flag OFF');
  });

  it('flag ON + generated voucher: the live Send control renders', () => {
    const html = renderRow(generatedRow, true);
    assert.ok(html.includes('aria-expanded'), 'live send trigger present');
  });

  it('flag ON + no voucher: Send stays disabled, no live control', () => {
    const html = renderRow(notGeneratedRow, true);
    assert.ok(html.includes('Coming later'));
    assert.ok(!html.includes('aria-expanded'), 'no live send for a non-generated row');
  });
});

describe('Phase 2F-B — send request builder + proxy', () => {
  it('builds the voucher-send proxy path + an EMPTY-body POST (no client recipient/subject/body)', () => {
    assert.equal(voucherSendPath('bk-1', 'op-9'), '/api/operations/v2/bk-1/op-9/voucher-send');
    const req = buildVoucherSendRequest('bk-1', 'op-9');
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/operations/v2/bk-1/op-9/voucher-send');
    assert.equal(req.body, '{}'); // empty body — server resolves everything
  });

  it('proxy is POST-only with an empty body; no GET/mutating-verb exports, no client fields', () => {
    assert.ok(proxySrc.includes('export async function POST'));
    for (const verb of ['export async function GET', 'export async function PATCH', 'export async function PUT', 'export async function DELETE']) {
      assert.ok(!proxySrc.includes(verb), `proxy must not export ${verb}`);
    }
    assert.ok(proxySrc.includes('/voucher/send'), 'proxy targets the backend send endpoint');
    assert.ok(proxySrc.includes("body: '{}'"), 'proxy forwards an empty body');
    // The proxy never forwards the client request body (empty '{}' only) — so no
    // recipient/subject/body can be injected. It must also hit no other endpoint.
    assert.ok(!proxySrc.includes('request.json'), 'proxy must not read/forward the client body');
    assert.ok(!proxySrc.includes('await request.text'), 'proxy must not read/forward the client body');
    for (const bad of ['send-document-email', 'supplier-confirmation', '/status', '/vouchers/', '/voucher/pdf', '/invoices', '/payments', '/dispatch']) {
      assert.ok(!proxySrc.includes(bad), `proxy must not reference "${bad}"`);
    }
  });
});

describe('Phase 2F-B — control (preview-first, typed SEND, read-only-safe)', () => {
  it('open panel shows the Send voucher title + Close (preview loads async)', () => {
    const html = renderControlOpen();
    assert.ok(html.includes('Send voucher'));
    assert.ok(html.includes('Close'));
  });

  it('control calls the 2F-A preview first and only sends when readiness is READY', () => {
    assert.ok(controlSrc.includes('voucherSendPreviewPath'), 'fetches the 2F-A preview first');
    assert.ok(controlSrc.includes("preview?.readiness === 'READY'") || controlSrc.includes('isReady'), 'gates on READY');
    assert.ok(controlSrc.includes('if (!isReady'), 'send() bails when not READY');
  });

  it('control requires a typed SEND confirmation to enable the final send', () => {
    assert.ok(controlSrc.includes("typed.trim() === 'SEND'"), 'confirmed only when typed === SEND');
    assert.ok(controlSrc.includes('disabled={!confirmed'), 'final Send disabled until confirmed');
    assert.ok(controlSrc.includes('This will send an email to the supplier.'), 'shows the send warning');
  });

  it('success path sets sent + router.refresh(); error path never shows success', () => {
    assert.ok(controlSrc.includes('result.sent === true'), 'success only when server confirms sent');
    assert.ok(controlSrc.includes('router.refresh()'), 'refreshes on success');
    assert.ok(controlSrc.includes('setSendError('), 'error path surfaces an inline error');
    assert.ok(controlSrc.includes('Open in Classic'), 'Open in Classic fallback remains');
  });

  it('control uses ONLY the sanctioned send + preview endpoints; no forbidden mechanics', () => {
    assert.ok(controlSrc.includes('buildVoucherSendRequest'), 'uses the sanctioned send request builder');
    for (const bad of [
      '.pdf', 'createObjectURL', 'download=', '/export', 'window.print',
      'send-document-email', 'supplier-confirmation', '/vouchers/', '/voucher/pdf', '/status',
      'assign-supplier', '/confirmation', 'voucher/generate', '/invoices', '/payments', '/dispatch',
      "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'",
      'name="email"', 'name="recipient"', 'name="subject"', 'name="body"', 'name="to"',
    ]) {
      assert.ok(!controlSrc.includes(bad), `send control must not reference "${bad}"`);
    }
  });

  it('request builder produces an empty body (no client recipient/subject/body encoded)', () => {
    // The body is exactly '{}' — there is no JSON.stringify of any recipient/subject/
    // body payload, so the client cannot inject send fields. (Comments may mention the
    // words; what matters is the emitted request.)
    const req = buildVoucherSendRequest('bk-1', 'op-1');
    assert.equal(req.body, '{}');
    assert.ok(!requestSrc.includes('JSON.stringify'), 'request builder must not encode any client payload');
    assert.ok(requestSrc.includes("body: '{}'"), 'literal empty body');
  });

  it('service row gates the send behind the flag (else: disabled placeholder)', () => {
    const serviceRowSrc = readFileSync(path.join(HERE, '../../../components/ops/v2/service-row.tsx'), 'utf8');
    assert.ok(serviceRowSrc.includes('isOpsV2VoucherSendEnabled'));
    assert.ok(serviceRowSrc.includes('VoucherSendControl'));
    assert.ok(serviceRowSrc.includes('label="Send"'), 'keeps the disabled fallback');
  });
});
