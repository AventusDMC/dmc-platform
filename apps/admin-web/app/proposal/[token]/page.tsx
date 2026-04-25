import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../lib/admin-server';

type ProposalPageProps = {
  params: Promise<{
    token: string;
  }>;
};

type PublicQuoteViewResponse = {
  quote: {
    title: string;
    status?: string;
  };
};

async function getPublicQuoteView(token: string) {
  return adminPageFetchJson<PublicQuoteViewResponse | null>(`/api/quotes/public/${token}/view`, 'Public proposal', {
    cache: 'no-store',
    allowAnonymous: true,
    allow404: true,
  });
}

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { token } = await params;
  const quoteView = await getPublicQuoteView(token);

  if (!quoteView) {
    notFound();
  }

  return (
    <main className="page">
      <section className="panel" style={{ width: '100%', maxWidth: '1200px', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p className="eyebrow">Travel Proposal</p>
            <h1>{quoteView.quote.title || 'Jordan Travel Proposal'}</h1>
            <p className="detail-copy">A clean public proposal view designed for clients and partner agents.</p>
          </div>
          <div className="table-action-row">
            <a href={`/api/public/proposals/${token}/pdf`} className="primary-button" target="_blank" rel="noreferrer">
              Download PDF
            </a>
            <Link href={`/q/${token}`} className="secondary-button">
              Open Interactive View
            </Link>
          </div>
        </div>

        <div className="detail-card" style={{ padding: 0, overflow: 'hidden' }}>
          <iframe
            src={`/api/public/proposals/${token}`}
            title={quoteView.quote.title || 'Travel proposal'}
            style={{ width: '100%', minHeight: '1100px', border: 0, background: '#fff' }}
          />
        </div>
      </section>
    </main>
  );
}
