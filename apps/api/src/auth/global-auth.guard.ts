import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthenticatedActor } from './auth.types';
import { IS_PUBLIC_KEY } from './auth.decorators';

type RequestWithActor = {
  headers: Record<string, string | string[] | undefined>;
  authenticatedActor?: AuthenticatedActor;
};

@Injectable()
export class GlobalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    request.authenticatedActor = this.authService.authenticateHeaders(request.headers);
    return true;
  }
}
