import {
  generateCallsign,
  normaliseName,
  type SeatNumber,
} from '../../shared/protocol.ts';

const CALLSIGN_KEY = 'voidlink.callsign.v1';
const SESSION_PREFIX = 'voidlink.session.v1.';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function pickStorage(): StorageLike {
  try {
    const probe = '__voidlink_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return window.sessionStorage;
  }
}

const storage = typeof window === 'undefined' ? null : pickStorage();

export interface RoomSession {
  token: string;
  seat: SeatNumber;
}

export function loadCallsign(): string {
  if (!storage) return generateCallsign();
  const saved = normaliseName(storage.getItem(CALLSIGN_KEY));
  if (saved) return saved;
  const fresh = generateCallsign();
  try {
    storage.setItem(CALLSIGN_KEY, fresh);
  } catch {
    // Storage can be available for reads but full for writes; keep the value
    // in memory for this session instead of failing the launch.
  }
  return fresh;
}

export function saveCallsign(value: string): string {
  const clean = normaliseName(value) ?? loadCallsign();
  try {
    storage?.setItem(CALLSIGN_KEY, clean);
  } catch {
    // Ignore a full or disabled store.
  }
  return clean;
}

export function loadSession(code: string): RoomSession | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${SESSION_PREFIX}${code}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoomSession>;
    if (
      typeof parsed.token !== 'string' ||
      !/^[0-9a-f]{64}$/.test(parsed.token) ||
      (parsed.seat !== 1 && parsed.seat !== 2)
    ) {
      return null;
    }
    return { token: parsed.token, seat: parsed.seat };
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: RoomSession): void {
  try {
    storage?.setItem(`${SESSION_PREFIX}${code}`, JSON.stringify(session));
  } catch {
    // A private-mode quota failure should not break the match that just began.
  }
}

export function clearSession(code: string): void {
  try {
    storage?.removeItem(`${SESSION_PREFIX}${code}`);
  } catch {
    // Ignore storage failures.
  }
}
