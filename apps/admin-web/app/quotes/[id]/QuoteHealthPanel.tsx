import Link from 'next/link';
import { QuoteReadinessModel } from './quote-readiness';

type QuoteHealthPanelProps = {
  readiness: QuoteReadinessModel;
  groupPricingHref: string;
};

function uniqueIssuesByHref(readiness: QuoteReadinessModel) {
  const links = new Map<string, { href: string; label: string; helper: string }>();

  for (const issue of [...readiness.blockers, ...readiness.warnings, ...readiness.cleanupItems]) {
    if (links.has(issue.href)) {
      continue;
    }

    links.set(issue.href, {
      href: issue.href,
      label: issue.source,
      helper: issue.title,
    });
  }

  return [...links.values()].slice(0, 5);
}

export function QuoteHealthPanel({ readiness, groupPricingHref }: QuoteHealthPanelProps) {
  const readyToSend = readiness.blockers.length === 0;
  const servicesPriced = readiness.unpricedServices === 0;
  const datesSet = readiness.totalDays > 0;
  const quickActions = [
    ...uniqueIssuesByHref(readiness),
    {
      href: groupPricingHref,
      label: 'Group Pricing',
      helper: 'Open slab or package pricing setup.',
    },
  ].filter((action, index, actions) => actions.findIndex((candidate) => candidate.href === action.href) === index).slice(0, 5);
  const statusTone =
    readiness.statusLabel === 'Ready to Share'
      ? 'quote-ui-badge-success'
      : readiness.statusLabel === 'Needs Review'
        ? 'quote-ui-badge-info'
        : 'quote-ui-badge-warning';

  return (
    <aside className="workspace-sidebar-card quote-health-panel">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Quote Status</p>
          <h3>Client proposal status</h3>
        </div>
        <span className={`quote-ui-badge ${statusTone}`}>
          {readiness.statusLabel}
        </span>
      </div>

      <div className="quote-health-stats">
        <article className="workspace-summary-card">
          <span>Ready to send</span>
          <strong>{readyToSend ? 'Yes' : 'Review'}</strong>
          <p>{readyToSend ? 'No required items are blocking client sharing.' : 'Review required items before sending.'}</p>
        </article>
        <article className="workspace-summary-card">
          <span>Services priced</span>
          <strong>{servicesPriced ? 'Yes' : `${readiness.unpricedServices} left`}</strong>
          <p>{servicesPriced ? 'All services have pricing in place.' : 'Complete remaining service pricing.'}</p>
        </article>
        <article className="workspace-summary-card">
          <span>Dates set</span>
          <strong>{datesSet ? 'Yes' : 'Missing'}</strong>
          <p>{datesSet ? `${readiness.totalDays} itinerary day${readiness.totalDays === 1 ? '' : 's'} planned.` : 'Add travel dates and itinerary days.'}</p>
        </article>
      </div>

      <div className="quote-health-actions">
        <p className="workspace-sidebar-note">Next actions</p>
        {quickActions.length === 0 ? (
          <p className="detail-copy">Send to client, convert to booking, or continue editing from the page actions.</p>
        ) : (
          quickActions.map((action) => (
            <Link key={action.href} href={action.href} className="quote-health-action-link">
              <strong>{action.label}</strong>
              <span>{action.helper}</span>
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}
