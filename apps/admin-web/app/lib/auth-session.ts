export type SessionRole = 'admin' | 'super_admin' | 'agent_admin' | 'viewer' | 'operations' | 'finance' | 'agent';

export type SessionActor = {
  id: string;
  email: string;
  role: SessionRole;
  firstName: string;
  lastName: string;
  name: string;
  auditLabel: string;
};

type SessionPayload = {
  sub: string;
  email: string;
  role: SessionRole | 'sales' | 'ADMIN' | 'SUPER_ADMIN' | 'AGENT_ADMIN' | 'super-admin' | 'agent-admin';
  firstName: string;
  lastName: string;
  exp: number;
};

const TOKEN_VERSION = 'v1';

function normalizeSessionRole(role: SessionPayload['role']) {
  const normalized = String(role).trim().toLowerCase().replace(/[-\s]+/g, '_');

  return normalized === 'sales' ? 'viewer' : normalized as SessionRole;
}

export function readSessionActor(token: string) {
  const [version, payloadSegment] = token.split('.');

  if (!version || !payloadSegment || version !== TOKEN_VERSION) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as SessionPayload;

    if (!payload.sub || !payload.email || !payload.role || !payload.exp) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    const role = normalizeSessionRole(payload.role);
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim() || payload.email;

    return {
      id: payload.sub,
      email: payload.email,
      role,
      firstName: payload.firstName,
      lastName: payload.lastName,
      name,
      auditLabel: `${name} <${payload.email}> [${role}]`,
    } satisfies SessionActor;
  } catch {
    return null;
  }
}

export function canAccessFinance(role?: SessionRole | null) {
  return role === 'admin' || role === 'super_admin' || role === 'finance';
}

export function canAccessOperations(role?: SessionRole | null) {
  return role === 'admin' || role === 'super_admin' || role === 'operations';
}

// CP-N4b: canonical, fail-closed frontend permission helpers that MIRROR the deployed
// CP-N4a backend allowlists (apps/api/src/quotes/quotes.controller.ts) EXACTLY. These
// gate whether the UI renders/mounts action controls; the backend gate remains
// authoritative (client checks are UX defense only). Authority is derived ONLY from the
// trusted authenticated session role — never from query params, quote data, DOM, client
// storage, or user-controlled props. Missing / unknown / agent / agent_admin / future
// roles are false for every action permission (fail closed).

// Quote WRITE + public-link CAPABILITY authority (QUOTE_WRITE_ROLES): create/update/
// delete quote, item CRUD, pricing/options/templates/scenarios, status/cancel/requote,
// invoice, convert-to-booking, version WRITE, public-link enable/disable/regenerate,
// item display-text.
export function canWriteQuote(role?: SessionRole | null) {
  return role === 'admin' || role === 'super_admin' || role === 'finance';
}

// Operational quote WRITE authority (QUOTE_OPERATIONAL_WRITE_ROLES): passenger + rooming
// mutations, item pricing preview/apply, proposal-email send.
export function canPerformOperationalQuoteWrites(role?: SessionRole | null) {
  return role === 'admin' || role === 'super_admin' || role === 'operations';
}

// Quote proposal / PDF / export download authority (QUOTE_EXPORT_ROLES). Viewer fails
// closed this slice.
export function canExportQuote(role?: SessionRole | null) {
  return role === 'admin' || role === 'super_admin' || role === 'finance' || role === 'operations';
}

// Safe internal quote READ authority (INTERNAL_QUOTE_READ_ROLES): who may view a quote at
// all. Viewer is included — its access is read-only (the write/capability/export helpers
// above all return false for viewer).
export function canReadQuoteAsViewer(role?: SessionRole | null) {
  return (
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'finance' ||
    role === 'operations' ||
    role === 'viewer'
  );
}

// CP-N3b2b: full passenger-PII predicate. Mirrors the backend PII_FULL_ROLES
// (apps/api/src/auth/pii-roles.ts) EXACTLY: admin / super_admin / operations.
// Deliberately SEPARATE from canAccessFinance (cost axis) — cost visibility and
// passenger-PII visibility are independent. A missing/unknown/agent/agent_admin
// role is never full-PII (fail-closed).
export function canViewFullPassengerPii(role?: SessionRole | null) {
  return role === 'admin' || role === 'super_admin' || role === 'operations';
}

export function hasRequiredRole(role: SessionRole | null | undefined, allowedRoles: SessionRole[]) {
  if (!role) {
    return false;
  }

  return allowedRoles.includes(role) || role === 'super_admin' || (role === 'agent_admin' && allowedRoles.includes('admin'));
}
