import type { JsonObject } from './json';

export interface ApiMeta {
  timestamp: string;
  requestId?: string;
}

export interface ApiError {
  code: string;
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
