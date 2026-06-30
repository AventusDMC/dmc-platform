export const ROLE_NAMES = ['admin', 'super_admin', 'agent_admin', 'viewer', 'operations', 'finance', 'agent'] as const;

export type DmcRole = (typeof ROLE_NAMES)[number];

export type AuthenticatedActor = {
  id: string;
  email: string;
  role: DmcRole;
  firstName: string;
  lastName: string;
  name: string;
  auditLabel: string;
  companyId?: string | null;
};

export type SessionTokenPayload = {
  sub: string;
  email: string;
  role: DmcRole;
  // Optional: a (validly-signed) token may omit names, or a user may have a
  // null/empty name. toActor guards against this so auth never 500s.
  firstName?: string | null;
  lastName?: string | null;
  companyId?: string | null;
  exp: number;
};
