import type { ApiEnvelope, ApiError, ApiFailure, ApiMeta, ApiSuccess } from '@ryba/types';

const createMeta = (requestId?: string): ApiMeta => ({
  timestamp: new Date().toISOString(),
  ...(requestId ? { requestId } : {}),
});

export const success = <TData>(data: TData, requestId?: string): ApiSuccess<TData> => ({
  ok: true,
  data,
  meta: createMeta(requestId),
});

export const failure = (
  error: ApiError,
  requestId?: string,
): ApiFailure => ({
  ok: false,
  error,
  meta: createMeta(requestId),
});

export const envelope = <TData>(data: TData, requestId?: string): ApiEnvelope<TData> =>
  success(data, requestId);
