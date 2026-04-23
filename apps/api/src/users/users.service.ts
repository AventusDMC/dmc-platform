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
};

type UpdateUserInput = {
  name?: string;
  email?: string;
  role?: DmcRole;
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
      status: 'active' as const,
    }));
  }

  async create(input: CreateUserInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const normalizedRole = this.normalizeRole(input.role);
    const role = await this.prisma.role.findFirst({
      where: {
        name: normalizedRole,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const { firstName, lastName } = this.splitName(input.name);
    const email = input.email.trim().toLowerCase();
    const password = this.authService.hashPassword('changeme123');

    return this.prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password,
        roleId: role.id,
        companyId,
      },
      include: {
        role: true,
      },
    }).then((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
      email: user.email,
      role: this.normalizeRole(user.role.name),
      status: 'active' as const,
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
      ? await this.prisma.role.findFirst({
          where: {
            name: this.normalizeRole(input.role),
          },
        })
      : null;

    if (input.role && !role) {
      throw new NotFoundException('Role not found');
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
      },
      include: {
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
        status: 'active' as const,
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
    const normalized = (role.trim().toLowerCase() === 'sales' ? 'viewer' : role.trim().toLowerCase()) as DmcRole;

    if (!ROLE_NAMES.includes(normalized)) {
      throw new NotFoundException('Role not found');
    }

    return normalized;
  }
}
