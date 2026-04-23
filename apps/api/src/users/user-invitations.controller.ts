import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor, DmcRole } from '../auth/auth.types';
import { UserInvitationsService } from './user-invitations.service';

type CreateInvitationBody = {
  email?: string;
  role?: DmcRole;
};

@Controller('users/invitations')
@Roles('admin')
export class UserInvitationsController {
  constructor(private readonly userInvitationsService: UserInvitationsService) {}

  @Get()
  findAll(@Actor() actor: AuthenticatedActor) {
    return this.userInvitationsService.findAll(actor);
  }

  @Post()
  create(@Body() body: CreateInvitationBody, @Actor() actor: AuthenticatedActor) {
    return this.userInvitationsService.create({
      email: String(body.email || '').trim(),
      role: (body.role || 'viewer') as DmcRole,
    }, actor);
  }

  @Delete(':id')
  revoke(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.userInvitationsService.revoke(id, actor);
  }
}
