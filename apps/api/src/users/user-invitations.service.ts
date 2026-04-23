import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import nodemailer = require('nodemailer');
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
import { ROLE_NAMES, type DmcRole } from '../auth/auth.types';

type CreateInvitationInput = {
  email: string;
  role: DmcRole;
};

@Injectable()
export class UserInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const invitations = await (this.prisma as any).invitation.findMany({
      where: {
        companyId,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return invitations.map((invitation: any) => this.mapInvitation(invitation));
  }

  async create(input: CreateInvitationInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const email = input.email.trim().toLowerCase();
    const role = this.normalizeRole(input.role);

    if (!email) {
      throw new BadRequestException('Invitation email is required');
    }

    const [company, existingUser] = await Promise.all([
      this.prisma.company.findFirst({
        where: {
          id: companyId,
        },
        select: {
          id: true,
          name: true,
        },
      }),
      this.prisma.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (!company) {
      throw new BadRequestException('Company not found');
    }

    if (existingUser) {
      throw new BadRequestException('A user with this email already exists');
    }

    const activeInvite = await (this.prisma as any).invitation.findFirst({
      where: {
        companyId,
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
      },
    });

    if (activeInvite) {
      throw new BadRequestException('An active invitation already exists for this email');
    }

    const invitation = await (this.prisma as any).invitation.create({
      data: {
        companyId,
        email,
        role,
        token: randomBytes(32).toString('hex'),
        expiresAt: this.buildExpiryDate(),
        invitedByUserId: (actor as { id?: string } | null | undefined)?.id ?? null,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await this.sendInvitationEmail(invitation);

    await this.auditService.log({
      actor: actor ? { id: (actor as { id?: string }).id ?? null, companyId } : null,
      action: 'user.invite.created',
      entity: 'invitation',
      entityId: invitation.id,
      metadata: {
        email: invitation.email,
        role: invitation.role,
      },
    });

    return this.mapInvitation(invitation);
  }

  async revoke(id: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const invitation = await (this.prisma as any).invitation.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('Accepted invitations cannot be revoked');
    }

    const revoked = await (this.prisma as any).invitation.update({
      where: {
        id: invitation.id,
      },
      data: {
        revokedAt: new Date(),
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return this.mapInvitation(revoked);
  }

  async getByToken(token: string) {
    const invitation = await this.getValidInvitationByToken(token);

    return {
      email: invitation.email,
      role: this.normalizeRole(invitation.role),
      company: {
        id: invitation.company.id,
        name: invitation.company.name,
      },
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(token: string, input: { firstName: string; lastName?: string; password: string }) {
    const invitation = await this.getValidInvitationByToken(token);
    const email = invitation.email.trim().toLowerCase();
    const firstName = input.firstName.trim();
    const lastName = input.lastName?.trim() || '';
    const password = input.password.trim();

    if (!firstName || !password) {
      throw new BadRequestException('First name and password are required');
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
      throw new BadRequestException('A user with this email already exists');
    }

    const role = await this.prisma.role.findFirst({
      where: {
        name: this.normalizeRole(invitation.role),
      },
      select: {
        id: true,
      },
    });

    if (!role) {
      throw new BadRequestException('Invitation role is not configured');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          email,
          password: this.authService.hashPassword(password),
          firstName,
          lastName,
          roleId: role.id,
          companyId: invitation.companyId,
        },
      });

      await (tx as any).invitation.update({
        where: {
          id: invitation.id,
        },
        data: {
          acceptedAt: new Date(),
        },
      });
    });

    await this.auditService.log({
      companyId: invitation.companyId,
      action: 'user.invite.accepted',
      entity: 'invitation',
      entityId: invitation.id,
      metadata: {
        email,
        role: invitation.role,
      },
    });

    return this.authService.login(email, password);
  }

  private async getValidInvitationByToken(token: string) {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      throw new NotFoundException('Invitation not found');
    }

    const invitation = await (this.prisma as any).invitation.findFirst({
      where: {
        token: normalizedToken,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.revokedAt) {
      throw new BadRequestException('Invitation has been revoked');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('Invitation has already been accepted');
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invitation has expired');
    }

    return invitation;
  }

  private buildExpiryDate() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    return expiresAt;
  }

  private normalizeRole(role: string) {
    const normalized = (role.trim().toLowerCase() === 'sales' ? 'viewer' : role.trim().toLowerCase()) as DmcRole;

    if (!ROLE_NAMES.includes(normalized)) {
      throw new BadRequestException('Role not found');
    }

    return normalized;
  }

  private mapInvitation(invitation: {
    id: string;
    email: string;
    role: string;
    token: string;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    company: {
      id: string;
      name: string;
    };
  }) {
    const status =
      invitation.acceptedAt ? 'accepted' : invitation.revokedAt ? 'revoked' : invitation.expiresAt.getTime() <= Date.now() ? 'expired' : 'pending';

    return {
      id: invitation.id,
      email: invitation.email,
      role: this.normalizeRole(invitation.role),
      token: invitation.token,
      companyId: invitation.company.id,
      companyName: invitation.company.name,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
      status,
    };
  }

  private async sendInvitationEmail(invitation: {
    email: string;
    role: string;
    token: string;
    company: {
      name: string;
    };
  }) {
    const appUrl = (process.env.ADMIN_WEB_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    const inviteUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(invitation.token)}`;
    const transporter = this.createMailTransport();
    const fromAddress = process.env.BOOKING_DOCUMENTS_EMAIL_FROM || process.env.SMTP_FROM || 'noreply@localhost';

    await transporter.sendMail({
      from: fromAddress,
      to: invitation.email,
      subject: `Join ${invitation.company.name} on DMC Platform`,
      text: [
        `You have been invited to join ${invitation.company.name}.`,
        `Role: ${this.normalizeRole(invitation.role)}.`,
        `Accept the invitation: ${inviteUrl}`,
      ].join('\n'),
    });
  }

  private createMailTransport() {
    if (process.env.SMTP_HOST) {
      const port = Number(process.env.SMTP_PORT || 587);
      const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
      });
    }

    return nodemailer.createTransport({
      jsonTransport: true,
    });
  }
}
