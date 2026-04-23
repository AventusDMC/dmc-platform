import Link from 'next/link';
import { ReactNode } from 'react';
import { QuoteBuilderStatusBadge } from './QuoteBuilderStatusBadge';

type QuoteStatus = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';

type QuoteBuilderHeaderProps = {
  quoteId: string;
  title: string;
  quoteNumber: string | null;
  companyName: string;
  contactName: string;
  status: QuoteStatus;
  isExpired: boolean;
  description?: string | null;
  actions?: ReactNode;
};

export function QuoteBuilderHeader({
  quoteId,
  title,
  quoteNumber,
  companyName,
  contactName,
  status,
  isExpired,
  description,
  actions,
}: QuoteBuilderHeaderProps) {
  return (
    <section className="quote-builder-header">
      <div className="quote-builder-header-copy">
        <div className="quote-builder-header-meta">
          <Link href="/quotes" className="back-link">
            Back to quotes
          </Link>
          <span className="quote-builder-header-slash">/</span>
          <span>{quoteNumber || quoteId.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="quote-builder-title-row">
          <div>
            <p className="eyebrow">Quote Builder</p>
            <h1>{title}</h1>
          </div>
          <QuoteBuilderStatusBadge status={status} expired={isExpired} />
        </div>
        <div className="quote-builder-header-subtitle">
          <strong>{companyName}</strong>
          <span>{contactName}</span>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="quote-builder-header-actions">{actions}</div> : null}
    </section>
  );
}
