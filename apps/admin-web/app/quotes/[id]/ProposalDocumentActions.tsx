'use client';

import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';
import {
  PROPOSAL_LANGUAGES,
  getDefaultProposalPreviewHref,
  getQuoteExportPdfHref,
  isProposalLanguage,
} from './proposal-paths';
import { evaluateNotesLanguageWarning, proposalLanguageEnglishName, type ProposalDayNotesInput } from './proposal-notes-language';

type ProposalDocumentActionsProps = {
  apiBaseUrl: string;
  quoteId: string;
  // Default selected language — seeded from Quote.proposalLanguage when available.
  // Render-time selection only (Phase 3D.1I); the choice is not persisted.
  initialLanguage?: string | null;
  // Phase P.3X-5E-2.1 / 5E-4C — visible exported days (same planner-vs-legacy source
  // the proposal exports from), each with its notes + notesLanguage metadata. Used
  // ONLY for a non-blocking advisory; never sent to the backend. notesLanguage (when
  // present) is authoritative; null/unknown falls back to the heuristic.
  dayNotes?: ProposalDayNotesInput[];
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

  // Phase P.3X-5E-4C — non-blocking advisory: a day whose notes don't match the
  // selected proposal language. Uses the per-day notesLanguage metadata when present
  // (authoritative — fires even for an English selection), else the conservative
  // heuristic. Advisory only — never disables export, never changes hrefs/fetch,
  // never mutates notes, never hits the backend. Reacts to the selected language.
  const notesWarning = evaluateNotesLanguageWarning(dayNotes, language);
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

      {notesWarning.warn ? (
        <p className="form-help proposal-notes-language-warning" role="note">
          {notesWarning.mode === 'explicit'
            ? `Some day notes are saved as ${proposalLanguageEnglishName(notesWarning.fromLanguage)}, but this proposal is set to ${languageName}. Review or save ${languageName} day narratives in the Route Planner before sending to the client.`
            : `Some day notes may not match the selected proposal language (${languageName}). Review the day narratives in the Route Planner before sending to the client.`}
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
