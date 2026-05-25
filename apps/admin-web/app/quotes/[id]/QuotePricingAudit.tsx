// Pricing Audit — calm sage-toned collapsible "is this quote priced
// right?" surface. Sits next to QuoteOperationalInsights above the day
// cards. Server component: all checks run on data already loaded with
// the quote, no extra fetch.
//
// What it answers, in priority order:
//   1. Are any line items missing cost or sell? (silent zero-priced rows)
//   2. Does saved total per item match the calculated total per item?
//      (uses buildPricingDiagnostics's sync status — catches per-pax vs
//      per-room confusion, units mis-multiplication, etc.)
//   3. Are any line items in a currency other than the quote currency?
//      (silent sum bug — naive add of mixed currencies)
//   4. Are any line items selling below cost? (loss-leader sanity check)
//   5. Does the quote-wide margin fall below the configured floor?
//
// Design intent — calm, additive, never interrupts. Same palette family
// as QuoteOperationalInsights (sage / sand). Default collapsed. Plain
// language ("3 items need cost") not error codes.

import Link from 'next/link';
import { buildPricingDiagnostics, type PricingDiagnosticQuoteItem } from './pricing-diagnostics';

// Minimum margin % we treat as "healthy". Quote-wide margin below this
// triggers a calm flag in the audit. Conservative starting value;
// can be promoted to a per-org setting later.
const HEALTHY_MARGIN_FLOOR_PERCENT = 15;

type PricingAuditItem = PricingDiagnosticQuoteItem & {
  id: string;
  service?: PricingDiagnosticQuoteItem['service'] & { name?: string | null };
  hotel?: { name?: string | null } | null;
  activity?: { name?: string | null } | null;
  itineraryId?: string | null;
};

type AuditFinding = {
  severity: 'review' | 'caution' | 'info';
  headline: string;
  detail?: string;
  href?: string;
};

const TONE = {
  review: { bg: '#fbf9f4', border: '#e8dcc4', text: '#6b5933', dot: '#c7956b', label: 'Review' },
  caution: { bg: '#fbf6ea', border: '#e8d5a8', text: '#8b5e34', dot: '#c7956b', label: 'Caution' },
  info: { bg: '#f5f8f5', border: '#cdd7cd', text: '#3a5a3a', dot: '#94a395', label: 'Info' },
} as const;

function itemDisplayName(item: PricingAuditItem) {
  return (
    item.hotel?.name?.trim() ||
    item.activity?.name?.trim() ||
    item.service?.name?.trim() ||
    item.externalPackageName?.trim() ||
    'Untitled item'
  );
}

function formatMoney(value: number, currency: string) {
  return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function marginPercent(cost: number, sell: number) {
  if (!Number.isFinite(sell) || sell <= 0) return null;
  return ((sell - cost) / sell) * 100;
}

type SlabSummary = {
  minPax: number;
  maxPax: number | null;
  price: number;
  focPax?: number | null;
  label?: string | null;
};

export function QuotePricingAudit({
  quoteId,
  quoteCurrency,
  items,
  pricingMode = 'FIXED',
  pricingSlabs = [],
  totalPax = 0,
  quoteTotalSell = null,
  quoteTotalCost = null,
}: {
  quoteId: string;
  quoteCurrency: string;
  items: PricingAuditItem[];
  // Optional SLAB context — when pricingMode === 'SLAB' the canonical sell
  // is the matched slab × paying-pax, not the sum of item sells, so the
  // audit suppresses per-item sell checks (which all fire false positives
  // on SLAB quotes) and surfaces slab-specific findings instead.
  pricingMode?: 'FIXED' | 'SLAB';
  pricingSlabs?: SlabSummary[];
  totalPax?: number;
  quoteTotalSell?: number | null;
  quoteTotalCost?: number | null;
}) {
  const isSlabQuote = pricingMode === 'SLAB';
  const matchedSlab =
    isSlabQuote && totalPax > 0
      ? pricingSlabs.find(
          (slab) => totalPax >= slab.minPax && (slab.maxPax === null || slab.maxPax === undefined || totalPax <= slab.maxPax),
        ) || null
      : null;
  // Empty-quote case — keep the surface present so operators know this
  // panel exists, but skip the heavy analysis.
  if (!items || items.length === 0) {
    return (
      <section
        style={{
          background: '#f5f8f5',
          border: '1px dashed #cdd7cd',
          borderRadius: 10,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#6b7a6b', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Pricing Audit
        </span>
        <span style={{ color: '#94a395', fontSize: '0.85rem' }}>
          Add services to see the per-item pricing health check appear here.
        </span>
      </section>
    );
  }

  // Aggregate checks across every quote item.
  let totalCost = 0;
  let totalSell = 0;
  let missingCostCount = 0;
  let missingSellCount = 0;
  let sellBelowCostCount = 0;
  let mismatchCount = 0;
  const offendingCurrencies = new Set<string>();
  const itemRows: Array<{
    id: string;
    name: string;
    cost: number;
    sell: number;
    margin: number | null;
    currency: string;
    flags: string[];
    syncStatus: 'Synced' | 'Mismatch' | 'Pending';
    href: string;
  }> = [];

  for (const item of items) {
    const cost = Number(item.totalCost) || 0;
    const sell = Number(item.totalSell) || 0;
    const currency = (item.currency || quoteCurrency || 'USD').toUpperCase();
    totalCost += cost;
    totalSell += sell;
    if (currency !== quoteCurrency.toUpperCase()) {
      offendingCurrencies.add(currency);
    }

    const flags: string[] = [];
    if (cost <= 0) {
      missingCostCount += 1;
      flags.push('No cost');
    }
    // Per-item sell checks are FIXED-mode only. SLAB quotes set client sell
    // at the slab level — individual items keep cost (for margin) but
    // their sell column is operator-discretion, not the canonical client
    // price. Running these checks on SLAB floods the audit with false
    // positives (every item flagged "sell below cost", "math mismatch")
    // and trains operators to ignore the panel.
    if (!isSlabQuote) {
      if (sell <= 0) {
        missingSellCount += 1;
        flags.push('No sell');
      }
      if (cost > 0 && sell > 0 && sell < cost) {
        sellBelowCostCount += 1;
        flags.push('Sell below cost');
      }
      // Sync check — buildPricingDiagnostics already computes saved vs
      // calculated totals using the pricing mode + units (per-pax/per-room
      // etc.). If it reports "Mismatch" the math doesn't reconcile.
      const diagnostics = buildPricingDiagnostics(item);
      const statusRow = diagnostics.rows.find((row) => row.label === 'Status');
      const rawStatus = statusRow?.value || 'Pending';
      const syncStatus: 'Synced' | 'Mismatch' | 'Pending' =
        rawStatus === 'Synced' || rawStatus === 'Mismatch' ? rawStatus : 'Pending';
      if (syncStatus === 'Mismatch' && sell > 0) {
        mismatchCount += 1;
        flags.push('Math mismatch');
      }
    }
    const diagnosticsForRow = buildPricingDiagnostics(item);
    const statusRowForRow = diagnosticsForRow.rows.find((row) => row.label === 'Status');
    const rawStatusForRow = statusRowForRow?.value || 'Pending';
    const syncStatus: 'Synced' | 'Mismatch' | 'Pending' =
      rawStatusForRow === 'Synced' || rawStatusForRow === 'Mismatch' ? rawStatusForRow : 'Pending';

    itemRows.push({
      id: item.id,
      name: itemDisplayName(item),
      cost,
      sell,
      margin: marginPercent(cost, sell),
      currency,
      flags,
      syncStatus,
      href: `/quotes/${quoteId}?tab=services&item=${item.id}`,
    });
  }

  // For SLAB quotes the canonical sell comes from the matched slab × paying
  // pax (set on the quote after recalculateQuoteTotals). Override the
  // item-sum so margin computations use the real client price.
  const effectiveTotalSell = isSlabQuote && quoteTotalSell !== null ? quoteTotalSell : totalSell;
  const effectiveTotalCost = isSlabQuote && quoteTotalCost !== null ? quoteTotalCost : totalCost;
  const quoteMarginPct = marginPercent(effectiveTotalCost, effectiveTotalSell);

  // Build the plain-language findings list.
  const findings: AuditFinding[] = [];

  // SLAB-specific findings first (the per-item sell checks below are
  // skipped for SLAB quotes since item.totalSell isn't the canonical
  // client-facing price).
  if (isSlabQuote) {
    if (pricingSlabs.length === 0) {
      findings.push({
        severity: 'review',
        headline: 'No pricing slabs configured',
        detail: 'Open Step 5 (Group Pricing) to add slab tiers before sending.',
      });
    } else if (totalPax > 0 && !matchedSlab) {
      findings.push({
        severity: 'review',
        headline: `Current pax (${totalPax}) doesn't fall into any configured slab`,
        detail: `Add a slab covering ${totalPax} pax in Step 5, or adjust the existing slab ranges.`,
      });
    } else if (matchedSlab) {
      const slabLabel = matchedSlab.label || `${matchedSlab.minPax}-${matchedSlab.maxPax ?? '∞'} pax`;
      findings.push({
        severity: 'info',
        headline: `Matched slab: ${slabLabel} @ ${formatMoney(matchedSlab.price, quoteCurrency)}/pax`,
        detail: `Client total = ${formatMoney(effectiveTotalSell, quoteCurrency)} (${totalPax} pax, ${matchedSlab.focPax ?? 0} FOC). Item cost subtotal = ${formatMoney(totalCost, quoteCurrency)}.`,
      });
    }
  }

  if (missingCostCount > 0) {
    findings.push({
      severity: 'review',
      headline: `${missingCostCount} item${missingCostCount === 1 ? '' : 's'} need cost entered`,
      detail: 'Item totals are USD 0.00. Add supplier cost before sending the quote.',
    });
  }
  if (!isSlabQuote && missingSellCount > 0) {
    findings.push({
      severity: 'review',
      headline: `${missingSellCount} item${missingSellCount === 1 ? '' : 's'} need sell price`,
      detail: 'Sell will default to cost on send. Run Pricing Review (Step 4) to apply markup.',
    });
  }
  if (!isSlabQuote && mismatchCount > 0) {
    findings.push({
      severity: 'caution',
      headline: `${mismatchCount} item${mismatchCount === 1 ? '' : 's'} have a math mismatch`,
      detail: 'Saved total does not match cost × units. Common cause: per-pax vs per-room confusion.',
    });
  }
  if (!isSlabQuote && sellBelowCostCount > 0) {
    findings.push({
      severity: 'caution',
      headline: `${sellBelowCostCount} item${sellBelowCostCount === 1 ? '' : 's'} sell below cost`,
      detail: 'Either a loss-leader by design, or a missing markup. Verify before send.',
    });
  }
  if (offendingCurrencies.size > 0) {
    findings.push({
      severity: 'caution',
      headline: `Currency mix detected: ${[...offendingCurrencies].join(', ')} on items, ${quoteCurrency} on quote`,
      detail: 'Item totals are added naively. Convert before summing or set a single currency.',
    });
  }
  if (quoteMarginPct !== null && quoteMarginPct < HEALTHY_MARGIN_FLOOR_PERCENT) {
    findings.push({
      severity: 'review',
      headline: `Quote-wide margin ${quoteMarginPct.toFixed(1)}% is below the ${HEALTHY_MARGIN_FLOOR_PERCENT}% floor`,
      detail: 'Tighten markup or trim cost lines. Margin reflects current cost vs sell across all items.',
    });
  }
  if (findings.length === 0) {
    findings.push({
      severity: 'info',
      headline: 'All items reconcile and price within the healthy band',
      detail: `${items.length} item${items.length === 1 ? '' : 's'} priced, margin ${quoteMarginPct === null ? '—' : `${quoteMarginPct.toFixed(1)}%`}.`,
    });
  }

  // Compact headline for the collapsed chip — mirrors the Operational
  // Review chip pattern so the two read consistently.
  const reviewCount = findings.filter((f) => f.severity !== 'info').length;
  const headlineLabel =
    reviewCount === 0
      ? 'Pricing looks healthy'
      : `${reviewCount} pricing check${reviewCount === 1 ? '' : 's'} need review`;
  const headlineTone = reviewCount === 0 ? TONE.info : TONE.review;

  return (
    <details
      style={{
        background: headlineTone.bg,
        border: `1px solid ${headlineTone.border}`,
        borderRadius: 10,
        padding: '0.65rem 0.85rem',
        marginBottom: '0.75rem',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.75rem',
          listStyle: 'none',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            color: headlineTone.text,
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Pricing Audit
        </span>
        <strong style={{ color: headlineTone.text, fontSize: '0.92rem' }}>{headlineLabel}</strong>
        <span style={{ color: headlineTone.text, fontSize: '0.78rem', opacity: 0.8 }}>
          · {items.length} item{items.length === 1 ? '' : 's'} · {formatMoney(effectiveTotalSell, quoteCurrency)} sell ·{' '}
          {quoteMarginPct === null ? '—' : `${quoteMarginPct.toFixed(1)}%`} margin
          {isSlabQuote ? ' · slab pricing' : ''}
        </span>
        <span style={{ marginLeft: 'auto', color: headlineTone.text, fontSize: '0.78rem', fontWeight: 600 }}>
          Show ▾
        </span>
      </summary>

      <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        {/* Findings list — calm headlines, plain language */}
        {findings.map((finding, idx) => {
          const tone = TONE[finding.severity];
          return (
            <div
              key={`${finding.severity}-${idx}`}
              style={{
                background: tone.bg,
                border: `1px solid ${tone.border}`,
                borderRadius: 8,
                padding: '0.5rem 0.7rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: tone.dot,
                    flexShrink: 0,
                  }}
                />
                <strong style={{ color: tone.text, fontSize: '0.86rem', fontWeight: 600 }}>{finding.headline}</strong>
                <span
                  style={{
                    marginLeft: 'auto',
                    color: tone.text,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    opacity: 0.8,
                  }}
                >
                  {tone.label}
                </span>
              </div>
              {finding.detail ? (
                <span style={{ color: tone.text, fontSize: '0.78rem', opacity: 0.85, paddingLeft: '0.95rem' }}>{finding.detail}</span>
              ) : null}
            </div>
          );
        })}

        {/* Totals summary — one-line reconciliation of items vs quote */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #cdd7cd',
            borderRadius: 8,
            padding: '0.55rem 0.75rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.85rem',
            color: '#3a5a3a',
            fontSize: '0.82rem',
          }}
        >
          <span>
            <strong>{isSlabQuote ? 'Client total' : 'Items sum'}</strong> · cost {formatMoney(effectiveTotalCost, quoteCurrency)} · sell {formatMoney(effectiveTotalSell, quoteCurrency)}
          </span>
          <span>
            <strong>Margin</strong> · {quoteMarginPct === null ? '—' : `${quoteMarginPct.toFixed(1)}%`}
            {quoteMarginPct !== null
              ? ` (${formatMoney(effectiveTotalSell - effectiveTotalCost, quoteCurrency)} profit)`
              : ''}
          </span>
          <span style={{ marginLeft: 'auto', color: '#6b7a6b', fontSize: '0.74rem' }}>
            {isSlabQuote
              ? 'Sell = matched slab × paying pax. Item sells are operator-discretion, not the client price.'
              : 'This matches the Financial Summary panel — diverges only if scope filters apply.'}
          </span>
        </div>

        {/* Per-item table — sortable read-only view of the math */}
        <details>
          <summary
            style={{
              cursor: 'pointer',
              listStyle: 'none',
              color: '#3a5a3a',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              padding: '0.3rem 0',
            }}
          >
            Per-item breakdown ({itemRows.length})
          </summary>
          <div style={{ overflowX: 'auto', marginTop: '0.4rem' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.82rem',
                background: '#ffffff',
                border: '1px solid #cdd7cd',
                borderRadius: 8,
              }}
            >
              <thead>
                <tr style={{ background: '#f5f8f5', color: '#3a5a3a' }}>
                  <th style={{ textAlign: 'left', padding: '0.45rem 0.65rem' }}>Item</th>
                  <th style={{ textAlign: 'right', padding: '0.45rem 0.65rem' }}>Cost</th>
                  <th style={{ textAlign: 'right', padding: '0.45rem 0.65rem' }}>Sell</th>
                  <th style={{ textAlign: 'right', padding: '0.45rem 0.65rem' }}>Margin</th>
                  <th style={{ textAlign: 'left', padding: '0.45rem 0.65rem' }}>Currency</th>
                  <th style={{ textAlign: 'left', padding: '0.45rem 0.65rem' }}>Math</th>
                  <th style={{ textAlign: 'left', padding: '0.45rem 0.65rem' }}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid #e9ecef' }}>
                    <td style={{ padding: '0.4rem 0.65rem', maxWidth: 280 }}>
                      <Link href={row.href} style={{ color: '#175cd3', textDecoration: 'none' }}>
                        {row.name}
                      </Link>
                    </td>
                    <td style={{ padding: '0.4rem 0.65rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {row.cost === 0 ? <em style={{ color: '#c7956b' }}>—</em> : formatMoney(row.cost, row.currency)}
                    </td>
                    <td style={{ padding: '0.4rem 0.65rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {row.sell === 0 ? <em style={{ color: '#c7956b' }}>—</em> : formatMoney(row.sell, row.currency)}
                    </td>
                    <td style={{ padding: '0.4rem 0.65rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {row.margin === null ? <em style={{ color: '#94a395' }}>—</em> : `${row.margin.toFixed(1)}%`}
                    </td>
                    <td style={{ padding: '0.4rem 0.65rem', color: row.currency === quoteCurrency.toUpperCase() ? '#3a5a3a' : '#8b5e34' }}>
                      {row.currency}
                    </td>
                    <td style={{ padding: '0.4rem 0.65rem', color: row.syncStatus === 'Mismatch' ? '#8b5e34' : '#3a5a3a' }}>
                      {row.syncStatus}
                    </td>
                    <td style={{ padding: '0.4rem 0.65rem', color: '#6b5933' }}>
                      {row.flags.length === 0 ? <span style={{ color: '#94a395' }}>OK</span> : row.flags.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </details>
  );
}
