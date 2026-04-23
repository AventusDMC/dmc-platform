type BookingPaymentStatus = 'PENDING' | 'PAID';

type BookingPaymentStatusBadgeProps = {
  status: BookingPaymentStatus;
  overdue?: boolean;
};

export function BookingPaymentStatusBadge({ status, overdue = false }: BookingPaymentStatusBadgeProps) {
  if (overdue && status === 'PENDING') {
    return <span className="booking-payment-status-badge booking-payment-status-badge-overdue">OVERDUE</span>;
  }

  return (
    <span className={`booking-payment-status-badge booking-payment-status-badge-${status.toLowerCase()}`}>
      {status === 'PAID' ? 'Paid' : 'Pending'}
    </span>
  );
}
