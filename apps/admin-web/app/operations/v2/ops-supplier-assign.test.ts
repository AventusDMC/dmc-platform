import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ServiceRow } from '../../../components/ops/v2/service-row';
import { buildOperationsBoardVM } from './ops-view-model';
import { SAMPLE_GRID, SAMPLE_READINESS } from './ops-view-model.fixtures';
import {
  buildSupplierAssignRequest,
  supplierAssignPath,
  SUPPLIER_ASSIGN_STATUS,
} from './ops-supplier-assign-request';

// Test-only classic-runtime shim (components use the automatic JSX runtime).
(globalThis as unknown as { React?: unknown }).React = React;

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const CONTROL = path.join(HERE, '../../../components/ops/v2/supplier-assignment-control.tsx');
const SERVICE_ROW = path.join(HERE, '../../../components/ops/v2/service-row.tsx');
const REQUEST = path.join(HERE, 'ops-supplier-assign-request.ts');
const PROXY = path.join(HERE, '../../api/bookings/[id]/operations/[operationId]/assign-supplier/route.ts');

const controlSrc = readFileSync(CONTROL, 'utf8');
const requestSrc = readFileSync(REQUEST, 'utf8');
const serviceRowSrc = readFileSync(SERVICE_ROW, 'utf8');
const proxySrc = readFileSync(PROXY, 'utf8');

const sampleRow = buildOperationsBoardVM(SAMPLE_GRID, SAMPLE_READINESS).phases.flatMap((p) => p.rows)[0];

function renderRow(flagOn: boolean): string {
  if (flagOn) process.env.NEXT_PUBLIC_OPS_V2_SUPPLIER_ASSIGN = 'true';
  else delete process.env.NEXT_PUBLIC_OPS_V2_SUPPLIER_ASSIGN;
  try {
    const stubRouter = {
      back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {},
    };
    return renderToStaticMarkup(
      createElement(
        AppRouterContext.Provider as never,
        { value: stubRouter } as never,
        createElement(ServiceRow, { row: sampleRow, bookingId: 'bk-1' }),
      ),
    );
  } finally {
    delete process.env.NEXT_PUBLIC_OPS_V2_SUPPLIER_ASSIGN;
  }
}

describe('Phase 2A — supplier-assignment request (pure)', () => {
  it('assign → PATCH assign-supplier with ASSIGNED + supplier id', () => {
    const req = buildSupplierAssignRequest('bk-1', 'op-9', 'sup-7');
    assert.equal(req.url, '/api/bookings/bk-1/operations/op-9/assign-supplier');
    assert.equal(req.method, 'PATCH');
    assert.deepEqual(req.body, { assignedSupplierId: 'sup-7', assignmentStatus: 'ASSIGNED' });
  });

  it('unassign (null) → PATCH assign-supplier with UNASSIGNED + null', () => {
    const req = buildSupplierAssignRequest('bk-1', 'op-9', null);
    assert.equal(req.method, 'PATCH');
    assert.deepEqual(req.body, { assignedSupplierId: null, assignmentStatus: 'UNASSIGNED' });
  });

  it('empty string supplier id is treated as unassign', () => {
    assert.equal(buildSupplierAssignRequest('b', 'o', '').body.assignmentStatus, 'UNASSIGNED');
  });

  it('only ASSIGNED / UNASSIGNED statuses exist (never REQUESTED/CONFIRMED/REJECTED)', () => {
    assert.deepEqual(Object.values(SUPPLIER_ASSIGN_STATUS).sort(), ['ASSIGNED', 'UNASSIGNED']);
    assert.equal(supplierAssignPath('b', 'o'), '/api/bookings/b/operations/o/assign-supplier');
  });
});

describe('Phase 2A — flag gating (service row render)', () => {
  it('flag OFF: row keeps the disabled "Assign supplier — Coming later" and no control', () => {
    const html = renderRow(false);
    assert.ok(html.includes('Assign supplier'));
    assert.ok(html.includes('Coming later'));
    assert.ok(html.includes('aria-disabled="true"'));
    assert.ok(!html.includes('aria-expanded'), 'no interactive assignment control when flag OFF');
    assert.ok(!html.includes('<select'), 'no edit control when flag OFF');
  });

  it('flag ON: the supplier-assignment control renders for the row', () => {
    const html = renderRow(true);
    // Live trigger (has aria-expanded); the DisabledAction never does.
    assert.ok(html.includes('aria-expanded'), 'expected the live assignment trigger');
    assert.ok(/Assign supplier|Change supplier/.test(html));
    // The OTHER actions stay disabled "Coming later".
    assert.ok(html.includes('Request confirmation'));
    assert.ok(html.includes('Generate voucher'));
    assert.ok(html.includes('Coming later'));
  });
});

describe('Phase 2A — safety (only the sanctioned mutation)', () => {
  it('the control targets only assign-supplier + GET /api/suppliers, refreshes on success', () => {
    assert.ok(controlSrc.includes('buildSupplierAssignRequest'), 'uses the pure request builder');
    assert.ok(controlSrc.includes("'/api/suppliers'"), 'lazy-loads suppliers');
    assert.ok(controlSrc.includes('router.refresh'), 'refreshes on success');
    for (const bad of [
      '/confirmation', 'supplier-confirmation', '/voucher', '/operational', '/invoices', '/payments',
      'assignmentNotes', 'REQUESTED', 'CONFIRMED', 'REJECTED',
      '.pdf', '/export', 'download=', 'window.print',
      "method: 'POST'", "method: 'PUT'", "method: 'DELETE'",
      'serviceDate', 'startTime', 'pickupTime', 'mealPlan',
    ]) {
      assert.ok(!controlSrc.includes(bad), `control must not reference "${bad}"`);
    }
  });

  it('the request builder is PATCH assign-supplier with ASSIGNED/UNASSIGNED only', () => {
    assert.ok(requestSrc.includes('assign-supplier'));
    assert.ok(requestSrc.includes("method: 'PATCH'"));
    assert.ok(requestSrc.includes('ASSIGNED') && requestSrc.includes('UNASSIGNED'));
    for (const bad of ['REQUESTED', 'CONFIRMED', 'REJECTED', 'assignmentNotes', "method: 'POST'"]) {
      assert.ok(!requestSrc.includes(bad), `request builder must not reference "${bad}"`);
    }
  });

  it('the service row gates the control behind the flag (else: disabled placeholder)', () => {
    assert.ok(serviceRowSrc.includes('isOpsV2SupplierAssignEnabled'));
    assert.ok(serviceRowSrc.includes('SupplierAssignmentControl'));
    assert.ok(serviceRowSrc.includes('label="Assign supplier"'), 'keeps the disabled fallback');
  });

  it('the V2 PATCH proxy is supplier-only: no operational timing / other-domain endpoints', () => {
    const start = proxySrc.indexOf('export async function PATCH');
    assert.notEqual(start, -1, 'V2 PATCH handler missing');
    const patchSrc = proxySrc.slice(start);
    assert.ok(patchSrc.includes('assign-supplier'));
    assert.ok(patchSrc.includes("method: 'PATCH'"));
    assert.ok(patchSrc.includes('ASSIGNED') && patchSrc.includes('UNASSIGNED'));
    for (const bad of [
      '/operational', 'serviceDate', 'startTime', 'pickupTime', 'mealPlan', 'nights',
      '/voucher', '/confirmation', '/invoices', '/payments',
    ]) {
      assert.ok(!patchSrc.includes(bad), `V2 PATCH must not reference "${bad}"`);
    }
  });
});
