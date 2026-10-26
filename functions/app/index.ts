import { createDatabaseClient } from './_qoder/backend.mjs';
import { createApiHandler } from './api.ts';
import { createGameService } from './service.ts';
import { createSupabaseRoomStore } from './supabase-store.ts';

const database = createDatabaseClient();
const gameService = createGameService(createSupabaseRoomStore(database));
const handler = createApiHandler(gameService);

Deno.serve(request => handler(request));
