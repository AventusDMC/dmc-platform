import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ServiceRow } from '../../../components/ops/v2/service-row';
import { SupplierConfirmationControl } from '../../../components/ops/v2/supplier-confirmation-control';
import { buildOperationsBoardVM } from './ops-view-model';
import { SAMPLE_GRID, SAMPLE_READINESS } from './ops-view-model.fixtures';
import {
  buildSupplierConfirmRequest,
  isSupplierConfirmStatus,
  requiresAssignedSupplier,
  supplierConfirmPath,
  SUPPLIER_CONFIRM_STATUS,
  SUPPLIER_CONFIRM_STATUSES,
} from './ops-supplier-confirm-request';

// Test-only classic-runtime shim (components use the automatic JSX runtime).
(globalThis as unknown as { React?: unknown }).React = React;

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const CONTROL = path.join(HERE, '../../../components/ops/v2/supplier-confirmation-control.tsx');
const SERVICE_ROW = path.join(HERE, '../../../components/ops/v2/service-row.tsx');
const REQUEST = path.join(HERE, 'ops-supplier-confirm-request.ts');
const PROXY = path.join(HERE, '../../api/bookings/[id]/operations/[operationId]/confirmation/route.ts');

const controlSrc = readFileSync(CONTROL, 'utf8');
const requestSrc = readFileSync(REQUEST, 'utf8');
const serviceRowSrc = readFileSync(SERVICE_ROW, 'utf8');
const proxySrc = readFileSync(PROXY, 'utf8');

const rows = buildOperationsBoardVM(SAMPLE_GRID, SAMPLE_READINESS).phases.flatMap((p) => p.rows);
const assignedRow = rows.find((r) => r.assignedSupplierId) ?? rows[0];

function renderRow(flagOn: boolean): string {
  if (flagOn) process.env.NEXT_PUBLIC_OPS_V2_SUPPLIER_CONFIRM_STATUS = 'true';
  else delete process.env.NEXT_PUBLIC_OPS_V2_SUPPLIER_CONFIRM_STATUS;
  try {
    const stub = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {} };
    return renderToStaticMarkup(
      createElement(
        AppRouterContext.Provider as never,
        { value: stub } as never,
        createElement(ServiceRow, { row: assignedRow, bookingId: 'bk-1' }),
      ),
    );
  } finally {
    delete process.env.NEXT_PUBLIC_OPS_V2_SUPPLIER_CONFIRM_STATUS;
  }
}

// Render the confirmation control with its panel forced open (defaultOpen) so the
// status <select> + helper are present in the static markup and their
// enabled/disabled state can be asserted.
function renderControlOpen(hasSupplier: boolean): string {
  const stub = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {} };
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider as never,
      { value: stub } as never,
      createElement(SupplierConfirmationControl, {
        bookingId: 'bk-1',
        operationId: 'op-1',
        currentStatus: null,
        hasSupplier,
        defaultOpen: true,
      } as never),
    ),
  );
}

describe('Phase 2B — confirmation request (pure)', () => {
  it('builds PATCH …/confirmation with only supplierConfirmationStatus', () => {
    const req = buildSupplierConfirmRequest('bk-1', 'op-9', SUPPLIER_CONFIRM_STATUS.CONFIRMED);
    assert.equal(req.url, '/api/bookings/bk-1/operations/op-9/confirmation');
    assert.equal(req.method, 'PATCH');
    assert.deepEqual(req.body, { supplierConfirmationStatus: 'CONFIRMED' });
    assert.deepEqual(Object.keys(req.body), ['supplierConfirmationStatus']); // no reference/notes
    assert.equal(supplierConfirmPath('b', 'o'), '/api/bookings/b/operations/o/confirmation');
  });

  it('allowed statuses are exactly CONFIRMED, REJECTED (no NOT_SENT, no email-implying statuses)', () => {
    assert.deepEqual([...SUPPLIER_CONFIRM_STATUSES].sort(), ['CONFIRMED', 'REJECTED']);
    for (const bad of ['NOT_SENT', 'REQUESTED', 'SENT', 'ACKNOWLEDGED', 'CANCELLED']) {
      assert.equal(isSupplierConfirmStatus(bad), false, `${bad} must not be allowed`);
    }
  });

  it('both outcomes (Confirmed / Rejected) require an assigned supplier', () => {
    assert.equal(requiresAssignedSupplier(SUPPLIER_CONFIRM_STATUS.CONFIRMED), true);
    assert.equal(requiresAssignedSupplier(SUPPLIER_CONFIRM_STATUS.REJECTED), true);
  });
});

describe('Phase 2B — flag gating (service row render)', () => {
  it('flag OFF: "Request confirmation — Coming later" stays disabled, no control', () => {
    const html = renderRow(false);
    assert.ok(html.includes('Request confirmation'));
    assert.ok(html.includes('Coming later'));
    assert.ok(html.includes('aria-disabled="true"'));
    assert.ok(!html.includes('Record confirmation'), 'no live control when flag OFF');
  });

  it('flag ON: the manual confirmation control renders; other actions stay disabled', () => {
    const html = renderRow(true);
    assert.ok(html.includes('Record confirmation'), 'trigger label');
    assert.ok(html.includes('aria-expanded'), 'live control trigger present');
    assert.ok(html.includes('Generate voucher'));
    assert.ok(html.includes('Coming later'));
  });
});

describe('Phase 2B — operational-supplier gating (the staging-QA fix)', () => {
  it('operationally-unassigned row: Confirmed + Rejected disabled, helper shown', () => {
    const html = renderControlOpen(false);
    assert.ok(html.includes('Assign a supplier before recording confirmation.'), 'helper must appear');
    assert.ok(html.includes('value="CONFIRMED" disabled=""'), 'Confirmed must be disabled');
    assert.ok(html.includes('value="REJECTED" disabled=""'), 'Rejected must be disabled');
  });

  it('operationally-assigned row: Confirmed + Rejected enabled, no helper', () => {
    const html = renderControlOpen(true);
    assert.ok(!html.includes('Assign a supplier before recording confirmation.'), 'no helper when assigned');
    assert.ok(html.includes('value="CONFIRMED"'), 'Confirmed option present');
    assert.ok(!html.includes('value="CONFIRMED" disabled=""'), 'Confirmed must be enabled');
    assert.ok(!html.includes('value="REJECTED" disabled=""'), 'Rejected must be enabled');
  });
});

describe('Phase 2B — safety (only the sanctioned confirmation PATCH)', () => {
  it('control targets only the confirmation endpoint, refreshes, gates unassigned rows', () => {
    assert.ok(controlSrc.includes('buildSupplierConfirmRequest'));
    assert.ok(controlSrc.includes('router.refresh'));
    assert.ok(controlSrc.includes('requiresAssignedSupplier'));
    assert.ok(controlSrc.includes('Assign a supplier before recording confirmation.'));
    assert.ok(controlSrc.includes('Record supplier confirmation outcome manually'));
    for (const bad of [
      'supplier-confirmation', '/send', '/preview', '/voucher', '/operational', '/invoices', '/payments',
      '/dispatch', '/start', '/complete', '/issue',
      'assign-supplier', 'assign-transport', 'confirmationReference', 'confirmationNotes',
      'NOT_SENT', 'REQUESTED', 'ACKNOWLEDGED', 'CANCELLED',
      '.pdf', '/export', 'download=', 'window.print', "method: 'POST'",
    ]) {
      assert.ok(!controlSrc.includes(bad), `control must not reference "${bad}"`);
    }
  });

  it('request builder is PATCH …/confirmation, allowed statuses only, no reference/notes', () => {
    assert.ok(requestSrc.includes('/confirmation'));
    assert.ok(requestSrc.includes("method: 'PATCH'"));
    for (const bad of [
      'NOT_SENT', 'REQUESTED', 'ACKNOWLEDGED', 'CANCELLED', 'confirmationReference', 'confirmationNotes',
      'supplier-confirmation', '/send', '/preview', "method: 'POST'",
    ]) {
      assert.ok(!requestSrc.includes(bad), `request builder must not reference "${bad}"`);
    }
  });

  it('service row gates the control behind the flag (else: disabled placeholder)', () => {
    assert.ok(serviceRowSrc.includes('isOpsV2SupplierConfirmEnabled'));
    assert.ok(serviceRowSrc.includes('SupplierConfirmationControl'));
    assert.ok(serviceRowSrc.includes('label="Request confirmation"'), 'keeps the disabled fallback');
  });

  it('service row gates confirmation on the OPERATIONAL supplier signal, not the catalog fallback', () => {
    assert.ok(
      serviceRowSrc.includes('hasSupplier={row.hasOperationalSupplierAssignment}'),
      'confirmation hasSupplier must use the raw operational assignment',
    );
    assert.ok(
      !serviceRowSrc.includes('hasSupplier={Boolean(row.assignedSupplierId)}'),
      'must not gate on the catalog/fallback assignedSupplierId',
    );
  });

  it('the V2 confirmation PATCH proxy is status-only: no send/preview/voucher/finance', () => {
    const start = proxySrc.indexOf('export async function PATCH');
    assert.notEqual(start, -1, 'V2 confirmation PATCH handler missing');
    const patch = proxySrc.slice(start);
    assert.ok(patch.includes('/confirmation'));
    assert.ok(patch.includes("method: 'PATCH'"));
    assert.ok(patch.includes('CONFIRMED') && patch.includes('REJECTED'));
    assert.ok(!patch.includes('NOT_SENT'), 'V2 PATCH must not allow NOT_SENT');
    for (const bad of [
      'supplier-confirmation', '/send', '/preview', '/pdf', '/voucher', '/operational',
      '/invoices', '/payments', '/dispatch', '/start', '/complete', '/issue',
      'confirmationReference', 'confirmationNotes', 'REQUESTED', 'ACKNOWLEDGED', 'CANCELLED',
    ]) {
      assert.ok(!patch.includes(bad), `V2 PATCH must not reference "${bad}"`);
    }
  });
});
