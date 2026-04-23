import Link from 'next/link';

type BookingAlertItem = {
  id: string;
  message: string;
  actionLabel?: string;
  href?: string;
};

type BookingAlertPanelProps = {
  eyebrow: string;
  title: string;
  tone?: 'warning' | 'danger' | 'neutral';
  items: BookingAlertItem[];
  emptyLabel: string;
};

export function BookingAlertPanel({
  eyebrow,
  title,
  tone = 'neutral',
  items,
  emptyLabel,
}: BookingAlertPanelProps) {
  return (
    <article className={`booking-ops-alert-panel booking-ops-alert-panel-${tone}`}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="detail-copy">{emptyLabel}</p>
      ) : (
        <div className="booking-ops-alert-list">
          {items.map((item) => (
            <div key={item.id} className="booking-ops-alert-item">
              <p>{item.message}</p>
              {item.href && item.actionLabel ? (
                <Link href={item.href} className="booking-ops-alert-link">
                  {item.actionLabel}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
