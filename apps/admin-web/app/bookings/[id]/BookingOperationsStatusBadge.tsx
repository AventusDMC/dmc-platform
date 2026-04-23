type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

type BookingStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
type ClientInvoiceStatus = 'unbilled' | 'invoiced' | 'paid';
type SupplierPaymentStatus = 'unpaid' | 'scheduled' | 'paid';
type ServiceLifecycleStatus = 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled';
type ServiceConfirmationStatus = 'pending' | 'requested' | 'confirmed';

function formatLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getBookingTone(status: BookingStatus): Tone {
  if (status === 'completed') return 'success';
  if (status === 'confirmed' || status === 'in_progress') return 'accent';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

function getInvoiceTone(status: ClientInvoiceStatus): Tone {
  if (status === 'paid') return 'success';
  if (status === 'invoiced') return 'accent';
  return 'warning';
}

function getSupplierPaymentTone(status: SupplierPaymentStatus): Tone {
  if (status === 'paid') return 'success';
  if (status === 'scheduled') return 'accent';
  return 'warning';
}

function getLifecycleTone(status: ServiceLifecycleStatus): Tone {
  if (status === 'confirmed') return 'success';
  if (status === 'ready' || status === 'in_progress') return 'accent';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

function getConfirmationTone(status: ServiceConfirmationStatus): Tone {
  if (status === 'confirmed') return 'success';
  if (status === 'requested') return 'accent';
  return 'warning';
}

type BookingOperationsStatusBadgeProps =
  | {
      kind: 'booking';
      status: BookingStatus;
    }
  | {
      kind: 'invoice';
      status: ClientInvoiceStatus;
    }
  | {
      kind: 'supplier-payment';
      status: SupplierPaymentStatus;
    }
  | {
      kind: 'lifecycle';
      status: ServiceLifecycleStatus;
    }
  | {
      kind: 'confirmation';
      status: ServiceConfirmationStatus;
    }
  | {
      kind: 'custom';
      label: string;
      tone: Tone;
    };

export function BookingOperationsStatusBadge(props: BookingOperationsStatusBadgeProps) {
  if (props.kind === 'custom') {
    return <span className={`booking-ops-status booking-ops-status-${props.tone}`}>{props.label}</span>;
  }

  if (props.kind === 'booking') {
    return <span className={`booking-ops-status booking-ops-status-${getBookingTone(props.status)}`}>{formatLabel(props.status)}</span>;
  }

  if (props.kind === 'invoice') {
    return <span className={`booking-ops-status booking-ops-status-${getInvoiceTone(props.status)}`}>{formatLabel(props.status)}</span>;
  }

  if (props.kind === 'supplier-payment') {
    return (
      <span className={`booking-ops-status booking-ops-status-${getSupplierPaymentTone(props.status)}`}>{formatLabel(props.status)}</span>
    );
  }

  if (props.kind === 'lifecycle') {
    return <span className={`booking-ops-status booking-ops-status-${getLifecycleTone(props.status)}`}>{formatLabel(props.status)}</span>;
  }

  return (
    <span className={`booking-ops-status booking-ops-status-${getConfirmationTone(props.status)}`}>{formatLabel(props.status)}</span>
  );
}
