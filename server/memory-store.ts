import type {
  RoomRow,
  RoomStore,
  SeatRow,
} from '../shared/service.ts';
import type { SignalKind } from '../shared/protocol.ts';

function cloneRoom(row: RoomRow): RoomRow {
  return { ...row };
}

function cloneSeat(row: SeatRow): SeatRow {
  return { ...row };
}

/**
 * In-memory implementation of the same contract the published Function uses.
 * It is intentionally strict about version checks and seat uniqueness so the
 * local game exercises the same concurrency behaviour as production.
 */
export class MemoryStore implements RoomStore {
  private rooms = new Map<string, RoomRow>();
  private seats = new Map<string, SeatRow>();

  async insertRoom(room: RoomRow): Promise<boolean> {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, cloneRoom(room));
    return true;
  }

  async getRoom(code: string): Promise<RoomRow | null> {
    const found = this.rooms.get(code);
    return found ? cloneRoom(found) : null;
  }

  async updateRoom(
    code: string,
    expectedVersion: number,
    patch: Partial<RoomRow>,
  ): Promise<RoomRow | null> {
    const current = this.rooms.get(code);
    if (!current || current.version !== expectedVersion) return null;
    const next: RoomRow = { ...current, ...patch, code: current.code };
    this.rooms.set(code, next);
    return cloneRoom(next);
  }

  async getSeats(code: string): Promise<SeatRow[]> {
    const rows: SeatRow[] = [];
    for (const seat of this.seats.values()) {
      if (seat.room_code === code) rows.push(cloneSeat(seat));
    }
    rows.sort((a, b) => a.seat - b.seat);
    return rows;
  }

  async insertSeat(seat: SeatRow): Promise<boolean> {
    const key = `${seat.room_code}:${seat.seat}`;
    if (this.seats.has(key)) return false;
    for (const existing of this.seats.values()) {
      if (existing.token_hash === seat.token_hash) return false;
    }
    this.seats.set(key, cloneSeat(seat));
    return true;
  }

  async deleteSeat(code: string, seat: number): Promise<void> {
    this.seats.delete(`${code}:${seat}`);
  }

  async deleteRoom(code: string): Promise<void> {
    this.rooms.delete(code);
    for (const [key, seat] of this.seats) {
      if (seat.room_code === code) this.seats.delete(key);
    }
  }

  async touchSeat(code: string, seat: number, lastSeen: string): Promise<void> {
    const key = `${code}:${seat}`;
    const found = this.seats.get(key);
    if (found) found.last_seen = lastSeen;
  }

  async setSignal(
    code: string,
    seat: number,
    kind: SignalKind,
    at: string,
  ): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) return;
    room.signal_seat = seat;
    room.signal_kind = kind;
    room.signal_at = at;
  }

  async listWaitingRooms(size: number, limit: number): Promise<RoomRow[]> {
    const rooms: RoomRow[] = [];
    for (const room of this.rooms.values()) {
      if (room.status === 'waiting' && room.public_match && room.size === size) {
        rooms.push(cloneRoom(room));
      }
    }
    rooms.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return rooms.slice(0, limit);
  }

  /** Test helper. */
  reset(): void {
    this.rooms.clear();
    this.seats.clear();
  }
}
