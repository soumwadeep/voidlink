import { useEffect, useState } from 'react';
import { MAX_NAME_LENGTH, normaliseName } from '../../shared/protocol';
import type { AiDifficulty } from '../../shared/ai';
import { AI_DIFFICULTIES } from '../../shared/ai';
import type { BoardSize, Side } from '../../shared/engine';
import { CloseIcon, GridIcon, LockIcon, SparkIcon, UsersIcon } from './Icons';
import { Modal } from './Modal';

export type LaunchMode = 'create' | 'quick' | 'spar';

export interface LaunchConfig {
  mode: LaunchMode;
  name: string;
  size: BoardSize;
  difficulty: AiDifficulty;
  side: Side;
}

interface LaunchDialogProps {
  open: boolean;
  mode: LaunchMode;
  callsign: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onStart: (config: LaunchConfig) => void;
}

const MODE_COPY: Record<LaunchMode, { eyebrow: string; title: string; body: string }> = {
  create: {
    eyebrow: 'PRIVATE TRANSMISSION',
    title: 'OPEN AN UPLINK',
    body: 'You take CYAN. Your rival takes MAGENTA. Share the six-character code or the link.',
  },
  quick: {
    eyebrow: 'PUBLIC LATTICE',
    title: 'QUICK MATCH',
    body: 'Scan for a waiting operator. If nobody answers immediately, your uplink stays open until someone enters.',
  },
  spar: {
    eyebrow: 'LOCAL SIMULATION',
    title: 'SPAR AGAINST NEXUS',
    body: 'A training lattice that runs entirely on this device. No rival, no waiting, no account.',
  },
};

const SIZE_OPTIONS: { size: BoardSize; name: string; detail: string; tag: string }[] = [
  { size: 7, name: 'RAPID', detail: '49 nodes · 5–10 minutes', tag: 'RECOMMENDED' },
  { size: 9, name: 'CLASSIC', detail: '81 nodes · longer campaign', tag: 'DEEP' },
];

export function LaunchDialog({
  open,
  mode,
  callsign,
  busy,
  error,
  onClose,
  onStart,
}: LaunchDialogProps) {
  const [name, setName] = useState(callsign);
  const [size, setSize] = useState<BoardSize>(7);
  const [difficulty, setDifficulty] = useState<AiDifficulty>('veteran');
  const [side, setSide] = useState<Side>(1);
  const [localError, setLocalError] = useState<string | null>(null);
  const copy = MODE_COPY[mode];

  useEffect(() => {
    if (open) {
      setName(callsign);
      setLocalError(null);
    }
  }, [open, callsign]);

  const clean = normaliseName(name);

  function submit() {
    if (!clean) {
      setLocalError('Callsign needs 2–16 letters, numbers, spaces, or . _ -');
      return;
    }
    setLocalError(null);
    onStart({ mode, name: clean, size, difficulty, side });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="launch-modal"
      labelledBy="launch-title"
    >
      <div className="modal-head">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="launch-title" className="modal-title">
            {copy.title}
          </h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close launch panel">
          <CloseIcon />
        </button>
      </div>
      <p className="modal-lede">{copy.body}</p>

      <div className="field">
        <label className="field__label" htmlFor="operator-name">
          OPERATOR CALLSIGN
          <span className="field__meta">
            {name.length}/{MAX_NAME_LENGTH}
          </span>
        </label>
        <input
          id="operator-name"
          className="input mono"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoFocus
          autoComplete="nickname"
          spellCheck={false}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') submit();
          }}
        />
        <p className="field__hint">Shown to your rival. You can change it on any launch.</p>
      </div>

      <fieldset className="option-group">
        <legend className="field__label">LATTICE SIZE</legend>
        <div className="size-options" role="radiogroup" aria-label="Lattice size">
          {SIZE_OPTIONS.map(option => (
            <button
              key={option.size}
              type="button"
              role="radio"
              aria-checked={size === option.size}
              className={`size-option ${size === option.size ? 'is-selected' : ''}`}
              onClick={() => setSize(option.size)}
            >
              <span className="size-option__glyph" aria-hidden="true">
                <GridIcon size={20} />
                <span>{option.size}</span>
              </span>
              <span className="size-option__copy">
                <span className="size-option__name">
                  {option.name} <em>{option.tag}</em>
                </span>
                <span className="size-option__detail">{option.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {mode === 'spar' && (
        <>
          <fieldset className="option-group">
            <legend className="field__label">NEXUS AGGRESSION</legend>
            <div className="difficulty-options" role="radiogroup" aria-label="AI difficulty">
              {AI_DIFFICULTIES.map(option => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === option.id}
                  className={`difficulty-option ${difficulty === option.id ? 'is-selected' : ''}`}
                  onClick={() => setDifficulty(option.id)}
                >
                  <span className="difficulty-option__name">{option.name}</span>
                  <span className="difficulty-option__sub">{option.subtitle}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="option-group">
            <legend className="field__label">YOUR GATES</legend>
            <div className="side-toggle" role="radiogroup" aria-label="Your side">
              <button
                type="button"
                role="radio"
                aria-checked={side === 1}
                className={`side-choice side-choice--cyan ${side === 1 ? 'is-selected' : ''}`}
                onClick={() => setSide(1)}
              >
                <span className="side-choice__dot" aria-hidden="true" />
                <span>
                  <strong>CYAN</strong>
                  <small>top ↔ bottom · moves first</small>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={side === 2}
                className={`side-choice side-choice--magenta ${side === 2 ? 'is-selected' : ''}`}
                onClick={() => setSide(2)}
              >
                <span className="side-choice__dot" aria-hidden="true" />
                <span>
                  <strong>MAGENTA</strong>
                  <small>left ↔ right · moves second</small>
                </span>
              </button>
            </div>
          </fieldset>
        </>
      )}

      {(localError || error) && (
        <p className="form-error" role="alert">
          {localError ?? error}
        </p>
      )}

      <button type="button" className="btn btn--primary btn--large launch-submit" onClick={submit} disabled={busy}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" /> {mode === 'quick' ? 'SCANNING…' : 'PREPARING…'}
          </>
        ) : (
          <>
            {mode === 'create' && <LockIcon size={18} />}
            {mode === 'quick' && <UsersIcon size={18} />}
            {mode === 'spar' && <SparkIcon size={18} />}
            {mode === 'create' ? 'GENERATE UPLINK' : mode === 'quick' ? 'SEARCH THE LATTICE' : 'BEGIN SPAR'}
          </>
        )}
      </button>

      <div className="launch-foot mono">
        <span>NO ACCOUNT</span>
        <span>SERVER-AUTHORITATIVE MOVES</span>
        <span>{mode === 'spar' ? 'LOCAL ONLY' : 'CROSS-DEVICE'}</span>
      </div>
    </Modal>
  );
}
