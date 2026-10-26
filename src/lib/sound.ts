export type SoundEffect =
  | 'ui'
  | 'launch'
  | 'claim'
  | 'rival'
  | 'swap'
  | 'signal'
  | 'win'
  | 'lose'
  | 'error';

const MUTE_KEY = 'voidlink.muted.v1';

let muted = readMuted();
let context: AudioContext | null = null;
let master: GainNode | null = null;

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // Ignore disabled storage.
  }
}

function ensureContext(): AudioContext | null {
  if (muted) return null;
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.055;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function note(
  ctx: AudioContext,
  frequency: number,
  offset: number,
  duration: number,
  type: OscillatorType,
  volume: number,
): void {
  if (!master) return;
  const start = ctx.currentTime + offset;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function play(effect: SoundEffect): void {
  const ctx = ensureContext();
  if (!ctx) return;
  switch (effect) {
    case 'ui':
      note(ctx, 520, 0, 0.06, 'sine', 0.28);
      break;
    case 'launch':
      note(ctx, 220, 0, 0.16, 'triangle', 0.5);
      note(ctx, 330, 0.05, 0.2, 'sine', 0.35);
      note(ctx, 660, 0.12, 0.24, 'sine', 0.25);
      break;
    case 'claim':
      note(ctx, 392, 0, 0.08, 'triangle', 0.4);
      note(ctx, 587, 0.04, 0.12, 'sine', 0.3);
      break;
    case 'rival':
      note(ctx, 196, 0, 0.1, 'sine', 0.26);
      note(ctx, 147, 0.05, 0.16, 'triangle', 0.2);
      break;
    case 'swap':
      note(ctx, 660, 0, 0.08, 'square', 0.12);
      note(ctx, 440, 0.06, 0.12, 'square', 0.12);
      note(ctx, 880, 0.12, 0.18, 'sine', 0.22);
      break;
    case 'signal':
      note(ctx, 880, 0, 0.06, 'sine', 0.2);
      note(ctx, 1180, 0.05, 0.1, 'sine', 0.16);
      break;
    case 'win':
      note(ctx, 262, 0, 0.22, 'triangle', 0.4);
      note(ctx, 330, 0.09, 0.22, 'triangle', 0.36);
      note(ctx, 392, 0.18, 0.24, 'triangle', 0.34);
      note(ctx, 523, 0.28, 0.5, 'sine', 0.4);
      note(ctx, 784, 0.36, 0.55, 'sine', 0.2);
      break;
    case 'lose':
      note(ctx, 196, 0, 0.3, 'sine', 0.3);
      note(ctx, 147, 0.14, 0.38, 'sine', 0.28);
      note(ctx, 98, 0.28, 0.55, 'triangle', 0.25);
      break;
    case 'error':
      note(ctx, 148, 0, 0.08, 'square', 0.1);
      note(ctx, 110, 0.08, 0.14, 'square', 0.1);
      break;
  }
}

export function haptic(pattern: number | number[] = 8): void {
  if (muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Haptics are optional and not available everywhere.
  }
}
