export const DEFAULT_PROPOSAL_VARIANT = 'v3' as const;
export const TEMPORARY_FALLBACK_PROPOSAL_VARIANT = 'v2' as const;

// Phase 3D.1I — supported proposal languages (mirror the backend PROPOSAL_LOCALES).
// English is the default and produces NO query param, so the default render stays
// byte-identical to before this phase.
export const PROPOSAL_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
] as const;

export type ProposalLanguageCode = (typeof PROPOSAL_LANGUAGES)[number]['code'];

export function isProposalLanguage(value: string | null | undefined): value is ProposalLanguageCode {
  return PROPOSAL_LANGUAGES.some((entry) => entry.code === value);
}

// Render-time language override: omitted / 'en' / unknown → no query (unchanged default).
function languageQuery(language?: string | null) {
  return language && language !== 'en' && isProposalLanguage(language) ? `?language=${language}` : '';
}

export function getDefaultProposalPreviewHref(quoteId: string, language?: string | null) {
  return `/api/quotes/${quoteId}/proposal-v3/html${languageQuery(language)}`;
}

export function getDefaultProposalPdfHref(apiBaseUrl: string, quoteId: string, language?: string | null) {
  return `${apiBaseUrl}/quotes/${quoteId}/pdf${languageQuery(language)}`;
}

export function getQuoteExportPdfHref(apiBaseUrl: string, quoteId: string, language?: string | null) {
  return `${apiBaseUrl}/quotes/${quoteId}/export${languageQuery(language)}`;
}

export function getFallbackProposalPdfHref(apiBaseUrl: string, quoteId: string) {
  // Temporary internal fallback while Proposal V2 remains available for rollback only.
  return `${apiBaseUrl}/quotes/${quoteId}/proposal-v2/pdf`;
}
