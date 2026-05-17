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

export function hasRequiredRole(role: SessionRole | null | undefined, allowedRoles: SessionRole[]) {
  if (!role) {
    return false;
  }

  return allowedRoles.includes(role) || role === 'super_admin' || (role === 'agent_admin' && allowedRoles.includes('admin'));
}
