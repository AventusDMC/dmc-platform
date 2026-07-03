import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFinanceVM } from './ops-finance-vm';
import { EMPTY_FINANCE_DETAIL, FINANCE_REDACTED_RAW, SAMPLE_FINANCE_DETAIL } from './ops-finance.fixtures';

describe('ops-finance-vm — summary', () => {
  const vm = buildFinanceVM(SAMPLE_FINANCE_DETAIL);

  it('maps summary totals + margin', () => {
    assert.equal(vm.quotedTotal, 8450);
    assert.equal(vm.realizedCost, 5980);
    assert.equal(vm.margin, 2470);
    assert.equal(vm.marginPercent, 29);
    assert.equal(vm.currency, 'USD');
  });

  it('maps status badges', () => {
    assert.equal(vm.clientInvoiceStatus, 'invoiced');
    assert.equal(vm.clientInvoiceVariant, 'info');
    assert.equal(vm.supplierPaymentStatus, 'unpaid');
    assert.equal(vm.supplierPaymentVariant, 'neutral');
  });

  it('counts payments', () => {
    assert.equal(vm.paymentCount, 3);
  });
});

describe('ops-finance-vm — payments split + mapping', () => {
  const vm = buildFinanceVM(SAMPLE_FINANCE_DETAIL);

  it('splits client vs supplier payments', () => {
    assert.deepEqual(vm.clientPayments.map((p) => p.id), ['pc1', 'pc2']);
    assert.deepEqual(vm.supplierPayments.map((p) => p.id), ['ps1']);
    assert.equal(vm.hasClientPayments, true);
    assert.equal(vm.hasSupplierPayments, true);
  });

  it('maps per-payment status variants (paid/overdue/pending)', () => {
    const pc1 = vm.clientPayments.find((p) => p.id === 'pc1')!;
    const pc2 = vm.clientPayments.find((p) => p.id === 'pc2')!;
    const ps1 = vm.supplierPayments[0];
    assert.equal(pc1.statusVariant, 'success'); // PAID
    assert.equal(pc2.statusVariant, 'critical'); // PENDING + overdue
    assert.equal(pc2.overdue, true);
    assert.equal(ps1.statusVariant, 'warning'); // PENDING, not overdue
  });

  it('summarizes references (never the raw value)', () => {
    assert.equal(vm.clientPayments[0].reference, 'Reference recorded');
    assert.equal(vm.clientPayments[1].reference, null); // none present
    assert.equal(vm.supplierPayments[0].reference, 'Reference recorded');
  });

  it('shows safe short notes; summarizes sensitive/long notes', () => {
    assert.equal(vm.clientPayments[0].notes, 'First installment'); // safe + short
    assert.equal(vm.clientPayments[1].notes, 'Notes recorded'); // sensitive (financial)
    assert.equal(vm.supplierPayments[0].notes, 'Notes recorded'); // too long
  });

  it('drops injected service-level financial fields + never leaks raw refs/notes', () => {
    const serialized = JSON.stringify(vm);
    for (const raw of FINANCE_REDACTED_RAW) {
      assert.ok(!serialized.includes(raw), `finance VM leaked "${raw}"`);
    }
  });
});

describe('ops-finance-vm — empty', () => {
  it('no finance + no payments → safe empty VM', () => {
    const vm = buildFinanceVM(EMPTY_FINANCE_DETAIL);
    assert.equal(vm.quotedTotal, null);
    assert.equal(vm.margin, null);
    assert.equal(vm.paymentCount, 0);
    assert.equal(vm.hasClientPayments, false);
    assert.equal(vm.hasSupplierPayments, false);
    assert.equal(vm.clientInvoiceStatus, 'unbilled');
    assert.equal(vm.supplierPaymentStatus, 'unpaid');
  });

  it('null detail does not throw', () => {
    assert.equal(buildFinanceVM(null).paymentCount, 0);
  });
});

describe('ops-finance-vm — currency (Booking Creation V2 currency-label hardening)', () => {
  it('prefers the snapshot currency from the finance summary, even with no payments', () => {
    // Freshly converted booking: currency in the finance summary, no payments yet.
    const vm = buildFinanceVM({ finance: { currency: 'JOD', quotedTotalSell: 100 }, payments: [] });
    assert.equal(vm.currency, 'JOD');
  });

  it('falls back to USD when neither the summary nor any payment carries a currency', () => {
    const vm = buildFinanceVM({ finance: { quotedTotalSell: 100 }, payments: [] });
    assert.equal(vm.currency, 'USD');
  });

  it('falls back to a payment currency when the summary has none (no regression)', () => {
    const vm = buildFinanceVM({ finance: { quotedTotalSell: 100 }, payments: [{ type: 'CLIENT', amount: 50, currency: 'AED' }] });
    assert.equal(vm.currency, 'AED');
  });

  it('summary currency wins over payment currency', () => {
    const vm = buildFinanceVM({ finance: { currency: 'JOD', quotedTotalSell: 100 }, payments: [{ type: 'CLIENT', amount: 50, currency: 'AED' }] });
    assert.equal(vm.currency, 'JOD');
  });
});
