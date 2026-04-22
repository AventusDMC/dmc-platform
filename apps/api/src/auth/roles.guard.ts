import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedActor, DmcRole } from './auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

type RequestWithActor = {
  authenticatedActor?: AuthenticatedActor;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const roles = this.reflector.getAllAndOverride<DmcRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const actor = request.authenticatedActor;

    if (!actor || !roles.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    return true;
  }
}
