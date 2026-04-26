export const DEFAULT_PROPOSAL_VARIANT = 'v3' as const;
export const TEMPORARY_FALLBACK_PROPOSAL_VARIANT = 'v2' as const;

export function getDefaultProposalPreviewHref(quoteId: string) {
  return `/api/quotes/${quoteId}/proposal-v3/html`;
}

export function getDefaultProposalPdfHref(apiBaseUrl: string, quoteId: string) {
  return `${apiBaseUrl}/quotes/${quoteId}/pdf`;
}

export function getQuoteExportPdfHref(apiBaseUrl: string, quoteId: string) {
  return `${apiBaseUrl}/quotes/${quoteId}/export`;
}

export function getFallbackProposalPdfHref(apiBaseUrl: string, quoteId: string) {
  // Temporary internal fallback while Proposal V2 remains available for rollback only.
  return `${apiBaseUrl}/quotes/${quoteId}/proposal-v2/pdf`;
}
