import { GuidedQuoteBuilder } from './GuidedQuoteBuilder';
import { AdminBreadcrumbs } from '../../../components/AdminBreadcrumbs';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Guided Quote Builder v1 — linear 7-step travel-oriented wizard on top
// of the existing quote engine. Per spec: do NOT rewrite the quote engine;
// build a guided layer on top. Final step hands off to the existing
// /quotes/new (advanced workspace) with prefilled state.

export default function GuidedQuoteBuilderPage() {
  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Sales' }, { label: 'Quotes', href: '/quotes' }, { label: 'Guided Builder' }]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1>Guided Quote Builder</h1>
            <p className="admin-muted-copy">
              Build a travel journey step-by-step. Operational safety + supplier reliability checks run quietly underneath. Switch to the advanced
              workspace any time if you need full control.
            </p>
          </div>
          <Link
            href="/quotes/new"
            style={{
              background: '#ffffff',
              color: 'var(--ds-color-info, #175CD3)',
              padding: '0.5rem 0.95rem',
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: 'none',
              border: '1px solid #84caff',
              whiteSpace: 'nowrap',
            }}
          >
            Switch to Advanced Workspace →
          </Link>
        </div>
      </div>
      <GuidedQuoteBuilder />
    </main>
  );
}
