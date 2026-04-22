import { getDefaultProposalPreviewHref } from './proposal-paths';

export function QuotePreviewLink({ quoteId }: { quoteId: string }) {
  return (
    <a href={getDefaultProposalPreviewHref(quoteId)} className="secondary-button" target="_blank" rel="noreferrer">
      Open proposal
    </a>
  );
}
