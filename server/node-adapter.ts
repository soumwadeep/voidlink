import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Bridges Vercel's Node request/response (and the local relay) to the same
 * Web Request/Response handler used by the browser API.
 */

const MAX_BODY_BYTES = 64 * 1024;

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

export async function serveNode(
  handler: (request: Request) => Promise<Response>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const started = Date.now();
  try {
    const method = request.method ?? 'GET';
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > MAX_BODY_BYTES) {
        if (!response.headersSent) {
          response.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
        }
        response.end(
          JSON.stringify({
            ok: false,
            error: { code: 'payload_too_large', message: 'That transmission is too large.' },
          }),
        );
        return;
      }
      chunks.push(buffer);
    }

    const proto =
      headerValue(request.headers['x-forwarded-proto'])?.split(',')[0]?.trim() ?? 'http';
    const host =
      headerValue(request.headers['x-forwarded-host'])?.split(',')[0]?.trim() ??
      request.headers.host ??
      '127.0.0.1';
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      const joined = headerValue(value);
      if (joined !== undefined) headers.set(key, joined);
    }
    const body =
      method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks);
    const webRequest = new Request(`${proto}://${host}${request.url ?? '/'}`, {
      method,
      headers,
      body,
    });
    const webResponse = await handler(webRequest);
    const payload = Buffer.from(await webResponse.arrayBuffer());
    webResponse.headers.forEach((value, key) => response.setHeader(key, value));
    response.writeHead(webResponse.status);
    response.end(payload);
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `${method} ${request.url ?? '/'} ${webResponse.status} ${Date.now() - started}ms`,
      );
    }
  } catch (error) {
    const type = (error as Error | null)?.name ?? 'unknown';
    console.error(`voidlink_node_adapter_fault type=${type}`);
    if (!response.headersSent) {
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    }
    response.end(
      JSON.stringify({
        ok: false,
        error: { code: 'server_error', message: 'The relay hit an unexpected fault. Try again.' },
      }),
    );
  }
}
