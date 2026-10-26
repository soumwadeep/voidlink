import type { BoardSize, Side } from './engine';

export const API_BASE = '/api';
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const MAX_NAME_LENGTH = 16;
export const MAX_BODY_BYTES = 8 * 1024;
export const POLL_INTERVAL_MS = 1_400;
export const HEARTBEAT_INTERVAL_MS = 8_000;
export const ONLINE_WINDOW_MS = 26_000;
export const FORFEIT_AFTER_MS = 80_000;
export const REMATCH_VOTE_WINDOW_MS = 5 * 60_000;
export const SIGNAL_RATE_MS = 2_500;
export const SIGNALS = ['gg', 'nice', 'focus', 'gl'] as const;

export type SignalKind = (typeof SIGNALS)[number];
export type RoomStatus = 'waiting' | 'active' | 'finished';
export type SeatNumber = 1 | 2;
export type FinishReason = 'link' | 'resign' | 'forfeit' | 'draw';

export interface SeatView {
  seat: SeatNumber;
  name: string;
  side: Side;
  online: boolean;
  lastSeen: string;
  you: boolean;
}

export interface SignalView {
  seat: SeatNumber;
  side: Side;
  kind: SignalKind;
  at: string;
}

export interface RoomView {
  code: string;
  size: BoardSize;
  board: number[];
  turn: Side;
  turnSeat: SeatNumber | null;
  status: RoomStatus;
  winnerSide: Side | null;
  winnerSeat: SeatNumber | null;
  winPath: number[];
  moveCount: number;
  lastMove: number | null;
  finishReason: FinishReason | null;
  swapAvailable: boolean;
  swapped: boolean;
  publicMatch: boolean;
  rematchVotes: SeatNumber[];
  rematchWindowOpen: boolean;
  seats: SeatView[];
  lastSignal: SignalView | null;
  createdAt: string;
  updatedAt: string;
  serverTime: string;
  version: number;
  you: { seat: SeatNumber; side: Side } | null;
  spectator: boolean;
  canClaimForfeit: boolean;
  forfeitAfterMs: number;
}

export interface EnterRoomResponse {
  token: string;
  seat: SeatNumber;
  room: RoomView;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResult<T> = { ok: true; data: T } | ApiErrorBody;

export interface SignalDefinition {
  kind: SignalKind;
  label: string;
  glyph: string;
}

export const SIGNAL_DEFINITIONS: readonly SignalDefinition[] = [
  { kind: 'gg', label: 'Good game', glyph: '◇' },
  { kind: 'nice', label: 'Fine move', glyph: '✦' },
  { kind: 'focus', label: 'Watch this', glyph: '◉' },
  { kind: 'gl', label: 'Good luck', glyph: '⌁' },
];

export const CALLSIGN_PREFIXES = [
  'VANTA',
  'NOVA',
  'ECHO',
  'KITE',
  'ARCA',
  'HELIX',
  'ONYX',
  'QUARTZ',
  'VECTOR',
  'ORBIT',
  'CIPHER',
  'PULSE',
  'NOMAD',
  'ZERO',
  'AURORA',
  'SHAW',
  'KESTREL',
  'HALO',
] as const;

export function normaliseRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toUpperCase().replace(/[\s-]/g, '');
  return ROOM_CODE_PATTERN.test(cleaned) ? cleaned : null;
}

/**
 * Callsigns are display-only. Strip markup and control characters, collapse
 * whitespace, and bound the length. Unicode letters and digits are welcome.
 */
export function normaliseName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}<>&"'`\\]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (cleaned.length < 2) return null;
  if (!/^[\p{L}\p{N} ._-]+$/u.test(cleaned)) return null;
  return cleaned;
}

export function generateCallsign(random: () => number = Math.random): string {
  const prefix = CALLSIGN_PREFIXES[Math.floor(random() * CALLSIGN_PREFIXES.length)] ?? 'VANTA';
  const number = Math.floor(random() * 90) + 10;
  return `${prefix}-${number}`;
}

export function isSignalKind(value: unknown): value is SignalKind {
  return typeof value === 'string' && (SIGNALS as readonly string[]).includes(value);
}

export function oppositeSeat(seat: SeatNumber): SeatNumber {
  return seat === 1 ? 2 : 1;
}

export function sideForSeat(seat: SeatNumber, swapped: boolean): Side {
  if (seat === 1) return swapped ? 2 : 1;
  return swapped ? 1 : 2;
}

export function seatForSide(side: Side, swapped: boolean): SeatNumber {
  if (side === 1) return swapped ? 2 : 1;
  return swapped ? 1 : 2;
}
