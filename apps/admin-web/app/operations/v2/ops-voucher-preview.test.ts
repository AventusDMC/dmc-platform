import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ServiceRow } from '../../../components/ops/v2/service-row';
import { VoucherPreviewControl, voucherPreviewPath } from '../../../components/ops/v2/voucher-preview-control';
import { buildOperationsBoardVM, type OpsRowVM } from './ops-view-model';
import { SAMPLE_GRID, SAMPLE_READINESS } from './ops-view-model.fixtures';
import { buildVoucherPreviewVM, isPreviewableVoucherStatus } from './ops-voucher-preview-vm';

// Test-only classic-runtime shim (components use the automatic JSX runtime).
(globalThis as unknown as { React?: unknown }).React = React;

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const CONTROL = path.join(HERE, '../../../components/ops/v2/voucher-preview-control.tsx');
const VM = path.join(HERE, 'ops-voucher-preview-vm.ts');
const PROXY = path.join(HERE, '../../api/operations/v2/[bookingId]/[operationId]/voucher-preview/route.ts');

const controlSrc = readFileSync(CONTROL, 'utf8');
const vmSrc = readFileSync(VM, 'utf8');
const proxySrc = readFileSync(PROXY, 'utf8');

const byId = Object.fromEntries(
  buildOperationsBoardVM(SAMPLE_GRID, SAMPLE_READINESS).phases.flatMap((p) => p.rows).map((r) => [r.id, r]),
);
const previewableRow = byId['row-ready']; // voucher ISSUED → previewable
const notGeneratedRow = byId['row-voucher']; // voucher NOT_GENERATED → not previewable

function renderRow(row: OpsRowVM, flagOn: boolean): string {
  if (flagOn) process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_PREVIEW = 'true';
  else delete process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_PREVIEW;
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
    delete process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_PREVIEW;
  }
}

function renderControlOpen(): string {
  const stub = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {} };
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider as never,
      { value: stub } as never,
      createElement(VoucherPreviewControl, { bookingId: 'bk-1', operationId: 'op-1', defaultOpen: true } as never),
    ),
  );
}

describe('Phase 2D — voucher preview sanitizer (VM redaction)', () => {
  it('drops all finance/discount/token/reference/raw-snapshot fields, keeps only safe operational data', () => {
    const raw = {
      type: 'TRANSPORT',
      status: 'GENERATED',
      // full supplier object + finance on the RAW record — must never surface:
      supplier: { id: 'sup', name: 'FULL_SUPPLIER_OBJECT', transportDiscountPercent: 'LEAK_DISCOUNT', email: 'LEAK_EMAIL' },
      unitCost: 'LEAK_UNITCOST',
      totalCost: 'LEAK_TOTALCOST',
      unitSell: 'LEAK_UNITSELL',
      totalSell: 'LEAK_TOTALSELL',
      supplierPayableAmount: 'LEAK_PAYABLE',
      margin: 'LEAK_MARGIN',
      price: 'LEAK_PRICE',
      paymentStatus: 'LEAK_PAYMENT',
      bankIban: 'LEAK_IBAN',
      snapshotJson: {
        serviceName: 'Airport Transfer',
        serviceType: 'TRANSPORT',
        voucherType: 'TRANSPORT',
        supplier: { id: 'x', name: 'Almushtari' }, // cost-free snapshot supplier (name only)
        date: '2026-07-15',
        time: '09:00',
        paxCount: 2,
        meetingPoint: 'Lobby',
        operationalNotes: 'Meet driver at arrivals',
        transport: { routeName: 'QAIA to Amman', vehicleType: 'Van', driverPhone: 'LEAK_DRIVERPHONE', operationalRemarks: 'ok' },
        pickup: { location: 'QAIA', time: '09:00' },
        dropoff: 'City hotel',
        // injected leaks inside the snapshot too:
        confirmationReference: 'LEAK_REF',
        supplierReference: 'LEAK_SUPREF',
        portalToken: 'LEAK_TOKEN',
        publicUrl: 'https://LEAK_URL',
        proposalUrl: 'https://LEAK_PROPOSAL',
        costBreakdown: 'Rate USD 45.00 x 2 pax',
        internalNotes: 'LEAK_INTERNAL',
      },
    };
    const vm = buildVoucherPreviewVM(raw);
    const json = JSON.stringify(vm);
    for (const leak of [
      'LEAK_DISCOUNT', 'LEAK_EMAIL', 'LEAK_UNITCOST', 'LEAK_TOTALCOST', 'LEAK_UNITSELL', 'LEAK_TOTALSELL',
      'LEAK_PAYABLE', 'LEAK_MARGIN', 'LEAK_PRICE', 'LEAK_PAYMENT', 'LEAK_IBAN', 'LEAK_DRIVERPHONE',
      'LEAK_REF', 'LEAK_SUPREF', 'LEAK_TOKEN', 'LEAK_URL', 'LEAK_PROPOSAL', 'Rate USD 45.00', 'LEAK_INTERNAL',
      'FULL_SUPPLIER_OBJECT', 'transportDiscountPercent', 'snapshotJson',
    ]) {
      assert.ok(!json.includes(leak), `preview VM leaked "${leak}"`);
    }
    // Safe fields present (and supplier NAME came from the snapshot, not the raw supplier):
    assert.equal(vm.serviceName, 'Airport Transfer');
    assert.equal(vm.supplierName, 'Almushtari');
    assert.equal(vm.date, '2026-07-15');
    assert.equal(vm.paxCount, 2);
    assert.equal(vm.transport?.route, 'QAIA to Amman');
    assert.equal(vm.transport?.pickup, 'QAIA');
    assert.equal(vm.transport?.dropoff, 'City hotel');
    assert.equal(vm.operationalNotes, 'Meet driver at arrivals');
  });

  it('handles a null/empty snapshot without throwing', () => {
    const vm = buildVoucherPreviewVM({ type: 'HOTEL', status: 'ISSUED', snapshotJson: null });
    assert.equal(vm.voucherType, 'HOTEL');
    assert.equal(vm.status, 'ISSUED');
    assert.equal(vm.transport, null);
    assert.equal(vm.hotel, null);
    assert.equal(vm.serviceName, null);
  });
});

describe('Phase 2D — previewable eligibility', () => {
  it('previewable statuses are GENERATED/READY/ISSUED/SENT only', () => {
    for (const ok of ['GENERATED', 'READY', 'ISSUED', 'SENT', 'generated', 'issued']) {
      assert.ok(isPreviewableVoucherStatus(ok), `${ok} should be previewable`);
    }
    for (const bad of ['NOT_GENERATED', 'CANCELLED', 'DRAFT', 'REQUESTED', '', null, undefined]) {
      assert.ok(!isPreviewableVoucherStatus(bad as unknown), `${bad} must not be previewable`);
    }
  });

  it('view model: canPreviewVoucher tracks an existing generated voucher', () => {
    assert.equal(previewableRow.canPreviewVoucher, true); // ISSUED
    assert.equal(notGeneratedRow.canPreviewVoucher, false); // NOT_GENERATED
    assert.equal(byId['row-critical'].canPreviewVoucher, false); // NOT_GENERATED
  });
});

describe('Phase 2D — flag gating (service row render)', () => {
  it('flag OFF: "Preview — Coming later" stays disabled, no live control', () => {
    const html = renderRow(previewableRow, false);
    assert.ok(html.includes('Preview'));
    assert.ok(html.includes('Coming later'));
    assert.ok(!html.includes('aria-expanded'), 'no live control when flag OFF');
  });

  it('flag ON + previewable voucher: the live Preview control renders', () => {
    const html = renderRow(previewableRow, true);
    assert.ok(html.includes('Preview'));
    assert.ok(html.includes('aria-expanded'), 'live preview trigger present');
  });

  it('flag ON + no voucher: Preview stays disabled, no live control', () => {
    const html = renderRow(notGeneratedRow, true);
    assert.ok(html.includes('Preview'));
    assert.ok(html.includes('Coming later'));
    assert.ok(!html.includes('aria-expanded'), 'no live preview for a non-previewable row');
  });
});

describe('Phase 2D — control panel (read-only)', () => {
  it('open panel shows the preview-only copy + Close, and no form/input/mutation controls', () => {
    const html = renderControlOpen();
    assert.ok(html.includes('Preview only. No email is sent and nothing is downloaded.'));
    assert.ok(html.includes('Close'));
    for (const bad of ['<form', '<input', '<select', '<textarea']) {
      assert.ok(!html.includes(bad), `panel must not render "${bad}"`);
    }
  });

  it('builds the sanitized voucher-preview proxy path', () => {
    assert.equal(voucherPreviewPath('bk-1', 'op-9'), '/api/operations/v2/bk-1/op-9/voucher-preview');
  });
});

describe('Phase 2D — safety (read-only GET, no mutation/download/finance)', () => {
  it('control is a read-only GET; no pdf/download/print/export/send/status/mutation', () => {
    assert.ok(controlSrc.includes('voucher-preview'));
    assert.ok(controlSrc.includes('Open in Classic'));
    for (const bad of [
      '.pdf', 'download=', '/export', 'window.print', 'createObjectURL',
      '/vouchers/', '/status', '/send', 'send-document-email', 'supplier-confirmation',
      'assign-supplier', '/confirmation', 'voucher/generate',
      '/invoices', '/payments', '/dispatch', '/start', '/complete', '/issue',
      "method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'",
    ]) {
      assert.ok(!controlSrc.includes(bad), `preview control must not reference "${bad}"`);
    }
  });

  it('view model sanitizer contains no mutation/download affordance', () => {
    for (const bad of ['.pdf', 'download=', '/export', 'window.print', 'createObjectURL', "method: 'POST'"]) {
      assert.ok(!vmSrc.includes(bad), `preview VM must not reference "${bad}"`);
    }
  });

  it('proxy is a GET that sanitizes server-side via buildVoucherPreviewVM', () => {
    assert.ok(proxySrc.includes("method: 'GET'"), 'proxy must call the backend with GET');
    assert.ok(proxySrc.includes('/voucher'), 'proxy targets the operational voucher read');
    assert.ok(proxySrc.includes('buildVoucherPreviewVM'), 'proxy sanitizes before returning');
    for (const bad of [
      '.pdf', '/pdf', '/status', '/send', 'send-document-email', 'supplier-confirmation',
      'voucher/generate', '/invoices', '/payments', '/dispatch', '/start', '/complete', '/issue',
      "method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'",
    ]) {
      assert.ok(!proxySrc.includes(bad), `preview proxy must not reference "${bad}"`);
    }
  });

  it('service row gates the preview behind the flag (else: disabled placeholder)', () => {
    const serviceRowSrc = readFileSync(path.join(HERE, '../../../components/ops/v2/service-row.tsx'), 'utf8');
    assert.ok(serviceRowSrc.includes('isOpsV2VoucherPreviewEnabled'));
    assert.ok(serviceRowSrc.includes('VoucherPreviewControl'));
    assert.ok(serviceRowSrc.includes('label="Preview"'), 'keeps the disabled fallback');
  });
});
