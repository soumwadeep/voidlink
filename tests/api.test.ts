import { beforeEach, describe, expect, it } from 'vitest';
import { createApiHandler } from '../shared/api';
import { createGameService } from '../shared/service';
import { MemoryStore } from '../server/memory-store';
import { cellIndex } from '../shared/engine';

interface Harness {
  store: MemoryStore;
  request: (
    method: string,
    path: string,
    options?: { token?: string; body?: unknown },
  ) => Promise<{ status: number; json: any }>;
  advance: (ms: number) => void;
  now: () => number;
}

function createHarness(seed = 12345): Harness {
  const store = new MemoryStore();
  let nowMs = Date.parse('2026-10-26T10:00:00.000Z');
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const service = createGameService(store, {
    now: () => new Date(nowMs),
    random,
  });
  const handler = createApiHandler(service);

  async function request(
    method: string,
    path: string,
    options: { token?: string; body?: unknown } = {},
  ) {
    const headers = new Headers();
    if (options.token) headers.set('authorization', `Bearer ${options.token}`);
    let body: string | undefined;
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(options.body);
    }
    const response = await handler(
      new Request(`http://127.0.0.1${path}`, {
        method,
        headers,
        body,
      }),
    );
    return { status: response.status, json: await response.json() };
  }

  return {
    store,
    request,
    advance: ms => {
      nowMs += ms;
    },
    now: () => nowMs,
  };
}

async function createRoom(harness: Harness, size: 7 | 9 = 7, name = 'VANTA-07') {
  const response = await harness.request('POST', '/api/rooms', {
    body: { size, name },
  });
  expect(response.status).toBe(201);
  return response.json.data as { token: string; seat: 1; room: any };
}

async function joinRoom(harness: Harness, code: string, name = 'ECHO-42') {
  const response = await harness.request('POST', `/api/rooms/${code}/join`, {
    body: { name },
  });
  return response;
}

describe('VOIDLINK relay', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness();
  });

  it('reports a healthy relay without touching a room', async () => {
    const response = await h.request('GET', '/api/health');
    expect(response.status).toBe(200);
    expect(response.json.data.status).toBe('stable');
  });

  it('creates, reads and joins a room with separate tokens', async () => {
    const host = await createRoom(h);
    expect(host.room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(host.seat).toBe(1);
    expect(host.token).toMatch(/^[0-9a-f]{64}$/);
    expect(host.room.status).toBe('waiting');
    expect(host.room.spectator).toBe(false);
    expect(host.room.you).toEqual({ seat: 1, side: 1 });

    const lobby = await h.request('GET', `/api/rooms/${host.room.code}`, { token: host.token });
    expect(lobby.status).toBe(200);
    expect(lobby.json.data.seats).toHaveLength(1);

    const guestResponse = await joinRoom(h, host.room.code);
    expect(guestResponse.status).toBe(201);
    const guest = guestResponse.json.data;
    expect(guest.seat).toBe(2);
    expect(guest.token).not.toBe(host.token);
    expect(guest.room.status).toBe('active');
    expect(guest.room.turnSeat).toBe(1);
    expect(guest.room.seats).toHaveLength(2);

    const watcher = await h.request('GET', `/api/rooms/${host.room.code}`);
    expect(watcher.status).toBe(200);
    expect(watcher.json.data.spectator).toBe(true);
    expect(watcher.json.data.you).toBeNull();

    const full = await joinRoom(h, host.room.code, 'LATE-99');
    expect(full.status).toBe(409);
    expect(full.json.error.code).toBe('room_full');
  });

  it('rejects bad input safely', async () => {
    expect((await h.request('POST', '/api/rooms', { body: { size: 8, name: 'ACE' } })).json.error.code).toBe('invalid_size');
    expect((await h.request('POST', '/api/rooms', { body: { size: 7, name: '<' } })).json.error.code).toBe('invalid_name');
    expect((await h.request('POST', '/api/rooms/ZZZZZZ/join', { body: { name: 'ACE' } })).status).toBe(404);
    expect((await h.request('GET', '/api/rooms/BAD')).json.error.code).toBe('invalid_code');
    expect((await h.request('GET', '/api/health')).status).toBe(200);
    expect((await h.request('DELETE', '/api/health')).status).toBe(405);
    expect((await h.request('GET', '/api/rooms')).status).toBe(405);
  });

  it('rejects malformed or missing tokens for moves', async () => {
    const host = await createRoom(h);
    const guest = (await joinRoom(h, host.room.code)).json.data;
    const noToken = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
      body: { cell: 24 },
    });
    expect(noToken.status).toBe(401);
    const badToken = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
      token: 'f'.repeat(64),
      body: { cell: 24 },
    });
    expect(badToken.status).toBe(401);
    const notYourTurn = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
      token: guest.token,
      body: { cell: 24 },
    });
    expect(notYourTurn.status).toBe(409);
    expect(notYourTurn.json.error.code).toBe('not_your_turn');
  });

  it('enforces turn order and applies the swap protocol', async () => {
    const host = await createRoom(h);
    const guest = (await joinRoom(h, host.room.code)).json.data;

    const earlySwap = await h.request('POST', `/api/rooms/${host.room.code}/swap`, {
      token: guest.token,
    });
    expect(earlySwap.status).toBe(409);

    const first = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
      token: host.token,
      body: { cell: cellIndex(7, 3, 3) },
    });
    expect(first.status).toBe(200);
    expect(first.json.data.turn).toBe(2);
    expect(first.json.data.turnSeat).toBe(2);
    expect(first.json.data.swapAvailable).toBe(true);

    const swapped = await h.request('POST', `/api/rooms/${host.room.code}/swap`, {
      token: guest.token,
    });
    expect(swapped.status).toBe(200);
    expect(swapped.json.data.swapped).toBe(true);
    expect(swapped.json.data.swapAvailable).toBe(false);
    expect(swapped.json.data.turn).toBe(2);
    expect(swapped.json.data.turnSeat).toBe(1);
    expect(swapped.json.data.you.side).toBe(1);

    const guestTries = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
      token: guest.token,
      body: { cell: cellIndex(7, 2, 3) },
    });
    expect(guestTries.status).toBe(409);
    expect(guestTries.json.error.code).toBe('not_your_turn');

    const hostMove = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
      token: host.token,
      body: { cell: cellIndex(7, 2, 3) },
    });
    expect(hostMove.status).toBe(200);
    expect(hostMove.json.data.turnSeat).toBe(2);
    expect(hostMove.json.data.seats.find((s: any) => s.seat === 1).side).toBe(2);

    const closeSwap = await h.request('POST', `/api/rooms/${host.room.code}/swap`, {
      token: guest.token,
    });
    expect(closeSwap.status).toBe(409);
  });

  it('detects a winning chain and exposes it to both operators and watchers', async () => {
    const host = await createRoom(h);
    const guest = (await joinRoom(h, host.room.code)).json.data;

    for (let y = 0; y < 6; y += 1) {
      const cyan = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
        token: host.token,
        body: { cell: cellIndex(7, 0, y) },
      });
      expect(cyan.status).toBe(200);
      const magenta = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
        token: guest.token,
        body: { cell: cellIndex(7, 6, y) },
      });
      expect(magenta.status).toBe(200);
    }

    const winning = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
      token: host.token,
      body: { cell: cellIndex(7, 0, 6) },
    });
    expect(winning.status).toBe(200);
    const view = winning.json.data;
    expect(view.status).toBe('finished');
    expect(view.winnerSide).toBe(1);
    expect(view.winnerSeat).toBe(1);
    expect(view.winPath).toHaveLength(7);
    expect(view.turnSeat).toBeNull();
    expect(view.swapAvailable).toBe(false);

    const extra = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
      token: guest.token,
      body: { cell: cellIndex(7, 5, 5) },
    });
    expect(extra.status).toBe(409);
    expect(extra.json.error.code).toBe('game_not_active');

    const watcher = await h.request('GET', `/api/rooms/${host.room.code}`);
    expect(watcher.json.data.spectator).toBe(true);
    expect(watcher.json.data.winnerSeat).toBe(1);
    expect(watcher.json.data.winPath).toEqual(view.winPath);
  });

  it('carries both rematch votes and resets the lattice', async () => {
    const host = await createRoom(h);
    const guest = (await joinRoom(h, host.room.code)).json.data;
    await h.request('POST', `/api/rooms/${host.room.code}/resign`, { token: guest.token });

    const hostVote = await h.request('POST', `/api/rooms/${host.room.code}/rematch`, {
      token: host.token,
    });
    expect(hostVote.status).toBe(200);
    expect(hostVote.json.data.rematchVotes).toEqual([1]);
    expect(hostVote.json.data.status).toBe('finished');

    const hostAgain = await h.request('POST', `/api/rooms/${host.room.code}/rematch`, {
      token: host.token,
    });
    expect(hostAgain.status).toBe(200);
    expect(hostAgain.json.data.rematchVotes).toEqual([1]);

    const guestVote = await h.request('POST', `/api/rooms/${host.room.code}/rematch`, {
      token: guest.token,
    });
    expect(guestVote.status).toBe(200);
    expect(guestVote.json.data.status).toBe('active');
    expect(guestVote.json.data.board.every((cell: number) => cell === 0)).toBe(true);
    expect(guestVote.json.data.moveCount).toBe(0);
    expect(guestVote.json.data.swapped).toBe(false);
    expect(guestVote.json.data.rematchVotes).toEqual([]);
  });

  it('resolves a resignation for the remaining operator', async () => {
    const host = await createRoom(h);
    const guest = (await joinRoom(h, host.room.code)).json.data;
    const response = await h.request('POST', `/api/rooms/${host.room.code}/resign`, {
      token: guest.token,
    });
    expect(response.status).toBe(200);
    expect(response.json.data.status).toBe('finished');
    expect(response.json.data.winnerSeat).toBe(1);
    expect(response.json.data.winnerSide).toBe(1);
  });

  it('allows a disconnect forfeit only after the grace window', async () => {
    const host = await createRoom(h);
    await joinRoom(h, host.room.code);
    const tooSoon = await h.request('POST', `/api/rooms/${host.room.code}/forfeit`, {
      token: host.token,
    });
    expect(tooSoon.status).toBe(409);
    expect(tooSoon.json.error.code).toBe('forfeit_unavailable');

    h.advance(81_000);
    const expired = await h.request('POST', `/api/rooms/${host.room.code}/forfeit`, {
      token: host.token,
    });
    expect(expired.status).toBe(200);
    expect(expired.json.data.status).toBe('finished');
    expect(expired.json.data.winnerSeat).toBe(1);
    expect(expired.json.data.canClaimForfeit).toBe(false);

    h.advance(5_000);
    const watcher = await h.request('GET', `/api/rooms/${host.room.code}`);
    expect(watcher.json.data.status).toBe('finished');
  });

  it('heartbeats keep a rival online and block forfeiture', async () => {
    const host = await createRoom(h);
    const guest = (await joinRoom(h, host.room.code)).json.data;
    h.advance(60_000);
    const beat = await h.request('POST', `/api/rooms/${host.room.code}/heartbeat`, {
      token: host.token,
    });
    expect(beat.status).toBe(200);
    const view = await h.request('GET', `/api/rooms/${host.room.code}`, { token: guest.token });
    expect(view.json.data.canClaimForfeit).toBe(false);
    expect(view.json.data.seats.find((s: any) => s.seat === 1).online).toBe(true);
  });

  it('rate-limits pings and surfaces the latest signal', async () => {
    const host = await createRoom(h);
    const guest = (await joinRoom(h, host.room.code)).json.data;
    const first = await h.request('POST', `/api/rooms/${host.room.code}/signal`, {
      token: host.token,
      body: { kind: 'gg' },
    });
    expect(first.status).toBe(200);
    const second = await h.request('POST', `/api/rooms/${host.room.code}/signal`, {
      token: guest.token,
      body: { kind: 'nice' },
    });
    expect(second.status).toBe(429);

    h.advance(3_000);
    const third = await h.request('POST', `/api/rooms/${host.room.code}/signal`, {
      token: guest.token,
      body: { kind: 'nice' },
    });
    expect(third.status).toBe(200);
    const view = await h.request('GET', `/api/rooms/${host.room.code}`, { token: host.token });
    expect(view.json.data.lastSignal.kind).toBe('nice');
    expect(view.json.data.lastSignal.seat).toBe(2);
  });

  it('pairs two quick-match seekers and keeps the next one waiting', async () => {
    const one = await h.request('POST', '/api/rooms/quick', {
      body: { size: 7, name: 'NOVA-10' },
    });
    expect(one.status).toBe(201);
    expect(one.json.data.room.status).toBe('waiting');
    const two = await h.request('POST', '/api/rooms/quick', {
      body: { size: 7, name: 'KITE-20' },
    });
    expect(two.status).toBe(201);
    expect(two.json.data.room.code).toBe(one.json.data.room.code);
    expect(two.json.data.room.status).toBe('active');

    const three = await h.request('POST', '/api/rooms/quick', {
      body: { size: 7, name: 'HELIX-30' },
    });
    expect(three.status).toBe(201);
    expect(three.json.data.room.status).toBe('waiting');
    expect(three.json.data.room.code).not.toBe(one.json.data.room.code);

    const otherSize = await h.request('POST', '/api/rooms/quick', {
      body: { size: 9, name: 'ARCA-40' },
    });
    expect(otherSize.status).toBe(201);
    expect(otherSize.json.data.room.size).toBe(9);
  });


  it('serialises simultaneous claims so exactly one node lands', async () => {
    const host = await createRoom(h);
    await joinRoom(h, host.room.code);
    const [first, second] = await Promise.all([
      h.request('POST', `/api/rooms/${host.room.code}/move`, {
        token: host.token,
        body: { cell: cellIndex(7, 1, 1) },
      }),
      h.request('POST', `/api/rooms/${host.room.code}/move`, {
        token: host.token,
        body: { cell: cellIndex(7, 2, 2) },
      }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const view = await h.request('GET', `/api/rooms/${host.room.code}`, { token: host.token });
    expect(view.json.data.moveCount).toBe(1);
    expect(view.json.data.board.filter((cell: number) => cell !== 0)).toHaveLength(1);
    expect(view.json.data.turn).toBe(2);
  });

  it('rejects malformed move and signal payloads without touching state', async () => {
    const host = await createRoom(h);
    const guest = (await joinRoom(h, host.room.code)).json.data;
    const badMove = await h.request('POST', `/api/rooms/${host.room.code}/move`, {
      token: host.token,
      body: { cell: 'A1' },
    });
    expect(badMove.status).toBe(409);
    expect(badMove.json.error.code).toBe('invalid_move');
    const badSignal = await h.request('POST', `/api/rooms/${host.room.code}/signal`, {
      token: guest.token,
      body: { kind: 'free-text' },
    });
    expect(badSignal.status).toBe(400);
    expect(badSignal.json.error.code).toBe('invalid_request');
    const view = await h.request('GET', `/api/rooms/${host.room.code}`, { token: host.token });
    expect(view.json.data.moveCount).toBe(0);
  });


  it('lets the host cancel a waiting uplink so no ghost room is paired', async () => {
    const host = await createRoom(h);
    const wrong = await h.request('POST', `/api/rooms/${host.room.code}/cancel`, {
      token: 'f'.repeat(64),
    });
    expect(wrong.status).toBe(401);
    const cancel = await h.request('POST', `/api/rooms/${host.room.code}/cancel`, {
      token: host.token,
    });
    expect(cancel.status).toBe(200);
    expect(cancel.json.data.cancelled).toBe(true);
    const gone = await h.request('GET', `/api/rooms/${host.room.code}`);
    expect(gone.status).toBe(404);
    const joinGone = await joinRoom(h, host.room.code);
    expect(joinGone.status).toBe(404);
  });

  it('will not cancel a duel after it has started', async () => {
    const host = await createRoom(h);
    const guest = (await joinRoom(h, host.room.code)).json.data;
    const cancel = await h.request('POST', `/api/rooms/${host.room.code}/cancel`, {
      token: host.token,
    });
    expect(cancel.status).toBe(409);
    expect(cancel.json.error.code).toBe('game_not_active');
    const still = await h.request('GET', `/api/rooms/${host.room.code}`, { token: guest.token });
    expect(still.json.data.status).toBe('active');
  });

  it('never leaks token hashes in a room view', async () => {
    const host = await createRoom(h);
    await joinRoom(h, host.room.code);
    const view = await h.request('GET', `/api/rooms/${host.room.code}`, { token: host.token });
    const text = JSON.stringify(view.json);
    expect(text).not.toContain(host.token);
    expect(text).not.toContain('token_hash');
    expect(text).not.toContain('tokenHash');
  });

  it('rejects a rematch while the new duel is active', async () => {
    const host = await createRoom(h);
    const guest = (await joinRoom(h, host.room.code)).json.data;
    await h.request('POST', `/api/rooms/${host.room.code}/resign`, { token: guest.token });
    await h.request('POST', `/api/rooms/${host.room.code}/rematch`, { token: host.token });
    const guestVote = await h.request('POST', `/api/rooms/${host.room.code}/rematch`, { token: guest.token });
    expect(guestVote.json.data.status).toBe('active');
    const late = await h.request('POST', `/api/rooms/${host.room.code}/rematch`, { token: host.token });
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe('rematch_unavailable');
  });
});
