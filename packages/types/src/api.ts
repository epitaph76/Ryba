import type { JsonObject } from './json';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR';

export interface ApiMeta {
  timestamp: string;
  requestId?: string;
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: JsonObject;
}

export interface ApiSuccess<TData> {
  ok: true;
  data: TData;
  meta?: ApiMeta;
}

export interface ApiFailure {
  ok: false;
  error: ApiError;
  meta?: ApiMeta;
}

export type ApiEnvelope<TData> = ApiSuccess<TData> | ApiFailure;
