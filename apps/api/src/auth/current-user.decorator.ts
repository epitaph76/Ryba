import { createParamDecorator, ExecutionContext, HttpStatus } from '@nestjs/common';

import { ApiException } from '../common/api-exception';
import type { AuthenticatedUser } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();

    if (!request.user) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'User context not found');
    }

    return request.user;
  },
);
