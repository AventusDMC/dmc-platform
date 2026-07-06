'use client';

import { useMemo, useState } from 'react';

/**
 * Product Catalog V2 — Slice 2 read-only view.
 *
 * Display-only: renders the backend read-only summary (suppliers, service
 * catalog, hotel contracts, data-quality warnings). NO create/edit/delete, NO
 * forms that submit, NO buttons, NO writes — the only interactivity is local,
 * in-memory filtering (text search / warnings-only / supplier type). Pricing
 * figures are never shown when the backend redacts them (pricingRedacted).
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

function dash(v: string | null | undefined): string {
  return v && String(v).trim() ? String(v) : '—';
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
      {children}
    </span>
  );
}

export function CatalogV2View({ summary }: { summary: CatalogV2Summary }) {
  const [search, setSearch] = useState('');
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');

  const supplierTypes = useMemo(
    () => Array.from(new Set(summary.suppliers.map((s) => (s.type ?? '').trim()).filter(Boolean))).sort(),
    [summary.suppliers],
  );

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summary.suppliers.filter((s) => {
      if (typeFilter !== 'all' && (s.type ?? '') !== typeFilter) return false;
      if (warningsOnly && s.warnings.length === 0) return false;
      if (q) {
        const hay = `${s.name} ${s.email ?? ''} ${s.baseCity ?? ''} ${s.type ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [summary.suppliers, search, warningsOnly, typeFilter]);

  const activeWarnings = Object.entries(summary.warningCounts).filter(([, n]) => n > 0);

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

      {/* Summary counts */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Suppliers', summary.meta.counts.suppliers],
          ['Services', summary.serviceCatalog.services],
          ['Activities', summary.serviceCatalog.activities],
          ['Guides', summary.serviceCatalog.guides],
          ['Restaurants', summary.serviceCatalog.restaurants],
          ['Warnings', summary.meta.counts.totalWarnings],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-lg font-semibold text-foreground">{value}</div>
          </div>
        ))}
      </div>

      {/* Filters (local, in-memory — no form submit, no buttons) */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search suppliers…"
          aria-label="Search suppliers"
          className="h-8 w-56 rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Supplier type"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          <option value="all">All types</option>
          {supplierTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={warningsOnly} onChange={(e) => setWarningsOnly(e.target.checked)} aria-label="Warnings only" />
          Warnings only
        </label>
      </div>

      {/* Suppliers table */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Suppliers ({filteredSuppliers.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Base city</th>
                <th className="px-3 py-2 font-medium">Services</th>
                <th className="px-3 py-2 font-medium">Contracts</th>
                <th className="px-3 py-2 font-medium">Currencies</th>
                <th className="px-3 py-2 font-medium">Pricing</th>
                <th className="px-3 py-2 font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground">{dash(s.name)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dash(s.type)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dash(s.email)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dash(s.baseCity)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.serviceCount}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.contractCount}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.currencies.length ? s.currencies.join(', ') : '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.pricingRedacted || !s.pricing ? 'Hidden' : `${s.pricing.transportDiscountPercent ?? 0}% disc.`}
                  </td>
                  <td className="px-3 py-2">
                    {s.warnings.length ? (
                      <span className="flex flex-wrap gap-1">
                        {s.warnings.map((w, i) => (
                          <Chip key={`${s.id}-${i}`}>{w.code}</Chip>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    No suppliers match the current filters.
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
        <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <li className="rounded-md border border-border bg-card px-2.5 py-1">Services: {summary.serviceCatalog.services}</li>
          <li className="rounded-md border border-border bg-card px-2.5 py-1">
            Activities: {summary.serviceCatalog.activitiesActive}/{summary.serviceCatalog.activities} active
          </li>
          <li className="rounded-md border border-border bg-card px-2.5 py-1">
            Guides: {summary.serviceCatalog.guidesActive}/{summary.serviceCatalog.guides} active
          </li>
          <li className="rounded-md border border-border bg-card px-2.5 py-1">
            Restaurants: {summary.serviceCatalog.restaurantsActive}/{summary.serviceCatalog.restaurants} active
          </li>
        </ul>
      </div>

      {/* Hotel contracts table */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Hotel contracts ({summary.hotelContracts.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Hotel</th>
                <th className="px-3 py-2 font-medium">Contract</th>
                <th className="px-3 py-2 font-medium">Valid</th>
                <th className="px-3 py-2 font-medium">Currency</th>
                <th className="px-3 py-2 font-medium">Confidence</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {summary.hotelContracts.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground">{dash(c.hotelName)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dash(c.name)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {dash(c.validFrom?.slice(0, 10))} → {dash(c.validTo?.slice(0, 10))}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{dash(c.currency)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dash(c.confidence)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dash(c.validity)}</td>
                  <td className="px-3 py-2">
                    {c.warnings.length ? (
                      <span className="flex flex-wrap gap-1">
                        {c.warnings.map((w, i) => (
                          <Chip key={`${c.id}-${i}`}>{w.code}</Chip>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {summary.hotelContracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    No hotel contracts.
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
            {activeWarnings.map(([code, n]) => (
              <li key={code} className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] text-warning">
                <span className="font-medium">{code}</span>
                <span className="rounded-full bg-warning/20 px-1.5">{n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No data-quality warnings.</p>
        )}
      </div>
    </section>
  );
}
