'use client';

import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';
import {
  PROPOSAL_LANGUAGES,
  getDefaultProposalPreviewHref,
  getQuoteExportPdfHref,
  isProposalLanguage,
} from './proposal-paths';
import { detectNotesLanguageMismatch, proposalLanguageEnglishName } from './proposal-notes-language';

type ProposalDocumentActionsProps = {
  apiBaseUrl: string;
  quoteId: string;
  // Default selected language — seeded from Quote.proposalLanguage when available.
  // Render-time selection only (Phase 3D.1I); the choice is not persisted.
  initialLanguage?: string | null;
  // Phase P.3X-5E-2.1 — visible day notes (same planner-vs-legacy source the proposal
  // exports from), used ONLY for a non-blocking advisory when a non-English proposal
  // still has English-looking day notes. Never sent to the backend.
  dayNotes?: Array<string | null>;
};

// Phase 3D.1I — operator-facing proposal language selector. Lets the operator
// choose EN / PT / ES / AR and have BOTH the "Open proposal" preview and the
// "Export quote PDF" honour that language (via ?language=). English stays the
// default and produces no query param. No proposal content / pricing / quote
// data is changed — this is a render-time view switch only.
export function ProposalDocumentActions({ apiBaseUrl, quoteId, initialLanguage = 'en', dayNotes = [] }: ProposalDocumentActionsProps) {
  const [language, setLanguage] = useState<string>(isProposalLanguage(initialLanguage) ? initialLanguage : 'en');
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  // Phase P.3X-5E-2.1 — non-blocking advisory: a non-English proposal whose day
  // notes still look English (or, for Arabic, non-Arabic). Advisory only — it never
  // disables export, never changes hrefs/fetch, never mutates notes, never hits the
  // backend. Reacts to the selected language.
  const showNotesLanguageWarning = detectNotesLanguageMismatch(dayNotes, language);
  const languageName = proposalLanguageEnglishName(language);

  async function handleDownload() {
    try {
      setIsDownloading(true);
      setError('');

      const response = await fetch(getQuoteExportPdfHref(apiBaseUrl, quoteId, language));
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || !contentType.toLowerCase().includes('application/pdf')) {
        throw new Error(await getErrorMessage(response, 'Failed to export quote PDF'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const suffix = language && language !== 'en' ? `-${language}` : '';

      link.href = url;
      link.download = `quote-${quoteId}-export${suffix}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not download the quote PDF.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="section-stack proposal-document-actions">
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }}>
        <span>Proposal language</span>
        <select
          className="app-input"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          aria-label="Proposal language"
        >
          {PROPOSAL_LANGUAGES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

      {showNotesLanguageWarning ? (
        <p className="form-help proposal-notes-language-warning" role="note">
          {language === 'ar'
            ? `This proposal is set to ${languageName}, but some day notes do not appear to be ${languageName}. Review or save ${languageName} day narratives in the Route Planner before sending to the client.`
            : `This proposal is set to ${languageName}, but some day notes still appear to be in English. Review or save ${languageName} day narratives in the Route Planner before sending to the client.`}
        </p>
      ) : null}

      <a
        href={getDefaultProposalPreviewHref(quoteId, language)}
        className="secondary-button"
        target="_blank"
        rel="noreferrer"
      >
        Open proposal
      </a>

      <button type="button" className="secondary-button" onClick={handleDownload} disabled={isDownloading}>
        {isDownloading ? 'Exporting...' : 'Export quote PDF'}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
