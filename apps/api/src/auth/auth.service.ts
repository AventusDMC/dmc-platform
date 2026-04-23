import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedActor, DmcRole, ROLE_NAMES, SessionTokenPayload } from './auth.types';

type HeaderMap = Record<string, string | string[] | undefined>;

const PASSWORD_PREFIX = 'scrypt';
const SESSION_TOKEN_VERSION = 'v1';
const SESSION_COOKIE_HEADER = 'x-dmc-session';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async signup(input: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    companyName?: string;
  }) {
    const email = input.email.trim().toLowerCase();
    const password = input.password.trim();
    const firstName = input.firstName.trim();
    const lastName = input.lastName?.trim() || '';
    const companyName = input.companyName?.trim() || `${firstName || email}'s Company`;

    if (!email || !password || !firstName || !companyName) {
      throw new UnauthorizedException('Email, password, first name, and company name are required');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new UnauthorizedException('An account with this email already exists');
    }

    const adminRole = await this.prisma.role.findFirst({
      where: {
        name: 'admin',
      },
      select: {
        id: true,
      },
    });

    if (!adminRole) {
      throw new UnauthorizedException('Admin role is not configured');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          type: 'tenant',
        },
        select: {
          id: true,
        },
      });

      return tx.user.create({
        data: {
          email,
          password: this.hashPassword(password),
          firstName,
          lastName,
          roleId: adminRole.id,
          companyId: company.id,
        },
        include: {
          role: true,
        },
      });
    });

    const actor = this.toActor({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name,
      companyId: user.companyId,
    });

    return {
      token: this.createSessionToken(actor),
      actor,
    };
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      throw new UnauthorizedException('Email and password are required');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
      include: {
        role: true,
      },
    });

    if (!user || !this.verifyPassword(normalizedPassword, user.password)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const actor = this.toActor({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name,
      companyId: user.companyId,
    });

    return {
      token: this.createSessionToken(actor),
      actor,
    };
  }

  requireActor(headers: HeaderMap, allowedRoles?: DmcRole[]) {
    const actor = this.authenticateHeaders(headers);

    if (allowedRoles?.length && !allowedRoles.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    return actor;
  }

  authenticateHeaders(headers: HeaderMap) {
    const authorization = headers.authorization;
    const authHeader = Array.isArray(authorization) ? authorization[0] : authorization;
    const sessionHeader = headers[SESSION_COOKIE_HEADER];
    const fallbackHeader = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    const token = this.extractBearerToken(authHeader) || fallbackHeader?.trim() || '';

    if (!token) {
      throw new UnauthorizedException('Authentication is required');
    }

    return this.verifySessionToken(token);
  }

  verifySessionToken(token: string) {
    const [version, payloadSegment, signatureSegment] = token.split('.');

    if (!version || !payloadSegment || !signatureSegment || version !== SESSION_TOKEN_VERSION) {
      throw new UnauthorizedException('Invalid session token');
    }

    const expectedSignature = this.signSegment(payloadSegment);
    const providedSignature = Buffer.from(signatureSegment);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);

    if (
      providedSignature.length !== expectedSignatureBuffer.length ||
      !timingSafeEqual(providedSignature, expectedSignatureBuffer)
    ) {
      throw new UnauthorizedException('Invalid session token');
    }

    let payload: SessionTokenPayload;

    try {
      payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as SessionTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid session token');
    }

    if (!payload?.sub || !payload.email || !payload.role || !payload.exp) {
      throw new UnauthorizedException('Invalid session token');
    }

    const normalizedRole = this.normalizeRoleName(payload.role);

    if (!normalizedRole) {
      throw new UnauthorizedException('Invalid session token');
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Session token has expired');
    }

    return this.toActor({
      id: payload.sub,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      role: normalizedRole,
      companyId: payload.companyId,
    });
  }

  hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const iterations = 16384;
    const derivedKey = scryptSync(password, salt, 64).toString('hex');
    return `${PASSWORD_PREFIX}$${iterations}$${salt}$${derivedKey}`;
  }

  verifyPassword(password: string, storedPassword: string) {
    if (!storedPassword.startsWith(`${PASSWORD_PREFIX}$`)) {
      return storedPassword === password;
    }

    const [, , salt, expectedHash] = storedPassword.split('$');

    if (!salt || !expectedHash) {
      return false;
    }

    const calculatedHash = scryptSync(password, salt, 64).toString('hex');
    return timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(expectedHash));
  }

  private createSessionToken(actor: AuthenticatedActor) {
    const ttlHours = Number(process.env.DMC_AUTH_SESSION_TTL_HOURS || 12);
    const payload: SessionTokenPayload = {
      sub: actor.id,
      email: actor.email,
      role: actor.role,
      firstName: actor.firstName,
      lastName: actor.lastName,
      companyId: actor.companyId,
      exp: Math.floor(Date.now() / 1000) + Math.max(1, ttlHours) * 60 * 60,
    };
    const payloadSegment = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.signSegment(payloadSegment);
    return `${SESSION_TOKEN_VERSION}.${payloadSegment}.${signature}`;
  }

  private signSegment(payloadSegment: string) {
    return createHmac('sha256', this.getSessionSecret()).update(payloadSegment).digest('hex');
  }

  private getSessionSecret() {
    return process.env.DMC_AUTH_SESSION_SECRET || 'dmc-local-dev-session-secret';
  }

  private extractBearerToken(value?: string) {
    const normalized = value?.trim() || '';
    if (!normalized.toLowerCase().startsWith('bearer ')) {
      return null;
    }
    return normalized.slice(7).trim() || null;
  }

  private toActor(values: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    companyId?: string | null;
  }): AuthenticatedActor {
    const normalizedRole = this.normalizeRoleName(values.role);

    if (!normalizedRole) {
      throw new UnauthorizedException('Unsupported user role');
    }

    const firstName = values.firstName.trim();
    const lastName = values.lastName.trim();
    const name = [firstName, lastName].filter(Boolean).join(' ').trim() || values.email.trim().toLowerCase();

    return {
      id: values.id,
      email: values.email.trim().toLowerCase(),
      role: normalizedRole,
      firstName,
      lastName,
      name,
      auditLabel: `${name} <${values.email.trim().toLowerCase()}> [${normalizedRole}]`,
      companyId: values.companyId ?? null,
    };
  }

  private normalizeRoleName(role: string) {
    const normalized = role.trim().toLowerCase();

    if (normalized === 'sales') {
      return 'viewer';
    }

    return ROLE_NAMES.includes(normalized as DmcRole) ? (normalized as DmcRole) : null;
  }
}
