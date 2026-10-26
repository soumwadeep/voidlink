import {
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  cellLabel,
  cellPoint,
  getNeighbours,
  inBounds,
  type BoardSize,
  type Cell,
  type Side,
} from '../../shared/engine';
import { useHexGeometry } from '../lib/hex';

interface BoardProps {
  size: BoardSize;
  board: readonly Cell[];
  yourSide?: Side | null;
  interactive: boolean;
  onClaim?: (index: number) => void;
  winPath?: readonly number[];
  lastMove?: number | null;
  pendingCell?: number | null;
  label?: string;
}

interface Direction {
  primary: { dx: number; dy: number };
  alternate?: { dx: number; dy: number };
}

const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowRight: { primary: { dx: 1, dy: 0 } },
  ArrowLeft: { primary: { dx: -1, dy: 0 } },
  ArrowDown: { primary: { dx: 0, dy: 1 }, alternate: { dx: -1, dy: 1 } },
  ArrowUp: { primary: { dx: 0, dy: -1 }, alternate: { dx: 1, dy: -1 } },
};

export function Board({
  size,
  board,
  yourSide = null,
  interactive,
  onClaim,
  winPath = [],
  lastMove = null,
  pendingCell = null,
  label = 'VOIDLINK lattice',
}: BoardProps) {
  const geometry = useHexGeometry(size, 40, 14);
  const neighbours = useMemo(() => getNeighbours(size), [size]);
  const gradientUid = useId().replace(/:/g, '');
  const cyanGradient = `cyan-node-${gradientUid}`;
  const magentaGradient = `magenta-node-${gradientUid}`;
  const glowFilter = `node-glow-${gradientUid}`;
  const cellRefs = useRef<(SVGGElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(() => Math.floor((size * size) / 2));

  const claimable = (index: number) =>
    interactive && board[index] === 0 && pendingCell === null;

  const firstClaimable = useMemo(
    () => board.findIndex(cell => cell === 0),
    [board],
  );
  const tabStop = claimable(focusIndex) ? focusIndex : Math.max(0, firstClaimable);

  const winSet = useMemo(() => new Set(winPath), [winPath]);
  const rawWinSide = winPath.length > 0 ? board[winPath[0]!] ?? 0 : 0;
  const winSide: Side | null = rawWinSide === 1 || rawWinSide === 2 ? rawWinSide : null;
  const winTone = winSide === 2 ? 'magenta' : 'cyan';

  const connections = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; side: Side; key: string }[] = [];
    for (let index = 0; index < board.length; index += 1) {
      const owner = board[index];
      if (owner !== 1 && owner !== 2) continue;
      for (const next of neighbours[index] ?? []) {
        if (next <= index || board[next] !== owner) continue;
        const from = geometry.centers[index];
        const to = geometry.centers[next];
        if (!from || !to) continue;
        lines.push({
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          side: owner,
          key: `${index}-${next}`,
        });
      }
    }
    return lines;
  }, [board, geometry.centers, neighbours]);

  const winPoints = useMemo(
    () =>
      winPath
        .map(index => geometry.centers[index])
        .filter((point): point is { x: number; y: number } => Boolean(point))
        .map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(' '),
    [geometry.centers, winPath],
  );

  function focusCell(index: number) {
    setFocusIndex(index);
    requestAnimationFrame(() => cellRefs.current[index]?.focus());
  }

  function moveFocus(index: number, key: string) {
    const direction = ARROW_DIRECTIONS[key];
    if (!direction) return;
    const { x, y } = cellPoint(size, index);
    const tryPoint = (dx: number, dy: number) =>
      inBounds(size, x + dx, y + dy) ? (y + dy) * size + (x + dx) : null;
    const next =
      tryPoint(direction.primary.dx, direction.primary.dy) ??
      (direction.alternate
        ? tryPoint(direction.alternate.dx, direction.alternate.dy)
        : null);
    if (next !== null) focusCell(next);
  }

  function onKeyDown(event: ReactKeyboardEvent<SVGGElement>, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (claimable(index)) onClaim?.(index);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusCell(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusCell(size * size - 1);
      return;
    }
    if (event.key in ARROW_DIRECTIONS) {
      event.preventDefault();
      moveFocus(index, event.key);
    }
  }

  return (
    <div className={`board ${interactive ? 'board--interactive' : ''}`}>
      <svg
        className="board__svg"
        viewBox={geometry.viewBox}
        role="group"
        aria-label={label}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={cyanGradient} x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#9dfcff" />
            <stop offset="45%" stopColor="#52f6ff" />
            <stop offset="100%" stopColor="#0b8794" />
          </linearGradient>
          <linearGradient id={magentaGradient} x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#ffb4ef" />
            <stop offset="42%" stopColor="#ff4fd1" />
            <stop offset="100%" stopColor="#8d126d" />
          </linearGradient>
          <filter id={glowFilter} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="board__grid" aria-hidden="true">
          {geometry.centers.map((center, index) => (
            <circle
              key={`spoke-${index}`}
              cx={center.x}
              cy={center.y}
              r={2}
              className="board__spoke"
            />
          ))}
        </g>

        <g className="board__connections" aria-hidden="true">
          {connections.map(line => (
            <line
              key={line.key}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`link-line link-line--${line.side}`}
            />
          ))}
        </g>

        <g className="board__cells">
          {geometry.polygons.map((points, index) => {
            const { x, y } = cellPoint(size, index);
            const owner = board[index] ?? 0;
            const onCyanGate = y === 0 || y === size - 1;
            const onMagentaGate = x === 0 || x === size - 1;
            const isLast = lastMove === index;
            const isWin = winSet.has(index);
            const isPending = pendingCell === index;
            const empty = owner === 0;
            const canClaim = claimable(index);
            const sideClass = owner === 1 ? 'side-1' : owner === 2 ? 'side-2' : '';
            const gateClass = [onCyanGate ? 'gate-1' : '', onMagentaGate ? 'gate-2' : '']
              .filter(Boolean)
              .join(' ');
            const center = geometry.centers[index]!;
            const labelText = cellLabel(size, index);
            const description = empty
              ? `${labelText}. Empty node${canClaim ? '. Press Enter to claim.' : '.'}`
              : `${labelText}. ${owner === 1 ? 'Cyan' : 'Magenta'} node.`;
            return (
              <g
                key={index}
                ref={node => {
                  cellRefs.current[index] = node;
                }}
                className={[
                  'hex',
                  empty ? 'hex--empty' : 'hex--claimed',
                  sideClass,
                  gateClass,
                  canClaim ? 'hex--claimable' : '',
                  isLast ? 'hex--last' : '',
                  isWin ? 'hex--win' : '',
                  isPending ? 'hex--pending' : '',
                  interactive && yourSide ? `hex--hover-${yourSide}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role={canClaim ? 'button' : 'img'}
                aria-label={description}
                aria-disabled={canClaim ? undefined : true}
                tabIndex={canClaim && index === tabStop ? 0 : -1}
                onClick={() => {
                  if (canClaim) onClaim?.(index);
                }}
                onFocus={() => setFocusIndex(index)}
                onKeyDown={event => onKeyDown(event, index)}
                style={{ '--hex-row': y, '--hex-col': x } as CSSProperties}
              >
                <title>{description}</title>
                <polygon points={points} className="hex__plate" />
                {canClaim && (
                  <text x={center.x} y={center.y + 3.4} className="hex__coord" aria-hidden="true">
                    {labelText}
                  </text>
                )}
                {empty && <circle cx={center.x} cy={center.y} r={3.2} className="hex__dot" />}
                {!empty && (
                  <>
                    <polygon
                      points={insetPoints(points, center, 0.66)}
                      className="hex__node"
                      fill={owner === 1 ? `url(#${cyanGradient})` : `url(#${magentaGradient})`}
                    />
                    <circle cx={center.x} cy={center.y} r={7.4} className="hex__node-ring" />
                    <circle cx={center.x} cy={center.y} r={2.2} className="hex__node-core" />
                  </>
                )}
                {isLast && (
                  <circle
                    cx={center.x}
                    cy={center.y}
                    r={23}
                    className="hex__last-ring"
                    filter={`url(#${glowFilter})`}
                  />
                )}
                {isPending && (
                  <circle cx={center.x} cy={center.y} r={17} className="hex__pending-ring" />
                )}
              </g>
            );
          })}
        </g>

        {winPoints && (
          <g className="board__win" aria-hidden="true" filter={`url(#${glowFilter})`}>
            <polyline points={winPoints} className={`win-trace win-trace--halo win-trace--${winTone}`} />
            <polyline points={winPoints} className={`win-trace win-trace--${winTone}`} />
            {winPath.map(index => {
              const center = geometry.centers[index];
              return center ? (
                <circle
                  key={`win-${index}`}
                  cx={center.x}
                  cy={center.y}
                  r={10.5}
                  className={`win-node win-node--${winTone}`}
                />
              ) : null;
            })}
          </g>
        )}

        <g className="board__gates" aria-hidden="true">
          <path
            className="gate-mark gate-mark--cyan"
            d={`M ${geometry.centerX - 12} 7 L ${geometry.centerX} 15 L ${geometry.centerX + 12} 7`}
          />
          <path
            className="gate-mark gate-mark--cyan"
            d={`M ${geometry.centerX - 12} ${geometry.height - 7} L ${geometry.centerX} ${geometry.height - 15} L ${geometry.centerX + 12} ${geometry.height - 7}`}
          />
          <path
            className="gate-mark gate-mark--magenta"
            d={`M 7 ${geometry.centerY - 12} L 15 ${geometry.centerY} L 7 ${geometry.centerY + 12}`}
          />
          <path
            className="gate-mark gate-mark--magenta"
            d={`M ${geometry.width - 7} ${geometry.centerY - 12} L ${geometry.width - 15} ${geometry.centerY} L ${geometry.width - 7} ${geometry.centerY + 12}`}
          />
        </g>
      </svg>
      <span className="sr-only">
        {interactive
          ? 'Claim one empty node. Use arrow keys to move focus and Enter to place your node.'
          : 'This lattice is display only.'}
      </span>
    </div>
  );
}

function insetPoints(points: string, center: { x: number; y: number }, scale: number): string {
  return points
    .split(' ')
    .map(pair => {
      const [x, y] = pair.split(',').map(Number);
      if (x === undefined || y === undefined) return pair;
      return `${(center.x + (x - center.x) * scale).toFixed(3)},${(center.y + (y - center.y) * scale).toFixed(3)}`;
    })
    .join(' ');
}
