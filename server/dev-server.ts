import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createApiHandler } from '../shared/api.ts';
import { createGameService, type ServiceOptions } from '../shared/service.ts';
import { MemoryStore } from './memory-store.ts';

export interface DevServerOptions {
  port?: number;
  host?: string;
  store?: MemoryStore;
  clock?: ServiceOptions;
}

/**
 * Local-only relay. Vite proxies `/functions/v1/app` here, which keeps the
 * browser code identical to the deployed path.
 */
export function createDevServer(options: DevServerOptions = {}) {
  const store = options.store ?? new MemoryStore();
  const service = createGameService(store, options.clock ?? {});
  const handler = createApiHandler(service);
  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? Number(process.env.PORT ?? 8787);

  const server: Server = createServer(async (req, res) => {
    const started = Date.now();
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const method = req.method ?? 'GET';
      const origin = `http://${req.headers.host ?? `${host}:${requestedPort}`}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(', '));
      }
      const body =
        method === 'GET' || method === 'HEAD'
          ? undefined
          : Buffer.concat(chunks);
      const request = new Request(`${origin}${req.url ?? '/'}`, {
        method,
        headers,
        body,
      });
      const response = await handler(request);
      const payload = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(payload);
      console.log(`${method} ${req.url ?? '/'} ${response.status} ${Date.now() - started}ms`);
    } catch (error) {
      const message = error instanceof Error ? error.name : 'unknown';
      console.error(`local relay fault: ${message}`);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'server_error', message: 'Local relay fault.' } }));
    }
  });

  return {
    server,
    store,
    service,
    listen(): Promise<number> {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(requestedPort, host, () => {
          const address = server.address();
          const port = typeof address === 'object' && address ? address.port : requestedPort;
          console.log(`VOIDLINK relay stable at http://${host}:${port}`);
          resolve(port);
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    },
  };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const app = createDevServer();
  app.listen().catch(error => {
    console.error(`VOIDLINK relay could not bind: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  });
}
