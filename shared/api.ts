import { GameError, ERROR_MESSAGE, type GameService } from './service';
import { MAX_BODY_BYTES } from './protocol';

/**
 * Transport-agnostic HTTP layer. The local Node relay and the Vercel Function
 * both call this with a standard Web `Request`, so route handling, validation
 * and error shapes cannot drift between environments.
 */

const ROOM_PATH = /^\/api\/rooms\/([A-Za-z0-9-]{1,12})(?:\/(join|move|swap|resign|forfeit|rematch|heartbeat|cancel|signal))?$/;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  vary: 'Authorization',
};

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: JSON_HEADERS,
  });
}

function fail(code: string, message: string, status: number, requestId: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message }, requestId }),
    { status, headers: JSON_HEADERS },
  );
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new GameError('invalid_request', 'Send a JSON transmission.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new GameError('invalid_request');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new GameError('invalid_request', 'That transmission is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) throw new GameError('invalid_request', 'The transmission was empty.');
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(merged);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not_an_object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new GameError('invalid_request');
  }
}

function tokenOf(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+([0-9a-f]{64})$/i.exec(header.trim());
  return match ? match[1]!.toLowerCase() : null;
}

export function createApiHandler(service: GameService) {
  return async function handle(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    if (path !== '/api' && !path.startsWith('/api/')) {
      return fail('not_found', 'No such relay route.', 404, requestId);
    }
    const token = tokenOf(request);

    try {
      if (path === '/api/health') {
        if (request.method !== 'GET') {
          return fail('method_not_allowed', 'Use GET for health.', 405, requestId);
        }
        return respond({ status: 'stable', service: 'voidlink-relay', version: 1 });
      }

      if (path === '/api/rooms') {
        if (request.method !== 'POST') {
          return fail('method_not_allowed', 'Use POST to open a room.', 405, requestId);
        }
        const body = await readJson(request);
        const room = await service.createRoom({
          size: body.size,
          name: body.name,
          publicMatch: false,
        });
        return respond(room, 201);
      }

      if (path === '/api/rooms/quick') {
        if (request.method !== 'POST') {
          return fail('method_not_allowed', 'Use POST to find a duel.', 405, requestId);
        }
        const body = await readJson(request);
        return respond(await service.quickMatch({ size: body.size, name: body.name }), 201);
      }

      const match = ROOM_PATH.exec(path);
      if (!match) {
        return fail('not_found', 'No such relay route.', 404, requestId);
      }
      const code = match[1]!;
      const action = match[2] ?? null;

      if (!action) {
        if (request.method !== 'GET') {
          return fail('method_not_allowed', 'Use GET to read a room.', 405, requestId);
        }
        return respond(await service.getRoom(code, token));
      }

      if (request.method !== 'POST') {
        return fail('method_not_allowed', 'Use POST for room actions.', 405, requestId);
      }

      switch (action) {
        case 'join': {
          const body = await readJson(request);
          return respond(await service.joinRoom(code, { name: body.name }), 201);
        }
        case 'move': {
          const body = await readJson(request);
          return respond(await service.move(code, token, body.cell));
        }
        case 'swap':
          return respond(await service.swap(code, token));
        case 'resign':
          return respond(await service.resign(code, token));
        case 'forfeit':
          return respond(await service.forfeit(code, token));
        case 'rematch':
          return respond(await service.requestRematch(code, token));
        case 'heartbeat':
          return respond(await service.heartbeat(code, token));
        case 'cancel':
          return respond(await service.cancelRoom(code, token));
        case 'signal': {
          const body = await readJson(request);
          return respond(await service.signal(code, token, body.kind));
        }
        default:
          return fail('not_found', 'No such relay action.', 404, requestId);
      }
    } catch (error) {
      if (error instanceof GameError) {
        return fail(error.code, error.message, error.status, requestId);
      }
      // Keep raw provider or transport details out of responses and logs.
      console.error(`voidlink_relay_fault request=${requestId} type=${(error as Error)?.name ?? 'unknown'}`);
      return fail(
        'server_error',
        ERROR_MESSAGE.server_error,
        500,
        requestId,
      );
    }
  };
}
