/**
 * VOIDLINK's rules engine.
 *
 * The lattice is an axial hex grid drawn as a rhombus. `x` runs left to right,
 * `y` runs top to bottom. Cyan (side 1) links the top edge to the bottom edge.
 * Magenta (side 2) links the left edge to the right edge.
 *
 * Axial neighbours are the six offsets below. Because positive `y` shifts the
 * row half a cell to the right when drawn, (1, -1) is up-right and (-1, 1) is
 * down-left.
 */

export type Side = 1 | 2;
export type Cell = 0 | Side;
export type BoardSize = 7 | 9;
export type GameStatus = 'active' | 'won' | 'drawn';

export interface GameState {
  size: BoardSize;
  board: Cell[];
  turn: Side;
  status: GameStatus;
  winner: Side | null;
  winPath: number[];
  moveCount: number;
}

export type MoveFailure = 'out_of_bounds' | 'occupied' | 'game_over';

export type MoveResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: MoveFailure };

export interface Point {
  x: number;
  y: number;
}

export const BOARD_SIZES: readonly BoardSize[] = [7, 9] as const;

export const AXIAL_NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
];

const adjacencyCache = new Map<BoardSize, readonly (readonly number[])[]>();
const distanceCache = new Map<BoardSize, Int32Array>();

export function isBoardSize(value: unknown): value is BoardSize {
  return value === 7 || value === 9;
}

export function otherSide(side: Side): Side {
  return side === 1 ? 2 : 1;
}

export function cellIndex(size: BoardSize, x: number, y: number): number {
  return y * size + x;
}

export function cellPoint(size: BoardSize, index: number): Point {
  return { x: index % size, y: Math.floor(index / size) };
}

export function inBounds(size: BoardSize, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

export function getNeighbours(size: BoardSize): readonly (readonly number[])[] {
  const cached = adjacencyCache.get(size);
  if (cached) return cached;

  const grid: number[][] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const here: number[] = [];
      for (const offset of AXIAL_NEIGHBOURS) {
        const nx = x + offset.x;
        const ny = y + offset.y;
        if (inBounds(size, nx, ny)) here.push(cellIndex(size, nx, ny));
      }
      grid.push(here);
    }
  }
  adjacencyCache.set(size, grid);
  return grid;
}

/**
 * Rectangular (axial) distance. Useful for the interface and AI heuristics.
 */
export function axialDistance(size: BoardSize, a: number, b: number): number {
  let cache = distanceCache.get(size);
  if (!cache) {
    cache = new Int32Array(size * size * size * size);
    cache.fill(-1);
    distanceCache.set(size, cache);
  }
  const key = a * size * size + b;
  const cached = cache[key];
  if (cached !== undefined && cached >= 0) return cached;

  const pa = cellPoint(size, a);
  const pb = cellPoint(size, b);
  const dx = pa.x - pb.x;
  const dy = pa.y - pb.y;
  const dz = -dx - dy;
  const distance = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  cache[key] = distance;
  return distance;
}

export function createGame(size: BoardSize, first: Side = 1): GameState {
  return {
    size,
    board: Array.from({ length: size * size }, () => 0 as Cell),
    turn: first,
    status: 'active',
    winner: null,
    winPath: [],
    moveCount: 0,
  };
}

export function cloneGame(state: GameState): GameState {
  return {
    ...state,
    board: state.board.slice(),
    winPath: state.winPath.slice(),
  };
}

export function legalMoves(board: readonly Cell[], size: BoardSize): number[] {
  const moves: number[] = [];
  for (let index = 0; index < size * size; index += 1) {
    if (board[index] === 0) moves.push(index);
  }
  return moves;
}

export function isGateCell(size: BoardSize, side: Side, index: number): boolean {
  const { x, y } = cellPoint(size, index);
  return side === 1 ? y === 0 || y === size - 1 : x === 0 || x === size - 1;
}

/**
 * A node touches one of `side`'s two gates.
 */
export function touchesGate(size: BoardSize, side: Side, index: number): boolean {
  return isGateCell(size, side, index);
}

/**
 * Breadth-first search that returns one shortest unbroken chain between the
 * side's opposite gates, or null if the side is not connected. Opponent nodes
 * are impassable.
 */
export function findWinningPath(
  board: readonly Cell[],
  size: BoardSize,
  side: Side,
): number[] | null {
  const neighbours = getNeighbours(size);
  const visited = new Uint8Array(size * size);
  const parent = new Int32Array(size * size);
  parent.fill(-2);
  const queue = new Int32Array(size * size);
  let head = 0;
  let tail = 0;

  const starts: number[] = [];
  const targets: number[] = [];
  for (let i = 0; i < size * size; i += 1) {
    if (board[i] !== side) continue;
    const { x, y } = cellPoint(size, i);
    if (side === 1 ? y === 0 : x === 0) starts.push(i);
    if (side === 1 ? y === size - 1 : x === size - 1) targets.push(i);
  }

  if (starts.length === 0 || targets.length === 0) return null;
  const targetSet = new Set(targets);

  for (const start of starts) {
    visited[start] = 1;
    parent[start] = -1;
    queue[tail] = start;
    tail += 1;
  }

  while (head < tail) {
    const current = queue[head]!;
    head += 1;

    if (targetSet.has(current)) {
      const path: number[] = [];
      let node = current;
      while (node !== -1) {
        path.push(node);
        node = parent[node]!;
      }
      path.reverse();
      return path;
    }

    for (const next of neighbours[current]!) {
      if (visited[next] || board[next] !== side) continue;
      visited[next] = 1;
      parent[next] = current;
      queue[tail] = next;
      tail += 1;
    }
  }

  return null;
}

export function checkWinner(
  board: readonly Cell[],
  size: BoardSize,
  side: Side,
): { winner: Side; path: number[] } | null {
  const path = findWinningPath(board, size, side);
  return path ? { winner: side, path } : null;
}

export function winningCells(board: readonly Cell[], size: BoardSize, side: Side): number[] {
  const wins: number[] = [];
  const probe = board.slice();
  for (let i = 0; i < probe.length; i += 1) {
    if (probe[i] !== 0) continue;
    probe[i] = side;
    if (findWinningPath(probe, size, side)) wins.push(i);
    probe[i] = 0;
  }
  return wins;
}

export function applyMove(state: GameState, index: number): MoveResult {
  if (state.status !== 'active') return { ok: false, reason: 'game_over' };
  if (!Number.isInteger(index) || index < 0 || index >= state.size * state.size) {
    return { ok: false, reason: 'out_of_bounds' };
  }
  if (state.board[index] !== 0) return { ok: false, reason: 'occupied' };

  const next = cloneGame(state);
  next.board[index] = next.turn;
  next.moveCount += 1;

  const win = checkWinner(next.board, next.size, next.turn);
  if (win) {
    next.status = 'won';
    next.winner = win.winner;
    next.winPath = win.path;
    next.turn = win.winner;
    return { ok: true, state: next };
  }

  if (next.moveCount === next.size * next.size) {
    // Hex cannot end in a draw on a complete board; this is a defensive branch
    // that keeps a malformed board from stranding the match.
    next.status = 'drawn';
    next.winner = null;
    return { ok: true, state: next };
  }

  next.turn = otherSide(next.turn);
  return { ok: true, state: next };
}

/**
 * Cost for `side` to finish a chain. Claimed own nodes cost 0, empty nodes 1,
 * opponent nodes are impassable. This is the core of the sparring AI and is
 * also handy for tutorials and tests.
 */
export function shortestLinkCost(
  board: readonly Cell[],
  size: BoardSize,
  side: Side,
): number {
  const neighbours = getNeighbours(size);
  const total = size * size;
  const dist = new Int32Array(total);
  dist.fill(0x3fffffff);
  const visited = new Uint8Array(total);

  // Tiny binary heap keyed by distance. Boards are at most 81 nodes.
  const heapNodes: number[] = [];
  const heapKeys: number[] = [];
  const push = (node: number, key: number) => {
    let i = heapNodes.length;
    heapNodes.push(node);
    heapKeys.push(key);
    while (i > 0) {
      const parentIndex = (i - 1) >> 1;
      if (heapKeys[parentIndex]! <= heapKeys[i]!) break;
      const nodeSwap = heapNodes[parentIndex]!;
      const keySwap = heapKeys[parentIndex]!;
      heapNodes[parentIndex] = heapNodes[i]!;
      heapKeys[parentIndex] = heapKeys[i]!;
      heapNodes[i] = nodeSwap;
      heapKeys[i] = keySwap;
      i = parentIndex;
    }
  };
  const pop = (): { node: number; key: number } | null => {
    if (heapNodes.length === 0) return null;
    const node = heapNodes[0]!;
    const key = heapKeys[0]!;
    const lastNode = heapNodes.pop()!;
    const lastKey = heapKeys.pop()!;
    if (heapNodes.length > 0) {
      heapNodes[0] = lastNode;
      heapKeys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heapNodes.length && heapKeys[left]! < heapKeys[smallest]!) smallest = left;
        if (right < heapNodes.length && heapKeys[right]! < heapKeys[smallest]!) smallest = right;
        if (smallest === i) break;
        const nodeSwap = heapNodes[smallest]!;
        const keySwap = heapKeys[smallest]!;
        heapNodes[smallest] = heapNodes[i]!;
        heapKeys[smallest] = heapKeys[i]!;
        heapNodes[i] = nodeSwap;
        heapKeys[i] = keySwap;
        i = smallest;
      }
    }
    return { node, key };
  };

  for (let i = 0; i < total; i += 1) {
    const { x, y } = cellPoint(size, i);
    const onStart = side === 1 ? y === 0 : x === 0;
    if (!onStart || board[i] === otherSide(side)) continue;
    const weight = board[i] === 0 ? 1 : 0;
    if (weight < dist[i]!) {
      dist[i] = weight;
      push(i, weight);
    }
  }

  let best = 0x3fffffff;
  while (true) {
    const entry = pop();
    if (!entry) break;
    if (visited[entry.node]) continue;
    visited[entry.node] = 1;
    if (entry.key > best) break;

    const { x, y } = cellPoint(size, entry.node);
    const onTarget = side === 1 ? y === size - 1 : x === size - 1;
    if (onTarget) {
      best = Math.min(best, entry.key);
      continue;
    }

    for (const next of neighbours[entry.node]!) {
      if (visited[next] || board[next] === otherSide(side)) continue;
      const weight = board[next] === 0 ? 1 : 0;
      const candidate = entry.key + weight;
      if (candidate < dist[next]!) {
        dist[next] = candidate;
        push(next, candidate);
      }
    }
  }

  return best;
}

const COLUMN_LABELS = 'ABCDEFGHI';

export function cellLabel(size: BoardSize, index: number): string {
  const { x, y } = cellPoint(size, index);
  return `${COLUMN_LABELS[x] ?? '?'}${y + 1}`;
}

export function parseCellLabel(size: BoardSize, label: string): number | null {
  const match = /^([A-I])([1-9])$/.exec(label.toUpperCase());
  if (!match) return null;
  const x = COLUMN_LABELS.indexOf(match[1]!);
  const y = Number(match[2]) - 1;
  if (!inBounds(size, x, y)) return null;
  return cellIndex(size, x, y);
}

/**
 * The number of empty cells that would complete at least one "bridge" (a pair
 * of own nodes sharing two empty neighbours). Bridges are hard for the
 * opponent to cut, so the AI values them.
 */
export function bridgeCount(board: readonly Cell[], size: BoardSize, side: Side): number {
  const neighbours = getNeighbours(size);
  const total = size * size;
  let bridges = 0;
  for (let a = 0; a < total; a += 1) {
    if (board[a] !== side) continue;
    for (let b = a + 1; b < total; b += 1) {
      if (board[b] !== side) continue;
      if (axialDistance(size, a, b) !== 2) continue;
      let shared = 0;
      for (const candidate of neighbours[a]!) {
        if (board[candidate] !== 0) continue;
        if (neighbours[b]!.includes(candidate)) {
          shared += 1;
          if (shared >= 2) {
            bridges += 1;
            break;
          }
        }
      }
    }
  }
  return bridges;
}

export function formatSide(side: Side): string {
  return side === 1 ? 'CYAN' : 'MAGENTA';
}
