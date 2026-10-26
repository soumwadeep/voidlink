import type { RoomView, SeatNumber } from '../../shared/protocol';

export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function elapsedSince(iso: string | null | undefined, now: number): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : 0;
}

export function seatLabel(seat: SeatNumber): string {
  return seat === 1 ? 'OPERATOR 01' : 'OPERATOR 02';
}

export function sideLabel(side: 1 | 2): string {
  return side === 1 ? 'CYAN' : 'MAGENTA';
}

export function gateLabel(side: 1 | 2): string {
  return side === 1 ? 'TOP ↔ BOTTOM' : 'LEFT ↔ RIGHT';
}

export function roomUrl(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

export function cleanShareUrl(url: string): string {
  // Deployment previews may add query parameters; the room is all a rival needs.
  try {
    const parsed = new URL(url);
    const room = parsed.searchParams.get('room');
    parsed.search = room ? `?room=${room}` : '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      ok ? resolve() : reject(new Error('copy_failed'));
    } catch (error) {
      reject(error);
    }
  });
}

export function rivalSeat(room: RoomView): (typeof room.seats)[number] | null {
  return room.seats.find(seat => seat.seat !== room.you?.seat) ?? null;
}

export function finishHeadline(room: RoomView): {
  result: 'win' | 'loss' | 'watch' | 'draw';
  eyebrow: string;
  title: string;
  detail: string;
} {
  if (!room.you) {
    return {
      result: 'watch',
      eyebrow: 'OBSERVATION COMPLETE',
      title: room.winnerSide ? `${sideLabel(room.winnerSide)} SECURED THE LINK` : 'LATTICE SEALED',
      detail: 'The duel has concluded. Open a room of your own when you are ready.',
    };
  }
  if (room.winnerSide === null) {
    return {
      result: 'draw',
      eyebrow: 'LATTICE SEALED',
      title: 'NO LINK ESTABLISHED',
      detail: 'The board closed without a chain. A rare fault in the lattice.',
    };
  }
  const won = room.winnerSide === room.you.side;
  const reason =
    room.finishReason === 'resign'
      ? won
        ? 'Your rival withdrew from the lattice.'
        : 'You withdrew from the lattice.'
      : room.finishReason === 'forfeit'
        ? won
          ? 'The rival uplink went dark past the grace window.'
          : 'Your uplink went dark past the grace window.'
        : won
          ? 'Your gates are joined. The lattice answers to you.'
          : 'Your rival closed an unbroken chain between their gates.';
  return {
    result: won ? 'win' : 'loss',
    eyebrow: won ? 'LINK SECURED' : 'SIGNAL LOST',
    title: won ? 'YOU HOLD THE LATTICE' : 'RIVAL HOLDS THE LATTICE',
    detail: reason,
  };
}

export function relativeSeconds(iso: string | null | undefined, now: number): string {
  return formatClock(elapsedSince(iso, now));
}
