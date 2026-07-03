/**
 * Booking Operations V2 — Finance tab view model (pure mapping).
 *
 * Maps the booking-detail INTERNAL finance summary + payments into a lean,
 * allowlisted VM. It exposes ONLY approved finance-summary + payment fields —
 * never service-level unitCost/unitSell/totalCost/totalSell/supplierPayable
 * (those never reach any VM). References are summarized to "Reference recorded"
 * (payment references are financial by nature and the API does not mask them);
 * notes are shown only when short + non-sensitive, else "Notes recorded".
 *
 * Pure module: no React, no I/O.
 */
import { isSensitiveValue } from './ops-activity-vm';
import {
  invoiceStatusVariant,
  paymentStatusVariant,
  supplierPaymentStatusVariant,
  type StatusVariant,
} from './ops-status-map';

export type RawFinanceSummary = {
  currency?: string | null;
  quotedTotalSell?: number | null;
  realizedTotalCost?: number | null;
  quotedMargin?: number | null;
  quotedMarginPercent?: number | null;
  realizedMargin?: number | null;
  realizedMarginPercent?: number | null;
  clientInvoiceStatus?: string | null;
  supplierPaymentStatus?: string | null;
} | null
  | undefined;

export type RawPayment = {
  id: string;
  type?: string | null; // CLIENT | SUPPLIER
  amount?: number | null;
  currency?: string | null;
  status?: string | null; // PENDING | PAID
  method?: string | null;
  reference?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  overdue?: boolean | null;
  notes?: string | null;
};

export type RawBookingFinance = {
  finance?: RawFinanceSummary;
  payments?: RawPayment[] | null;
} | null
  | undefined;

export type FinancePaymentVM = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  statusLabel: string;
  statusVariant: StatusVariant;
  method: string;
  dueDate: string | null;
  paidDate: string | null;
  /** "Reference recorded" when a reference exists, else null (never the raw value). */
  reference: string | null;
  /** Short non-sensitive note, "Notes recorded", or null. */
  notes: string | null;
  overdue: boolean;
};

export type FinanceVM = {
  currency: string;
  quotedTotal: number | null;
  realizedCost: number | null;
  margin: number | null;
  marginPercent: number | null;
  clientInvoiceStatus: string;
  clientInvoiceVariant: StatusVariant;
  supplierPaymentStatus: string;
  supplierPaymentVariant: StatusVariant;
  paymentCount: number;
  clientPayments: FinancePaymentVM[];
  supplierPayments: FinancePaymentVM[];
  hasClientPayments: boolean;
  hasSupplierPayments: boolean;
};

function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function titleCase(value: string | null | undefined): string {
  if (!value) return '—';
  return String(value)
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

function mapPayment(p: RawPayment): FinancePaymentVM {
  const status = String(p.status || 'PENDING').toUpperCase();
  const overdue = Boolean(p.overdue);
  const note = (p.notes ?? '').trim();
  return {
    id: p.id,
    amount: num(p.amount) ?? 0,
    currency: String(p.currency || 'USD'),
    status,
    statusLabel: titleCase(status),
    statusVariant: paymentStatusVariant(status, overdue),
    method: titleCase(p.method),
    dueDate: p.dueDate ?? null,
    paidDate: p.paidAt ?? null,
    reference: p.reference && String(p.reference).trim() ? 'Reference recorded' : null,
    notes: note ? (note.length <= 80 && !isSensitiveValue(note) ? note : 'Notes recorded') : null,
    overdue,
  };
}

export function buildFinanceVM(detail: RawBookingFinance): FinanceVM {
  const finance = detail?.finance ?? null;
  const rawPayments = Array.isArray(detail?.payments) ? detail!.payments! : [];

  const clientPayments = rawPayments.filter((p) => String(p.type || '').toUpperCase() === 'CLIENT').map(mapPayment);
  const supplierPayments = rawPayments.filter((p) => String(p.type || '').toUpperCase() === 'SUPPLIER').map(mapPayment);

  // Prefer the booking's snapshot currency (correct even before any payment exists);
  // fall back to a payment currency, then USD, so bookings without a stored currency
  // keep the previous behavior.
  const currency =
    finance?.currency || clientPayments[0]?.currency || supplierPayments[0]?.currency || 'USD';

  const clientInvoiceStatus = String(finance?.clientInvoiceStatus || 'unbilled');
  const supplierPaymentStatus = String(finance?.supplierPaymentStatus || 'unpaid');

  return {
    currency,
    quotedTotal: num(finance?.quotedTotalSell),
    realizedCost: num(finance?.realizedTotalCost),
    margin: num(finance?.quotedMargin),
    marginPercent: num(finance?.quotedMarginPercent),
    clientInvoiceStatus,
    clientInvoiceVariant: invoiceStatusVariant(clientInvoiceStatus),
    supplierPaymentStatus,
    supplierPaymentVariant: supplierPaymentStatusVariant(supplierPaymentStatus),
    paymentCount: rawPayments.length,
    clientPayments,
    supplierPayments,
    hasClientPayments: clientPayments.length > 0,
    hasSupplierPayments: supplierPayments.length > 0,
  };
}
