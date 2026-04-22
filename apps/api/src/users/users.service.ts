import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ROLE_NAMES, type DmcRole } from '../auth/auth.types';

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
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: {
        role: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
      email: user.email,
      role: user.role.name,
      status: 'active' as const,
    }));
  }

  async create(input: CreateUserInput) {
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
      },
      include: {
        role: true,
      },
    }).then((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
      email: user.email,
      role: user.role.name,
      status: 'active' as const,
    }));
  }

  async update(id: string, input: UpdateUserInput) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
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
    }).then((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
      email: user.email,
      role: user.role.name,
      status: 'active' as const,
    }));
  }

  async remove(id: string) {
    await this.prisma.user.delete({
      where: { id },
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
    const normalized = role.trim().toLowerCase() as DmcRole;

    if (!ROLE_NAMES.includes(normalized)) {
      throw new NotFoundException('Role not found');
    }

    return normalized;
  }
}
