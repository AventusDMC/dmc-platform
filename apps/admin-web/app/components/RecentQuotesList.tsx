import Link from 'next/link';
import { DashboardEmptyState } from './DashboardEmptyState';
import { DashboardSectionCard } from './DashboardSectionCard';

export type DashboardQuoteListItem = {
  id: string;
  href: string;
  title: string;
  reference: string;
  company: string;
  travelLabel: string;
  statusLabel: string;
  amountLabel: string;
};

type RecentQuotesListProps = {
  quotes: DashboardQuoteListItem[];
};

export function RecentQuotesList({ quotes }: RecentQuotesListProps) {
  return (
    <DashboardSectionCard
      eyebrow="Sales"
      title="Recent Quotes"
      description="Fresh commercial activity and quotes that may need a follow-up."
      action={
        <Link href="/quotes" className="dashboard-toolbar-link">
          View all
        </Link>
      }
    >
      {quotes.length === 0 ? (
        <DashboardEmptyState
          title="No quotes yet"
          description="Quotes will appear here once the sales team starts building proposals."
          action={
            <Link href="/quotes/new" className="secondary-button">
              Create quote
            </Link>
          }
        />
      ) : (
        <div className="executive-dashboard-list">
          {quotes.map((quote) => (
            <Link key={quote.id} href={quote.href} className="executive-dashboard-list-row executive-dashboard-list-row-quote">
              <div className="executive-dashboard-list-row-copy executive-dashboard-quote-row-copy">
                <strong>{quote.title}</strong>
                <p className="executive-dashboard-quote-company">{quote.company}</p>
                <div className="executive-dashboard-quote-meta">
                  <span>{quote.reference}</span>
                  <span>{quote.travelLabel}</span>
                </div>
              </div>
              <div className="executive-dashboard-list-row-aside executive-dashboard-quote-row-aside">
                <span className="executive-dashboard-inline-pill executive-dashboard-quote-status">{quote.statusLabel}</span>
                <span className="executive-dashboard-row-value executive-dashboard-quote-amount">{quote.amountLabel}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </DashboardSectionCard>
  );
}
