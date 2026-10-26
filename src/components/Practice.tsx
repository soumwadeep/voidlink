import { useEffect, useRef, useState } from 'react';
import {
  applyMove,
  createGame,
  otherSide,
  type GameState,
  type Side,
} from '../../shared/engine.ts';
import { AI_DIFFICULTIES, chooseAiMove, type AiDifficulty } from '../../shared/ai.ts';
import type { PracticeSetup } from '../App.tsx';
import { Board } from './Board.tsx';
import { Modal } from './Modal.tsx';
import {
  ArrowLeft,
  ArrowRight,
  BookIcon,
  CloseIcon,
  CrownIcon,
  RefreshIcon,
  SignalIcon,
  SparkIcon,
} from './Icons.tsx';
import { haptic, play } from '../lib/sound.ts';

interface PracticeProps {
  setup: PracticeSetup;
  onExit: () => void;
  onRules: () => void;
  onReconfigure: () => void;
}

const AI_NAMES: Record<AiDifficulty, string> = {
  cadet: 'NEXUS // SPAR',
  veteran: 'NEXUS // VETERAN',
  ace: 'NEXUS // ACE',
};

const AI_BRIEFS: Record<AiDifficulty, string> = {
  cadet: 'Probes wide vectors and sometimes misses a narrow bridge.',
  veteran: 'Reads the shortest route and severs immediate chains.',
  ace: 'Checks the reply before every claim. Closes bridges early.',
};

export function Practice({ setup, onExit, onRules, onReconfigure }: PracticeProps) {
  const [game, setGame] = useState<GameState>(() => createGame(setup.size, 1));
  const [lastMove, setLastMove] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [record, setRecord] = useState({ wins: 0, losses: 0 });
  const scored = useRef(false);
  const aiSide: Side = otherSide(setup.side);
  const difficultyLabel = AI_DIFFICULTIES.find(item => item.id === setup.difficulty)?.name ?? 'VETERAN';

  useEffect(() => {
    if (game.status !== 'won') return;
    setResultOpen(true);
    play(game.winner === setup.side ? 'win' : 'lose');
    haptic(game.winner === setup.side ? [18, 60, 18, 60, 32] : 16);
    if (!scored.current) {
      scored.current = true;
      setRecord(previous =>
        game.winner === setup.side
          ? { ...previous, wins: previous.wins + 1 }
          : { ...previous, losses: previous.losses + 1 },
      );
    }
  }, [game.status, game.winner, setup.side]);

  useEffect(() => {
    if (game.status !== 'active' || game.turn !== aiSide) {
      setThinking(false);
      return;
    }
    setThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseAiMove(game, aiSide, setup.difficulty);
      if (!move) {
        setThinking(false);
        return;
      }
      const result = applyMove(game, move.cell);
      if (result.ok) {
        setGame(result.state);
        setLastMove(move.cell);
        if (result.state.status === 'active') play('rival');
      }
      setThinking(false);
    }, 520 + Math.random() * 520);
    return () => {
      window.clearTimeout(timer);
      setThinking(false);
    };
  }, [game, aiSide, setup.difficulty]);

  function reset() {
    setGame(createGame(setup.size, 1));
    setLastMove(null);
    setThinking(false);
    setResultOpen(false);
    scored.current = false;
    play('launch');
  }

  function claim(cell: number) {
    if (game.status !== 'active' || game.turn !== setup.side) return;
    const result = applyMove(game, cell);
    if (!result.ok) {
      play('error');
      return;
    }
    setGame(result.state);
    setLastMove(cell);
    if (result.state.status === 'active') {
      play('claim');
      haptic(9);
    }
  }

  const humanTurn = game.status === 'active' && game.turn === setup.side;
  const finished = game.status === 'won';
  const humanWon = finished && game.winner === setup.side;
  const banner = finished
    ? {
        kind: 'finished',
        eyebrow: 'SPAR COMPLETE',
        title: humanWon ? 'YOU HOLD THE LATTICE' : 'NEXUS HOLDS THE LATTICE',
        sub: humanWon ? 'The training lattice is yours.' : 'Study the chain, then run it again.',
      }
    : humanTurn
      ? {
          kind: 'you',
          eyebrow: 'YOUR TURN',
          title: 'EXTEND YOUR CHAIN',
          sub: 'Claim one node. NEXUS is reading your line.',
        }
      : {
          kind: 'rival',
          eyebrow: 'NEXUS TRANSMITTING',
          title: thinking ? 'CALCULATING THE LATTICE' : 'NEXUS IS MOVING',
          sub: `${AI_BRIEFS[setup.difficulty]}`,
        };

  return (
    <main className="game-screen practice-screen">
      <div className="practice-ribbon">
        <span className="mono">LOCAL SIMULATION // NO SERVER // NO RIVAL</span>
        <span className="micro micro--dim">SWAP PROTOCOL IS DISABLED IN SPAR</span>
      </div>

      <div className="game-layout">
        <aside className="game-side game-side--left">
          <div className="player-stack">
            <PracticePlayerCard
              label={`OPERATOR 0${setup.side}`}
              name={setup.name}
              side={setup.side}
              isYou
              isTurn={humanTurn}
              status={finished ? (humanWon ? 'DUEL WON' : 'DUEL LOST') : humanTurn ? 'YOUR MOVE' : 'HOLDING'}
            />
            <PracticePlayerCard
              label={`OPERATOR 0${aiSide}`}
              name={AI_NAMES[setup.difficulty]}
              side={aiSide}
              isYou={false}
              isTurn={game.status === 'active' && game.turn === aiSide}
              status={finished ? (humanWon ? 'DUEL LOST' : 'DUEL WON') : thinking ? 'THINKING' : 'HOLDING'}
            />
          </div>

          <div className="panel practice-record">
            <p className="eyebrow">SPAR RECORD</p>
            <div className="practice-record__row">
              <div>
                <span className="micro">WINS</span>
                <strong className="mono">{String(record.wins).padStart(2, '0')}</strong>
              </div>
              <div>
                <span className="micro">LOSSES</span>
                <strong className="mono">{String(record.losses).padStart(2, '0')}</strong>
              </div>
              <div>
                <span className="micro">MOVES</span>
                <strong className="mono">{String(game.moveCount).padStart(2, '0')}</strong>
              </div>
            </div>
            <p className="micro micro--dim">LOCAL ONLY · RESETS WITH THE TAB</p>
          </div>

          <button type="button" className="btn btn--ghost btn--small" onClick={reset} disabled={thinking}>
            <RefreshIcon size={15} /> RESTART SPAR
          </button>
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
            <span className="micro micro--dim">MOVE {String(game.moveCount).padStart(2, '0')} / {setup.size * setup.size}</span>
          </div>

          <div className={`turn-banner turn-banner--${banner.kind}`}>
            <div className="turn-banner__copy">
              <p className="eyebrow">{banner.eyebrow}</p>
              <h1>{banner.title}</h1>
              <p>{banner.sub}</p>
            </div>
            <div className="turn-banner__meter">
              <span className="micro">TURN</span>
              <strong className="mono">{String(Math.ceil(game.moveCount / 2) + (game.status === 'active' ? 1 : 0)).padStart(2, '0')}</strong>
              <span className="micro micro--dim">{difficultyLabel}</span>
            </div>
          </div>

          <div className="board-stage">
            <div className={`board-aura board-aura--${setup.side === 2 ? 'magenta' : 'cyan'}`} aria-hidden="true" />
            <Board
              size={setup.size}
              board={game.board}
              yourSide={setup.side}
              interactive={humanTurn}
              onClaim={claim}
              winPath={game.winPath}
              lastMove={lastMove}
              pendingCell={null}
              label={`Practice lattice. You are ${setup.side === 1 ? 'cyan' : 'magenta'}.`}
            />
          </div>

          <div className="board-underbar">
            <p className="board-hint">
              {finished ? (
                <>
                  <CrownIcon size={14} /> {humanWon ? 'A clean link. Run it back or raise the difficulty.' : 'NEXUS closed the chain. The board is still yours to study.'}
                </>
              ) : humanTurn ? (
                <>
                  <span className="hint-dot" aria-hidden="true" /> Pick any open hex. NEXUS is watching the same lattice.
                </>
              ) : (
                <>
                  <span className="hint-dot hint-dot--dim" aria-hidden="true" /> Study the rival's line while it calculates.
                </>
              )}
            </p>
            <div className="underbar-actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={onRules}>
                <BookIcon size={15} /> CODEX
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={reset} disabled={thinking}>
                <RefreshIcon size={15} /> RESTART
              </button>
              <button type="button" className="btn btn--primary btn--small" onClick={onReconfigure} disabled={thinking}>
                <SparkIcon size={15} /> NEW SPAR
              </button>
              <button type="button" className="btn btn--danger btn--small" onClick={onExit}>
                <CloseIcon size={14} /> EXIT
              </button>
            </div>
          </div>

          {finished && !resultOpen && (
            <button type="button" className="result-strip" onClick={() => setResultOpen(true)}>
              <span className={`result-strip__sigil result-strip__sigil--${humanWon ? 'win' : 'loss'}`} aria-hidden="true">
                {humanWon ? <CrownIcon size={18} /> : <SignalIcon size={18} />}
              </span>
              <span>
                <strong>{humanWon ? 'SPAR SECURED' : 'NEXUS PREVAILS'}</strong>
                <small>VIEW RESULT</small>
              </span>
              <span className="text-link">
                VIEW RESULT <ArrowRight size={14} />
              </span>
            </button>
          )}
        </section>

        <aside className="game-side game-side--right">
          <div className="panel practice-dossier">
            <p className="eyebrow">NEXUS DOSSIER</p>
            <h2>{difficultyLabel}</h2>
            <p>{AI_BRIEFS[setup.difficulty]}</p>
            <dl className="meta-list">
              <div>
                <dt>OPPONENT</dt>
                <dd>{AI_NAMES[setup.difficulty]}</dd>
              </div>
              <div>
                <dt>YOUR GATES</dt>
                <dd className={setup.side === 2 ? 'text-magenta' : 'text-cyan'}>
                  {setup.side === 2 ? 'MAGENTA' : 'CYAN'}
                </dd>
              </div>
              <div>
                <dt>GRID</dt>
                <dd>{setup.size} × {setup.size}</dd>
              </div>
              <div>
                <dt>SWAP</dt>
                <dd>DISABLED</dd>
              </div>
            </dl>
            <button type="button" className="text-link" onClick={onRules}>
              STUDY THE FULL CODEX <ArrowRight size={14} />
            </button>
          </div>

          <div className="panel practice-tip">
            <p className="eyebrow">FIELD NOTE</p>
            <p>
              A chain may bend through any open hex. Look for bridges — two of your nodes that
              share two landing cells — before NEXUS takes one of them.
            </p>
            <button type="button" className="btn btn--ghost btn--small" onClick={onReconfigure}>
              CHANGE DIFFICULTY <ArrowRight size={14} />
            </button>
          </div>

          <button type="button" className="game-leave" onClick={onExit}>
            RETURN TO DECK <ArrowLeft size={14} />
          </button>
        </aside>
      </div>

      <Modal
        open={resultOpen}
        onClose={() => setResultOpen(false)}
        labelledBy="spar-result-title"
        className={`result-modal ${humanWon ? 'result-modal--win' : 'result-modal--loss'}`}
      >
        <div className="result-sigil" aria-hidden="true">
          {humanWon ? <CrownIcon size={34} /> : <SignalIcon size={34} />}
        </div>
        <p className="eyebrow">{humanWon ? 'SPAR SECURED' : 'SPAR LOST'}</p>
        <h2 id="spar-result-title" className="result-title">
          {humanWon ? 'YOU OUTREAD NEXUS' : 'NEXUS CLOSED THE CHAIN'}
        </h2>
        <p className="result-detail">
          {humanWon
            ? `${difficultyLabel} could not answer your link. Raise the aggression or carry this shape into a live duel.`
            : `${difficultyLabel} found the shorter route. Inspect the final chain, then take the lattice again.`}
        </p>
        <div className="result-stats">
          <div>
            <span className="micro">MOVES</span>
            <strong className="mono">{game.moveCount}</strong>
          </div>
          <div>
            <span className="micro">GRID</span>
            <strong className="mono">{setup.size}×{setup.size}</strong>
          </div>
          <div>
            <span className="micro">SPAR</span>
            <strong className="mono">{record.wins}–{record.losses}</strong>
          </div>
          <div>
            <span className="micro">MODE</span>
            <strong className="mono">LOCAL</strong>
          </div>
        </div>
        <div className="modal-actions result-actions">
          <button type="button" className="btn btn--primary" onClick={reset}>
            <RefreshIcon size={16} /> RUN IT AGAIN
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setResultOpen(false)}>
            INSPECT LATTICE
          </button>
          <button type="button" className="btn btn--ghost" onClick={onReconfigure}>
            NEW SPAR
          </button>
          <button type="button" className="btn btn--quiet" onClick={onExit}>
            LEAVE DUEL
          </button>
        </div>
      </Modal>
    </main>
  );
}

function PracticePlayerCard({
  label,
  name,
  side,
  isYou,
  isTurn,
  status,
}: {
  label: string;
  name: string;
  side: Side;
  isYou: boolean;
  isTurn: boolean;
  status: string;
}) {
  return (
    <article className={`player-card player-card--${side === 1 ? 'cyan' : 'magenta'} ${isYou ? 'is-you' : ''} ${isTurn ? 'is-turn' : ''}`}>
      <div className="player-card__top">
        <span className="micro">{label}</span>
        <span className="tag">{isYou ? 'YOU' : 'AI'}</span>
      </div>
      <div className="player-card__identity">
        <span className="player-card__sigil" aria-hidden="true">{side === 1 ? '◇' : '◆'}</span>
        <div>
          <h2>{name}</h2>
          <p className="mono">{side === 1 ? 'CYAN' : 'MAGENTA'} · {side === 1 ? 'TOP ↔ BOTTOM' : 'LEFT ↔ RIGHT'}</p>
        </div>
      </div>
      <div className="player-card__foot">
        <span>{isTurn ? <><i className="live-dot" aria-hidden="true" /> {status}</> : status}</span>
        <span className="micro micro--dim">{isYou ? 'THIS DEVICE' : 'LOCAL AI'}</span>
      </div>
    </article>
  );
}
