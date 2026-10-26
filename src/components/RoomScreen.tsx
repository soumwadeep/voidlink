import { useEffect, useRef } from 'react';
import type { RoomView } from '../../shared/protocol.ts';
import type { VoidlinkApiError } from '../lib/api.ts';
import { copyText, roomUrl } from '../lib/format.ts';
import { play } from '../lib/sound.ts';
import type { RoomFeed } from '../lib/useRoom.ts';
import type { ToastMessage } from './Toast.tsx';
import { Game } from './Game.tsx';
import { Lobby } from './Lobby.tsx';
import { ArrowLeft, RefreshIcon, SignalIcon } from './Icons.tsx';

interface RoomScreenProps {
  code: string;
  token: string | null;
  feed: RoomFeed;
  onLeave: () => void;
  onRules: () => void;
  onNotify: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function RoomScreen({
  code,
  token,
  feed,
  onLeave,
  onRules,
  onNotify,
}: RoomScreenProps) {
  const { room, error, link, applyRoom, refresh } = feed;
  const previousStatus = useRef<RoomView['status'] | null>(room?.status ?? null);

  useEffect(() => {
    if (room?.status === 'active' && previousStatus.current === 'waiting') {
      play('launch');
      onNotify({
        title: 'RIVAL LINKED',
        message: 'Both seats are live. The lattice is open — cyan claims first.',
        tone: 'success',
      });
    }
    previousStatus.current = room?.status ?? null;
  }, [room?.status, onNotify]);

  async function copy(value: string, title: string) {
    try {
      await copyText(value);
      onNotify({ title, message: value, tone: 'success' });
    } catch {
      onNotify({ title: 'COPY FAILED', message: 'Select the code and copy it manually.', tone: 'warn' });
    }
  }

  async function share() {
    if (!room) return;
    const url = roomUrl(room.code);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'VOIDLINK — a two-operator lattice duel',
          text: 'Take the open seat and cut my chain before I cut yours.',
          url,
        });
        return;
      } catch {
        // Fall through to copy.
      }
    }
    await copy(url, 'INVITE LINK COPIED');
  }

  if (!room) {
    if (error) {
      const dead = error.code === 'room_not_found' || error.code === 'invalid_code';
      return (
        <main className="room-loading room-loading--dead">
          <div className="room-loading__panel">
            <SignalIcon size={30} />
            <p className="eyebrow eyebrow--warn">{dead ? 'SIGNAL LOST' : 'RELAY PENDING'}</p>
            <h1>{dead ? 'NO DUEL ANSWERS.' : 'THE UPLINK IS THIN.'}</h1>
            <p>{error.message}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn--primary" onClick={refresh}>
                <RefreshIcon size={16} /> RETRY UPLINK
              </button>
              <button type="button" className="btn btn--ghost" onClick={onLeave}>
                <ArrowLeft size={16} /> BACK TO DECK
              </button>
            </div>
            <span className="mono micro micro--dim">UPLINK {code}</span>
          </div>
        </main>
      );
    }
    return (
      <main className="room-loading">
        <div className="room-loading__panel">
          <span className="room-loading__scanner" aria-hidden="true" />
          <p className="eyebrow">SYNCING UPLINK</p>
          <h1 className="mono">{code}</h1>
          <p>Reading the lattice and claiming your seat. Hold position.</p>
          <span className="micro micro--dim mono">READING LATTICE SIGNAL</span>
        </div>
      </main>
    );
  }

  if (room.status === 'waiting') {
    return (
      <Lobby
        room={room}
        onCopyCode={() => void copy(room.code, 'UPLINK CODE COPIED')}
        onCopyLink={() => void copy(roomUrl(room.code), 'INVITE LINK COPIED')}
        onShare={() => void share()}
        onLeave={onLeave}
        onRules={onRules}
      />
    );
  }

  return (
    <Game
      room={room}
      token={token}
      link={link}
      error={error as VoidlinkApiError | null}
      onRoom={applyRoom}
      refresh={refresh}
      onNotify={onNotify}
      onRules={onRules}
      onLeaveNow={onLeave}
    />
  );
}

