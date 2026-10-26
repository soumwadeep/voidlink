import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardSize, Side } from '../shared/engine';
import {
  normaliseRoomCode,
  type EnterRoomResponse,
  type RoomView,
} from '../shared/protocol';
import type { AiDifficulty } from '../shared/ai';
import { apiRequest, VoidlinkApiError } from './lib/api';
import { copyText, finishHeadline } from './lib/format';
import {
  loadCallsign,
  loadSession,
  saveCallsign,
  saveSession,
} from './lib/session';
import {
  haptic,
  isMuted,
  play,
  setMuted as persistMuted,
} from './lib/sound';
import { useRoom } from './lib/useRoom';
import { Home } from './components/Home';
import { JoinScreen } from './components/JoinScreen';
import { RoomScreen } from './components/RoomScreen';
import { Practice } from './components/Practice';
import { Codex } from './components/Codex';
import { LaunchDialog, type LaunchConfig, type LaunchMode } from './components/LaunchDialog';
import { Modal } from './components/Modal';
import { Toast, type ToastMessage } from './components/Toast';
import { TopBar } from './components/TopBar';
import { ArrowLeft, ArrowRight, CloseIcon } from './components/Icons';

type View = 'home' | 'join' | 'room' | 'practice';

export interface PracticeSetup {
  size: BoardSize;
  difficulty: AiDifficulty;
  side: Side;
  name: string;
}

function readInitialRoute() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room');
  const code = normaliseRoomCode(raw);
  const session = code ? loadSession(code) : null;
  return { rawPresent: Boolean(raw), code, session };
}

export function App() {
  const [initial] = useState(readInitialRoute);
  const [view, setView] = useState<View>(() =>
    initial.code ? (initial.session ? 'room' : 'join') : 'home',
  );
  const [roomCode, setRoomCode] = useState<string | null>(initial.code);
  const [token, setToken] = useState<string | null>(initial.session?.token ?? null);
  const [callsign, setCallsign] = useState(loadCallsign);
  const [launchMode, setLaunchMode] = useState<LaunchMode | null>(null);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [practice, setPractice] = useState<PracticeSetup | null>(null);
  const [practiceKey, setPracticeKey] = useState(0);
  const [codexOpen, setCodexOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastId = useRef(0);
  const practiceConfig = practice;

  const feed = useRoom(view === 'room' ? roomCode : null, token, view === 'room');

  const notify = useCallback((message: Omit<ToastMessage, 'id'>) => {
    toastId.current += 1;
    setToast({ id: toastId.current, ...message });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (initial.rawPresent && !initial.code) {
      notify({
        title: 'INVALID UPLINK',
        message: 'Room codes are six characters. Use the code your rival sent you.',
        tone: 'warn',
      });
      setRoomQuery(null);
    }
  }, [initial, notify]);

  useEffect(() => {
    const title =
      view === 'room' && roomCode
        ? `${roomCode} // ${feed.room?.status === 'active' ? 'LIVE' : feed.room?.status === 'finished' ? 'SEALED' : 'ARMED'} — VOIDLINK`
        : view === 'practice'
          ? 'SPAR — VOIDLINK'
          : 'VOIDLINK — a two-operator lattice duel';
    document.title = title;
  }, [view, roomCode, feed.room?.status]);

  useEffect(() => {
    document.documentElement.dataset.view = view;
    return () => {
      delete document.documentElement.dataset.view;
    };
  }, [view]);

  function setRoomQuery(code: string | null) {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    url.hash = '';
    window.history.replaceState(null, '', url.toString());
  }

  function toggleSound() {
    if (muted) {
      persistMuted(false);
      setMutedState(false);
      play('ui');
    } else {
      persistMuted(true);
      setMutedState(true);
    }
    haptic(4);
  }

  function openLaunch(mode: LaunchMode) {
    setLaunchError(null);
    setLaunchMode(mode);
    play('ui');
  }

  function closeLaunch() {
    if (launchBusy) return;
    setLaunchMode(null);
    setLaunchError(null);
  }

  async function startLaunch(config: LaunchConfig) {
    const saved = saveCallsign(config.name);
    setCallsign(saved);
    setLaunchError(null);

    if (config.mode === 'spar') {
      setPractice({
        size: config.size,
        difficulty: config.difficulty,
        side: config.side,
        name: saved,
      });
      setPracticeKey(key => key + 1);
      setLaunchMode(null);
      setView('practice');
      setRoomQuery(null);
      play('launch');
      return;
    }

    setLaunchBusy(true);
    try {
      const path = config.mode === 'create' ? '/rooms' : '/rooms/quick';
      const response = await apiRequest<EnterRoomResponse>(path, {
        method: 'POST',
        body: { size: config.size, name: saved },
      });
      saveSession(response.room.code, { token: response.token, seat: response.seat });
      setToken(response.token);
      setRoomCode(response.room.code);
      feed.applyRoom(response.room);
      setView('room');
      setRoomQuery(response.room.code);
      setLaunchMode(null);
      play('launch');
      notify({
        title: config.mode === 'create' ? 'UPLINK ARMED' : response.room.status === 'active' ? 'RIVAL FOUND' : 'LATTICE SCANNING',
        message:
          config.mode === 'create'
            ? 'Share the code or the link to bring your rival in.'
            : response.room.status === 'active'
              ? 'Both seats are live. Your duel begins now.'
              : 'No operator is waiting yet. Your uplink stays open.',
        tone: 'success',
      });
    } catch (caught) {
      const apiError =
        caught instanceof VoidlinkApiError
          ? caught
          : new VoidlinkApiError('network', 'The relay is unreachable.', 0);
      setLaunchError(apiError.message);
      play('error');
    } finally {
      setLaunchBusy(false);
    }
  }

  function handleJoinCode(code: string) {
    const normalised = normaliseRoomCode(code);
    if (!normalised) {
      notify({ title: 'INVALID UPLINK', message: 'Codes are six characters.', tone: 'warn' });
      return;
    }
    play('ui');
    setRoomCode(normalised);
    setRoomQuery(normalised);
    const session = loadSession(normalised);
    if (session) {
      setToken(session.token);
      setView('room');
    } else {
      setToken(null);
      setView('join');
    }
  }

  function handleJoined(response: EnterRoomResponse, name: string) {
    const saved = saveCallsign(name);
    setCallsign(saved);
    saveSession(response.room.code, { token: response.token, seat: response.seat });
    setToken(response.token);
    setRoomCode(response.room.code);
    feed.applyRoom(response.room);
    setView('room');
    setRoomQuery(response.room.code);
    play('launch');
    notify({
      title: 'SEAT SECURED',
      message: `You pilot ${response.room.you?.side === 2 ? 'MAGENTA' : 'CYAN'}. The duel is live.`,
      tone: 'success',
    });
  }

  function handleSpectate(room: RoomView) {
    setToken(null);
    setRoomCode(room.code);
    feed.applyRoom(room);
    setView('room');
    setRoomQuery(room.code);
    play('ui');
    notify({
      title: 'OBSERVATION MODE',
      message: 'You are watching this duel. Open your own uplink to take a seat.',
      tone: 'info',
    });
  }

  function leaveNow() {
    if (view === 'room' && feed.room?.status === 'waiting' && token) {
      // A private or quick-match lobby that never found a rival should not
      // linger as a ghost room for the next operator who scans the public pool.
      void apiRequest<{ cancelled: true }>(`/rooms/${feed.room.code}/cancel`, {
        method: 'POST',
        token,
      }).catch(() => undefined);
    }
    setLeaveOpen(false);
    setView('home');
    setRoomCode(null);
    setToken(null);
    setPractice(null);
    setRoomQuery(null);
    play('ui');
  }

  function requestLeave() {
    if (view === 'home') return;
    if (view === 'room' && feed.room?.status === 'active') {
      setLeaveOpen(true);
      return;
    }
    leaveNow();
  }

  async function copyCode() {
    if (!roomCode) return;
    try {
      await copyText(roomCode);
      notify({ title: 'UPLINK CODE COPIED', message: roomCode, tone: 'success' });
    } catch {
      notify({ title: 'COPY FAILED', message: 'Select the code manually.', tone: 'warn' });
    }
  }

  const leaveHeadline = feed.room ? finishHeadline(feed.room) : null;

  return (
    <div className="app">
      <div className="scene" aria-hidden="true">
        <div className="scene__grid" />
        <div className="scene__glow scene__glow--cyan" />
        <div className="scene__glow scene__glow--magenta" />
        <div className="scene__stars" />
        <div className="scene__scan" />
      </div>

      <TopBar
        inRoom={view === 'room' || view === 'practice'}
        roomCode={view === 'room' ? roomCode : null}
        link={feed.link}
        muted={muted}
        onHome={() => {
          if (view !== 'home') requestLeave();
        }}
        onRules={() => {
          play('ui');
          setCodexOpen(true);
        }}
        onToggleSound={toggleSound}
        onCopyCode={() => void copyCode()}
      />

      {view === 'home' && (
        <Home onLaunch={openLaunch} onJoin={handleJoinCode} onRules={() => setCodexOpen(true)} />
      )}

      {view === 'join' && roomCode && (
        <JoinScreen
          code={roomCode}
          onJoined={handleJoined}
          onSpectate={handleSpectate}
          onHome={leaveNow}
          onRules={() => setCodexOpen(true)}
        />
      )}

      {view === 'room' && roomCode && (
        <RoomScreen
          code={roomCode}
          token={token}
          feed={feed}
          onLeave={leaveNow}
          onRules={() => setCodexOpen(true)}
          onNotify={notify}
        />
      )}

      {view === 'practice' && practiceConfig && (
        <Practice
          key={practiceKey}
          setup={practiceConfig}
          onExit={leaveNow}
          onRules={() => setCodexOpen(true)}
          onReconfigure={() => openLaunch('spar')}
        />
      )}

      <LaunchDialog
        open={launchMode !== null}
        mode={launchMode ?? 'create'}
        callsign={callsign}
        busy={launchBusy}
        error={launchError}
        onClose={closeLaunch}
        onStart={config => void startLaunch(config)}
      />

      <Codex open={codexOpen} onClose={() => setCodexOpen(false)} />

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        labelledBy="leave-title"
        className="confirm-modal"
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow eyebrow--warn">LINK INTERRUPTION</p>
            <h2 id="leave-title" className="modal-title">
              LEAVE THIS DUEL?
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={() => setLeaveOpen(false)} aria-label="Stay in duel">
            <CloseIcon />
          </button>
        </div>
        <p className="modal-lede">
          Your seat stays saved on this device, so you can return from this link. But while you are
          away your rival can claim a disconnect win after the grace window.
        </p>
        {leaveHeadline && feed.room && (
          <div className="confirm-facts mono">
            <span>UPLINK {feed.room.code}</span>
            <span>{feed.room.size}×{feed.room.size} LATTICE</span>
            <span>MOVE {String(feed.room.moveCount).padStart(2, '0')}</span>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn--primary" onClick={() => setLeaveOpen(false)}>
            <ArrowLeft size={16} /> STAY IN THE DUEL
          </button>
          <button type="button" className="btn btn--ghost" onClick={leaveNow}>
            LEAVE ANYWAY <ArrowRight size={16} />
          </button>
        </div>
        <p className="result-foot micro">
          {token ? 'Your session token remains stored privately in this browser.' : 'You are observing; no seat will be held.'}
        </p>
      </Modal>

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
