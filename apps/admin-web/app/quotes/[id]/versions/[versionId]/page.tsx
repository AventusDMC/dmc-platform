import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatNightCountLabel } from '../../../../lib/formatters';
import type { VersionSummary } from '../../../../../lib/quote-types';
import { adminPageFetchJson } from '../../../../lib/admin-server';

// CP-N3b2c3b: the Classic historical-version page renders ONLY the safe,
// whitelist-curated version summary (backend GET /quotes/:id/versions/:versionId
// /summary via the /summary admin proxy). It never fetches, and never falls back
// to, the raw version-detail route (…/versions/:versionId) that returns the full
// snapshotJson — that payload carries cost/margin, PII, contact/company, supplier
// identity, internal notes, capability tokens and arbitrary JSON. This page shows
// none of that. The `cost` block is rendered purely on backend presence (finance
// roles); the page never computes cost and never trusts a client-side role.

type QuoteVersionPageProps = {
  params: Promise<{
    id: string;
    versionId: string;
  }>;
};

async function getVersionSummary(id: string, versionId: string): Promise<VersionSummary | null> {
  // Fetch ONLY the safe summary. No fallback to raw detail on any outcome:
  //  - 404 → allow404 returns null → notFound() below.
  //  - 401 → adminPageFetchJson redirects to the session-expired page.
  //  - 403 / malformed / non-JSON / empty / timeout → it throws (surfaced by the
  //    Next error boundary). None of these paths retry the raw route.
  return adminPageFetchJson<VersionSummary | null>(
    `/api/quotes/${id}/versions/${versionId}/summary`,
    'Quote version summary',
    { cache: 'no-store', allow404: true },
  );
}

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '—';
  }

  return `${currency || 'USD'} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return `${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return value.toLocaleString('en-US');
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(parsed);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

export default async function QuoteVersionPage({ params }: QuoteVersionPageProps) {
  const { id, versionId } = await params;
  const summary = await getVersionSummary(id, versionId);

  if (!summary) {
    notFound();
  }

  const totalPax =
    summary.adults !== null || summary.children !== null
      ? (summary.adults ?? 0) + (summary.children ?? 0)
      : null;

  return (
    <main className="page">
      <section className="panel quote-preview-page">
        <Link href={`/quotes/${id}`} className="back-link">
          Back to quote
        </Link>

        <header className="quote-preview-hero">
          <div>
            <p className="eyebrow">Saved Quote Version</p>
            <h1 className="section-title quote-title">
              {summary.title || 'Untitled quote'} | v{summary.versionNumber}
            </h1>
            <p className="detail-copy">
              {[
                summary.quoteNumber ? `Quote ${summary.quoteNumber}` : null,
                summary.statusAtSnapshot ? `Status ${summary.statusAtSnapshot}` : null,
              ]
                .filter(Boolean)
                .join(' | ') || 'Read-only summary of this saved version.'}
            </p>
          </div>
          <div className="quote-preview-meta">
            <strong>Version {summary.versionNumber}</strong>
            {summary.label ? <p>{summary.label}</p> : null}
            <p>Saved {formatDateTime(summary.createdAt)}</p>
          </div>
        </header>

        <section className="quote-preview-grid">
          <article className="detail-card">
            <p className="eyebrow">Version Info</p>
            <div className="quote-preview-total-list">
              <div>
                <span>Version</span>
                <strong>{summary.versionNumber}</strong>
              </div>
              <div>
                <span>Label</span>
                <strong>{summary.label || '—'}</strong>
              </div>
              <div>
                <span>Saved at</span>
                <strong>{formatDateTime(summary.createdAt)}</strong>
              </div>
              <div>
                <span>Status at snapshot</span>
                <strong>{summary.statusAtSnapshot || '—'}</strong>
              </div>
            </div>
            <p className="detail-copy">
              Read-only summary saved from the quote state at that time. Full historical detail is not shown.
            </p>
          </article>

          <article className="detail-card">
            <p className="eyebrow">Trip Summary</p>
            <div className="quote-preview-total-list">
              <div>
                <span>Travel start</span>
                <strong>{formatDate(summary.travelStartDate)}</strong>
              </div>
              <div>
                <span>Valid until</span>
                <strong>{formatDate(summary.validUntil)}</strong>
              </div>
              <div>
                <span>Nights</span>
                <strong>{summary.nightCount !== null ? formatNightCountLabel(summary.nightCount) : '—'}</strong>
              </div>
              <div>
                <span>Rooms</span>
                <strong>{formatCount(summary.roomCount)}</strong>
              </div>
              <div>
                <span>Passengers</span>
                <strong>
                  {totalPax !== null
                    ? `${formatCount(totalPax)} (${formatCount(summary.adults)} adults | ${formatCount(summary.children)} children)`
                    : '—'}
                </strong>
              </div>
              <div>
                <span>Services</span>
                <strong>{formatCount(summary.itemCount)}</strong>
              </div>
              <div>
                <span>Itinerary days</span>
                <strong>{formatCount(summary.dayCount)}</strong>
              </div>
            </div>
          </article>

          <article className="detail-card">
            <p className="eyebrow">Price Summary</p>
            <div className="quote-preview-total-list">
              <div>
                <span>Currency</span>
                <strong>{summary.quoteCurrency || '—'}</strong>
              </div>
              <div>
                <span>Total sell</span>
                <strong>{formatMoney(summary.totalSell, summary.quoteCurrency)}</strong>
              </div>
              <div>
                <span>Price per pax</span>
                <strong>{formatMoney(summary.pricePerPax, summary.quoteCurrency)}</strong>
              </div>
              <div>
                <span>Fixed price / person</span>
                <strong>{formatMoney(summary.fixedPricePerPerson, summary.quoteCurrency)}</strong>
              </div>
            </div>
          </article>
        </section>

        {summary.cost ? (
          <section className="detail-card">
            <p className="eyebrow">Cost &amp; Margin</p>
            <div className="quote-preview-total-list">
              <div>
                <span>Total cost</span>
                <strong>{formatMoney(summary.cost.totalCost, summary.quoteCurrency)}</strong>
              </div>
              <div>
                <span>Margin</span>
                <strong>{formatMoney(summary.cost.margin, summary.quoteCurrency)}</strong>
              </div>
              <div>
                <span>Margin %</span>
                <strong>{formatPercent(summary.cost.marginPercent)}</strong>
              </div>
            </div>
          </section>
        ) : null}

        <section className="detail-card">
          <p className="eyebrow">Readiness</p>
          <div className="quote-preview-total-list">
            <div>
              <span>Inclusions</span>
              <strong>{summary.hasInclusions ? 'Present' : 'None'}</strong>
            </div>
            <div>
              <span>Exclusions</span>
              <strong>{summary.hasExclusions ? 'Present' : 'None'}</strong>
            </div>
            <div>
              <span>Completeness</span>
              <strong>{summary.completeness.ok ? 'Ready' : 'Needs review'}</strong>
            </div>
            <div>
              <span>Accept will succeed</span>
              <strong>{summary.acceptWillSucceed ? 'Yes' : 'No'}</strong>
            </div>
          </div>
          {!summary.completeness.ok && summary.completeness.reasons.length > 0 ? (
            <>
              {summary.completeness.reasons.map((reason) => (
                <p key={reason} className="detail-copy">
                  {reason}
                </p>
              ))}
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
