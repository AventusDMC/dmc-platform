import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { ROLE_NAMES, type DmcRole } from '../auth/auth.types';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';

type CreateUserInput = {
  name: string;
  email: string;
  role: DmcRole;
  companyId?: string | null;
  password?: string | null;
  active?: boolean;
};

type UpdateUserInput = {
  name?: string;
  email?: string;
  role?: DmcRole;
  companyId?: string | null;
  active?: boolean;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
      },
      include: {
        role: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
      email: user.email,
      role: this.normalizeRole(user.role.name),
      companyId: user.companyId,
      active: user.active,
      status: user.active ? 'active' as const : 'inactive' as const,
    }));
  }

  async findAgents(actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    const agents = await this.prisma.user.findMany({
      where: {
        role: {
          name: 'agent',
        },
      },
      include: {
        company: true,
        role: true,
      },
      orderBy: [{ active: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });

    return agents.map((agent) => ({
      id: agent.id,
      name: [agent.firstName, agent.lastName].filter(Boolean).join(' ').trim() || agent.email,
      email: agent.email,
      role: 'agent' as const,
      companyId: agent.companyId,
      companyName: agent.company?.name || 'Unlinked company',
      active: agent.active,
      status: agent.active ? 'active' as const : 'inactive' as const,
    }));
  }

  async create(input: CreateUserInput, actor?: CompanyScopedActor) {
    const actorCompanyId = requireActorCompanyId(actor);
    const normalizedRole = this.normalizeRole(input.role);
    const companyId = input.companyId?.trim() || actorCompanyId;
    const role = await this.findOrCreateRole(normalizedRole);

    if (!role) {
      throw new BadRequestException('Unsupported user role');
    }

    const { firstName, lastName } = this.splitName(input.name);
    const email = input.email.trim().toLowerCase();
    const password = this.authService.hashPassword(input.password?.trim() || 'changeme123');

    return this.prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password,
        roleId: role.id,
        companyId,
        active: input.active ?? true,
      },
      include: {
        company: true,
        role: true,
      },
    }).then((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
      email: user.email,
      role: this.normalizeRole(user.role.name),
      companyId: user.companyId,
      companyName: user.company?.name || 'Unlinked company',
      active: user.active,
      status: user.active ? 'active' as const : 'inactive' as const,
    }));
  }

  async update(id: string, input: UpdateUserInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        companyId,
      },
      include: { role: true },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const nameParts = input.name ? this.splitName(input.name) : null;
    const role = input.role
      ? await this.findOrCreateRole(this.normalizeRole(input.role))
      : null;

    if (input.role && !role) {
      throw new BadRequestException('Unsupported user role');
    }

    if (input.role && this.normalizeRole(existing.role.name) === 'admin' && this.normalizeRole(input.role) !== 'admin') {
      const adminCount = await this.prisma.user.count({
        where: {
          companyId,
          role: {
            name: 'admin',
          },
        },
      });

      if (adminCount <= 1) {
        throw new BadRequestException('At least one admin must remain in the company');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        firstName: nameParts?.firstName,
        lastName: nameParts?.lastName,
        email: input.email ? input.email.trim().toLowerCase() : undefined,
        roleId: role?.id,
        companyId: input.companyId?.trim() || undefined,
        active: input.active,
      },
      include: {
        company: true,
        role: true,
      },
    }).then(async (user) => {
      const nextRole = this.normalizeRole(user.role.name);

      if (input.role && nextRole !== this.normalizeRole(existing.role.name)) {
        await this.auditService.log({
          actor: actor ? { id: (actor as { id?: string }).id ?? null, companyId } : null,
          action: 'user.role.changed',
          entity: 'user',
          entityId: user.id,
          metadata: {
            email: user.email,
            from: this.normalizeRole(existing.role.name),
            to: nextRole,
          },
        });
      }

      return {
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
        email: user.email,
        role: nextRole,
        companyId: user.companyId,
        companyName: user.company?.name || 'Unlinked company',
        active: user.active,
        status: user.active ? 'active' as const : 'inactive' as const,
      };
    });
  }

  async remove(id: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        role: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const adminCount = await this.prisma.user.count({
      where: {
        companyId,
        role: {
          name: 'admin',
        },
      },
    });

    if (this.normalizeRole(existing.role.name) === 'admin' && adminCount <= 1) {
      throw new BadRequestException('At least one admin must remain in the company');
    }

    await this.prisma.user.delete({
      where: { id: existing.id },
    });

    return { ok: true };
  }

  private splitName(name: string) {
    const normalized = name.trim().replace(/\s+/g, ' ');
    const [firstName = '', ...rest] = normalized.split(' ');
    return {
      firstName: firstName || normalized,
      lastName: rest.join(' '),
    };
  }

  private normalizeRole(role: string) {
    const normalizedInput = role.trim().toLowerCase().replace(/[-\s]+/g, '_');
    const normalized = (normalizedInput === 'sales' ? 'viewer' : normalizedInput) as DmcRole;

    if (!ROLE_NAMES.includes(normalized)) {
      throw new BadRequestException('Unsupported user role');
    }

    return normalized;
  }

  private async findOrCreateRole(role: DmcRole) {
    const existing = await this.prisma.role.findFirst({
      where: {
        name: {
          equals: role,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return existing;
    }

    if (!['admin', 'super_admin', 'agent_admin', 'agent'].includes(role)) {
      return null;
    }

    return this.prisma.role.create({
      data: {
        name: role,
        description: this.getRoleDescription(role),
      },
    });
  }

  private getRoleDescription(role: DmcRole) {
    if (role === 'super_admin') {
      return 'System administrators with unrestricted platform access.';
    }

    if (role === 'agent_admin') {
      return 'Administrators managing external agent companies and portal users.';
    }

    if (role === 'agent') {
      return 'Agent portal users viewing only their assigned commercial records.';
    }

    return 'Platform administrators with full access.';
  }
}
