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
          <p className="eyebrow">Quote Health</p>
          <h3>Send readiness</h3>
        </div>
        <span className={`quote-ui-badge ${statusTone}`}>
          {readiness.statusLabel}
        </span>
      </div>

      <div className="quote-health-progress">
        <div>
          <span>Completion</span>
          <strong>{readiness.completionPercent}%</strong>
        </div>
        <div className="quote-health-progress-bar" aria-hidden="true">
          <span style={{ width: `${readiness.completionPercent}%` }} />
        </div>
      </div>

      <div className="quote-health-stats">
        <article className="workspace-summary-card">
          <span>Blockers</span>
          <strong>{readiness.blockers.length}</strong>
          <p>Must be cleared before share.</p>
        </article>
        <article className="workspace-summary-card">
          <span>Warnings</span>
          <strong>{readiness.warnings.length}</strong>
          <p>Advisory checks that still need review.</p>
        </article>
        <article className="workspace-summary-card">
          <span>Cleanup</span>
          <strong>{readiness.cleanupItems.length}</strong>
          <p>Operational cleanup that stays visible but does not block share.</p>
        </article>
      </div>

      <div className="quote-health-actions">
        <p className="workspace-sidebar-note">Quick actions</p>
        {quickActions.length === 0 ? (
          <p className="detail-copy">No immediate issues. Use the guided flow or tabs below as needed.</p>
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
