import { Pool } from 'pg';
import type { RoomRow, RoomStore, SeatRow } from '../shared/service';
import type { SignalKind } from '../shared/protocol';

/**
 * Hosted persistence adapter for the portable relay.
 *
 * The game rules never see SQL. This module is the only place that knows the
 * database, and every room transition is a single-row compare-and-set on
 * `version`. Seat uniqueness is enforced by the primary key.
 */

type DbRow = Record<string, unknown>;

interface PgError {
  code?: string;
}

const DUPLICATE_KEY = '23505';

const ROOM_COLUMNS = [
  'code',
  'size',
  'board',
  'turn',
  'status',
  'winner',
  'win_path',
  'move_count',
  'last_move',
  'finish_reason',
  'swapped',
  'public_match',
  'rematch',
  'signal_seat',
  'signal_kind',
  'signal_at',
  'created_at',
  'updated_at',
  'version',
] as const;

const SEAT_COLUMNS = [
  'room_code',
  'seat',
  'token_hash',
  'name',
  'last_seen',
  'joined_at',
] as const;

const PATCHABLE = new Set([
  'size',
  'board',
  'turn',
  'status',
  'winner',
  'win_path',
  'move_count',
  'last_move',
  'finish_reason',
  'swapped',
  'public_match',
  'rematch',
  'signal_seat',
  'signal_kind',
  'signal_at',
  'updated_at',
  'version',
]);

let defaultPool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (defaultPool) return defaultPool;
  const connectionString =
    process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (!connectionString) throw new Error('database_not_configured');
  defaultPool = new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    // Hosted Postgres providers require TLS. Set DATABASE_SSL=disable only
    // for a local development database that does not speak TLS.
    ssl:
      process.env.DATABASE_SSL === 'disable'
        ? false
        : { rejectUnauthorized: false },
    application_name: 'voidlink',
  });
  defaultPool.on('error', () => {
    // Idle connection failures are retried by the next request. Do not crash
    // the serverless instance for a transient pool error.
  });
  return defaultPool;
}

export async function closePostgresPool(): Promise<void> {
  if (!defaultPool) return;
  const current = defaultPool;
  defaultPool = null;
  await current.end().catch(() => undefined);
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return value == null ? '' : String(value);
}

function isoOrNull(value: unknown): string | null {
  return value == null ? null : iso(value);
}

function normaliseRoom(row: DbRow): RoomRow {
  const rematch =
    typeof row.rematch === 'string' ? row.rematch : JSON.stringify(row.rematch ?? []);
  return {
    code: String(row.code),
    size: Number(row.size),
    board: String(row.board ?? ''),
    turn: Number(row.turn),
    status: String(row.status) as RoomRow['status'],
    winner: row.winner == null ? null : Number(row.winner),
    win_path: String(row.win_path ?? ''),
    move_count: Number(row.move_count),
    last_move: row.last_move == null ? null : Number(row.last_move),
    finish_reason: row.finish_reason == null ? null : String(row.finish_reason),
    swapped: Boolean(row.swapped),
    public_match: Boolean(row.public_match),
    rematch,
    signal_seat: row.signal_seat == null ? null : Number(row.signal_seat),
    signal_kind: row.signal_kind == null ? null : String(row.signal_kind),
    signal_at: isoOrNull(row.signal_at),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    version: Number(row.version),
  };
}

function normaliseSeat(row: DbRow): SeatRow {
  return {
    room_code: String(row.room_code),
    seat: Number(row.seat),
    token_hash: String(row.token_hash),
    name: String(row.name),
    last_seen: iso(row.last_seen),
    joined_at: iso(row.joined_at),
  };
}

function isDuplicate(error: unknown): boolean {
  return (error as PgError | null)?.code === DUPLICATE_KEY;
}

export function createPostgresRoomStore(pool?: Pool): RoomStore {
  const db = () => pool ?? getPostgresPool();

  return {
    async insertRoom(room: RoomRow): Promise<boolean> {
      const placeholders = ROOM_COLUMNS.map((_, index) => `$${index + 1}`).join(', ');
      const values = ROOM_COLUMNS.map(column => room[column]);
      try {
        await db().query(
          `INSERT INTO rooms (${ROOM_COLUMNS.join(', ')}) VALUES (${placeholders})`,
          values,
        );
        return true;
      } catch (error) {
        if (isDuplicate(error)) return false;
        throw error;
      }
    },

    async getRoom(code: string): Promise<RoomRow | null> {
      const result = await db().query(
        `SELECT ${ROOM_COLUMNS.join(', ')} FROM rooms WHERE code = $1 LIMIT 1`,
        [code],
      );
      const row = result.rows[0] as DbRow | undefined;
      return row ? normaliseRoom(row) : null;
    },

    async updateRoom(
      code: string,
      expectedVersion: number,
      patch: Partial<RoomRow>,
    ): Promise<RoomRow | null> {
      const entries = Object.entries(patch).filter(
        ([key]) => PATCHABLE.has(key) && key !== 'code',
      ) as [string, unknown][];
      if (entries.length === 0) return this.getRoom(code);

      const assignments = entries.map(([key], index) => `${key} = $${index + 1}`);
      const values: unknown[] = entries.map(([, value]) => value);
      values.push(code, expectedVersion);
      const codeParam = values.length - 1;
      const versionParam = values.length;
      const result = await db().query(
        `UPDATE rooms SET ${assignments.join(', ')}
         WHERE code = $${codeParam} AND version = $${versionParam}
         RETURNING ${ROOM_COLUMNS.join(', ')}`,
        values,
      );
      const row = result.rows[0] as DbRow | undefined;
      return row ? normaliseRoom(row) : null;
    },

    async getSeats(code: string): Promise<SeatRow[]> {
      const result = await db().query(
        `SELECT ${SEAT_COLUMNS.join(', ')} FROM seats WHERE room_code = $1 ORDER BY seat ASC`,
        [code],
      );
      return (result.rows as DbRow[]).map(normaliseSeat);
    },

    async insertSeat(seat: SeatRow): Promise<boolean> {
      const placeholders = SEAT_COLUMNS.map((_, index) => `$${index + 1}`).join(', ');
      const values = SEAT_COLUMNS.map(column => seat[column]);
      try {
        await db().query(
          `INSERT INTO seats (${SEAT_COLUMNS.join(', ')}) VALUES (${placeholders})`,
          values,
        );
        return true;
      } catch (error) {
        if (isDuplicate(error)) return false;
        throw error;
      }
    },

    async deleteSeat(code: string, seat: number): Promise<void> {
      await db().query('DELETE FROM seats WHERE room_code = $1 AND seat = $2', [
        code,
        seat,
      ]);
    },

    async deleteRoom(code: string): Promise<void> {
      const client = await db().connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM seats WHERE room_code = $1', [code]);
        await client.query('DELETE FROM rooms WHERE code = $1', [code]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async touchSeat(code: string, seat: number, lastSeen: string): Promise<void> {
      await db().query(
        'UPDATE seats SET last_seen = $1 WHERE room_code = $2 AND seat = $3',
        [lastSeen, code, seat],
      );
    },

    async setSignal(
      code: string,
      seat: number,
      kind: SignalKind,
      at: string,
    ): Promise<void> {
      await db().query(
        'UPDATE rooms SET signal_seat = $1, signal_kind = $2, signal_at = $3 WHERE code = $4',
        [seat, kind, at, code],
      );
    },

    async listWaitingRooms(size: number, limit: number): Promise<RoomRow[]> {
      const result = await db().query(
        `SELECT ${ROOM_COLUMNS.join(', ')} FROM rooms
         WHERE status = 'waiting' AND public_match = true AND size = $1
         ORDER BY created_at ASC LIMIT $2`,
        [size, limit],
      );
      return (result.rows as DbRow[]).map(normaliseRoom);
    },
  };
}
