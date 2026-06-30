import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bookingStatusVariant,
  confirmationVariant,
  documentStatusVariant,
  executionVariant,
  humanizeStatus,
  invoiceStatusVariant,
  operationStatusVariant,
  paymentStatusVariant,
  phaseVariant,
  severityVariant,
  supplierPaymentStatusVariant,
  voucherVariant,
} from './ops-status-map';

// Exhaustive enum → variant coverage. Locks the presentational decoding from
// the design brief §7 / handoff §6 so the badge palette stays consistent.

describe('ops-status-map — confirmation status', () => {
  const cases: Array<[string, string]> = [
    ['CONFIRMED', 'success'],
    ['REQUESTED', 'warning'],
    ['SENT', 'warning'],
    ['ACKNOWLEDGED', 'warning'],
    ['REJECTED', 'critical'],
    ['CANCELLED', 'critical'],
    ['NOT_SENT', 'neutral'],
  ];
  for (const [status, variant] of cases) {
    it(`${status} → ${variant}`, () => assert.equal(confirmationVariant(status), variant));
  }
  it('case-insensitive + null/unknown → neutral', () => {
    assert.equal(confirmationVariant('confirmed'), 'success');
    assert.equal(confirmationVariant(null), 'neutral');
    assert.equal(confirmationVariant('something-else'), 'neutral');
  });
});

describe('ops-status-map — voucher status', () => {
  const cases: Array<[string, string]> = [
    ['ISSUED', 'success'],
    ['SENT', 'success'],
    ['GENERATED', 'warning'],
    ['CANCELLED', 'critical'],
    ['NOT_GENERATED', 'neutral'],
  ];
  for (const [status, variant] of cases) {
    it(`${status} → ${variant}`, () => assert.equal(voucherVariant(status), variant));
  }
});

describe('ops-status-map — execution status', () => {
  const cases: Array<[string, string]> = [
    ['COMPLETED', 'success'],
    ['DISPATCHED', 'info'],
    ['IN_PROGRESS', 'info'],
    ['ISSUE', 'critical'],
    ['CANCELLED', 'critical'],
    ['READY', 'neutral'],
  ];
  for (const [status, variant] of cases) {
    it(`${status} → ${variant}`, () => assert.equal(executionVariant(status), variant));
  }
});

describe('ops-status-map — booking status', () => {
  const cases: Array<[string, string]> = [
    ['confirmed', 'success'],
    ['completed', 'success'],
    ['in_progress', 'info'],
    ['cancelled', 'critical'],
    ['draft', 'neutral'],
  ];
  for (const [status, variant] of cases) {
    it(`${status} → ${variant}`, () => assert.equal(bookingStatusVariant(status), variant));
  }
});

describe('ops-status-map — phase + severity', () => {
  it('phase variants', () => {
    assert.equal(phaseVariant('Operationally Ready'), 'success');
    assert.equal(phaseVariant('Ready for Voucher'), 'warning');
    assert.equal(phaseVariant('Needs Confirmation'), 'warning');
    assert.equal(phaseVariant('Critical Issues'), 'critical');
    assert.equal(phaseVariant('Needs Assignment'), 'neutral');
  });
  it('severity variants', () => {
    assert.equal(severityVariant('CRITICAL'), 'critical');
    assert.equal(severityVariant('ACTION REQUIRED'), 'warning');
    assert.equal(severityVariant('INFO'), 'info');
  });
});

describe('ops-status-map — operation status (grid row.status)', () => {
  const cases: Array<[string, string]> = [
    ['COMPLETED', 'success'],
    ['OPERATIONAL_READY', 'success'],
    ['CONFIRMED', 'success'],
    ['VOUCHER_SENT', 'info'],
    ['REQUESTED', 'warning'],
    ['REJECTED', 'critical'],
    ['PENDING', 'neutral'],
  ];
  for (const [status, variant] of cases) {
    it(`${status} → ${variant}`, () => assert.equal(operationStatusVariant(status), variant));
  }
});

describe('ops-status-map — finance variants', () => {
  it('invoice status', () => {
    assert.equal(invoiceStatusVariant('paid'), 'success');
    assert.equal(invoiceStatusVariant('invoiced'), 'info');
    assert.equal(invoiceStatusVariant('unbilled'), 'neutral');
  });
  it('supplier payment status', () => {
    assert.equal(supplierPaymentStatusVariant('paid'), 'success');
    assert.equal(supplierPaymentStatusVariant('scheduled'), 'warning');
    assert.equal(supplierPaymentStatusVariant('unpaid'), 'neutral');
  });
  it('per-payment status (overdue → critical)', () => {
    assert.equal(paymentStatusVariant('PAID'), 'success');
    assert.equal(paymentStatusVariant('PENDING', false), 'warning');
    assert.equal(paymentStatusVariant('PENDING', true), 'critical');
  });
  it('document status', () => {
    assert.equal(documentStatusVariant('ISSUED'), 'success');
    assert.equal(documentStatusVariant('SENT'), 'success');
    assert.equal(documentStatusVariant('READY'), 'info');
    assert.equal(documentStatusVariant('DRAFT'), 'warning');
    assert.equal(documentStatusVariant('CANCELLED'), 'critical');
    assert.equal(documentStatusVariant('NOT_GENERATED'), 'neutral');
    assert.equal(documentStatusVariant('IN_CLASSIC'), 'neutral');
  });
});

describe('ops-status-map — humanizeStatus', () => {
  it('title-cases enum-ish values', () => {
    assert.equal(humanizeStatus('NOT_SENT'), 'Not Sent');
    assert.equal(humanizeStatus('NOT_GENERATED'), 'Not Generated');
    assert.equal(humanizeStatus('IN_PROGRESS'), 'In Progress');
    assert.equal(humanizeStatus('CONFIRMED'), 'Confirmed');
  });
  it('null/empty → dash', () => {
    assert.equal(humanizeStatus(null), '-');
    assert.equal(humanizeStatus(''), '-');
  });
});
