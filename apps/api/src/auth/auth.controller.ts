import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { loginRequestSchema, registerRequestSchema } from '@ryba/schemas';
import type { ApiEnvelope, AuthSession, UserRecord } from '@ryba/types';

import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';

type RegisterRequest = z.infer<typeof registerRequestSchema>;
type LoginRequest = z.infer<typeof loginRequestSchema>;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) payload: RegisterRequest,
  ): Promise<ApiEnvelope<AuthSession>> {
    const session = await this.authService.register(payload);

    return envelope(session);
  }

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) payload: LoginRequest,
  ): Promise<ApiEnvelope<AuthSession>> {
    const session = await this.authService.login(payload);

    return envelope(session);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ApiEnvelope<UserRecord>> {
    const user = await this.authService.me(currentUser.userId);

    return envelope(user);
  }
}
