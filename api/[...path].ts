import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiHandler } from '../shared/api';
import { createGameService } from '../shared/service';
import { createPostgresRoomStore } from '../server/postgres-store';
import { serveNode } from '../server/node-adapter';

/**
 * Vercel Node Function for every /api/* route.
 *
 * The static Vite client and this function share one origin, so the browser
 * needs no CORS configuration and no database credential is ever shipped to
 * the client. DATABASE_URL is read only here, at request time.
 */
const store = createPostgresRoomStore();
const service = createGameService(store);
const handler = createApiHandler(service);

export default async function route(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await serveNode(handler, request, response);
}
