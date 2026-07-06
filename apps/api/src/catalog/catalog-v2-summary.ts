// Product Catalog V2 — Slice 1 PURE, read-only summary + warnings builder.
//
// Aggregates suppliers, their linked services / rates / transport contracts, and
// hotel contracts into a lean read-only summary with derived data-quality
// warnings. PURE: no DB, no I/O, no mutation; `now` is injected for deterministic
// expiry. Pricing/rate FIGURES are redacted for non-pricing roles (agent / viewer
// / agent_admin); structure, validity, currencies (codes), and warnings stay
// visible to all authorized roles.

export type CatalogRole =
  | 'admin'
  | 'super_admin'
  | 'agent_admin'
  | 'viewer'
  | 'operations'
  | 'finance'
  | 'agent';

// Roles allowed to see pricing/rate figures.
const PRICING_ROLES: readonly CatalogRole[] = ['admin', 'operations', 'super_admin', 'finance'];
export function roleSeesPricing(role: CatalogRole | null | undefined): boolean {
  return role != null && PRICING_ROLES.includes(role);
}

// Days-before-expiry window that counts as "expiring soon".
const EXPIRING_SOON_DAYS = 30;

export type CatalogWarningCode =
  | 'MISSING_EMAIL'
  | 'MULTIPLE_EMAILS'
  | 'MISSING_RATES'
  | 'EXPIRED_CONTRACT'
  | 'EXPIRING_SOON'
  | 'UNVERIFIED_HOTEL_CONTRACT'
  | 'NO_ACTIVE_SERVICES'
  | 'CURRENCY_MISMATCH'
  | 'MISSING_BASE_CITY';

type Severity = 'high' | 'medium' | 'low';
const SEVERITY: Record<CatalogWarningCode, Severity> = {
  MISSING_EMAIL: 'high',
  MISSING_RATES: 'high',
  EXPIRED_CONTRACT: 'high',
  MULTIPLE_EMAILS: 'medium',
  EXPIRING_SOON: 'medium',
  UNVERIFIED_HOTEL_CONTRACT: 'medium',
  NO_ACTIVE_SERVICES: 'medium',
  CURRENCY_MISMATCH: 'low',
  MISSING_BASE_CITY: 'low',
};
const MESSAGE: Record<CatalogWarningCode, string> = {
  MISSING_EMAIL: 'Supplier has no email on file.',
  MULTIPLE_EMAILS: 'Supplier email field holds multiple addresses.',
  MISSING_RATES: 'Supplier has services/contracts but no rates.',
  EXPIRED_CONTRACT: 'A contract has expired.',
  EXPIRING_SOON: 'A contract expires soon.',
  UNVERIFIED_HOTEL_CONTRACT: 'Hotel contract is not verified.',
  NO_ACTIVE_SERVICES: 'Supplier has no active services or valid contracts.',
  CURRENCY_MISMATCH: 'Supplier mixes more than one currency.',
  MISSING_BASE_CITY: 'Transport supplier has no base city.',
};

export type CatalogWarning = { code: CatalogWarningCode; severity: Severity; message: string };
function warn(code: CatalogWarningCode): CatalogWarning {
  return { code, severity: SEVERITY[code], message: MESSAGE[code] };
}

// --- Inputs (already loaded, read-only) --------------------------------------

export type CatalogV2Input = {
  suppliers: Array<{
    id: string;
    name: string;
    type: string | null;
    email: string | null;
    phone: string | null;
    baseCity: string | null;
    transportDiscountPercent: number | null;
  }>;
  supplierServices: Array<{
    id: string;
    resolvedSupplierId: string | null;
    supplierId: string | null;
    name: string | null;
    category: string | null;
    currency: string | null;
    baseCost: number | null;
    serviceTypeActive: boolean | null;
  }>;
  serviceRates: Array<{
    serviceId: string;
    resolvedSupplierId: string | null;
    supplierId: string | null;
    costCurrency: string | null;
    costBaseAmount: number | null;
  }>;
  transportContracts: Array<{
    supplierId: string;
    currency: string | null;
    validFrom: string | null;
    validTo: string | null;
    active: boolean;
  }>;
  vehicleRates: Array<{ supplierId: string | null; currency: string | null }>;
  hotelContracts: Array<{
    id: string;
    name: string | null;
    hotelName: string | null;
    validFrom: string | null;
    validTo: string | null;
    currency: string | null;
    confidence: string | null;
  }>;
  catalogCounts: {
    services: number;
    activities: number;
    activitiesActive: number;
    guides: number;
    guidesActive: number;
    restaurants: number;
    restaurantsActive: number;
  };
};

// --- Helpers -----------------------------------------------------------------

function parseEmails(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? '').split(/[;,]/)) {
    const v = part.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function toTime(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

type ContractValidity = { active: number; expiringSoon: number; expired: number; noValidityWindow: number };

function classifyValidity(validTo: string | null, active: boolean, nowMs: number): keyof ContractValidity {
  if (!active) return 'noValidityWindow'; // inactive → not counted as a live window
  const to = toTime(validTo);
  if (to == null) return 'noValidityWindow';
  if (to < nowMs) return 'expired';
  if (to < nowMs + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) return 'expiringSoon';
  return 'active';
}

// --- Builder -----------------------------------------------------------------

export function buildCatalogV2Summary(input: CatalogV2Input, role: CatalogRole | null, now: string) {
  const nowMs = toTime(now) ?? 0;
  const pricingVisible = roleSeesPricing(role);

  const warningTotals: Record<CatalogWarningCode, number> = {
    MISSING_EMAIL: 0,
    MULTIPLE_EMAILS: 0,
    MISSING_RATES: 0,
    EXPIRED_CONTRACT: 0,
    EXPIRING_SOON: 0,
    UNVERIFIED_HOTEL_CONTRACT: 0,
    NO_ACTIVE_SERVICES: 0,
    CURRENCY_MISMATCH: 0,
    MISSING_BASE_CITY: 0,
  };
  const bump = (c: CatalogWarningCode) => {
    warningTotals[c] += 1;
  };

  const suppliers = input.suppliers.map((s) => {
    const linkedServices = input.supplierServices.filter(
      (sv) => sv.resolvedSupplierId === s.id || sv.supplierId === s.id,
    );
    const serviceIds = new Set(linkedServices.map((sv) => sv.id));
    const linkedRates = input.serviceRates.filter(
      (r) => serviceIds.has(r.serviceId) || r.resolvedSupplierId === s.id || r.supplierId === s.id,
    );
    const linkedContracts = input.transportContracts.filter((c) => c.supplierId === s.id);
    const linkedVehicleRates = input.vehicleRates.filter((v) => v.supplierId === s.id);

    const rateCount = linkedRates.length + linkedVehicleRates.length;
    // SupplierService has no active flag → treat as active unless its serviceType is inactive.
    const activeServiceCount = linkedServices.filter((sv) => sv.serviceTypeActive !== false).length;
    const validContractCount = linkedContracts.filter(
      (c) => c.active && classifyValidity(c.validTo, c.active, nowMs) !== 'expired',
    ).length;
    const operationallyActive = activeServiceCount > 0 || validContractCount > 0;

    const currencies = Array.from(
      new Set(
        [
          ...linkedServices.map((sv) => sv.currency),
          ...linkedRates.map((r) => r.costCurrency),
          ...linkedContracts.map((c) => c.currency),
          ...linkedVehicleRates.map((v) => v.currency),
        ]
          .filter((c): c is string => Boolean(c))
          .map((c) => c.toUpperCase()),
      ),
    ).sort();

    const contractValidity: ContractValidity = { active: 0, expiringSoon: 0, expired: 0, noValidityWindow: 0 };
    for (const c of linkedContracts) contractValidity[classifyValidity(c.validTo, c.active, nowMs)] += 1;

    const emails = parseEmails(s.email);
    const warnings: CatalogWarning[] = [];
    if (emails.length === 0) warnings.push(warn('MISSING_EMAIL'));
    else if (emails.length > 1) warnings.push(warn('MULTIPLE_EMAILS'));
    if ((linkedServices.length > 0 || linkedContracts.length > 0) && rateCount === 0) warnings.push(warn('MISSING_RATES'));
    if (!operationallyActive) warnings.push(warn('NO_ACTIVE_SERVICES'));
    if (currencies.length > 1) warnings.push(warn('CURRENCY_MISMATCH'));
    if ((s.type ?? '').toLowerCase() === 'transport' && !(s.baseCity ?? '').trim()) warnings.push(warn('MISSING_BASE_CITY'));
    if (contractValidity.expired > 0) warnings.push(warn('EXPIRED_CONTRACT'));
    if (contractValidity.expiringSoon > 0) warnings.push(warn('EXPIRING_SOON'));
    for (const w of warnings) bump(w.code);

    return {
      id: s.id,
      name: s.name,
      type: s.type ?? null,
      email: s.email ?? null,
      phone: s.phone ?? null,
      baseCity: s.baseCity ?? null,
      // Supplier destination/city is NOT modeled at the supplier level (derived elsewhere).
      derivedCity: null as string | null,
      operationallyActive,
      currencies,
      serviceCount: linkedServices.length,
      activeServiceCount,
      contractCount: linkedContracts.length,
      contractValidity,
      rateCount,
      pricingRedacted: !pricingVisible,
      pricing: pricingVisible
        ? {
            transportDiscountPercent: s.transportDiscountPercent ?? 0,
            serviceBaseCosts: linkedServices.map((sv) => ({ id: sv.id, baseCost: sv.baseCost ?? null, currency: sv.currency ?? null })),
            rateAmounts: linkedRates.map((r) => ({ costBaseAmount: r.costBaseAmount ?? null, costCurrency: r.costCurrency ?? null })),
          }
        : null,
      warnings,
    };
  });

  const hotelContracts = input.hotelContracts.map((c) => {
    const validity = classifyValidity(c.validTo, true, nowMs);
    const warnings: CatalogWarning[] = [];
    if (validity === 'expired') warnings.push(warn('EXPIRED_CONTRACT'));
    if (validity === 'expiringSoon') warnings.push(warn('EXPIRING_SOON'));
    if ((c.confidence ?? '').toUpperCase() !== 'VERIFIED') warnings.push(warn('UNVERIFIED_HOTEL_CONTRACT'));
    for (const w of warnings) bump(w.code);
    return {
      id: c.id,
      name: c.name ?? null,
      hotelName: c.hotelName ?? null,
      validFrom: c.validFrom ?? null,
      validTo: c.validTo ?? null,
      currency: c.currency ?? null,
      confidence: c.confidence ?? null,
      validity,
      warnings,
    };
  });

  const totalWarnings = Object.values(warningTotals).reduce((a, b) => a + b, 0);

  return {
    meta: {
      role: role ?? null,
      pricingRedacted: !pricingVisible,
      counts: {
        suppliers: suppliers.length,
        hotelContracts: hotelContracts.length,
        totalWarnings,
      },
    },
    serviceCatalog: input.catalogCounts,
    suppliers,
    hotelContracts,
    warningCounts: warningTotals,
    note: 'Read-only summary. No changes are made.',
  };
}
