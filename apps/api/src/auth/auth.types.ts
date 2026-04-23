export const ROLE_NAMES = ['admin', 'viewer', 'operations', 'finance'] as const;

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
  firstName: string;
  lastName: string;
  companyId?: string | null;
  exp: number;
};
