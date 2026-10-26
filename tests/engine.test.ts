import { describe, expect, it } from 'vitest';
import {
  applyMove,
  axialDistance,
  bridgeCount,
  cellIndex,
  cellLabel,
  cellPoint,
  checkWinner,
  createGame,
  findWinningPath,
  getNeighbours,
  isBoardSize,
  isGateCell,
  legalMoves,
  parseCellLabel,
  shortestLinkCost,
  winningCells,
  type BoardSize,
  type Cell,
  type GameState,
  type Side,
} from '../shared/engine';
import { chooseAiMove, playAiGame, type AiDifficulty } from '../shared/ai';

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function assertWinningPath(state: GameState, side: Side) {
  const path = findWinningPath(state.board, state.size, side);
  expect(path).not.toBeNull();
  if (!path) return;
  const neighbours = getNeighbours(state.size);
  expect(path.length).toBeGreaterThan(0);
  const first = path[0]!;
  const last = path[path.length - 1]!;
  const firstPoint = cellPoint(state.size, first);
  const lastPoint = cellPoint(state.size, last);
  if (side === 1) {
    expect(firstPoint.y).toBe(0);
    expect(lastPoint.y).toBe(state.size - 1);
  } else {
    expect(firstPoint.x).toBe(0);
    expect(lastPoint.x).toBe(state.size - 1);
  }
  for (let i = 0; i < path.length; i += 1) {
    expect(state.board[path[i]!]).toBe(side);
    if (i > 0) {
      expect(neighbours[path[i - 1]!]!).toContain(path[i]!);
    }
  }
}

describe('lattice geometry', () => {
  it('knows its board sizes', () => {
    expect(isBoardSize(7)).toBe(true);
    expect(isBoardSize(9)).toBe(true);
    expect(isBoardSize(8)).toBe(false);
    expect(isBoardSize('7')).toBe(false);
  });

  it('builds six-neighbour interior nodes and clipped corners', () => {
    const neighbours = getNeighbours(7);
    expect(neighbours.length).toBe(49);
    expect(neighbours[cellIndex(7, 3, 3)]!.length).toBe(6);
    expect([...neighbours[cellIndex(7, 0, 0)]!].sort()).toEqual([1, 7].sort());
    expect([...neighbours[cellIndex(7, 6, 6)]!].sort()).toEqual([41, 47].sort());
  });

  it('keeps adjacency symmetric', () => {
    for (const size of [7, 9] as BoardSize[]) {
      const neighbours = getNeighbours(size);
      for (let i = 0; i < size * size; i += 1) {
        for (const neighbour of neighbours[i]!) {
          expect(neighbours[neighbour]!).toContain(i);
        }
      }
    }
  });

  it('measures axial distance consistently', () => {
    const a = cellIndex(7, 0, 0);
    const b = cellIndex(7, 6, 0);
    expect(axialDistance(7, a, b)).toBe(6);
    expect(axialDistance(7, a, a)).toBe(0);
    expect(axialDistance(9, cellIndex(9, 4, 4), cellIndex(9, 5, 4))).toBe(1);
  });

  it('round-trips human cell labels', () => {
    for (const size of [7, 9] as BoardSize[]) {
      for (let i = 0; i < size * size; i += 1) {
        expect(parseCellLabel(size, cellLabel(size, i))).toBe(i);
      }
    }
    expect(parseCellLabel(7, 'H1')).toBeNull();
    expect(parseCellLabel(7, 'A8')).toBeNull();
    expect(parseCellLabel(9, 'I9')).not.toBeNull();
  });

  it('identifies gate cells for both operators', () => {
    expect(isGateCell(7, 1, cellIndex(7, 0, 0))).toBe(true);
    expect(isGateCell(7, 1, cellIndex(7, 0, 6))).toBe(true);
    expect(isGateCell(7, 1, cellIndex(7, 0, 3))).toBe(false);
    expect(isGateCell(7, 2, cellIndex(7, 0, 3))).toBe(true);
    expect(isGateCell(7, 2, cellIndex(7, 6, 3))).toBe(true);
    expect(isGateCell(7, 2, cellIndex(7, 3, 3))).toBe(false);
  });
});

describe('game flow', () => {
  it('starts empty with cyan to move', () => {
    const game = createGame(7);
    expect(game.board).toHaveLength(49);
    expect(game.board.every(cell => cell === 0)).toBe(true);
    expect(game.turn).toBe(1);
    expect(game.status).toBe('active');
    expect(legalMoves(game.board, game.size)).toHaveLength(49);
  });

  it('alternates turns and rejects occupied or out-of-range nodes', () => {
    let game = createGame(7);
    let result = applyMove(game, cellIndex(7, 3, 3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    game = result.state;
    expect(game.turn).toBe(2);
    expect(game.moveCount).toBe(1);

    result = applyMove(game, cellIndex(7, 3, 3));
    expect(result).toEqual({ ok: false, reason: 'occupied' });

    result = applyMove(game, 999);
    expect(result).toEqual({ ok: false, reason: 'out_of_bounds' });

    result = applyMove(game, cellIndex(7, 2, 2));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.turn).toBe(1);
  });

  it('stops accepting moves once the lattice is won', () => {
    let game = createGame(7, 1);
    // Cyan claims column A uninterrupted while magenta answers elsewhere.
    for (let y = 0; y < 6; y += 1) {
      const cyan = applyMove(game, cellIndex(7, 0, y));
      expect(cyan.ok).toBe(true);
      if (!cyan.ok) return;
      game = cyan.state;
      expect(game.status).toBe('active');
      const magenta = applyMove(game, cellIndex(7, 6, y));
      expect(magenta.ok).toBe(true);
      if (!magenta.ok) return;
      game = magenta.state;
    }
    const winningMove = applyMove(game, cellIndex(7, 0, 6));
    expect(winningMove.ok).toBe(true);
    if (!winningMove.ok) return;
    game = winningMove.state;
    expect(game.status).toBe('won');
    expect(game.winner).toBe(1);
    expect(game.winPath.length).toBe(7);
    assertWinningPath(game, 1);
    expect(applyMove(game, cellIndex(7, 1, 6))).toEqual({ ok: false, reason: 'game_over' });
  });

  it('finds a magenta link left to right', () => {
    let game = createGame(7, 2);
    for (let x = 0; x < 6; x += 1) {
      const magenta = applyMove(game, cellIndex(7, x, 6));
      expect(magenta.ok).toBe(true);
      if (!magenta.ok) return;
      game = magenta.state;
      const cyan = applyMove(game, cellIndex(7, x, 0));
      expect(cyan.ok).toBe(true);
      if (!cyan.ok) return;
      game = cyan.state;
    }
    const winningMove = applyMove(game, cellIndex(7, 6, 6));
    expect(winningMove.ok).toBe(true);
    if (!winningMove.ok) return;
    game = winningMove.state;
    expect(game.status).toBe('won');
    expect(game.winner).toBe(2);
    assertWinningPath(game, 2);
  });

  it('does not let a chain pass through the rival', () => {
    const board: Cell[] = Array.from({ length: 49 }, () => 0 as Cell);
    // Cyan nearly links column C, but magenta blocks C4.
    for (const y of [0, 1, 2, 3, 4, 5]) board[cellIndex(7, 2, y)] = 1;
    board[cellIndex(7, 2, 6)] = 1;
    board[cellIndex(7, 2, 3)] = 2;
    expect(findWinningPath(board, 7, 1)).toBeNull();
    board[cellIndex(7, 2, 3)] = 1;
    expect(findWinningPath(board, 7, 1)).not.toBeNull();
  });

  it('has no draws: a full lattice always links exactly one side', () => {
    const random = seeded(9137);
    for (let round = 0; round < 220; round += 1) {
      const size: BoardSize = round % 2 === 0 ? 7 : 9;
      const total = size * size;
      const board: Cell[] = Array.from({ length: total }, () => 0 as Cell);
      const indices = Array.from({ length: total }, (_, i) => i);
      for (let i = total - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const swapValue = indices[i]!;
        indices[i] = indices[j]!;
        indices[j] = swapValue;
      }
      const cyanCount = Math.floor(total / 2);
      for (let i = 0; i < total; i += 1) board[indices[i]!] = i < cyanCount ? 1 : 2;
      const cyan = findWinningPath(board, size, 1);
      const magenta = findWinningPath(board, size, 2);
      expect(Boolean(cyan) !== Boolean(magenta)).toBe(true);
    }
  });
});

describe('route cost and threats', () => {
  it('costs a full column of empty cells to cross an empty board', () => {
    const empty = createGame(7);
    expect(shortestLinkCost(empty.board, 7, 1)).toBe(7);
    expect(shortestLinkCost(empty.board, 7, 2)).toBe(7);
  });

  it('drops to zero when a side already has a chain', () => {
    const board: Cell[] = Array.from({ length: 49 }, () => 0 as Cell);
    for (let x = 0; x < 7; x += 1) board[cellIndex(7, x, 4)] = 2;
    expect(shortestLinkCost(board, 7, 2)).toBe(0);
    expect(shortestLinkCost(board, 7, 1)).toBeGreaterThan(0);
    expect(checkWinner(board, 7, 2)?.winner).toBe(2);
  });

  it('lists moves that would immediately win', () => {
    const board: Cell[] = Array.from({ length: 49 }, () => 0 as Cell);
    for (let y = 0; y < 6; y += 1) board[cellIndex(7, 1, y)] = 1;
    const wins = winningCells(board, 7, 1);
    expect(wins).toContain(cellIndex(7, 1, 6));
  });

  it('counts bridges only when a pair shares two landing nodes', () => {
    const empty: Cell[] = Array.from({ length: 49 }, () => 0 as Cell);
    expect(bridgeCount(empty, 7, 1)).toBe(0);
    const bridged = empty.slice();
    // These two cyan nodes share two empty neighbours (the classic bridge).
    bridged[cellIndex(7, 0, 1)] = 1;
    bridged[cellIndex(7, 2, 0)] = 1;
    expect(bridgeCount(bridged, 7, 1)).toBeGreaterThan(0);
  });
});

describe('sparring AI', () => {
  it('takes an immediate win', () => {
    const board: Cell[] = Array.from({ length: 49 }, () => 0 as Cell);
    for (let y = 0; y < 6; y += 1) board[cellIndex(7, 2, y)] = 1;
    for (let y = 0; y < 4; y += 1) board[cellIndex(7, 6, y)] = 2;
    const game: GameState = {
      size: 7,
      board,
      turn: 1,
      status: 'active',
      winner: null,
      winPath: [],
      moveCount: 10,
    };
    const move = chooseAiMove(game, 1, 'veteran', seeded(4));
    expect(move).not.toBeNull();
    if (!move) return;
    const result = applyMove(game, move.cell);
    expect(result.ok && result.state.status === 'won' && result.state.winner === 1).toBe(true);
  });

  it('blocks a rival win', () => {
    const board: Cell[] = Array.from({ length: 49 }, () => 0 as Cell);
    for (let x = 0; x < 6; x += 1) board[cellIndex(7, x, 4)] = 2;
    const game: GameState = {
      size: 7,
      board,
      turn: 1,
      status: 'active',
      winner: null,
      winPath: [],
      moveCount: 10,
    };
    const threats = winningCells(board, 7, 2);
    expect(threats.length).toBeGreaterThan(0);
    const move = chooseAiMove(game, 1, 'veteran', seeded(7));
    expect(move).not.toBeNull();
    if (!move) return;
    expect(threats).toContain(move.cell);
  });

  it('always returns a legal move', () => {
    const random = seeded(88);
    for (const difficulty of ['cadet', 'veteran', 'ace'] as AiDifficulty[]) {
      let game = createGame(7, 1);
      for (let turn = 0; turn < 30 && game.status === 'active'; turn += 1) {
        const move = chooseAiMove(game, game.turn, difficulty, random);
        expect(move).not.toBeNull();
        if (!move) break;
        expect(game.board[move.cell]).toBe(0);
        const result = applyMove(game, move.cell);
        expect(result.ok).toBe(true);
        if (!result.ok) break;
        game = result.state;
      }
    }
  });

  it('plays a complete AI duel without stalling', () => {
    for (const difficulty of ['cadet', 'veteran', 'ace'] as AiDifficulty[]) {
      const final = playAiGame(createGame(7, 1), difficulty, seeded(difficulty.length * 71));
      expect(final.status).toBe('won');
      expect([1, 2]).toContain(final.winner);
      expect(final.moveCount).toBeLessThanOrEqual(49);
    }
  });
});
