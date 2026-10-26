import type { RoomRow, RoomStore, SeatRow } from './service.ts';
import type { SignalKind } from './protocol.ts';

/**
 * The only environment-specific part of the server: mapping the room store
 * contract onto the platform database client. All game rules live in
 * service.ts, shared byte-for-byte with the local relay.
 *
 * Multi-row SDK calls are not transactions. Every state transition therefore
 * uses a single-row version compare-and-set, and seat uniqueness is enforced
 * by the primary key in the database.
 */

interface QueryResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

interface QueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): QueryBuilder;
  insert(values: unknown): QueryBuilder;
  update(values: unknown): QueryBuilder;
  delete(): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
}

interface DatabaseClient {
  from(table: string): QueryBuilder;
}

const DUPLICATE_KEY = '23505';

const ROOM_COLUMNS =
  'code,size,board,turn,status,winner,win_path,move_count,last_move,finish_reason,swapped,public_match,rematch,signal_seat,signal_kind,signal_at,created_at,updated_at,version';

function rows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  return data == null ? [] : [data as T];
}

function failIfError(result: QueryResult): void {
  if (result.error) throw new Error('database_unavailable');
}

function isDuplicate(result: QueryResult): boolean {
  return result.error?.code === DUPLICATE_KEY;
}

export function createSupabaseRoomStore(db: DatabaseClient): RoomStore {
  return {
    async insertRoom(room: RoomRow): Promise<boolean> {
      const result = await db.from('rooms').insert(room).select('code');
      if (isDuplicate(result)) return false;
      failIfError(result);
      return true;
    },

    async getRoom(code: string): Promise<RoomRow | null> {
      const result = await db
        .from('rooms')
        .select(ROOM_COLUMNS)
        .eq('code', code)
        .limit(1);
      failIfError(result);
      return rows<RoomRow>(result.data)[0] ?? null;
    },

    async updateRoom(
      code: string,
      expectedVersion: number,
      patch: Partial<RoomRow>,
    ): Promise<RoomRow | null> {
      const result = await db
        .from('rooms')
        .update(patch)
        .eq('code', code)
        .eq('version', expectedVersion)
        .select(ROOM_COLUMNS);
      failIfError(result);
      return rows<RoomRow>(result.data)[0] ?? null;
    },

    async getSeats(code: string): Promise<SeatRow[]> {
      const result = await db
        .from('seats')
        .select('room_code,seat,token_hash,name,last_seen,joined_at')
        .eq('room_code', code)
        .order('seat', { ascending: true });
      failIfError(result);
      return rows<SeatRow>(result.data);
    },

    async insertSeat(seat: SeatRow): Promise<boolean> {
      const result = await db.from('seats').insert(seat).select('seat');
      if (isDuplicate(result)) return false;
      failIfError(result);
      return true;
    },

    async deleteSeat(code: string, seat: number): Promise<void> {
      const result = await db
        .from('seats')
        .delete()
        .eq('room_code', code)
        .eq('seat', seat)
        .select('seat');
      failIfError(result);
    },

    async deleteRoom(code: string): Promise<void> {
      const seats = await db
        .from('seats')
        .delete()
        .eq('room_code', code)
        .select('seat');
      failIfError(seats);
      const result = await db
        .from('rooms')
        .delete()
        .eq('code', code)
        .select('code');
      failIfError(result);
    },

    async touchSeat(code: string, seat: number, lastSeen: string): Promise<void> {
      const result = await db
        .from('seats')
        .update({ last_seen: lastSeen })
        .eq('room_code', code)
        .eq('seat', seat)
        .select('seat');
      failIfError(result);
    },

    async setSignal(
      code: string,
      seat: number,
      kind: SignalKind,
      at: string,
    ): Promise<void> {
      const result = await db
        .from('rooms')
        .update({ signal_seat: seat, signal_kind: kind, signal_at: at })
        .eq('code', code)
        .select('code');
      failIfError(result);
    },

    async listWaitingRooms(size: number, limit: number): Promise<RoomRow[]> {
      const result = await db
        .from('rooms')
        .select(ROOM_COLUMNS)
        .eq('status', 'waiting')
        .eq('public_match', true)
        .eq('size', size)
        .order('created_at', { ascending: true })
        .limit(limit);
      failIfError(result);
      return rows<RoomRow>(result.data);
    },
  };
}
