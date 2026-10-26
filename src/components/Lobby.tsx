import type { RoomView } from '../../shared/protocol';
import { gateLabel, roomUrl, sideLabel } from '../lib/format';
import {
  ArrowRight,
  CopyIcon,
  LinkIcon,
  LockIcon,
  ShareIcon,
  SparkIcon,
  UsersIcon,
} from './Icons';

interface LobbyProps {
  room: RoomView;
  onCopyCode: () => void;
  onCopyLink: () => void;
  onShare: () => void;
  onLeave: () => void;
  onRules: () => void;
}

export function Lobby({ room, onCopyCode, onCopyLink, onShare, onLeave, onRules }: LobbyProps) {
  const you = room.you;
  const rivalSeat = room.seats.find(seat => seat.seat !== you?.seat);
  const shareUrl = roomUrl(room.code);

  return (
    <main className="lobby">
      <div className="lobby__halo" aria-hidden="true" />
      <div className="lobby-grid">
        <section className="lobby-main">
          <div className="lobby-banner">
            <span className="lobby-banner__pulse" aria-hidden="true" />
            <span className="eyebrow">
              {room.publicMatch ? 'PUBLIC MATCHMAKING' : 'PRIVATE UPLINK'} · {room.status === 'waiting' ? 'AWAITING RIVAL' : 'LINKING'}
            </span>
            <span className="micro micro--dim">
              {room.size}×{room.size} {room.size === 7 ? 'RAPID' : 'CLASSIC'} LATTICE
            </span>
          </div>

          <h1 className="lobby-title">
            ONE SEAT <span className="text-dim">EMPTY.</span>
          </h1>
          <p className="lobby-lede">
            {room.publicMatch
              ? 'Your uplink is open on the public lattice. The next operator to scan in takes MAGENTA.'
              : 'Send the code or the link to your rival. The duel begins the instant the second seat fills.'}
          </p>

          <div className="lobby-code-block">
            <div className="lobby-code-block__head">
              <span className="micro">UPLINK CODE</span>
              <span className="micro micro--dim">
                {room.publicMatch ? <UsersIcon size={12} /> : <LockIcon size={12} />}
                {room.publicMatch ? 'QUICK MATCH' : 'PRIVATE BY DEFAULT'}
              </span>
            </div>
            <button type="button" className="lobby-code" onClick={onCopyCode} title="Copy room code">
              {room.code.split('').map((character, index) => (
                <span key={`${character}-${index}`} className="lobby-code__char mono">
                  {character}
                </span>
              ))}
              <span className="lobby-code__copy">
                <CopyIcon size={18} />
              </span>
            </button>
            <div className="lobby-share">
              <code className="lobby-share__url mono">{shareUrl}</code>
              <button type="button" className="btn btn--primary" onClick={onCopyLink}>
                <LinkIcon size={17} /> COPY LINK
              </button>
              <button type="button" className="btn btn--ghost" onClick={onShare}>
                <ShareIcon size={17} /> SHARE
              </button>
            </div>
          </div>

          <div className="lobby-seats">
            {[1, 2].map(seatNumber => {
              const seat = room.seats.find(item => item.seat === seatNumber);
              const isYou = seatNumber === you?.seat;
              const side = seat?.side ?? (seatNumber === 1 ? 1 : 2);
              return (
                <article
                  key={seatNumber}
                  className={`lobby-seat lobby-seat--${side === 1 ? 'cyan' : 'magenta'} ${seat ? 'is-filled' : 'is-empty'}`}
                >
                  <div className="lobby-seat__head">
                    <span className="micro">OPERATOR 0{seatNumber}</span>
                    {isYou ? (
                      <span className="tag tag--bright">YOU</span>
                    ) : seat ? (
                      <span className="tag">{seat.online ? 'LINKED' : 'IDLE'}</span>
                    ) : (
                      <span className="tag tag--dim">EMPTY</span>
                    )}
                  </div>
                  <div className="lobby-seat__body">
                    <span className="lobby-seat__sigil" aria-hidden="true">
                      {seatNumber === 1 ? '◇' : '◆'}
                    </span>
                    <div>
                      <h2>{seat?.name ?? 'AWAITING OPERATOR'}</h2>
                      <p className="mono">
                        {sideLabel(side)} · {gateLabel(side)}
                      </p>
                    </div>
                  </div>
                  {!seat && (
                    <div className="lobby-seat__scanner" aria-hidden="true">
                      <span />
                    </div>
                  )}
                  {!seat && (
                    <p className="lobby-seat__hint">
                      The next operator to enter becomes MAGENTA. They may swap sides once after your
                      opening claim.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <aside className="lobby-side">
          <div className="panel lobby-side__panel">
            <p className="eyebrow">YOUR STATION</p>
            <div className="station">
              <span className={`station__orb station__orb--${you?.side === 2 ? 'magenta' : 'cyan'}`} />
              <div>
                <span className="micro">CALLSIGN</span>
                <strong>{you?.seat ? room.seats.find(seat => seat.seat === you.seat)?.name : 'OBSERVER'}</strong>
              </div>
            </div>
            <dl className="meta-list">
              <div>
                <dt>PILOTING</dt>
                <dd className={you?.side === 2 ? 'text-magenta' : 'text-cyan'}>
                  {you ? sideLabel(you.side) : 'NO SEAT'}
                </dd>
              </div>
              <div>
                <dt>GATES</dt>
                <dd>{you ? gateLabel(you.side) : '—'}</dd>
              </div>
              <div>
                <dt>GRID</dt>
                <dd>{room.size} × {room.size}</dd>
              </div>
              <div>
                <dt>MOVES</dt>
                <dd>{room.moveCount}</dd>
              </div>
            </dl>
          </div>

          <div className="panel lobby-side__panel">
            <p className="eyebrow">WHILE YOU WAIT</p>
            <ul className="brief-list">
              <li>
                <span>01</span>
                <p>You may claim any open node. A chain only counts across shared hex edges.</p>
              </li>
              <li>
                <span>02</span>
                <p>After your first claim, magenta may swap gates once to cancel first-move advantage.</p>
              </li>
              <li>
                <span>03</span>
                <p>No draws. Resignation or a lost uplink ends a live duel.</p>
              </li>
            </ul>
            <button type="button" className="text-link" onClick={onRules}>
              READ THE FULL CODEX <ArrowRight size={15} />
            </button>
          </div>

          <button
            type="button"
            className="btn btn--ghost lobby-side__leave"
            onClick={() => {
              if (room.publicMatch && rivalSeat) onLeave();
              else onLeave();
            }}
          >
            LEAVE LOBBY
          </button>
        </aside>
      </div>

      <div className="lobby-transmission" role="status" aria-live="polite">
        <span className="lobby-transmission__icon">
          {room.publicMatch ? <UsersIcon size={15} /> : <SparkIcon size={15} />}
        </span>
        <span className="mono">
          {room.publicMatch
            ? 'SCANNING THE PUBLIC LATTICE FOR A RIVAL…'
            : 'UPLINK ARMED. SHARE THE CODE TO BEGIN.'}
        </span>
      </div>
    </main>
  );
}
