type QuoteStatus = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';

const STATUS_TONE_BY_STATUS: Record<QuoteStatus, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  READY: 'accent',
  SENT: 'accent',
  ACCEPTED: 'success',
  CONFIRMED: 'success',
  REVISION_REQUESTED: 'warning',
  EXPIRED: 'danger',
  CANCELLED: 'danger',
};

function formatQuoteStatus(status: QuoteStatus) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function QuoteBuilderStatusBadge({ status, expired = false }: { status: QuoteStatus; expired?: boolean }) {
  const tone = expired && status !== 'ACCEPTED' && status !== 'CONFIRMED' ? 'danger' : STATUS_TONE_BY_STATUS[status];

  return <span className={`quote-builder-status quote-builder-status-${tone}`}>{formatQuoteStatus(status)}</span>;
}
