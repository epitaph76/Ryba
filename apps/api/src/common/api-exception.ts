import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@ryba/types';

interface ApiExceptionBody {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(
      {
        code,
        message,
        details,
      } satisfies ApiExceptionBody,
      status,
    );
  }
}
