import { useEffect, useRef, useState } from 'react';
import type { Cell, Side } from '../../shared/engine';
import {
  FORFEIT_AFTER_MS,
  SIGNAL_DEFINITIONS,
  SIGNAL_RATE_MS,
  type RoomView,
  type SeatNumber,
  type SignalKind,
  type SignalView,
} from '../../shared/protocol';
import { VoidlinkApiError, apiRequest } from '../lib/api';
import {
  copyText,
  elapsedSince,
  finishHeadline,
  formatClock,
  gateLabel,
  roomUrl,
  sideLabel,
} from '../lib/format';
import { play, haptic } from '../lib/sound';
import type { LinkState } from '../lib/useRoom';
import { useNow } from '../lib/useNow';
import type { ToastMessage } from './Toast';
import { Board } from './Board';
import {
  ArrowRight,
  CloseIcon,
  CopyIcon,
  CrownIcon,
  LinkIcon,
  RefreshIcon,
  ShareIcon,
  SignalGlyph,
  SignalIcon,
  SparkIcon,
  WifiOffIcon,
} from './Icons';
import { Modal } from './Modal';

interface GameProps {
  room: RoomView;
  token: string | null;
  link: LinkState;
  error: VoidlinkApiError | null;
  onRoom: (room: RoomView) => void;
  refresh: () => void;
  onNotify: (toast: Omit<ToastMessage, 'id'>) => void;
  onRules: () => void;
  onLeaveNow: () => void;
}

type ConfirmAction = 'resign' | 'forfeit' | 'swap' | null;

interface SignalFlash {
  signal: SignalView;
  name: string;
}

export function Game({
  room,
  token,
  link,
  error,
  onRoom,
  refresh,
  onNotify,
  onRules,
  onLeaveNow,
}: GameProps) {
  const [pendingCell, setPendingCell] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [resultOpen, setResultOpen] = useState(room.status === 'finished');
  const [flash, setFlash] = useState<SignalFlash | null>(null);
  const seen = useRef({
    status: room.status,
    moveCount: room.moveCount,
    signalAt: room.lastSignal?.at ?? null,
    swapped: room.swapped,
  });

  const you = room.you;
  const rival = room.seats.find(seat => seat.seat !== you?.seat) ?? null;
  const rivalSide = rival?.side ?? null;
  const canMove =
    room.status === 'active' && Boolean(you) && room.turnSeat === you?.seat && pendingCell === null;
  const isSpectator = room.spectator;
  const finished = room.status === 'finished';
  const myVote = you ? room.rematchVotes.includes(you.seat) : false;
  const rivalVote = you
    ? room.rematchVotes.some(seat => seat !== you.seat)
    : room.rematchVotes.length > 0;
  const headline = finishHeadline(room);
  const shareUrl = roomUrl(room.code);

  useEffect(() => {
    if (room.status === 'finished' && seen.current.status !== 'finished') {
      setResultOpen(true);
      play(
        room.you
          ? room.winnerSide === room.you.side
            ? 'win'
            : 'lose'
          : 'signal',
      );
      haptic(room.you && room.winnerSide === room.you.side ? [18, 60, 18, 60, 32] : 16);
    }
    if (room.status === 'active' && seen.current.status === 'finished') {
      setResultOpen(false);
      onNotify({ title: 'REMATCH LIVE', message: 'A fresh lattice. All claims reset.', tone: 'success' });
      play('launch');
    }
    if (room.status === 'active' && seen.current.status === 'active') {
      if (room.moveCount > seen.current.moveCount) {
        const mover = room.lastMove !== null ? room.board[room.lastMove] : null;
        if (mover === room.you?.side) {
          play('claim');
          haptic(9);
        } else {
          play('rival');
        }
      }
      if (room.swapped && !seen.current.swapped) {
        play('swap');
        onNotify({
          title: 'SWAP INVOKED',
          message: 'The gates have changed hands. Cyan and magenta are reversed.',
          tone: 'info',
        });
      }
    }
    if (room.lastSignal && room.lastSignal.at !== seen.current.signalAt) {
      const fresh = Date.now() - Date.parse(room.lastSignal.at) < 9_000;
      if (fresh && room.lastSignal.seat !== room.you?.seat) {
        const signaler = room.seats.find(seat => seat.seat === room.lastSignal?.seat);
        setFlash({
          signal: room.lastSignal,
          name: signaler?.name ?? `OPERATOR 0${room.lastSignal.seat}`,
        });
        window.setTimeout(() => setFlash(null), 3_400);
        play('signal');
        haptic(12);
      }
    }
    seen.current = {
      status: room.status,
      moveCount: room.moveCount,
      signalAt: room.lastSignal?.at ?? null,
      swapped: room.swapped,
    };
  }, [room, onNotify]);

  useEffect(() => {
    if (finished) return;
    setResultOpen(false);
  }, [finished]);

  async function move(cell: number) {
    if (!token) return;
    setPendingCell(cell);
    try {
      const next = await apiRequest<RoomView>(`/rooms/${room.code}/move`, {
        method: 'POST',
        token,
        body: { cell },
      });
      onRoom(next);
    } catch (caught) {
      const apiError = caught instanceof VoidlinkApiError ? caught : null;
      onNotify({
        title: 'CLAIM REJECTED',
        message: apiError?.message ?? 'The relay could not place that node.',
        tone: 'warn',
      });
      play('error');
      refresh();
    } finally {
      setPendingCell(null);
    }
  }

  async function runAction(
    key: string,
    path: string,
    title: string,
    success?: { title: string; message: string; tone?: ToastMessage['tone'] },
  ) {
    if (!token) return;
    setBusy(key);
    try {
      const next = await apiRequest<RoomView>(`/rooms/${room.code}/${path}`, {
        method: 'POST',
        token,
      });
      onRoom(next);
      if (success) onNotify(success);
    } catch (caught) {
      const apiError = caught instanceof VoidlinkApiError ? caught : null;
      onNotify({
        title,
        message: apiError?.message ?? 'The relay rejected that command.',
        tone: 'warn',
      });
      play('error');
      refresh();
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function sendSignal(kind: SignalKind) {
    if (!token) return;
    setBusy(`signal-${kind}`);
    try {
      await apiRequest<{ accepted: true }>(`/rooms/${room.code}/signal`, {
        method: 'POST',
        token,
        body: { kind },
      });
      refresh();
      haptic(6);
    } catch (caught) {
      const apiError = caught instanceof VoidlinkApiError ? caught : null;
      if (apiError?.code !== 'rate_limited') {
        onNotify({
          title: 'SIGNAL BLOCKED',
          message: apiError?.message ?? 'The signal could not be sent.',
          tone: 'warn',
        });
      }
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await copyText(value);
      onNotify({ title: label, message: value, tone: 'success' });
    } catch {
      onNotify({ title: 'COPY FAILED', message: 'Select the code and copy it manually.', tone: 'warn' });
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'VOIDLINK — a two-operator lattice duel',
          text: 'Take MAGENTA and cut my chain before I cut yours.',
          url: shareUrl,
        });
        return;
      } catch {
        // A cancelled share falls through to copying, which is still useful.
      }
    }
    await copy(shareUrl, 'LINK COPIED');
  }

  const swapAvailableForYou =
    room.status === 'active' && room.swapAvailable && you?.seat === 2;
  const swapPendingForYou =
    room.status === 'active' && room.swapAvailable && you?.seat === 1;

  const turnCopy = (() => {
    if (finished) {
      return {
        kind: 'finished',
        eyebrow: 'LATTICE SEALED',
        title:
          room.winnerSide === null
            ? 'NO CHAIN ESTABLISHED'
            : `${sideLabel(room.winnerSide)} HOLDS THE LATTICE`,
        sub:
          room.finishReason === 'resign'
            ? 'The duel ended by withdrawal. The lattice is settled.'
            : room.finishReason === 'forfeit'
              ? 'The duel ended after a lost rival uplink.'
              : room.winPath.length
                ? 'An unbroken chain now crosses the board.'
                : 'The duel ended without a completed chain.',
      };
    }
    if (canMove) {
      return {
        kind: 'you',
        eyebrow: 'YOUR TURN',
        title: 'EXTEND YOUR CHAIN',
        sub: swapAvailableForYou
          ? 'Claim a node — or invoke the swap protocol first.'
          : 'Claim one open node. Every node must connect the gates.',
      };
    }
    if (isSpectator) {
      return {
        kind: 'spectate',
        eyebrow: 'OBSERVING',
        title: `${sideLabel(room.turn)} TO MOVE`,
        sub: 'You are watching a live lattice. Open your own uplink to take a side.',
      };
    }
    return {
      kind: 'rival',
      eyebrow: 'RIVAL TRANSMITTING',
      title: 'THE LATTICE IS THEIRS',
      sub: `Waiting on ${rival?.name ?? 'your rival'}. Their clock is running.`,
    };
  })();

  return (
    <main className="game-screen">
      {link === 'lost' && (
        <div className="relay-banner" role="status">
          <WifiOffIcon size={15} />
          <span>
            <strong>RELAY LINK LOST.</strong> {error?.message ?? 'Trying to re-establish the uplink…'}
          </span>
          <button type="button" className="text-link" onClick={refresh}>
            <RefreshIcon size={13} /> RETRY NOW
          </button>
        </div>
      )}

      <div className="game-layout">
        <aside className="game-side game-side--left">
          <div className="player-stack">
            <PlayerCard
              room={room}
              seat={you?.seat ?? 1}
              name={room.seats.find(seat => seat.seat === you?.seat)?.name ?? 'OBSERVER'}
              side={you?.side ?? null}
              isYou
              isTurn={room.status === 'active' && room.turnSeat === you?.seat}
              online
              finished={finished}
            />
            <PlayerCard
              room={room}
              seat={you?.seat === 1 ? 2 : 1}
              name={rival?.name ?? 'AWAITING RIVAL'}
              side={rivalSide}
              isYou={false}
              isTurn={room.status === 'active' && room.turnSeat === rival?.seat}
              online={rival?.online ?? false}
              finished={finished}
            />
          </div>

          <div className="panel codex-mini">
            <p className="eyebrow">MATCH PROTOCOL</p>
            <div className="codex-mini__gates">
              <span className="gate-line gate-line--cyan">CYAN <b>TOP ↔ BOTTOM</b></span>
              <span className="gate-line gate-line--magenta">MAGENTA <b>LEFT ↔ RIGHT</b></span>
            </div>
            <button type="button" className="text-link" onClick={onRules}>
              OPEN THE CODEX <ArrowRight size={14} />
            </button>
          </div>

          <div className="match-stamp mono">
            <span>UPLINK {room.code}</span>
            <span>{room.size}×{room.size} {room.size === 7 ? 'RAPID' : 'CLASSIC'}</span>
            {room.swapped && <span className="text-amber">GATES SWAPPED</span>}
          </div>
        </aside>

        <section className="game-main">
          <div className="board-topstrip">
            <div className="legend">
              <span className="legend__item legend__item--cyan">
                <i aria-hidden="true" /> CYAN GATES <b>TOP / BOTTOM</b>
              </span>
              <span className="legend__item legend__item--magenta">
                <i aria-hidden="true" /> MAGENTA GATES <b>LEFT / RIGHT</b>
              </span>
            </div>
            <span className="micro micro--dim">MOVE {String(room.moveCount).padStart(2, '0')} / {room.size * room.size}</span>
          </div>

          <div className={`turn-banner turn-banner--${turnCopy.kind}`}>
            <div className="turn-banner__copy">
              <p className="eyebrow">{turnCopy.eyebrow}</p>
              <h1>{turnCopy.title}</h1>
              <p>{turnCopy.sub}</p>
            </div>
            <div className="turn-banner__meter">
              {finished ? (
                <>
                  <span className="micro">FINAL</span>
                  <strong className="mono">{String(room.moveCount).padStart(2, '0')}</strong>
                  <span className="micro micro--dim">MOVES</span>
                </>
              ) : (
                <>
                  <span className="micro">{canMove ? 'YOUR CLOCK' : 'SINCE LAST CLAIM'}</span>
                  <strong className="mono">
                    <LiveClock iso={room.updatedAt} />
                  </strong>
                  <span className="micro micro--dim">TURN {Math.ceil(room.moveCount / 2) + 1}</span>
                </>
              )}
            </div>
          </div>

          {swapAvailableForYou && (
            <div className="swap-banner">
              <div className="swap-banner__icon" aria-hidden="true">
                <RefreshIcon size={18} />
              </div>
              <div>
                <p className="eyebrow">SWAP PROTOCOL AVAILABLE</p>
                <p>
                  Take cyan's opening node and exchange gates. This equalises the first-move
                  advantage. You may invoke it once, now only.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--warn btn--small"
                onClick={() => setConfirm('swap')}
                disabled={busy !== null}
              >
                REVIEW SWAP
              </button>
            </div>
          )}

          {swapPendingForYou && (
            <div className="swap-banner swap-banner--quiet">
              <div className="swap-banner__icon" aria-hidden="true">
                <RefreshIcon size={18} />
              </div>
              <div>
                <p className="eyebrow">SWAP PROTOCOL OPEN</p>
                <p>Your rival may swap gates once. If they do, your cyan node becomes theirs.</p>
              </div>
            </div>
          )}

          <div className="board-stage">
            <div className={`board-aura board-aura--${you?.side === 2 ? 'magenta' : 'cyan'}`} aria-hidden="true" />
            <Board
              size={room.size}
              board={room.board as Cell[]}
              yourSide={you?.side ?? null}
              interactive={canMove && !isSpectator}
              onClaim={cell => void move(cell)}
              winPath={room.winPath}
              lastMove={room.lastMove}
              pendingCell={pendingCell}
              label={`${room.size} by ${room.size} VOIDLINK lattice. ${you ? `You are ${sideLabel(you.side)}.` : 'You are observing.'}`}
            />
            {flash && (
              <div className={`signal-flash signal-flash--${flash.signal.side === 1 ? 'cyan' : 'magenta'}`} role="status">
                <span className="signal-flash__glyph">
                  <SignalGlyph kind={flash.signal.kind} />
                </span>
                <div>
                  <span className="micro">{flash.name}</span>
                  <strong>
                    {SIGNAL_DEFINITIONS.find(item => item.kind === flash.signal.kind)?.label ??
                      'Signal received'}
                  </strong>
                </div>
              </div>
            )}
          </div>

          <OfflineNotice room={room} rival={rival} onForfeit={() => setConfirm('forfeit')} />

          <div className="board-underbar">
            <p className="board-hint">
              {finished ? (
                <>
                  <CrownIcon size={14} />{' '}
                  {room.winnerSeat
                    ? room.finishReason === 'link'
                      ? `${room.seats.find(seat => seat.seat === room.winnerSeat)?.name ?? sideLabel(room.winnerSide ?? 1)} holds the chain.`
                      : `${room.seats.find(seat => seat.seat === room.winnerSeat)?.name ?? sideLabel(room.winnerSide ?? 1)} takes the duel.`
                    : 'No chain was completed.'}
                </>
              ) : canMove ? (
                <>
                  <span className="hint-dot" aria-hidden="true" /> Pick any open hex. Hover to inspect.
                </>
              ) : (
                <>
                  <span className="hint-dot hint-dot--dim" aria-hidden="true" /> Watch the rival's line.
                  Sever it before it reaches their far gate.
                </>
              )}
            </p>
            <div className="underbar-actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={() => void copy(room.code, 'CODE COPIED')}>
                <CopyIcon size={15} /> CODE
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => void share()}>
                <ShareIcon size={15} /> INVITE
              </button>
              {finished && !isSpectator && (
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  onClick={() =>
                    myVote
                      ? setResultOpen(true)
                      : void runAction('rematch', 'rematch', 'REMATCH FAILED')
                  }
                  disabled={myVote || busy !== null}
                >
                  <RefreshIcon size={15} /> {myVote ? 'REMATCH PENDING' : rivalVote ? 'ACCEPT REMATCH' : 'REMATCH'}
                </button>
              )}
              {finished && isSpectator && (
                <button type="button" className="btn btn--primary btn--small" onClick={onLeaveNow}>
                  OPEN YOUR OWN <ArrowRight size={15} />
                </button>
              )}
              {!finished && !isSpectator && (
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  onClick={() => setConfirm('resign')}
                  disabled={busy !== null}
                >
                  <CloseIcon size={14} /> RESIGN
                </button>
              )}
              {finished && !isSpectator && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setResultOpen(true)}>
                  RESULT
                </button>
              )}
            </div>
          </div>

          {finished && !resultOpen && (
            <button type="button" className="result-strip" onClick={() => setResultOpen(true)}>
              <span className={`result-strip__sigil result-strip__sigil--${headline.result}`} aria-hidden="true">
                {headline.result === 'win' ? <CrownIcon size={18} /> : <SignalIcon size={18} />}
              </span>
              <span>
                <strong>{headline.title}</strong>
                <small>{headline.eyebrow}</small>
              </span>
              <span className="text-link">
                VIEW RESULT <ArrowRight size={14} />
              </span>
            </button>
          )}
        </section>

        <aside className="game-side game-side--right">
          <SignalsPanel
            room={room}
            disabled={isSpectator || !rival || room.status === 'waiting'}
            busy={busy}
            onSignal={kind => void sendSignal(kind)}
          />

          <div className="panel objective-panel">
            <p className="eyebrow">OBJECTIVE</p>
            <h2>JOIN YOUR TWO GATES.</h2>
            <p>
              Weave an unbroken chain of your nodes between opposite edges. Cyan links top to
              bottom. Magenta links left to right. All six shared edges count.
            </p>
            <div className="objective-diagram" aria-hidden="true">
              <span className="objective-diagram__cyan">CYAN</span>
              <span className="objective-diagram__grid" />
              <span className="objective-diagram__magenta">MAGENTA</span>
            </div>
            <button type="button" className="text-link" onClick={onRules}>
              RULES, SWAP &amp; EDGE CASES <ArrowRight size={14} />
            </button>
          </div>

          <div className="panel match-panel">
            <p className="eyebrow">MATCH TELEMETRY</p>
            <dl className="meta-list">
              <div>
                <dt>UPLINK</dt>
                <dd className="mono">{room.code}</dd>
              </div>
              <div>
                <dt>GRID</dt>
                <dd>{room.size} × {room.size} {room.size === 7 ? 'RAPID' : 'CLASSIC'}</dd>
              </div>
              <div>
                <dt>YOU PILOT</dt>
                <dd className={you?.side === 2 ? 'text-magenta' : 'text-cyan'}>
                  {you ? sideLabel(you.side) : 'OBSERVER'}
                </dd>
              </div>
              <div>
                <dt>SWAP</dt>
                <dd>{room.swapped ? 'USED' : room.swapAvailable ? 'AVAILABLE' : 'CLOSED'}</dd>
              </div>
              <div>
                <dt>RELAY</dt>
                <dd className={link === 'live' ? 'text-green' : 'text-amber'}>
                  {link === 'live' ? 'STABLE' : link === 'lost' ? 'RECONNECTING' : 'SYNCING'}
                </dd>
              </div>
            </dl>
            <div className="match-panel__actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={() => void copy(shareUrl, 'INVITE LINK COPIED')}>
                <LinkIcon size={15} /> COPY INVITE LINK
              </button>
            </div>
          </div>

          {isSpectator && (
            <div className="spectator-note panel">
              <p className="eyebrow">YOU ARE OBSERVING</p>
              <p>No seat, no moves. Every claim still resolves on this screen in real time.</p>
              <button type="button" className="btn btn--primary btn--small" onClick={onLeaveNow}>
                OPEN YOUR OWN UPLINK <ArrowRight size={15} />
              </button>
            </div>
          )}
        </aside>
      </div>

      <div className="sr-only" aria-live="polite">
        {canMove ? 'Your turn. Claim one node.' : finished ? `${headline.title}. ${headline.detail}` : `${sideLabel(room.turn)} is thinking.`}
      </div>

      <Modal
        open={confirm === 'swap'}
        onClose={() => setConfirm(null)}
        className="confirm-modal"
        labelledBy="swap-title"
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">ONE-TIME PROTOCOL</p>
            <h2 id="swap-title" className="modal-title">
              INVOKE THE SWAP?
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={() => setConfirm(null)} aria-label="Cancel swap">
            <CloseIcon />
          </button>
        </div>
        <p className="modal-lede">
          You will take over cyan's opening node and both operators exchange gates. The move
          itself does not change: after swapping, it is still the current turn, now controlled by
          your rival's new color.
        </p>
        <div className="confirm-facts mono">
          <span>YOU MOVE FROM MAGENTA → CYAN</span>
          <span>AVAILABLE ONLY AFTER MOVE 01</span>
          <span>ONE USE PER DUEL</span>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn--warn"
            onClick={() => void runAction('swap', 'swap', 'SWAP FAILED')}
            disabled={busy !== null}
          >
            {busy === 'swap' ? <><span className="spinner" /> SWAPPING…</> : <><RefreshIcon size={17} /> CONFIRM SWAP</>}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)} disabled={busy !== null}>
            KEEP MAGENTA
          </button>
        </div>
      </Modal>

      <Modal
        open={confirm === 'resign'}
        onClose={() => setConfirm(null)}
        className="confirm-modal"
        labelledBy="resign-title"
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow eyebrow--warn">TERMINATE LINK</p>
            <h2 id="resign-title" className="modal-title">
              WITHDRAW FROM THE LATTICE?
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={() => setConfirm(null)} aria-label="Cancel withdrawal">
            <CloseIcon />
          </button>
        </div>
        <p className="modal-lede">
          Your rival takes the duel immediately. There is no undo, and the final position remains
          readable for both operators.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => void runAction('resign', 'resign', 'WITHDRAWAL FAILED')}
            disabled={busy !== null}
          >
            {busy === 'resign' ? <><span className="spinner" /> CLOSING LINK…</> : <><CloseIcon size={16} /> CONFIRM WITHDRAWAL</>}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)} disabled={busy !== null}>
            STAY IN THE DUEL
          </button>
        </div>
      </Modal>

      <Modal
        open={confirm === 'forfeit'}
        onClose={() => setConfirm(null)}
        className="confirm-modal"
        labelledBy="forfeit-title"
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow eyebrow--warn">RIVAL UPLINK DARK</p>
            <h2 id="forfeit-title" className="modal-title">
              CLAIM THE DISCONNECT?
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={() => setConfirm(null)} aria-label="Cancel claim">
            <CloseIcon />
          </button>
        </div>
        <p className="modal-lede">
          Your rival has stopped transmitting beyond the grace window. The duel will be recorded as
          a disconnect win for you. If they return after you claim, the result stands.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn--warn"
            onClick={() => void runAction('forfeit', 'forfeit', 'CLAIM FAILED')}
            disabled={busy !== null}
          >
            {busy === 'forfeit' ? <><span className="spinner" /> CLAIMING…</> : <><CrownIcon size={17} /> CLAIM THE DUEL</>}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)} disabled={busy !== null}>
            WAIT LONGER
          </button>
        </div>
      </Modal>

      <ResultDialog
        open={resultOpen}
        room={room}
        headline={headline}
        busy={busy}
        myVote={myVote}
        rivalVote={rivalVote}
        onClose={() => setResultOpen(false)}
        onRematch={() => void runAction('rematch', 'rematch', 'REMATCH FAILED')}
        onInspect={() => setResultOpen(false)}
        onExit={onLeaveNow}
      />
    </main>
  );
}

function LiveClock({ iso }: { iso: string }) {
  const now = useNow(true, 500);
  return <>{formatClock(elapsedSince(iso, now))}</>;
}

interface PlayerCardProps {
  room: RoomView;
  seat: SeatNumber;
  name: string;
  side: Side | null;
  isYou: boolean;
  isTurn: boolean;
  online: boolean;
  finished: boolean;
}

function PlayerCard({ room, seat, name, side, isYou, isTurn, online, finished }: PlayerCardProps) {
  const sideClass = side === 1 ? 'cyan' : side === 2 ? 'magenta' : 'empty';
  const present = room.seats.some(item => item.seat === seat);
  return (
    <article
      className={[
        'player-card',
        `player-card--${sideClass}`,
        isYou ? 'is-you' : '',
        isTurn ? 'is-turn' : '',
        !present ? 'is-absent' : '',
        !online && present ? 'is-offline' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="player-card__top">
        <span className="micro">OPERATOR 0{seat}</span>
        <span className="player-card__status">
          {isYou ? (
            <span className="tag tag--bright">YOU</span>
          ) : present ? (
            <span className={`tag ${online ? '' : 'tag--warn'}`}>{online ? 'LINKED' : 'SIGNAL LOST'}</span>
          ) : (
            <span className="tag tag--dim">OPEN</span>
          )}
        </span>
      </div>
      <div className="player-card__identity">
        <span className="player-card__sigil" aria-hidden="true">
          {side === 1 ? '◇' : side === 2 ? '◆' : '·'}
        </span>
        <div>
          <h2>{name}</h2>
          <p className="mono">{side ? `${sideLabel(side)} · ${gateLabel(side)}` : 'NO GATE ASSIGNED'}</p>
        </div>
      </div>
      <div className="player-card__foot">
        <span>
          {isTurn && !finished ? (
            <>
              <i className="live-dot" aria-hidden="true" /> {isYou ? 'YOUR MOVE' : 'CALCULATING'}
            </>
          ) : finished ? (
            room.winnerSeat === seat ? 'DUEL SECURED' : 'LATTICE LOST'
          ) : present ? (
            online ? 'HOLDING POSITION' : 'AWAITING SIGNAL'
          ) : (
            'SEAT OPEN'
          )}
        </span>
        <span className="micro micro--dim">{isYou ? 'THIS DEVICE' : 'REMOTE'}</span>
      </div>
    </article>
  );
}

interface SignalsPanelProps {
  room: RoomView;
  disabled: boolean;
  busy: string | null;
  onSignal: (kind: SignalKind) => void;
}

function SignalsPanel({ room, disabled, busy, onSignal }: SignalsPanelProps) {
  const now = useNow(true, 500);
  const cooldown = room.lastSignal
    ? Math.max(0, SIGNAL_RATE_MS - (now - Date.parse(room.lastSignal.at)))
    : 0;
  const sender = room.lastSignal
    ? room.seats.find(seat => seat.seat === room.lastSignal?.seat)?.name
    : null;
  const definition = room.lastSignal
    ? SIGNAL_DEFINITIONS.find(item => item.kind === room.lastSignal?.kind)
    : null;

  return (
    <div className="panel comms-panel">
      <div className="comms-panel__head">
        <p className="eyebrow">SHORT-RANGE COMMS</p>
        <span className="micro micro--dim">COOLDOWN 2.5S</span>
      </div>
      {room.lastSignal && definition ? (
        <div className={`signal-last signal-last--${room.lastSignal.side === 1 ? 'cyan' : 'magenta'}`}>
          <span className="signal-last__glyph">
            <SignalGlyph kind={room.lastSignal.kind} />
          </span>
          <div>
            <strong>{definition.label}</strong>
            <span className="micro">{sender ?? `OPERATOR 0${room.lastSignal.seat}`}</span>
          </div>
          <span className="micro micro--dim">{formatClock(now - Date.parse(room.lastSignal.at))}</span>
        </div>
      ) : (
        <p className="comms-panel__empty">Pre-set pings only. No chat, no noise.</p>
      )}
      <div className="signal-grid">
        {SIGNAL_DEFINITIONS.map(definitionItem => (
          <button
            key={definitionItem.kind}
            type="button"
            className="signal-button"
            onClick={() => onSignal(definitionItem.kind)}
            disabled={disabled || busy !== null || cooldown > 0}
            title={definitionItem.label}
          >
            <SignalGlyph kind={definitionItem.kind} />
            <span>{definitionItem.label.toUpperCase()}</span>
          </button>
        ))}
      </div>
      {cooldown > 0 && (
        <p className="comms-panel__cooldown mono">SIGNAL RECHARGING · {Math.ceil(cooldown / 100) / 10}s</p>
      )}
    </div>
  );
}

function OfflineNotice({
  room,
  rival,
  onForfeit,
}: {
  room: RoomView;
  rival: RoomView['seats'][number] | null;
  onForfeit: () => void;
}) {
  const now = useNow(true, 1_000);
  if (!rival || room.status !== 'active') return null;
  const elapsed = elapsedSince(rival.lastSeen, now);
  const remaining = Math.max(0, FORFEIT_AFTER_MS - elapsed);
  if (rival.online) return null;

  return (
    <div className="offline-banner" role="status">
      <span className="offline-banner__icon">
        <WifiOffIcon size={16} />
      </span>
      <div>
        <strong>RIVAL UPLINK WEAK</strong>
        <p>
          {room.canClaimForfeit
            ? 'The grace window has expired. You can claim the disconnect.'
            : `No signal for ${formatClock(elapsed)}. Disconnect claim unlocks in ${formatClock(remaining)}.`}
        </p>
      </div>
      {room.canClaimForfeit && (
        <button type="button" className="btn btn--warn btn--small" onClick={onForfeit}>
          <CrownIcon size={15} /> CLAIM DISCONNECT
        </button>
      )}
    </div>
  );
}

interface ResultDialogProps {
  open: boolean;
  room: RoomView;
  headline: ReturnType<typeof finishHeadline>;
  busy: string | null;
  myVote: boolean;
  rivalVote: boolean;
  onClose: () => void;
  onRematch: () => void;
  onInspect: () => void;
  onExit: () => void;
}

function ResultDialog({
  open,
  room,
  headline,
  busy,
  myVote,
  rivalVote,
  onClose,
  onRematch,
  onInspect,
  onExit,
}: ResultDialogProps) {
  const you = room.you;
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="result-title"
      className={`result-modal result-modal--${headline.result}`}
    >
      <div className="result-sigil" aria-hidden="true">
        {headline.result === 'win' ? <CrownIcon size={34} /> : <SignalIcon size={34} />}
      </div>
      <p className="eyebrow">{headline.eyebrow}</p>
      <h2 id="result-title" className="result-title">
        {headline.title}
      </h2>
      <p className="result-detail">{headline.detail}</p>

      <div className="result-stats">
        <div>
          <span className="micro">MOVES</span>
          <strong className="mono">{room.moveCount}</strong>
        </div>
        <div>
          <span className="micro">GRID</span>
          <strong className="mono">{room.size}×{room.size}</strong>
        </div>
        <div>
          <span className="micro">SWAP</span>
          <strong className="mono">{room.swapped ? 'USED' : 'UNUSED'}</strong>
        </div>
        <div>
          <span className="micro">LINK</span>
          <strong className="mono">{room.finishReason === 'resign' ? 'RESIGN' : room.finishReason === 'forfeit' ? 'DARK' : room.finishReason === 'draw' ? 'DRAW' : 'CHAIN'}</strong>
        </div>
      </div>

      {rivalVote && !myVote && you && (
        <div className="rematch-invite">
          <RefreshIcon size={16} />
          <span>Your rival has requested a rematch.</span>
        </div>
      )}
      {myVote && (
        <div className="rematch-invite rematch-invite--quiet">
          <RefreshIcon size={16} />
          <span>Rematch requested. Waiting for your rival to accept.</span>
        </div>
      )}

      <div className="modal-actions result-actions">
        {you ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={onRematch}
            disabled={busy !== null || myVote}
          >
            {busy === 'rematch' ? (
              <><span className="spinner" /> REQUESTING…</>
            ) : myVote ? (
              <><RefreshIcon size={16} /> AWAITING RIVAL</>
            ) : rivalVote ? (
              <><RefreshIcon size={16} /> ACCEPT REMATCH</>
            ) : (
              <><RefreshIcon size={16} /> REQUEST REMATCH</>
            )}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={onExit}>
            <SparkIcon size={16} /> OPEN YOUR OWN UPLINK
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onInspect}>
          INSPECT LATTICE
        </button>
        <button type="button" className="btn btn--quiet" onClick={onExit}>
          LEAVE DUEL
        </button>
      </div>

      <p className="result-foot micro">
        {you
          ? 'A rematch needs both operators. Sides reset to cyan first; the swap protocol reopens after the opening claim.'
          : 'Observation mode. You can remain while the lattice resets.'}
      </p>
    </Modal>
  );
}
