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
    <main className="page public-proposal-page">
      <section className="public-proposal-shell">
        <div className="public-proposal-header">
          <div className="public-proposal-title-group">
            <span className="public-proposal-logo-wrapper">
              <img src="/axis-logo-light.png" alt="AXIS Destination Management" className="public-proposal-logo" />
            </span>
            <div>
              <p className="eyebrow">Travel Proposal</p>
              <h1>{quoteView.quote.title || 'Jordan Travel Proposal'}</h1>
              <p className="detail-copy">A client-ready proposal prepared by AXIS Destination Management.</p>
            </div>
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

        <div className="public-proposal-frame-card">
          <iframe
            src={`/api/public/proposals/${token}`}
            title={quoteView.quote.title || 'Travel proposal'}
            className="public-proposal-frame"
          />
        </div>
      </section>
    </main>
  );
}
