import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError, ApiErrorCode, JsonObject } from '@ryba/types';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { failure } from './api-response';

const mapStatusToCode = (status: number): ApiErrorCode => {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.BAD_REQUEST:
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'VALIDATION_ERROR';
    default:
      return 'INTERNAL_ERROR';
  }
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : undefined);
    }

    const responsePayload: unknown =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    const derivedError = this.buildError(responsePayload, status);
    const requestId = this.extractRequestId(request);

    reply.status(status).send(failure(derivedError, requestId));
  }

  private buildError(
    responsePayload: unknown,
    status: number,
  ): ApiError {
    if (typeof responsePayload === 'string') {
      return {
        code: mapStatusToCode(status),
        message: responsePayload,
      };
    }

    if (!responsePayload || typeof responsePayload !== 'object') {
      return {
        code: mapStatusToCode(status),
        message: 'Request failed',
      };
    }

    const responseObject = responsePayload as Record<string, unknown>;

    const payloadCode = responseObject.code;
    const payloadMessage = responseObject.message;
    const payloadDetails = responseObject.details;

    return {
      code:
        typeof payloadCode === 'string' && payloadCode.length > 0
          ? (payloadCode as ApiErrorCode)
          : mapStatusToCode(status),
      message:
        typeof payloadMessage === 'string' && payloadMessage.length > 0
          ? payloadMessage
          : 'Request failed',
      details:
        payloadDetails && typeof payloadDetails === 'object'
          ? (payloadDetails as JsonObject)
          : undefined,
    };
  }

  private extractRequestId(request: FastifyRequest): string | undefined {
    const requestId = request.headers['x-request-id'];

    return typeof requestId === 'string' ? requestId : undefined;
  }
}
