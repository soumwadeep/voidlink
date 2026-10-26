import type { LinkState } from '../lib/useRoom.ts';
import {
  ArrowLeft,
  BookIcon,
  CopyIcon,
  SoundOffIcon,
  SoundOnIcon,
  WifiIcon,
  WifiOffIcon,
} from './Icons.tsx';

interface TopBarProps {
  roomCode?: string | null;
  link?: LinkState;
  muted: boolean;
  onHome: () => void;
  onRules: () => void;
  onToggleSound: () => void;
  onCopyCode?: () => void;
  inRoom?: boolean;
}

export function TopBar({
  roomCode,
  link = 'connecting',
  muted,
  onHome,
  onRules,
  onToggleSound,
  onCopyCode,
  inRoom = false,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        {inRoom && (
          <button
            type="button"
            className="icon-button topbar__exit"
            onClick={onHome}
            aria-label="Leave this duel and return to the deck"
            title="Leave duel"
          >
            <ArrowLeft size={17} />
          </button>
        )}
        <button type="button" className="brand-button" onClick={onHome} aria-label="VOIDLINK home">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-mark__inner" />
          </span>
          <span className="brand-type">
            VOID<span>LINK</span>
          </span>
          <span className="brand-sub">TWO-OPERATOR LATTICE DUEL</span>
        </button>
      </div>

      <div className="topbar__right">
        {roomCode && (
          <button
            type="button"
            className="room-chip"
            onClick={onCopyCode}
            title="Copy room code"
            aria-label={`Room ${roomCode}. Copy room code.`}
          >
            <span className="room-chip__label">UPLINK</span>
            <span className="room-chip__code mono">{roomCode}</span>
            <CopyIcon size={13} />
          </button>
        )}
        {roomCode && (
          <span className={`link-pill link-pill--${link}`} title={link === 'live' ? 'Relay connected' : 'Relay reconnecting'}>
            {link === 'live' ? <WifiIcon size={13} /> : <WifiOffIcon size={13} />}
            <span>{link === 'live' ? 'LINK STABLE' : link === 'lost' ? 'RECONNECTING' : 'SYNCING'}</span>
          </span>
        )}
        <button type="button" className="text-button" onClick={onRules} aria-label="Open the rules codex">
          <BookIcon size={16} />
          <span>CODEX</span>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onToggleSound}
          aria-label={muted ? 'Enable sound' : 'Mute sound'}
          title={muted ? 'Enable sound' : 'Mute sound'}
          aria-pressed={!muted}
        >
          {muted ? <SoundOffIcon size={17} /> : <SoundOnIcon size={17} />}
        </button>
      </div>
    </header>
  );
}
