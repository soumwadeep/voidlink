import {
  applyMove,
  createGame,
  isBoardSize,
  otherSide,
  type BoardSize,
  type Cell,
  type GameState,
  type Side,
} from './engine.ts';
import {
  FORFEIT_AFTER_MS,
  ONLINE_WINDOW_MS,
  REMATCH_VOTE_WINDOW_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SIGNAL_RATE_MS,
  isSignalKind,
  normaliseName,
  normaliseRoomCode,
  seatForSide,
  sideForSeat,
  type EnterRoomResponse,
  type RoomStatus,
  type RoomView,
  type SeatNumber,
  type SignalKind,
} from './protocol.ts';

/* ------------------------------------------------------------------ *
 * Storage contract
 *
 * The local server uses an in-memory implementation; the published Qoder
 * Function uses the same contract over the platform database. Keeping every
 * rule in this file means local play and live play execute identical logic.
 * ------------------------------------------------------------------ */

export interface RoomRow {
  code: string;
  size: number;
  board: string;
  turn: number;
  status: RoomStatus;
  winner: number | null;
  win_path: string;
  move_count: number;
  last_move: number | null;
  finish_reason: string | null;
  swapped: boolean;
  public_match: boolean;
  rematch: unknown;
  signal_seat: number | null;
  signal_kind: string | null;
  signal_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface SeatRow {
  room_code: string;
  seat: number;
  token_hash: string;
  name: string;
  last_seen: string;
  joined_at: string;
}

export interface RoomStore {
  insertRoom(room: RoomRow): Promise<boolean>;
  getRoom(code: string): Promise<RoomRow | null>;
  updateRoom(
    code: string,
    expectedVersion: number,
    patch: Partial<RoomRow>,
  ): Promise<RoomRow | null>;
  getSeats(code: string): Promise<SeatRow[]>;
  insertSeat(seat: SeatRow): Promise<boolean>;
  deleteSeat(code: string, seat: number): Promise<void>;
  deleteRoom(code: string): Promise<void>;
  touchSeat(code: string, seat: number, lastSeen: string): Promise<void>;
  setSignal(
    code: string,
    seat: number,
    kind: SignalKind,
    at: string,
  ): Promise<void>;
  listWaitingRooms(size: number, limit: number): Promise<RoomRow[]>;
}

export type ErrorCode =
  | 'invalid_request'
  | 'invalid_code'
  | 'invalid_name'
  | 'invalid_size'
  | 'room_not_found'
  | 'room_full'
  | 'not_seated'
  | 'game_not_active'
  | 'not_your_turn'
  | 'invalid_move'
  | 'swap_unavailable'
  | 'rematch_unavailable'
  | 'forfeit_unavailable'
  | 'rate_limited'
  | 'write_conflict'
  | 'server_error';

const ERROR_STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  invalid_code: 400,
  invalid_name: 400,
  invalid_size: 400,
  room_not_found: 404,
  room_full: 409,
  not_seated: 401,
  game_not_active: 409,
  not_your_turn: 409,
  invalid_move: 409,
  swap_unavailable: 409,
  rematch_unavailable: 409,
  forfeit_unavailable: 409,
  rate_limited: 429,
  write_conflict: 409,
  server_error: 500,
};

const ERROR_MESSAGE: Record<ErrorCode, string> = {
  invalid_request: 'That transmission could not be parsed.',
  invalid_code: 'Uplink codes are six characters.',
  invalid_name: 'Use 2–16 letters, numbers, spaces, or . _ -',
  invalid_size: 'Choose a 7×7 rapid lattice or a 9×9 classic lattice.',
  room_not_found: 'No duel answers to that uplink code.',
  room_full: 'This duel already has two operators. You can watch instead.',
  not_seated: 'You are observing this duel, not piloting it.',
  game_not_active: 'This duel is not active.',
  not_your_turn: 'The lattice is waiting on your rival.',
  invalid_move: 'That node cannot be claimed.',
  swap_unavailable: 'The swap window has closed.',
  rematch_unavailable: 'A rematch cannot start from this state.',
  forfeit_unavailable: 'The rival uplink is still live.',
  rate_limited: 'Wait a moment before signalling again.',
  write_conflict: 'The lattice shifted. Refresh and try again.',
  server_error: 'The relay hit an unexpected fault. Try again.',
};

export class GameError extends Error {
  code: ErrorCode;
  status: number;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGE[code]);
    this.name = 'GameError';
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}

export interface ServiceOptions {
  now?: () => Date;
  random?: () => number;
}

export interface GameService {
  createRoom(input: { size: unknown; name: unknown; publicMatch?: unknown }): Promise<EnterRoomResponse>;
  quickMatch(input: { size: unknown; name: unknown }): Promise<EnterRoomResponse>;
  joinRoom(code: string, input: { name: unknown }): Promise<EnterRoomResponse>;
  getRoom(code: string, token: string | null): Promise<RoomView>;
  move(code: string, token: string | null, cell: unknown): Promise<RoomView>;
  swap(code: string, token: string | null): Promise<RoomView>;
  resign(code: string, token: string | null): Promise<RoomView>;
  forfeit(code: string, token: string | null): Promise<RoomView>;
  requestRematch(code: string, token: string | null): Promise<RoomView>;
  heartbeat(code: string, token: string | null): Promise<{ serverTime: string }>;
  cancelRoom(code: string, token: string | null): Promise<{ cancelled: true }>;
  signal(code: string, token: string | null, kind: unknown): Promise<{ accepted: true }>;
}

const WAITING_ROOM_TTL_MS = 30 * 60_000;
const QUICK_MATCH_FRESH_MS = 2 * 60_000;
const REMATCH_WINDOW_MS = REMATCH_VOTE_WINDOW_MS;

function iso(date: Date): string {
  return date.toISOString();
}

function parseTime(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBoard(room: RoomRow): Cell[] {
  const size = room.size as BoardSize;
  const total = size * size;
  const parsed: Cell[] = Array.from({ length: total }, () => 0 as Cell);
  if (typeof room.board === 'string') {
    for (let i = 0; i < total && i < room.board.length; i += 1) {
      const digit = room.board.charCodeAt(i) - 48;
      if (digit === 0 || digit === 1 || digit === 2) parsed[i] = digit;
    }
  }
  return parsed;
}

function parseWinPath(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(',')
    .map(part => Number(part))
    .filter(part => Number.isInteger(part) && part >= 0);
}

function parseRematch(value: unknown): SeatNumber[] {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const votes: SeatNumber[] = [];
  for (const item of raw) {
    if (item === 1 || item === 2) votes.push(item);
  }
  return [...new Set(votes)].sort() as SeatNumber[];
}

function gameFromRow(room: RoomRow): GameState {
  const size = room.size as BoardSize;
  const game = createGame(size, room.turn === 2 ? 2 : 1);
  return {
    ...game,
    board: parseBoard(room),
    moveCount: room.move_count,
    status: 'active',
  };
}

function roomStatus(value: unknown): RoomStatus {
  return value === 'active' || value === 'finished' ? value : 'waiting';
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

export function makeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function isTokenFormat(value: string | null): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function makeCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)] ?? 'X';
  }
  return code;
}

function baseRoom(code: string, size: BoardSize, publicMatch: boolean, now: Date): RoomRow {
  return {
    code,
    size,
    board: '',
    turn: 1,
    status: 'waiting',
    winner: null,
    win_path: '',
    move_count: 0,
    last_move: null,
    finish_reason: null,
    swapped: false,
    public_match: publicMatch,
    rematch: '[]',
    signal_seat: null,
    signal_kind: null,
    signal_at: null,
    created_at: iso(now),
    updated_at: iso(now),
    version: 1,
  };
}

function baseSeat(
  code: string,
  seat: SeatNumber,
  tokenHash: string,
  name: string,
  now: Date,
): SeatRow {
  return {
    room_code: code,
    seat,
    token_hash: tokenHash,
    name,
    last_seen: iso(now),
    joined_at: iso(now),
  };
}

function viewOf(
  room: RoomRow,
  seats: SeatRow[],
  viewerSeat: SeatNumber | null,
  now: Date,
): RoomView {
  const size = isBoardSize(room.size) ? room.size : 7;
  const board = parseBoard({ ...room, size });
  const orderedSeats = [...seats].sort((a, b) => a.seat - b.seat);
  const seatViews = orderedSeats.map(seat => {
    const seatNumber: SeatNumber = seat.seat === 2 ? 2 : 1;
    const side = sideForSeat(seatNumber, room.swapped);
    const isYou = viewerSeat === seatNumber;
    const lastSeenMs = parseTime(seat.last_seen);
    const online = isYou || now.getTime() - lastSeenMs < ONLINE_WINDOW_MS;
    return {
      seat: seatNumber,
      name: seat.name,
      side,
      online,
      lastSeen: seat.last_seen,
      you: isYou,
    };
  });
  const rival = viewerSeat
    ? seatViews.find(seat => seat.seat !== viewerSeat) ?? null
    : null;
  const winnerSide =
    room.winner === 1 || room.winner === 2 ? (room.winner as Side) : null;
  const winnerSeat = winnerSide ? seatForSide(winnerSide, room.swapped) : null;
  const rematchVotes = parseRematch(room.rematch);
  const votesFresh = now.getTime() - parseTime(room.updated_at) < REMATCH_WINDOW_MS;
  const signalSeat =
    room.signal_seat === 1 || room.signal_seat === 2
      ? (room.signal_seat as SeatNumber)
      : null;
  const lastSignal =
    signalSeat && room.signal_kind && room.signal_at && isSignalKind(room.signal_kind)
      ? {
          seat: signalSeat,
          side: sideForSeat(signalSeat, room.swapped),
          kind: room.signal_kind,
          at: room.signal_at,
        }
      : null;
  const canClaimForfeit =
    Boolean(viewerSeat) &&
    room.status === 'active' &&
    Boolean(rival) &&
    !rival!.online &&
    now.getTime() - parseTime(rival!.lastSeen) >= FORFEIT_AFTER_MS;

  return {
    code: room.code,
    size,
    board,
    turn: room.turn === 2 ? 2 : 1,
    turnSeat:
      room.status === 'active' ? seatForSide(room.turn === 2 ? 2 : 1, room.swapped) : null,
    status: roomStatus(room.status),
    winnerSide,
    winnerSeat,
    winPath: parseWinPath(room.win_path),
    moveCount: room.move_count,
    lastMove:
      typeof room.last_move === 'number' && room.last_move >= 0 && room.last_move < size * size
        ? room.last_move
        : null,
    finishReason:
      room.finish_reason === 'link' ||
      room.finish_reason === 'resign' ||
      room.finish_reason === 'forfeit' ||
      room.finish_reason === 'draw'
        ? room.finish_reason
        : null,
    swapAvailable:
      room.status === 'active' && room.move_count === 1 && !room.swapped,
    swapped: room.swapped,
    publicMatch: room.public_match,
    rematchVotes: room.status === 'finished' && votesFresh ? rematchVotes : [],
    rematchWindowOpen: room.status === 'finished' && votesFresh,
    seats: seatViews,
    lastSignal,
    createdAt: room.created_at,
    updatedAt: room.updated_at,
    serverTime: iso(now),
    version: room.version,
    you: viewerSeat
      ? { seat: viewerSeat, side: sideForSeat(viewerSeat, room.swapped) }
      : null,
    spectator: viewerSeat === null,
    canClaimForfeit,
    forfeitAfterMs: FORFEIT_AFTER_MS,
  };
}

export function createGameService(
  store: RoomStore,
  options: ServiceOptions = {},
): GameService {
  const clock = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;

  async function findSeat(
    code: string,
    token: string | null,
  ): Promise<{ room: RoomRow; seats: SeatRow[]; seat: SeatRow | null }> {
    const normalised = normaliseRoomCode(code);
    if (!normalised) throw new GameError('invalid_code');
    const room = await store.getRoom(normalised);
    if (!room) throw new GameError('room_not_found');
    const seats = await store.getSeats(normalised);
    if (!isTokenFormat(token)) return { room, seats, seat: null };
    const digest = await hashToken(token);
    let matched: SeatRow | null = null;
    for (const seat of seats) {
      if (constantTimeEqual(seat.token_hash, digest)) matched = seat;
    }
    return { room, seats, seat: matched };
  }

  async function currentView(
    code: string,
    viewerSeat: SeatNumber | null,
  ): Promise<RoomView> {
    const room = await store.getRoom(code);
    if (!room) throw new GameError('room_not_found');
    const seats = await store.getSeats(code);
    return viewOf(room, seats, viewerSeat, clock());
  }

  async function safeTouch(code: string, seat: number, now: Date): Promise<void> {
    try {
      await store.touchSeat(code, seat, iso(now));
    } catch {
      // Presence is best-effort; a move must not fail because a heartbeat did.
    }
  }

  async function create(input: {
    size: unknown;
    name: unknown;
    publicMatch: boolean;
  }): Promise<EnterRoomResponse> {
    if (!isBoardSize(input.size)) throw new GameError('invalid_size');
    const name = normaliseName(input.name);
    if (!name) throw new GameError('invalid_name');
    const now = clock();
    const token = makeToken();
    const tokenHash = await hashToken(token);

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const code = makeCode(random);
      const room = baseRoom(code, input.size, input.publicMatch, now);
      const inserted = await store.insertRoom(room);
      if (!inserted) continue;
      const seat = baseSeat(code, 1, tokenHash, name, now);
      let seated = false;
      try {
        seated = await store.insertSeat(seat);
      } catch (error) {
        try {
          await store.deleteRoom(code);
        } catch {
          // The orphaned room is harmless: it has no seat and cannot be joined
          // as an active duel. Do not mask the original failure.
        }
        throw error;
      }
      if (!seated) {
        try {
          await store.deleteRoom(code);
        } catch {
          // Best effort cleanup before retrying a fresh code.
        }
        continue;
      }
      return {
        token,
        seat: 1,
        room: viewOf(room, [seat], 1, now),
      };
    }
    throw new GameError('server_error');
  }

  async function join(codeInput: string, nameInput: unknown): Promise<EnterRoomResponse> {
    const code = normaliseRoomCode(codeInput);
    if (!code) throw new GameError('invalid_code');
    const name = normaliseName(nameInput);
    if (!name) throw new GameError('invalid_name');
    const room = await store.getRoom(code);
    if (!room) throw new GameError('room_not_found');
    if (room.status !== 'waiting') throw new GameError('room_full');
    const existing = await store.getSeats(code);
    if (existing.some(seat => seat.seat === 2)) throw new GameError('room_full');

    const now = clock();
    const token = makeToken();
    const tokenHash = await hashToken(token);
    const seat = baseSeat(code, 2, tokenHash, name, now);
    const inserted = await store.insertSeat(seat);
    if (!inserted) throw new GameError('room_full');

    const updated = await store.updateRoom(code, room.version, {
      status: 'active',
      updated_at: iso(now),
      version: room.version + 1,
    });
    if (!updated) {
      const latest = await store.getRoom(code);
      if (latest?.status === 'active') {
        const seats = await store.getSeats(code);
        return { token, seat: 2, room: viewOf(latest, seats, 2, now) };
      }
      // The seat insert succeeded but activation failed. Release the seat so a
      // later attempt can join instead of leaving a ghost seat in a waiting room.
      try {
        await store.deleteSeat(code, 2);
      } catch {
        // Keep the original conflict; a failed cleanup must not hide it.
      }
      throw new GameError('write_conflict');
    }
    const seats = await store.getSeats(code);
    return { token, seat: 2, room: viewOf(updated, seats, 2, now) };
  }

  async function quickMatch(input: { size: unknown; name: unknown }): Promise<EnterRoomResponse> {
    if (!isBoardSize(input.size)) throw new GameError('invalid_size');
    const name = normaliseName(input.name);
    if (!name) throw new GameError('invalid_name');
    const now = clock();
    const candidates = await store.listWaitingRooms(input.size, 12);

    for (const room of candidates) {
      if (now.getTime() - parseTime(room.created_at) > WAITING_ROOM_TTL_MS) continue;
      const seats = await store.getSeats(room.code);
      if (seats.some(seat => seat.seat === 2)) continue;
      const host = seats.find(seat => seat.seat === 1);
      if (!host || now.getTime() - parseTime(host.last_seen) > QUICK_MATCH_FRESH_MS) continue;
      try {
        return await join(room.code, name);
      } catch (error) {
        if (error instanceof GameError && (error.code === 'room_full' || error.code === 'room_not_found')) {
          continue;
        }
        throw error;
      }
    }
    return create({ size: input.size, name, publicMatch: true });
  }

  async function getRoom(codeInput: string, token: string | null): Promise<RoomView> {
    const { room, seats, seat } = await findSeat(codeInput, token);
    return viewOf(room, seats, seat ? (seat.seat === 2 ? 2 : 1) : null, clock());
  }

  async function move(
    codeInput: string,
    token: string | null,
    cellInput: unknown,
  ): Promise<RoomView> {
    const { room, seat } = await findSeat(codeInput, token);
    if (!seat) throw new GameError('not_seated');
    const viewerSeat = seat.seat === 2 ? 2 : 1;
    if (room.status !== 'active') throw new GameError('game_not_active');
    if (typeof cellInput !== 'number' || !Number.isInteger(cellInput)) {
      throw new GameError('invalid_move');
    }
    const mySide = sideForSeat(viewerSeat, room.swapped);
    if (room.turn !== mySide) throw new GameError('not_your_turn');

    const game = gameFromRow(room);
    const result = applyMove(game, cellInput);
    if (!result.ok) throw new GameError('invalid_move');
    const now = clock();
    const next = result.state;
    const patch: Partial<RoomRow> = {
      board: next.board.join(''),
      turn: next.turn,
      status: next.status === 'active' ? 'active' : 'finished',
      winner: next.status === 'won' ? next.winner : null,
      win_path: next.winPath.join(','),
      move_count: next.moveCount,
      last_move: cellInput,
      finish_reason: next.status === 'won' ? 'link' : next.status === 'drawn' ? 'draw' : null,
      swapped: room.swapped,
      rematch: '[]',
      signal_seat: null,
      signal_kind: null,
      signal_at: null,
      updated_at: iso(now),
      version: room.version + 1,
    };
    const updated = await store.updateRoom(room.code, room.version, patch);
    if (!updated) {
      const latest = await store.getRoom(room.code);
      if (
        latest &&
        latest.move_count === room.move_count + 1 &&
        latest.board[cellInput] === String(mySide)
      ) {
        const seats = await store.getSeats(room.code);
        return viewOf(latest, seats, viewerSeat, now);
      }
      throw new GameError('write_conflict');
    }
    await safeTouch(room.code, viewerSeat, now);
    const seats = await store.getSeats(room.code);
    return viewOf(updated, seats, viewerSeat, now);
  }

  async function swap(codeInput: string, token: string | null): Promise<RoomView> {
    const { room, seat } = await findSeat(codeInput, token);
    if (!seat) throw new GameError('not_seated');
    const viewerSeat = seat.seat === 2 ? 2 : 1;
    if (viewerSeat !== 2) throw new GameError('swap_unavailable');
    if (room.status !== 'active') throw new GameError('game_not_active');
    if (room.move_count !== 1 || room.swapped) throw new GameError('swap_unavailable');
    const now = clock();
    const updated = await store.updateRoom(room.code, room.version, {
      swapped: true,
      updated_at: iso(now),
      version: room.version + 1,
    });
    if (!updated) {
      const latest = await store.getRoom(room.code);
      if (latest?.swapped) {
        const seats = await store.getSeats(room.code);
        return viewOf(latest, seats, viewerSeat, now);
      }
      throw new GameError('write_conflict');
    }
    await safeTouch(room.code, viewerSeat, now);
    const seats = await store.getSeats(room.code);
    return viewOf(updated, seats, viewerSeat, now);
  }

  async function finishByForfeit(
    room: RoomRow,
    viewerSeat: SeatNumber,
    reason: 'resign' | 'forfeit',
  ): Promise<RoomView> {
    const now = clock();
    const mySide = sideForSeat(viewerSeat, room.swapped);
    const winner = reason === 'resign' ? otherSide(mySide) : mySide;
    const updated = await store.updateRoom(room.code, room.version, {
      status: 'finished',
      winner,
      win_path: '',
      finish_reason: reason,
      move_count: room.move_count,
      rematch: '[]',
      updated_at: iso(now),
      version: room.version + 1,
    });
    if (!updated) {
      const latest = await store.getRoom(room.code);
      if (latest?.status === 'finished') {
        const seats = await store.getSeats(room.code);
        return viewOf(latest, seats, viewerSeat, now);
      }
      throw new GameError('write_conflict');
    }
    await safeTouch(room.code, viewerSeat, now);
    const seats = await store.getSeats(room.code);
    return viewOf(updated, seats, viewerSeat, now);
  }

  async function resign(codeInput: string, token: string | null): Promise<RoomView> {
    const { room, seat } = await findSeat(codeInput, token);
    if (!seat) throw new GameError('not_seated');
    const viewerSeat = seat.seat === 2 ? 2 : 1;
    if (room.status !== 'active') throw new GameError('game_not_active');
    return finishByForfeit(room, viewerSeat, 'resign');
  }

  async function forfeit(codeInput: string, token: string | null): Promise<RoomView> {
    const { room, seats, seat } = await findSeat(codeInput, token);
    if (!seat) throw new GameError('not_seated');
    const viewerSeat = seat.seat === 2 ? 2 : 1;
    if (room.status !== 'active') throw new GameError('game_not_active');
    const rival = seats.find(candidate => candidate.seat !== seat.seat);
    if (!rival) throw new GameError('forfeit_unavailable');
    const now = clock();
    if (now.getTime() - parseTime(rival.last_seen) < FORFEIT_AFTER_MS) {
      throw new GameError('forfeit_unavailable');
    }
    return finishByForfeit(room, viewerSeat, 'forfeit');
  }

  async function requestRematch(
    codeInput: string,
    token: string | null,
  ): Promise<RoomView> {
    const { room, seat } = await findSeat(codeInput, token);
    if (!seat) throw new GameError('not_seated');
    const viewerSeat = seat.seat === 2 ? 2 : 1;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = attempt === 0 ? room : await store.getRoom(room.code);
      if (!current) throw new GameError('room_not_found');
      if (current.status !== 'finished') throw new GameError('rematch_unavailable');
      const now = clock();
      const fresh =
        now.getTime() - parseTime(current.updated_at) < REMATCH_WINDOW_MS;
      const votes = fresh ? parseRematch(current.rematch) : [];
      if (votes.includes(viewerSeat)) {
        return currentView(current.code, viewerSeat);
      }
      votes.push(viewerSeat);
      votes.sort();
      const bothSeated = (await store.getSeats(current.code)).length >= 2;
      const reset = votes.length >= 2 && bothSeated;
      const patch: Partial<RoomRow> = reset
        ? {
            board: '',
            turn: 1,
            status: 'active',
            winner: null,
            win_path: '',
            move_count: 0,
            last_move: null,
            finish_reason: null,
            swapped: false,
            rematch: '[]',
            signal_seat: null,
            signal_kind: null,
            signal_at: null,
            updated_at: iso(now),
            version: current.version + 1,
          }
        : {
            rematch: JSON.stringify(votes),
            updated_at: iso(now),
            version: current.version + 1,
          };
      const updated = await store.updateRoom(current.code, current.version, patch);
      if (updated) {
        await safeTouch(current.code, viewerSeat, now);
        const seats = await store.getSeats(current.code);
        return viewOf(updated, seats, viewerSeat, now);
      }
      // Someone changed the room first (usually the other rematch vote). Retry
      // with fresh state so both votes can be counted.
    }
    throw new GameError('write_conflict');
  }

  async function cancelRoom(
    codeInput: string,
    token: string | null,
  ): Promise<{ cancelled: true }> {
    const { room, seat } = await findSeat(codeInput, token);
    if (!seat) throw new GameError('not_seated');
    if (room.status !== 'waiting') throw new GameError('game_not_active');
    await store.deleteRoom(room.code);
    return { cancelled: true };
  }

  async function heartbeat(
    codeInput: string,
    token: string | null,
  ): Promise<{ serverTime: string }> {
    const { room, seat } = await findSeat(codeInput, token);
    if (!seat) throw new GameError('not_seated');
    const now = clock();
    await store.touchSeat(room.code, seat.seat, iso(now));
    return { serverTime: iso(now) };
  }

  async function signal(
    codeInput: string,
    token: string | null,
    kind: unknown,
  ): Promise<{ accepted: true }> {
    const { room, seat } = await findSeat(codeInput, token);
    if (!seat) throw new GameError('not_seated');
    if (!isSignalKind(kind)) throw new GameError('invalid_request');
    if (room.status !== 'active' && room.status !== 'finished') {
      throw new GameError('game_not_active');
    }
    const now = clock();
    if (now.getTime() - parseTime(room.signal_at) < SIGNAL_RATE_MS) {
      throw new GameError('rate_limited');
    }
    await store.setSignal(room.code, seat.seat, kind, iso(now));
    await safeTouch(room.code, seat.seat, now);
    return { accepted: true };
  }

  return {
    createRoom: input =>
      create({ size: input.size, name: input.name, publicMatch: input.publicMatch === true }),
    quickMatch,
    joinRoom: (code, input) => join(code, input.name),
    getRoom,
    move,
    swap,
    resign,
    forfeit,
    requestRematch,
    heartbeat,
    cancelRoom,
    signal,
  };
}

export { ERROR_MESSAGE };
