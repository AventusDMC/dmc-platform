import { Body, Controller, Get, Logger, Post } from '@nestjs/common';
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
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly userInvitationsService: UserInvitationsService,
  ) {}

  @Post('login')
  @Public()
  async login(@Body() body: LoginBody) {
    const email = String(body.email || '').trim().toLowerCase();
    this.logger.log(`[login] start email=${email || 'missing'}`);

    try {
      const result = await this.authService.login(email, body.password || '');
      this.logger.log(`[login] response sent email=${email || 'missing'} actor=${result.actor.id}`);
      return result;
    } catch (error) {
      this.logger.warn(
        `[login] response sent email=${email || 'missing'} status=error message=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
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
