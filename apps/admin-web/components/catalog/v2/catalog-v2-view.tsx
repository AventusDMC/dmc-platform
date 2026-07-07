'use client';

import { useMemo, useState } from 'react';

/**
 * Product Catalog V2 — read-only view (Slice 4 polish).
 *
 * Display-only: renders the backend read-only summary (suppliers, service
 * catalog, hotel contracts, data-quality warnings) with clearer summary cards,
 * friendly severity-coded warning badges, and a tidier supplier table. NO
 * create/edit/delete, NO forms that submit, NO buttons, NO writes — the only
 * interactivity is local, in-memory filtering (search / type / severity /
 * warnings-only). Pricing figures are never shown when the backend redacts them.
 */

export type CatalogWarningVM = { code: string; severity: string; message: string };

export type CatalogSupplierVM = {
  id: string;
  name: string;
  type: string | null;
  email: string | null;
  baseCity: string | null;
  operationallyActive: boolean;
  currencies: string[];
  serviceCount: number;
  contractCount: number;
  contractValidity: { active: number; expiringSoon: number; expired: number; noValidityWindow: number };
  rateCount: number;
  pricingRedacted: boolean;
  pricing: { transportDiscountPercent?: number } | null;
  warnings: CatalogWarningVM[];
};

export type CatalogHotelContractVM = {
  id: string;
  name: string | null;
  hotelName: string | null;
  validFrom: string | null;
  validTo: string | null;
  currency: string | null;
  confidence: string | null;
  validity: string;
  warnings: CatalogWarningVM[];
};

export type CatalogV2Summary = {
  meta: { role: string | null; pricingRedacted: boolean; counts: { suppliers: number; hotelContracts: number; totalWarnings: number } };
  serviceCatalog: { services: number; activities: number; activitiesActive: number; guides: number; guidesActive: number; restaurants: number; restaurantsActive: number };
  suppliers: CatalogSupplierVM[];
  hotelContracts: CatalogHotelContractVM[];
  warningCounts: Record<string, number>;
  note: string;
};

// Friendly labels + severity per warning code (mirrors the backend severities).
const WARNING_META: Record<string, { label: string; severity: 'high' | 'medium' | 'low' }> = {
  MISSING_EMAIL: { label: 'Missing email', severity: 'high' },
  MISSING_RATES: { label: 'Missing rates', severity: 'high' },
  EXPIRED_CONTRACT: { label: 'Expired contract', severity: 'high' },
  MULTIPLE_EMAILS: { label: 'Multiple emails', severity: 'medium' },
  EXPIRING_SOON: { label: 'Expiring soon', severity: 'medium' },
  UNVERIFIED_HOTEL_CONTRACT: { label: 'Unverified hotel contract', severity: 'medium' },
  NO_ACTIVE_SERVICES: { label: 'No active services', severity: 'medium' },
  CURRENCY_MISMATCH: { label: 'Currency mismatch', severity: 'low' },
  MISSING_BASE_CITY: { label: 'Missing base city', severity: 'low' },
};
function warnMeta(code: string): { label: string; severity: 'high' | 'medium' | 'low' } {
  return WARNING_META[code] ?? { label: code, severity: 'low' };
}

const SEV_CLASS: Record<'high' | 'medium' | 'low', string> = {
  high: 'border-destructive/40 bg-destructive/10 text-destructive',
  medium: 'border-warning/40 bg-warning/10 text-warning',
  low: 'border-border bg-muted text-muted-foreground',
};
const SEV_RANK: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };

function dash(v: string | null | undefined): string {
  return v && String(v).trim() ? String(v) : '—';
}

function WarningChip({ code }: { code: string }) {
  const m = warnMeta(code);
  return (
    <span
      title={code}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${SEV_CLASS[m.severity]}`}
    >
      {m.label}
    </span>
  );
}

function WarningChips({ warnings }: { warnings: CatalogWarningVM[] }) {
  if (!warnings.length) return <span className="text-[11px] font-medium text-success">No issues</span>;
  const highest = warnings.reduce<'high' | 'medium' | 'low'>((acc, w) => {
    const s = warnMeta(w.code).severity;
    return SEV_RANK[s] > SEV_RANK[acc] ? s : acc;
  }, 'low');
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-[10px] font-bold ${SEV_CLASS[highest]}`}>
        {warnings.length}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {warnings.map((w, i) => (
          <WarningChip key={`${w.code}-${i}`} code={w.code} />
        ))}
      </span>
    </span>
  );
}

function StatusChip({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">Active</span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Inactive</span>
  );
}

export function CatalogV2View({ summary }: { summary: CatalogV2Summary }) {
  const [search, setSearch] = useState('');
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  const supplierTypes = useMemo(
    () => Array.from(new Set(summary.suppliers.map((s) => (s.type ?? '').trim()).filter(Boolean))).sort(),
    [summary.suppliers],
  );

  const activeSuppliers = useMemo(() => summary.suppliers.filter((s) => s.operationallyActive).length, [summary.suppliers]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summary.suppliers.filter((s) => {
      if (typeFilter !== 'all' && (s.type ?? '') !== typeFilter) return false;
      if (warningsOnly && s.warnings.length === 0) return false;
      if (severityFilter !== 'all' && !s.warnings.some((w) => warnMeta(w.code).severity === severityFilter)) return false;
      if (q) {
        const hay = `${s.name} ${s.email ?? ''} ${s.baseCity ?? ''} ${s.type ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [summary.suppliers, search, warningsOnly, typeFilter, severityFilter]);

  const activeWarnings = Object.entries(summary.warningCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => SEV_RANK[warnMeta(b[0]).severity] - SEV_RANK[warnMeta(a[0]).severity]);

  const cards: Array<[string, number | string, string | null]> = [
    ['Suppliers', summary.meta.counts.suppliers, `${activeSuppliers} active`],
    ['Services', summary.serviceCatalog.services, null],
    ['Hotel contracts', summary.meta.counts.hotelContracts, null],
    ['Warnings', summary.meta.counts.totalWarnings, summary.meta.counts.totalWarnings ? 'to review' : 'all clear'],
  ];

  return (
    <section aria-label="Product Catalog V2" className="space-y-6">
      {/* Header + read-only note */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-lg font-semibold text-foreground">Product Catalog V2</h1>
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Read-only · preview
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{summary.note}</p>
        {summary.meta.pricingRedacted ? (
          <p className="text-xs font-medium text-muted-foreground">Pricing is hidden for your role.</p>
        ) : null}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([label, value, sub]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
            {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
          </div>
        ))}
      </div>

      {/* Filters (local, in-memory — no form submit, no buttons) */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, city…"
            aria-label="Search suppliers"
            className="h-9 w-64 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Supplier type</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Supplier type"
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="all">All types</option>
            {supplierTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Severity</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            aria-label="Warning severity"
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="all">Any severity</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="inline-flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={warningsOnly} onChange={(e) => setWarningsOnly(e.target.checked)} aria-label="Warnings only" />
          Warnings only
        </label>
      </div>

      {/* Suppliers table */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Suppliers ({filteredSuppliers.length})</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Supplier</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Email</th>
                <th className="px-3 py-2.5 font-medium">Base city</th>
                <th className="px-3 py-2.5 font-medium">Services</th>
                <th className="px-3 py-2.5 font-medium">Contracts</th>
                <th className="px-3 py-2.5 font-medium">Currencies</th>
                <th className="px-3 py-2.5 font-medium">Pricing</th>
                <th className="px-3 py-2.5 font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((s) => (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{dash(s.name)}</div>
                    <div className="text-[11px] text-muted-foreground">{dash(s.type)}</div>
                  </td>
                  <td className="px-3 py-2.5"><StatusChip active={s.operationallyActive} /></td>
                  <td className="px-3 py-2.5">
                    {s.email && s.email.trim() ? (
                      <span className="text-muted-foreground">{s.email}</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">Missing</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{dash(s.baseCity)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.serviceCount}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.contractCount}</td>
                  <td className="px-3 py-2.5">
                    {s.currencies.length ? (
                      <span className="flex flex-wrap gap-1.5">
                        {s.currencies.map((c) => (
                          <span key={c} className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{c}</span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.pricingRedacted || !s.pricing ? (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Hidden</span>
                    ) : (
                      <span className="text-muted-foreground">{s.pricing.transportDiscountPercent ?? 0}% disc.</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5"><WarningChips warnings={s.warnings} /></td>
                </tr>
              ))}
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    {summary.suppliers.length === 0 ? 'No suppliers in the catalog yet.' : 'No suppliers match the current filters.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Service catalog summary */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Service catalog</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Services', summary.serviceCatalog.services, null as string | null],
            ['Activities', summary.serviceCatalog.activities, `${summary.serviceCatalog.activitiesActive} active`],
            ['Guides', summary.serviceCatalog.guides, `${summary.serviceCatalog.guidesActive} active`],
            ['Restaurants', summary.serviceCatalog.restaurants, `${summary.serviceCatalog.restaurantsActive} active`],
          ].map(([label, value, sub]) => (
            <div key={String(label)} className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="text-lg font-semibold text-foreground">{value}</div>
              {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
            </div>
          ))}
        </div>
      </div>

      {/* Hotel contracts table */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Hotel contracts ({summary.hotelContracts.length})</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Hotel</th>
                <th className="px-3 py-2.5 font-medium">Contract</th>
                <th className="px-3 py-2.5 font-medium">Valid</th>
                <th className="px-3 py-2.5 font-medium">Currency</th>
                <th className="px-3 py-2.5 font-medium">Confidence</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {summary.hotelContracts.map((c) => (
                <tr key={c.id} className="border-t border-border align-top">
                  <td className="px-3 py-2.5 font-medium text-foreground">{dash(c.hotelName)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{dash(c.name)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {dash(c.validFrom?.slice(0, 10))} → {dash(c.validTo?.slice(0, 10))}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{dash(c.currency)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{dash(c.confidence)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{dash(c.validity)}</td>
                  <td className="px-3 py-2.5"><WarningChips warnings={c.warnings} /></td>
                </tr>
              ))}
              {summary.hotelContracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    No hotel contracts in the catalog.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data-quality warnings summary */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Data-quality warnings</h2>
        {activeWarnings.length ? (
          <ul className="flex flex-wrap gap-2">
            {activeWarnings.map(([code, n]) => {
              const m = warnMeta(code);
              return (
                <li key={code} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${SEV_CLASS[m.severity]}`}>
                  <span>{m.label}</span>
                  <span className="rounded-full bg-background/60 px-1.5">{n}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-success">No data-quality warnings — catalog looks clean.</p>
        )}
      </div>
    </section>
  );
}
