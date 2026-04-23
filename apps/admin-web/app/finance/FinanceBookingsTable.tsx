import Link from 'next/link';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { getMarginColor } from '../lib/financials';

type FinanceBooking = {
  id: string;
  bookingRef: string;
  status: string;
  finance: {
    quotedTotalSell: number;
    quotedTotalCost: number;
    quotedMargin: number;
    quotedMarginPercent: number;
    realizedTotalSell: number;
    realizedTotalCost: number;
    realizedMargin: number;
    realizedMarginPercent: number;
    clientInvoiceStatus: 'unbilled' | 'invoiced' | 'paid';
    supplierPaymentStatus: 'unpaid' | 'scheduled' | 'paid';
    hasLowMargin: boolean;
    hasUnpaidClientBalance: boolean;
    hasUnpaidSupplierObligation: boolean;
    overdueClientPaymentsCount: number;
    overdueSupplierPaymentsCount: number;
    hasOverdueClientPayments: boolean;
    hasOverdueSupplierPayments: boolean;
    badge: {
      count: number;
      tone: 'error' | 'warning' | 'none';
      breakdown: {
        unpaidClient: number;
        unpaidSupplier: number;
        negativeMargin: number;
        lowMargin: number;
        overdueClient: number;
        overdueSupplier: number;
      };
    };
  };
};

type FinanceBookingsTableProps = {
  bookings: FinanceBooking[];
};

function formatMoney(amount: number, currency = 'USD') {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatBookingStatus(status: string) {
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatClientInvoiceStatus(status: FinanceBooking['finance']['clientInvoiceStatus']) {
  if (status === 'unbilled') return 'Unbilled';
  if (status === 'invoiced') return 'Invoiced';
  return 'Paid';
}

function formatSupplierPaymentStatus(status: FinanceBooking['finance']['supplierPaymentStatus']) {
  if (status === 'unpaid') return 'Unpaid';
  if (status === 'scheduled') return 'Scheduled';
  return 'Paid';
}

export function FinanceBookingsTable({ bookings }: FinanceBookingsTableProps) {
  return (
    <div className="entity-list allotment-table-stack">
      <div className="table-wrap">
        <table className="data-table allotment-table">
          <thead>
            <tr>
              <th>Booking</th>
              <th>Quoted</th>
              <th>Realized</th>
              <th>Tracking</th>
              <th>Attention</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td>
                  <strong>{booking.bookingRef}</strong>
                  <div className="table-subcopy">{formatBookingStatus(booking.status)}</div>
                </td>
                <td>
                  <strong>{formatMoney(booking.finance.quotedTotalSell)}</strong>
                  <div className="table-subcopy">Cost {formatMoney(booking.finance.quotedTotalCost)}</div>
                  <div className="table-subcopy" style={{ color: getMarginColor(booking.finance.quotedMarginPercent < 0 ? 'negative' : booking.finance.hasLowMargin ? 'low' : 'positive') }}>
                    Margin {booking.finance.quotedMarginPercent.toFixed(2)}%
                  </div>
                </td>
                <td>
                  <strong>{formatMoney(booking.finance.realizedTotalSell)}</strong>
                  <div className="table-subcopy">Cost {formatMoney(booking.finance.realizedTotalCost)}</div>
                  <div className="table-subcopy" style={{ color: getMarginColor(booking.finance.realizedMarginPercent < 0 ? 'negative' : booking.finance.hasLowMargin ? 'low' : 'positive') }}>
                    Margin {booking.finance.realizedMarginPercent.toFixed(2)}%
                  </div>
                </td>
                <td>
                  <strong>{formatClientInvoiceStatus(booking.finance.clientInvoiceStatus)}</strong>
                  <div className="table-subcopy">Supplier {formatSupplierPaymentStatus(booking.finance.supplierPaymentStatus)}</div>
                </td>
                <td>
                  {booking.finance.badge.count > 0 ? (
                    <>
                      {booking.finance.badge.breakdown.unpaidClient > 0 ? <p className="form-error operations-inline-warning">{booking.finance.badge.breakdown.unpaidClient} unpaid client</p> : null}
                      {booking.finance.badge.breakdown.unpaidSupplier > 0 ? <p className="form-error operations-inline-warning">{booking.finance.badge.breakdown.unpaidSupplier} unpaid supplier</p> : null}
                      {booking.finance.badge.breakdown.overdueClient > 0 ? <p className="form-error operations-inline-warning">{booking.finance.overdueClientPaymentsCount} overdue client payment{booking.finance.overdueClientPaymentsCount === 1 ? '' : 's'}</p> : null}
                      {booking.finance.badge.breakdown.overdueSupplier > 0 ? <p className="form-error operations-inline-warning">{booking.finance.overdueSupplierPaymentsCount} overdue supplier payment{booking.finance.overdueSupplierPaymentsCount === 1 ? '' : 's'}</p> : null}
                      {booking.finance.badge.breakdown.negativeMargin > 0 ? <p className="form-error operations-inline-warning">{booking.finance.badge.breakdown.negativeMargin} negative margin</p> : null}
                      {booking.finance.badge.breakdown.lowMargin > 0 ? <p className="form-error operations-inline-warning">{booking.finance.badge.breakdown.lowMargin} low margin</p> : null}
                    </>
                  ) : (
                    <span className="supplier-confirmation-status">Clear</span>
                  )}
                </td>
                <td>
                  <RowDetailsPanel summary="Open details" className="operations-row-details" bodyClassName="operations-row-details-body">
                    <div className="table-action-row">
                      <Link href={`/bookings/${booking.id}?tab=finance`} className="compact-button">
                        Open finance tab
                      </Link>
                    </div>
                    <p className="detail-copy">
                      {`Quoted margin: ${formatMoney(booking.finance.quotedMargin)} | Realized margin: ${formatMoney(booking.finance.realizedMargin)}`}
                    </p>
                    <p className="detail-copy">
                      {`Client invoice: ${formatClientInvoiceStatus(booking.finance.clientInvoiceStatus)} | Supplier payment: ${formatSupplierPaymentStatus(booking.finance.supplierPaymentStatus)}`}
                    </p>
                    {booking.finance.hasLowMargin ? <p className="form-error">Margin is below the operational threshold.</p> : null}
                    {booking.finance.hasUnpaidClientBalance ? <p className="form-error">Client balance is not fully paid.</p> : null}
                    {booking.finance.hasUnpaidSupplierObligation ? <p className="form-error">Supplier obligations are still open.</p> : null}
                    {booking.finance.hasOverdueClientPayments ? <p className="form-error">Client payments are overdue.</p> : null}
                    {booking.finance.hasOverdueSupplierPayments ? <p className="form-error">Supplier payments are overdue.</p> : null}
                  </RowDetailsPanel>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
