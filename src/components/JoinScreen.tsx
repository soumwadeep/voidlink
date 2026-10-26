import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  MAX_NAME_LENGTH,
  normaliseName,
  type EnterRoomResponse,
  type RoomView,
} from '../../shared/protocol';
import { sideLabel } from '../lib/format';
import { loadCallsign } from '../lib/session';
import { VoidlinkApiError, apiRequest } from '../lib/api';
import { ArrowLeft, ArrowRight, LinkIcon, LockIcon, RefreshIcon, UsersIcon } from './Icons';

interface JoinScreenProps {
  code: string;
  onJoined: (response: EnterRoomResponse, name: string) => void;
  onSpectate: (room: RoomView) => void;
  onHome: () => void;
  onRules: () => void;
}

const PREVIEW_REFRESH_MS = 4_000;

export function JoinScreen({ code, onJoined, onSpectate, onHome, onRules }: JoinScreenProps) {
  const [preview, setPreview] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const fatalRef = useRef(false);
  const [name, setName] = useState(loadCallsign);
  const [busy, setBusy] = useState<'join' | 'spectate' | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const disposed = useRef(false);

  const full = Boolean(
    preview && (preview.status !== 'waiting' || preview.seats.length >= 2),
  );

  useEffect(() => {
    disposed.current = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const room = await apiRequest<RoomView>(`/rooms/${code}`);
        if (disposed.current) return;
        setPreview(room);
        setLoadError(null);
        setFatal(false);
        fatalRef.current = false;
        setLoading(false);
      } catch (error) {
        if (disposed.current) return;
        const apiError =
          error instanceof VoidlinkApiError
            ? error
            : new VoidlinkApiError('network', 'The relay is unreachable.', 0);
        setLoadError(apiError.message);
        setLoading(false);
        if (apiError.code === 'room_not_found' || apiError.code === 'invalid_code') {
          fatalRef.current = true;
          setFatal(true);
        }
      }
      if (!disposed.current && !fatalRef.current) {
        timer = window.setTimeout(load, PREVIEW_REFRESH_MS);
      }
    };

    void load();
    return () => {
      disposed.current = true;
      window.clearTimeout(timer);
    };
  }, [code, reloadKey]);

  useEffect(() => {
    if (!preview) return;
    if (preview.status !== 'waiting' && !loading) {
      // The field filled while this page was open.
      setJoinError(null);
    }
  }, [preview, loading]);

  async function join() {
    const clean = normaliseName(name);
    if (!clean) {
      setJoinError('Callsign needs 2–16 letters, numbers, spaces, or . _ -');
      return;
    }
    setBusy('join');
    setJoinError(null);
    try {
      const response = await apiRequest<EnterRoomResponse>(`/rooms/${code}/join`, {
        method: 'POST',
        body: { name: clean },
      });
      onJoined(response, clean);
    } catch (error) {
      const apiError =
        error instanceof VoidlinkApiError
          ? error
          : new VoidlinkApiError('network', 'The relay is unreachable.', 0);
      setJoinError(apiError.message);
      if (apiError.code === 'room_full' || apiError.code === 'game_not_active') {
        setPreview(prev => (prev ? { ...prev, status: 'active' } : prev));
      }
      setBusy(null);
    }
  }

  async function observe() {
    setBusy('spectate');
    try {
      const room = await apiRequest<RoomView>(`/rooms/${code}`);
      onSpectate(room);
    } catch (error) {
      const apiError =
        error instanceof VoidlinkApiError
          ? error
          : new VoidlinkApiError('network', 'The relay is unreachable.', 0);
      setJoinError(apiError.message);
      setBusy(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void join();
  }

  const host = preview?.seats.find(seat => seat.seat === 1);
  const guest = preview?.seats.find(seat => seat.seat === 2);

  return (
    <main className="join-screen">
      <div className="join-screen__orbit" aria-hidden="true" />
      <div className="join-card">
        <span className="corner corner--tl" aria-hidden="true" />
        <span className="corner corner--tr" aria-hidden="true" />
        <span className="corner corner--bl" aria-hidden="true" />
        <span className="corner corner--br" aria-hidden="true" />

        <button type="button" className="text-link join-card__back" onClick={onHome}>
          <ArrowLeft size={15} /> RETURN TO DECK
        </button>

        <div className="join-card__head">
          <p className="eyebrow">INCOMING UPLINK</p>
          <div className="join-code mono">{code}</div>
          {preview && (
            <p className="micro micro--dim">
              {preview.size}×{preview.size} {preview.size === 7 ? 'RAPID' : 'CLASSIC'} · {preview.publicMatch ? 'PUBLIC MATCH' : 'PRIVATE MATCH'}
            </p>
          )}
        </div>

        {loading && (
          <div className="join-card__loading">
            <span className="spinner spinner--large" aria-hidden="true" />
            <p className="mono">READING LATTICE SIGNAL…</p>
          </div>
        )}

        {!loading && fatal && (
          <div className="join-card__dead">
            <p className="eyebrow eyebrow--warn">NO SIGNAL</p>
            <h1 className="join-title">THIS UPLINK IS COLD.</h1>
            <p className="join-lede">
              {loadError ?? 'No duel answers to that code. Check the six characters and try again.'}
            </p>
            <div className="join-actions">
              <button type="button" className="btn btn--primary" onClick={onHome}>
                <ArrowLeft size={17} /> BACK TO DECK
              </button>
              <button type="button" className="btn btn--ghost" onClick={onRules}>
                READ THE CODEX
              </button>
            </div>
          </div>
        )}

        {!loading && !fatal && !preview && (
          <div className="join-card__dead">
            <p className="eyebrow eyebrow--warn">UPLINK WEAK</p>
            <h1 className="join-title">THE RELAY DID NOT ANSWER.</h1>
            <p className="join-lede">
              {loadError ?? 'The lattice could not be read. Check your connection and retry.'}
            </p>
            <div className="join-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setLoading(true);
                  setLoadError(null);
                  setReloadKey(key => key + 1);
                }}
              >
                <RefreshIcon size={16} /> RETRY UPLINK
              </button>
              <button type="button" className="btn btn--ghost" onClick={onHome}>
                <ArrowLeft size={16} /> BACK TO DECK
              </button>
            </div>
            <p className="field__hint">The room code may still be valid. The relay retries automatically every few seconds.</p>
          </div>
        )}

        {!loading && !fatal && preview && (
          <>
            <div className="join-card__body">
              <div className="join-duel">
                <div className={`join-seat join-seat--cyan ${host ? 'is-filled' : ''}`}>
                  <span className="join-seat__sigil" aria-hidden="true" />
                  <div>
                    <p className="micro">CYAN · TOP ↔ BOTTOM</p>
                    <p className="join-seat__name">{host?.name ?? 'OPEN SEAT'}</p>
                    <p className="micro micro--dim">{host?.online ? 'UPLINK LIVE' : host ? 'SIGNAL WEAK' : 'AWAITING OPERATOR'}</p>
                  </div>
                </div>
                <div className="join-duel__axis" aria-hidden="true">
                  <span />
                  <b>VS</b>
                  <span />
                </div>
                <div className={`join-seat join-seat--magenta ${guest ? 'is-filled' : ''}`}>
                  <span className="join-seat__sigil" aria-hidden="true" />
                  <div>
                    <p className="micro">MAGENTA · LEFT ↔ RIGHT</p>
                    <p className="join-seat__name">{guest?.name ?? 'OPEN SEAT'}</p>
                    <p className="micro micro--dim">{guest?.online ? 'UPLINK LIVE' : guest ? 'SIGNAL WEAK' : 'AWAITING OPERATOR'}</p>
                  </div>
                </div>
              </div>

              {preview.status === 'waiting' && !full ? (
                <form className="join-entry" onSubmit={onSubmit}>
                  <p className="join-lede">
                    The host is holding the lattice open. You will pilot{' '}
                    <strong className="text-cyan">MAGENTA</strong> — link left to right before cyan
                    links top to bottom.
                  </p>
                  <label className="field__label" htmlFor="join-name">
                    YOUR CALLSIGN
                    <span className="field__meta">
                      {name.length}/{MAX_NAME_LENGTH}
                    </span>
                  </label>
                  <input
                    id="join-name"
                    className="input mono"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    autoComplete="nickname"
                    spellCheck={false}
                    onChange={event => setName(event.target.value)}
                  />
                  {joinError && (
                    <p className="form-error" role="alert">
                      {joinError}
                    </p>
                  )}
                  <div className="join-actions">
                    <button type="submit" className="btn btn--primary btn--large" disabled={busy !== null}>
                      {busy === 'join' ? (
                        <>
                          <span className="spinner" aria-hidden="true" /> SYNCING…
                        </>
                      ) : (
                        <>
                          <LinkIcon size={18} /> ENTER THE DUEL <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => void observe()} disabled={busy !== null}>
                      OBSERVE FIRST
                    </button>
                  </div>
                  {joinError && <p className="field__hint">The field may have filled. Observing still works.</p>}
                </form>
              ) : (
                <div className="join-entry">
                  <p className="eyebrow eyebrow--warn">
                    {preview.status === 'finished' ? 'DUEL CONCLUDED' : 'FIELD FULL'}
                  </p>
                  <h1 className="join-title">
                    {preview.status === 'finished' ? 'THE LATTICE IS SETTLED.' : 'TWO OPERATORS ARE ALREADY INSIDE.'}
                  </h1>
                  <p className="join-lede">
                    {preview.status === 'finished'
                      ? `This match ended with ${preview.winnerSide ? sideLabel(preview.winnerSide) : 'the lattice'} holding the chain. You can still review the final position.`
                      : 'Both seats are claimed. You can watch the live lattice without taking a side — or open a fresh uplink of your own.'}
                  </p>
                  {joinError && (
                    <p className="form-error" role="alert">
                      {joinError}
                    </p>
                  )}
                  <div className="join-actions">
                    <button type="button" className="btn btn--primary btn--large" onClick={() => void observe()} disabled={busy !== null}>
                      {busy === 'spectate' ? (
                        <>
                          <span className="spinner" aria-hidden="true" /> TUNING IN…
                        </>
                      ) : (
                        <>
                          <UsersIcon size={18} /> {preview.status === 'finished' ? 'REVIEW THE LATTICE' : 'OBSERVE THE DUEL'}
                        </>
                      )}
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={onHome}>
                      <ArrowLeft size={17} /> BACK TO DECK
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="join-card__foot">
              <span className="mono">
                <LockIcon size={12} /> {preview.status === 'waiting' ? 'RELAY ARMED' : 'LIVE TELEMETRY'}
              </span>
              <button type="button" className="text-link" onClick={onRules}>
                HOW THE LATTICE WORKS
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
