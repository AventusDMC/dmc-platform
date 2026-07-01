import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ServiceRow } from '../../../components/ops/v2/service-row';
import { VoucherGenerateControl } from '../../../components/ops/v2/voucher-generate-control';
import { buildOperationsBoardVM, type OpsRowVM } from './ops-view-model';
import { SAMPLE_GRID, SAMPLE_READINESS, VOUCHER_NO_DATE_GRID } from './ops-view-model.fixtures';
import { buildVoucherGenerateRequest, voucherGeneratePath } from './ops-voucher-generate-request';

// Test-only classic-runtime shim (components use the automatic JSX runtime).
(globalThis as unknown as { React?: unknown }).React = React;

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const CONTROL = path.join(HERE, '../../../components/ops/v2/voucher-generate-control.tsx');
const SERVICE_ROW = path.join(HERE, '../../../components/ops/v2/service-row.tsx');
const REQUEST = path.join(HERE, 'ops-voucher-generate-request.ts');
const PROXY = path.join(HERE, '../../api/bookings/[id]/operations/[operationId]/voucher/generate/route.ts');

const controlSrc = readFileSync(CONTROL, 'utf8');
const requestSrc = readFileSync(REQUEST, 'utf8');
const serviceRowSrc = readFileSync(SERVICE_ROW, 'utf8');
const proxySrc = readFileSync(PROXY, 'utf8');

const byId = Object.fromEntries(
  buildOperationsBoardVM(SAMPLE_GRID, SAMPLE_READINESS).phases.flatMap((p) => p.rows).map((r) => [r.id, r]),
);
const noDateRow = buildOperationsBoardVM(VOUCHER_NO_DATE_GRID, undefined).phases
  .flatMap((p) => p.rows)
  .find((r) => r.id === 'row-voucher-no-date')!;

const eligibleRow = byId['row-voucher']; // CONFIRMED + assigned + dated + no voucher yet

function renderRow(row: OpsRowVM, flagOn: boolean): string {
  if (flagOn) process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_GENERATE = 'true';
  else delete process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_GENERATE;
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
    delete process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_GENERATE;
  }
}

function renderControlOpen(canGenerate: boolean, ineligibleReason: string | null): string {
  const stub = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {} };
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider as never,
      { value: stub } as never,
      createElement(VoucherGenerateControl, {
        bookingId: 'bk-1',
        operationId: 'op-1',
        canGenerate,
        ineligibleReason,
        defaultOpen: true,
      } as never),
    ),
  );
}

describe('Phase 2C — voucher-generate request (pure)', () => {
  it('builds PATCH …/voucher/generate with an empty body', () => {
    const req = buildVoucherGenerateRequest('bk-1', 'op-9');
    assert.equal(req.url, '/api/bookings/bk-1/operations/op-9/voucher/generate');
    assert.equal(req.method, 'PATCH');
    assert.deepEqual(req.body, {});
    assert.equal(Object.keys(req.body).length, 0, 'body must be empty — no notes/reference');
    assert.equal(voucherGeneratePath('b', 'o'), '/api/bookings/b/operations/o/voucher/generate');
  });
});

describe('Phase 2C — voucher-generate eligibility (view model)', () => {
  it('an operationally-ready row (assigned + CONFIRMED + dated + no voucher) is eligible', () => {
    assert.equal(eligibleRow.canGenerateVoucher, true);
    assert.equal(eligibleRow.voucherIneligibleReason, null);
    assert.equal(eligibleRow.operationalDatePresent, true);
  });

  it('unassigned row: ineligible with "Assign a supplier first."', () => {
    assert.equal(byId['row-unassigned'].canGenerateVoucher, false);
    assert.equal(byId['row-unassigned'].voucherIneligibleReason, 'Assign a supplier first.');
  });

  it('confirmation not CONFIRMED (REQUESTED): ineligible with "Confirm supplier before generating voucher."', () => {
    assert.equal(byId['row-requested'].canGenerateVoucher, false);
    assert.equal(byId['row-requested'].voucherIneligibleReason, 'Confirm supplier before generating voucher.');
  });

  it('confirmation REJECTED: ineligible with the reassign-in-Classic reason', () => {
    assert.equal(byId['row-critical'].canGenerateVoucher, false);
    assert.equal(byId['row-critical'].voucherIneligibleReason, 'Confirmation rejected — reassign or resolve in Classic.');
  });

  it('missing operational date: ineligible with "Set operational date in Classic."', () => {
    assert.equal(noDateRow.canGenerateVoucher, false);
    assert.equal(noDateRow.voucherIneligibleReason, 'Set operational date in Classic.');
    assert.equal(noDateRow.operationalDatePresent, false);
  });

  it('voucher already generated (ISSUED): ineligible with "Voucher already generated."', () => {
    assert.equal(byId['row-ready'].canGenerateVoucher, false);
    assert.equal(byId['row-ready'].voucherIneligibleReason, 'Voucher already generated.');
  });
});

describe('Phase 2C — flag gating (service row render)', () => {
  it('flag OFF: "Generate voucher — Coming later" stays disabled, no live control', () => {
    const html = renderRow(eligibleRow, false);
    assert.ok(html.includes('Generate voucher'));
    assert.ok(html.includes('Coming later'));
    assert.ok(!html.includes('aria-expanded'), 'no live control when flag OFF');
  });

  it('flag ON + eligible: the live "Generate voucher" control renders', () => {
    const html = renderRow(eligibleRow, true);
    assert.ok(html.includes('Generate voucher'));
    assert.ok(html.includes('aria-expanded'), 'live control trigger present');
    assert.ok(!html.includes('Set operational date in Classic'), 'no ineligible reason for an eligible row');
  });

  it('flag ON + ineligible: disabled with the row-specific reason, no live control', () => {
    for (const [id, reason] of [
      ['row-unassigned', 'Assign a supplier first.'],
      ['row-requested', 'Confirm supplier before generating voucher.'],
      ['row-critical', 'Confirmation rejected — reassign or resolve in Classic.'],
      ['row-ready', 'Voucher already generated.'],
    ] as const) {
      const html = renderRow(byId[id], true);
      assert.ok(html.includes(reason), `${id} must show "${reason}"`);
      assert.ok(!html.includes('aria-expanded'), `${id} must not render a live voucher control`);
    }
    const noDate = renderRow(noDateRow, true);
    assert.ok(noDate.includes('Set operational date in Classic.'));
    assert.ok(!noDate.includes('aria-expanded'));
  });
});

describe('Phase 2C — control panel copy (eligible, open)', () => {
  it('eligible open panel shows the record-only callout + Generate/Cancel', () => {
    const html = renderControlOpen(true, null);
    assert.ok(html.includes('Generate voucher record only. No email, download, print, or export.'));
    assert.ok(html.includes('Generate'));
    assert.ok(html.includes('Cancel'));
  });

  it('ineligible control shows the reason and no open panel', () => {
    const html = renderControlOpen(false, 'Assign a supplier first.');
    assert.ok(html.includes('Assign a supplier first.'));
    assert.ok(!html.includes('Generate voucher record only.'), 'no generate panel when ineligible');
  });
});

describe('Phase 2C — safety (only the sanctioned voucher-generate PATCH)', () => {
  it('control targets only the generate request, refreshes on success, surfaces warnings inline', () => {
    assert.ok(controlSrc.includes('buildVoucherGenerateRequest'));
    assert.ok(controlSrc.includes('router.refresh'));
    assert.ok(controlSrc.includes('warnings'), 'surfaces backend warnings');
    for (const bad of [
      '.pdf', 'download=', '/export', 'window.print', 'createObjectURL',
      '/vouchers/', '/status', '/preview', '/send', 'send-document-email', 'supplier-confirmation',
      'assign-supplier', '/confirmation', '/invoices', '/payments', '/dispatch', '/start', '/complete', '/issue',
      'notes', "method: 'POST'",
    ]) {
      assert.ok(!controlSrc.includes(bad), `control must not reference "${bad}"`);
    }
  });

  it('request builder is PATCH …/voucher/generate with an empty body', () => {
    assert.ok(requestSrc.includes('/voucher/generate'));
    assert.ok(requestSrc.includes("method: 'PATCH'"));
    for (const bad of [
      'notes', 'reference', '.pdf', '/vouchers/', '/status', '/preview', '/send', "method: 'POST'",
    ]) {
      assert.ok(!requestSrc.includes(bad), `request builder must not reference "${bad}"`);
    }
  });

  it('service row gates the control behind the flag (else: disabled placeholder)', () => {
    assert.ok(serviceRowSrc.includes('isOpsV2VoucherGenerateEnabled'));
    assert.ok(serviceRowSrc.includes('VoucherGenerateControl'));
    assert.ok(serviceRowSrc.includes('label="Generate voucher"'), 'keeps the disabled fallback');
  });

  it('the V2 voucher-generate PATCH proxy is generate-only, empty body, JSON verbatim', () => {
    const start = proxySrc.indexOf('export async function PATCH');
    assert.notEqual(start, -1, 'V2 voucher-generate PATCH handler missing');
    const patch = proxySrc.slice(start);
    assert.ok(patch.includes('/voucher/generate'));
    assert.ok(patch.includes('JSON.stringify({})'), 'empty body only');
    for (const bad of [
      'notes', 'confirmationReference', '.pdf', '/vouchers/', '/status', '/preview', '/send',
      'send-document-email', 'supplier-confirmation', 'assign-supplier', '/confirmation',
      '/invoices', '/payments', '/dispatch', '/start', '/complete', '/issue',
    ]) {
      assert.ok(!patch.includes(bad), `V2 PATCH must not reference "${bad}"`);
    }
  });
});
