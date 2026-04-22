import { Body, Controller, Get, Post } from '@nestjs/common';
import { Actor, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { AuthenticatedActor } from './auth.types';

type LoginBody = {
  email?: string;
  password?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  login(@Body() body: LoginBody) {
    return this.authService.login(body.email || '', body.password || '');
  }

  @Get('me')
  me(@Actor() actor: AuthenticatedActor) {
    return actor;
  }
}
