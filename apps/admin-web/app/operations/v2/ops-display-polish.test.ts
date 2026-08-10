import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { serviceTypeLabel, SERVICE_TYPE_LABELS } from './ops-service-type-display';
import { buildOperationsBoardVM, type RawOperationsGrid } from './ops-view-model';
import { ServiceRow } from '../../../components/ops/v2/service-row';

// Ops-DG-1: read-only service-row display polish — curated serviceType/operationType
// label + already-present safe operational detail (mealPlan/nights/pickup/time). No
// cost/PII, no new fetch/mutation/action.

// The V2 components use the automatic JSX runtime; under tsx the harness uses the
// classic runtime, so expose React on the global for renderToStaticMarkup.
(globalThis as unknown as { React?: unknown }).React = React;

describe('Ops-DG-1 — curated serviceType/operationType labels', () => {
  it('maps the required known operationType/serviceType values to friendly labels', () => {
    const expected: Record<string, string> = {
      AIRPORT_TRANSFER: 'Airport transfer',
      POINT_TO_POINT: 'Point-to-point transfer',
      ROUTE_TRANSFER: 'Route transfer',
      FULL_DAY: 'Full-day transport',
      TRANSPORT: 'Transport',
      HOTEL: 'Hotel',
      ACTIVITY: 'Activity',
      JEEP_TOUR: 'Jeep tour',
      GUIDE: 'Guide',
      MEAL: 'Meal',
      DINING: 'Dining',
      RESTAURANT: 'Restaurant',
      ENTRANCE: 'Entrance',
      TICKET: 'Ticket',
      EXTERNAL_PACKAGE: 'External package',
      SERVICE: 'Service',
    };
    for (const [key, label] of Object.entries(expected)) {
      assert.equal(serviceTypeLabel(key), label, `${key} → ${label}`);
      assert.equal(SERVICE_TYPE_LABELS[key], label);
      // case-insensitive normalization
      assert.equal(serviceTypeLabel(key.toLowerCase()), label);
    }
  });

  it('uses a documented safe fallback for unknown values (never blank/crash)', () => {
    assert.equal(serviceTypeLabel('WEIRD_NEW_TYPE'), 'Weird New Type');
    assert.equal(serviceTypeLabel('some-other-thing'), 'Some Other Thing');
    assert.equal(serviceTypeLabel(''), 'Service');
    assert.equal(serviceTypeLabel(null), 'Service');
    assert.equal(serviceTypeLabel(undefined), 'Service');
  });

  it('icon table covers the operationType vocabulary + keeps a CircleDot fallback', () => {
    const iconSrc = readFileSync(new URL('../../../components/ops/v2/service-type-icon.tsx', import.meta.url), 'utf8');
    for (const key of ['AIRPORT_TRANSFER', 'POINT_TO_POINT', 'ROUTE_TRANSFER', 'FULL_DAY', 'HOTEL', 'GUIDE', 'ACTIVITY', 'JEEP_TOUR', 'ENTRANCE', 'TICKET', 'MEAL', 'DINING', 'RESTAURANT', 'EXTERNAL_PACKAGE', 'TRANSPORT']) {
      assert.ok(iconSrc.includes(`${key}:`), `icon map should cover ${key}`);
    }
    assert.ok(iconSrc.includes('?? CircleDot'), 'unknown types keep the neutral CircleDot fallback');
  });
});

function gridWith(rows: any[]): RawOperationsGrid {
  return { booking: { id: 'bk-1', bookingRef: 'BK-1', title: 'QA' }, rows } as RawOperationsGrid;
}
function allRows(grid: RawOperationsGrid) {
  const vm = buildOperationsBoardVM(grid, null as any);
  return vm.phases.flatMap((p) => p.rows);
}

describe('Ops-DG-1 — mapRow exposes curated label + safe detail only', () => {
  it('hotel row: typeLabel + "mealPlan · N nights" detail', () => {
    const [row] = allRows(gridWith([{ id: 'h1', serviceType: 'HOTEL', description: 'Overnight Amman', mealPlan: 'HB', nights: 2 }]));
    assert.equal(row.typeLabel, 'Hotel');
    assert.equal(row.detail, 'HB · 2 nights');
  });

  it('transfer row: pickup · time · → dropoff', () => {
    const [row] = allRows(gridWith([{ id: 't1', serviceType: 'AIRPORT_TRANSFER', description: 'Airport pickup', pickupLocation: 'QAIA', operationalTime: '08:00', dropoffLocation: 'Hotel' }]));
    assert.equal(row.typeLabel, 'Airport transfer');
    assert.equal(row.detail, 'QAIA · 08:00 · → Hotel');
  });

  it('detail is null when no safe detail fields are present (never "undefined"/"null")', () => {
    const [row] = allRows(gridWith([{ id: 'x1', serviceType: 'GUIDE', description: 'Guide' }]));
    assert.equal(row.detail, null);
  });

  it('unknown serviceType still renders a safe fallback label', () => {
    const [row] = allRows(gridWith([{ id: 'u1', serviceType: 'MYSTERY_TYPE', description: 'Mystery' }]));
    assert.equal(row.typeLabel, 'Mystery Type');
  });

  it('row VM never exposes cost/margin/price/payable/driverPhone/PII even if present in payload', () => {
    const [row] = allRows(gridWith([{
      id: 'c1', serviceType: 'HOTEL', description: 'X', mealPlan: 'BB', nights: 1,
      // fields that MUST NOT leak into the VM:
      baseCost: 999, totalCost: 999, totalSell: 999, sell: 999, price: 999, margin: 999, payable: 999,
      supplierPayment: 999, supplierDiscount: 5, driverPhone: '+100000', guestPhone: '+200000', guestEmail: 'g@x.test',
    }]));
    const keys = Object.keys(row);
    for (const forbidden of ['baseCost', 'totalCost', 'totalSell', 'sell', 'price', 'margin', 'payable', 'supplierPayment', 'supplierDiscount', 'driverPhone', 'guestPhone', 'guestEmail']) {
      assert.equal(keys.includes(forbidden), false, `VM must not include ${forbidden}`);
    }
    const json = JSON.stringify(row);
    assert.equal(/999|\+100000|\+200000|g@x\.test/.test(json), false, 'no leaked cost/PII values');
  });
});

describe('Ops-DG-1 — service row renders label + detail, no cost/PII', () => {
  it('renders the curated typeLabel and detail line; does not render cost/driverPhone', () => {
    const [row] = allRows(gridWith([{
      id: 'h9', serviceType: 'HOTEL', description: 'Overnight Amman', mealPlan: 'HB', nights: 2,
      baseCost: 12345, driverPhone: '+19999999',
    }]));
    const html = renderToStaticMarkup(createElement(ServiceRow, { row, bookingId: 'bk-1' }));
    assert.ok(html.includes('Hotel'), 'renders curated typeLabel');
    assert.ok(html.includes('HB · 2 nights'), 'renders the safe detail line');
    assert.ok(html.includes('Overnight Amman'), 'preserves the description');
    assert.equal(html.includes('12345'), false, 'no cost rendered');
    assert.equal(html.includes('+19999999'), false, 'no driver phone rendered');
    // No form/input/select/mutation affordance introduced by the polish.
    for (const forbidden of ['<form', '<input', '<select', '<textarea']) {
      assert.equal(html.includes(forbidden), false, `no ${forbidden} introduced`);
    }
  });
});
