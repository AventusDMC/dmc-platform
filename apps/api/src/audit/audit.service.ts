import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AuditActorLike = {
  id?: string | null;
  companyId?: string | null;
} | null | undefined;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(values: {
    actor?: AuditActorLike;
    companyId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const companyId = values.companyId?.trim() || values.actor?.companyId?.trim() || '';

    if (!companyId) {
      return null;
    }

    return (this.prisma as any).auditLog.create({
      data: {
        companyId,
        userId: values.actor?.id?.trim() || null,
        action: values.action,
        entity: values.entity,
        entityId: values.entityId?.trim() || null,
        metadata: values.metadata ?? null,
      },
    });
  }
}
