import {
  applyMove,
  bridgeCount,
  cellPoint,
  legalMoves,
  otherSide,
  shortestLinkCost,
  winningCells,
  type GameState,
  type Side,
} from './engine.ts';

export type AiDifficulty = 'cadet' | 'veteran' | 'ace';

export interface AiMove {
  cell: number;
  reason: string;
}

export const AI_DIFFICULTIES: readonly {
  id: AiDifficulty;
  name: string;
  subtitle: string;
}[] = [
  { id: 'cadet', name: 'SPAR', subtitle: 'Learning the lattice' },
  { id: 'veteran', name: 'VETERAN', subtitle: 'Reads the short routes' },
  { id: 'ace', name: 'ACE', subtitle: 'Closes every bridge' },
];

interface ScoredMove {
  cell: number;
  score: number;
  theirThreats: number;
}

function placeProbe(state: GameState, cell: number, side: Side) {
  const probe = state.board.slice();
  probe[cell] = side;
  return probe;
}

function moveScore(state: GameState, cell: number, side: Side): number {
  const probe = placeProbe(state, cell, side);
  const rival = otherSide(side);
  const myCost = shortestLinkCost(probe, state.size, side);
  const rivalCost = shortestLinkCost(probe, state.size, rival);
  const { x, y } = cellPoint(state.size, cell);
  const middle = (state.size - 1) / 2;
  const centre = Math.max(0, 2.4 - Math.abs(x - middle) - Math.abs(y - middle));
  const bridges = bridgeCount(probe, state.size, side);
  let friendly = 0;
  let hostile = 0;
  for (let i = 0; i < probe.length; i += 1) {
    if (probe[i] === 0) continue;
    const point = cellPoint(state.size, i);
    const gap = Math.abs(point.x - x) + Math.abs(point.y - y);
    if (gap !== 1) continue;
    if (probe[i] === side) friendly += 1;
    else hostile += 1;
  }
  const alongGate = y === 0 || y === state.size - 1 || x === 0 || x === state.size - 1 ? 1 : 0;
  return (
    (rivalCost - myCost) * 11 +
    centre * 1.4 +
    bridges * 2.6 +
    friendly * 0.55 -
    hostile * 0.35 +
    alongGate * 0.7
  );
}

export function chooseAiMove(
  state: GameState,
  side: Side,
  difficulty: AiDifficulty = 'veteran',
  random: () => number = Math.random,
): AiMove | null {
  if (state.status !== 'active' || state.turn !== side) return null;
  const moves = legalMoves(state.board, state.size);
  if (moves.length === 0) return null;

  // Every grade of opponent takes a win when it is handed one.
  for (const cell of moves) {
    const result = applyMove(state, cell);
    if (result.ok && result.state.status === 'won' && result.state.winner === side) {
      return { cell, reason: 'wins the link' };
    }
  }

  const rival = otherSide(side);
  const threats = winningCells(state.board, state.size, rival);

  const scored: ScoredMove[] = moves.map(cell => {
    const score = moveScore(state, cell, side);
    const probe = placeProbe(state, cell, side);
    const threatsAfter = winningCells(probe, state.size, rival).length;
    return { cell, score, theirThreats: threatsAfter };
  });
  scored.sort((a, b) => b.score - a.score);

  const safe = (candidate: ScoredMove) => {
    const probe = placeProbe(state, candidate.cell, side);
    const replyThreats = winningCells(probe, state.size, rival);
    // If several winning replies exist we are lost anyway; prefer the move
    // that removes the most immediate danger.
    const survives = replyThreats.length === 0;
    return survives ? candidate : { ...candidate, score: candidate.score - 44 * replyThreats.length };
  };

  if (threats.length > 0) {
    const blocking = scored.filter(candidate => threats.includes(candidate.cell));
    if (blocking.length > 0 && (difficulty !== 'cadet' || random() < 0.78)) {
      const pick = blocking[0]!;
      if (difficulty === 'ace') {
        const safest = blocking.map(safe).sort((a, b) => b.score - a.score)[0]!;
        return { cell: safest.cell, reason: 'severs a rival route' };
      }
      return { cell: pick.cell, reason: 'severs a rival route' };
    }
  }

  if (difficulty === 'ace') {
    const shortlist = scored.slice(0, 10).map(safe).sort((a, b) => b.score - a.score);
    const pick = shortlist[0] ?? scored[0]!;
    return { cell: pick.cell, reason: 'extends a protected bridge' };
  }

  if (difficulty === 'cadet' && random() < 0.2) {
    const loose = moves[Math.floor(random() * moves.length)] ?? moves[0]!;
    return { cell: loose, reason: 'tests an unclaimed vector' };
  }

  const shortlistSize = difficulty === 'cadet' ? Math.min(5, scored.length) : Math.min(2, scored.length);
  const index = Math.floor(Math.pow(random(), difficulty === 'cadet' ? 1.8 : 4) * shortlistSize);
  const pick = scored[Math.min(index, shortlistSize - 1)]!;
  return {
    cell: pick.cell,
    reason: pick.score > 8 ? 'tightens the nearest chain' : 'claims the central lattice',
  };
}

/**
 * A quick sanity helper used by tests: plays a whole AI-vs-AI game and returns
 * the final state. Both sides are deterministic when a seeded random is given.
 */
export function playAiGame(
  initial: GameState,
  difficulty: AiDifficulty,
  random: () => number,
): GameState {
  let state = initial;
  let guard = 0;
  while (state.status === 'active' && guard < 500) {
    const move = chooseAiMove(state, state.turn, difficulty, random);
    if (!move) break;
    const result = applyMove(state, move.cell);
    if (!result.ok) break;
    state = result.state;
    guard += 1;
  }
  return state;
}
