import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HEARTBEAT_INTERVAL_MS,
  POLL_INTERVAL_MS,
  type RoomView,
} from '../../shared/protocol.ts';
import { VoidlinkApiError, apiRequest } from './api.ts';

export type LinkState = 'connecting' | 'live' | 'lost';

export interface RoomFeed {
  room: RoomView | null;
  error: VoidlinkApiError | null;
  link: LinkState;
  lastSync: number | null;
  applyRoom: (room: RoomView) => void;
  refresh: () => void;
}

/**
 * Polling is deliberately explicit: the game is turn-based, so a 1.4 second
 * authoritative poll is more robust than a socket that has to be reconnected
 * every time a phone locks its screen. Every action still returns the new
 * authoritative room immediately.
 */
export function useRoom(code: string | null, token: string | null, enabled: boolean): RoomFeed {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<VoidlinkApiError | null>(null);
  const [link, setLink] = useState<LinkState>('connecting');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (roomRef.current && roomRef.current.code !== code) {
      roomRef.current = null;
      setRoom(null);
      setError(null);
      setLink('connecting');
      setLastSync(null);
    }
  }, [code]);

  const applyRoom = useCallback((next: RoomView) => {
    const current = roomRef.current;
    // Signals share a version with the room; accepting equal versions keeps
    // the latest ping visible. Never let a slower request roll gameplay back.
    if (current && current.code === next.code && next.version < current.version) return;
    roomRef.current = next;
    setRoom(next);
  }, []);

  useEffect(() => {
    if (!code || !enabled) {
      refreshRef.current = () => undefined;
      return;
    }
    let disposed = false;
    let inFlight = false;
    let timer: number | undefined;
    let failures = 0;
    let fatal = false;
    let controller: AbortController | null = null;

    const schedule = () => {
      if (disposed || fatal) return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      const base = hidden ? 5_000 : POLL_INTERVAL_MS;
      const backoff = failures > 0 ? Math.min(8_000, 1_000 * 2 ** (failures - 1)) : 0;
      timer = window.setTimeout(() => void tick(), base + backoff);
    };

    const tick = async () => {
      if (inFlight || disposed) return;
      inFlight = true;
      window.clearTimeout(timer);
      controller = new AbortController();
      try {
        const next = await apiRequest<RoomView>(`/rooms/${code}`, {
          token,
          signal: controller.signal,
        });
        if (disposed) return;
        applyRoom(next);
        setError(null);
        setLink('live');
        setLastSync(Date.now());
        failures = 0;
      } catch (caught) {
        if (disposed || (caught instanceof VoidlinkApiError && caught.code === 'cancelled')) return;
        const apiError =
          caught instanceof VoidlinkApiError
            ? caught
            : new VoidlinkApiError('network', 'The relay is unreachable.', 0);
        setError(apiError);
        setLink('lost');
        failures += 1;
        if (apiError.code === 'room_not_found' || apiError.code === 'invalid_code') {
          fatal = true;
        }
      } finally {
        inFlight = false;
        if (!disposed) schedule();
      }
    };

    refreshRef.current = () => {
      if (!inFlight) void tick();
    };

    const onVisibility = () => {
      if (!document.hidden && !disposed) {
        window.clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    void tick();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      refreshRef.current = () => undefined;
    };
  }, [code, token, enabled, applyRoom]);

  useEffect(() => {
    if (!code || !token || !enabled) return;
    let disposed = false;
    const beat = async () => {
      try {
        await apiRequest<{ serverTime: string }>(`/rooms/${code}/heartbeat`, {
          method: 'POST',
          token,
        });
      } catch {
        // A missed heartbeat is reported by the rival's room view. It must not
        // interrupt the local player's game loop.
      }
    };
    void beat();
    const id = window.setInterval(() => {
      if (!disposed) void beat();
    }, HEARTBEAT_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [code, token, enabled]);

  const refresh = useCallback(() => refreshRef.current(), []);

  return { room, error, link, lastSync, applyRoom, refresh };
}
