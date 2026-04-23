import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedActor } from './auth.types';

export type CompanyScopedActor = Pick<AuthenticatedActor, 'companyId'> | null | undefined;

export function requireActorCompanyId(actor: CompanyScopedActor) {
  const companyId = actor?.companyId?.trim();

  if (!companyId) {
    throw new ForbiddenException('Company context is required');
  }

  return companyId;
}
