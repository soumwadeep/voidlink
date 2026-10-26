import { useState } from 'react';
import { ROOM_CODE_LENGTH } from '../../shared/protocol';
import { LatticePreview } from './LatticePreview';
import { ArrowRight, BoltIcon, LockIcon, SparkIcon, UsersIcon } from './Icons';
import type { LaunchMode } from './LaunchDialog';

interface HomeProps {
  onLaunch: (mode: LaunchMode) => void;
  onJoin: (code: string) => void;
  onRules: () => void;
}

export function Home({ onLaunch, onJoin, onRules }: HomeProps) {
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  function onCodeChange(value: string) {
    const clean = value
      .toUpperCase()
      .replace(/[^A-HJ-NP-Z2-9]/g, '')
      .slice(0, ROOM_CODE_LENGTH);
    setCode(clean);
    if (joinError) setJoinError(null);
  }

  function submitJoin(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== ROOM_CODE_LENGTH) {
      setJoinError(`Enter the full ${ROOM_CODE_LENGTH}-character code.`);
      return;
    }
    setJoinError(null);
    onJoin(code);
  }

  return (
    <main className="home">
      <div className="home__orb home__orb--a" aria-hidden="true" />
      <div className="home__orb home__orb--b" aria-hidden="true" />

      <div className="home__hero">
        <div className="hero-copy">
          <p className="eyebrow hero-copy__eyebrow">
            <span className="eyebrow-dash" aria-hidden="true" />
            TWO-OPERATOR LATTICE DUEL
            <span className="hero-copy__sector">SECTOR 07</span>
          </p>

          <h1 className="hero-mark" aria-label="VOIDLINK">
            <span>VOID</span>
            <span className="hero-mark__accent">LINK</span>
            <span className="hero-mark__cursor" aria-hidden="true" />
          </h1>

          <p className="hero-tagline">Claim the lattice. Join your gates. Cut theirs.</p>
          <p className="hero-lede">
            A turn-based strategy duel for two people on any two devices. Six shared edges,
            one unbroken chain, and nowhere to hide.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="btn btn--primary btn--large hero-cta"
              onClick={() => onLaunch('create')}
            >
              <LockIcon size={18} />
              OPEN A PRIVATE UPLINK
              <ArrowRight size={18} />
            </button>

            <form className="join-form" onSubmit={submitJoin}>
              <div className={`join-field ${joinError ? 'has-error' : ''}`}>
                <label className="join-field__label" htmlFor="room-code">
                  HAVE A CODE?
                </label>
                <div className="join-field__row">
                  <input
                    id="room-code"
                    className="join-field__input mono"
                    value={code}
                    onChange={event => onCodeChange(event.target.value)}
                    placeholder="ENTER 6-CHAR UPLINK"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby={joinError ? 'join-error' : undefined}
                  />
                  <button type="submit" className="join-field__submit" aria-label="Enter duel with this code">
                    <ArrowRight size={18} />
                  </button>
                </div>
                {joinError && (
                  <p className="field__error" id="join-error" role="alert">
                    {joinError}
                  </p>
                )}
              </div>
            </form>

            <div className="hero-secondary">
              <button type="button" className="mode-chip" onClick={() => onLaunch('quick')}>
                <UsersIcon size={17} />
                <span>
                  <strong>QUICK MATCH</strong>
                  <small>find a rival now</small>
                </span>
                <ArrowRight size={15} />
              </button>
              <button type="button" className="mode-chip" onClick={() => onLaunch('spar')}>
                <SparkIcon size={17} />
                <span>
                  <strong>SPAR VS NEXUS</strong>
                  <small>train alone</small>
                </span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>

          <div className="hero-trust mono">
            <span>
              <BoltIcon size={13} /> NO ACCOUNT
            </span>
            <span>WORKS ON PHONE / TABLET / DESKTOP</span>
            <span>SHARE ONE LINK</span>
          </div>
        </div>

        <div className="hero-visual">
          <LatticePreview />
          <div className="hero-visual__note">
            <span className="micro">SCHEMATIC // NOT A LIVE ROOM</span>
            <span className="micro micro--dim">LOOK FOR A CHAIN BETWEEN LIKE NODES</span>
          </div>
        </div>
      </div>

      <section className="brief-strip" aria-labelledby="brief-title">
        <div className="brief-strip__head">
          <div>
            <p className="eyebrow">FIELD MANUAL / 01</p>
            <h2 id="brief-title" className="section-title">
              Three moves. Infinite lattices.
            </h2>
          </div>
          <button type="button" className="text-link" onClick={onRules}>
            READ THE FULL CODEX <ArrowRight size={15} />
          </button>
        </div>

        <div className="brief-grid">
          <article className="brief-card">
            <span className="brief-card__index mono">01</span>
            <h3>CLAIM</h3>
            <p>On your turn, place one node anywhere the lattice is open. Nodes never move.</p>
            <span className="brief-card__tag mono">ONE TURN · ONE NODE</span>
          </article>
          <article className="brief-card">
            <span className="brief-card__index mono">02</span>
            <h3>CONNECT</h3>
            <p>Link a continuous chain across all six shared edges between your two gates.</p>
            <span className="brief-card__tag mono">CYAN TOP ↔ BOTTOM · MAGENTA LEFT ↔ RIGHT</span>
          </article>
          <article className="brief-card">
            <span className="brief-card__index mono">03</span>
            <h3>CONTROL</h3>
            <p>There are no draws. The first unbroken chain holds the lattice; withdraw and it is lost.</p>
            <span className="brief-card__tag mono">FIRST CHAIN WINS</span>
          </article>
        </div>
      </section>

      <footer className="home__footer">
        <span className="mono">VOIDLINK // RELAY BUILD 1.0</span>
        <span className="home__footer-note">Built for two. Best played with a rival who thinks ahead.</span>
        <div className="home__footer-links">
          <button type="button" className="text-link" onClick={onRules}>
            CODEX
          </button>
          <a
            className="text-link"
            href="https://github.com/soumwadeep/voidlink"
            target="_blank"
            rel="noreferrer"
          >
            SOURCE
          </a>
        </div>
      </footer>
    </main>
  );
}
