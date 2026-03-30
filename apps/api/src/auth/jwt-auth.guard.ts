import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import { z } from 'zod';

import { apiEnvironment } from '../app.config';
import { ApiException } from '../common/api-exception';
import type { AuthTokenPayload } from './auth.types';

const authHeaderSchema = z.string().regex(/^Bearer\s+.+$/i);
const tokenPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown>; user?: unknown }>();
    const authorizationHeader = request.headers.authorization;

    if (typeof authorizationHeader !== 'string' || !authHeaderSchema.safeParse(authorizationHeader).success) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Authorization header with Bearer token is required',
      );
    }

    const token = authorizationHeader.replace(/^Bearer\s+/i, '').trim();

    try {
      const decoded = verify(token, apiEnvironment.JWT_SECRET);
      const parsed = tokenPayloadSchema.safeParse(decoded);

      if (!parsed.success) {
        throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Invalid token payload', {
          issues: parsed.error.issues,
        });
      }

      const payload = parsed.data as AuthTokenPayload;
      request.user = {
        userId: payload.sub,
        email: payload.email,
      };

      return true;
    } catch (error) {
      if (error instanceof ApiException) {
        throw error;
      }

      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Token verification failed');
    }
  }
}
