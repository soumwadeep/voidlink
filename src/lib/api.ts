import { API_BASE } from '../../shared/protocol.ts';

export class VoidlinkApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'VoidlinkApiError';
    this.code = code;
    this.status = status;
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST';
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface SuccessShape<T> {
  ok: true;
  data: T;
}

interface FailureShape {
  ok: false;
  error?: { code?: string; message?: string };
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  const abortOuter = () => controller.abort();
  options.signal?.addEventListener('abort', abortOuter, { once: true });

  const headers = new Headers({ accept: 'application/json' });
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw new VoidlinkApiError('cancelled', 'Request cancelled.', 0);
    }
    if (controller.signal.aborted) {
      throw new VoidlinkApiError(
        'timeout',
        'The relay did not answer in time. Check your link and try again.',
        0,
      );
    }
    throw new VoidlinkApiError(
      'network',
      'The relay is unreachable. Check your connection and try again.',
      0,
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortOuter);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new VoidlinkApiError('invalid_response', 'The relay returned an unreadable signal.', response.status);
  }

  if (!response.ok) {
    const payload = parsed as FailureShape;
    const code = payload?.error?.code ?? `http_${response.status}`;
    const message = payload?.error?.message ?? 'The relay rejected that transmission.';
    throw new VoidlinkApiError(code, message, response.status);
  }

  const payload = parsed as SuccessShape<T> | FailureShape;
  if (!payload || payload.ok !== true) {
    const failure = parsed as FailureShape;
    throw new VoidlinkApiError(
      failure?.error?.code ?? 'invalid_response',
      failure?.error?.message ?? 'The relay returned an unexpected shape.',
      response.status,
    );
  }
  return payload.data as T;
}
