import { Body, Controller, Get, Post } from '@nestjs/common';
import { Actor, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { AuthenticatedActor } from './auth.types';
import { UserInvitationsService } from '../users/user-invitations.service';

type LoginBody = {
  email?: string;
  password?: string;
};

type SignupBody = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
};

type AcceptInviteBody = {
  token?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userInvitationsService: UserInvitationsService,
  ) {}

  @Post('login')
  @Public()
  login(@Body() body: LoginBody) {
    return this.authService.login(body.email || '', body.password || '');
  }

  @Post('signup')
  @Public()
  signup(@Body() body: SignupBody) {
    return this.authService.signup({
      email: body.email || '',
      password: body.password || '',
      firstName: body.firstName || '',
      lastName: body.lastName || '',
      companyName: body.companyName || '',
    });
  }

  @Post('accept-invite')
  @Public()
  acceptInvite(@Body() body: AcceptInviteBody) {
    return this.userInvitationsService.accept(String(body.token || ''), {
      firstName: String(body.firstName || '').trim(),
      lastName: String(body.lastName || '').trim(),
      password: String(body.password || ''),
    });
  }

  @Post('invite-details')
  @Public()
  inviteDetails(@Body() body: { token?: string }) {
    return this.userInvitationsService.getByToken(String(body.token || ''));
  }

  @Get('me')
  me(@Actor() actor: AuthenticatedActor) {
    return actor;
  }
}
