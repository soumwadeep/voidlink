import { useMemo } from 'react';
import { applyMove, createGame, cellIndex } from '../../shared/engine';
import { Board } from './Board';
import { SignalIcon } from './Icons';

/**
 * A deterministic, non-interactive position used as the landing illustration.
 * It is a legal position: cyan completes a winding top-to-bottom chain on the
 * last move while magenta has built a threatening press of its own.
 */
function buildPreview() {
  let game = createGame(7, 1);
  const cyanPath = [
    cellIndex(7, 2, 0),
    cellIndex(7, 2, 1),
    cellIndex(7, 3, 1),
    cellIndex(7, 3, 2),
    cellIndex(7, 3, 3),
    cellIndex(7, 2, 3),
    cellIndex(7, 2, 4),
    cellIndex(7, 1, 4),
    cellIndex(7, 1, 5),
  ];
  const magenta = [
    cellIndex(7, 5, 1),
    cellIndex(7, 5, 2),
    cellIndex(7, 6, 2),
    cellIndex(7, 4, 3),
    cellIndex(7, 5, 4),
    cellIndex(7, 4, 5),
    cellIndex(7, 6, 5),
    cellIndex(7, 4, 1),
    cellIndex(7, 6, 4),
  ];
  for (let i = 0; i < cyanPath.length; i += 1) {
    const cyanMove = applyMove(game, cyanPath[i]!);
    if (!cyanMove.ok) break;
    game = cyanMove.state;
    const magentaMove = applyMove(game, magenta[i]!);
    if (!magentaMove.ok) break;
    game = magentaMove.state;
  }
  const final = applyMove(game, cellIndex(7, 1, 6));
  if (final.ok) game = final.state;
  return game;
}

export function LatticePreview() {
  const game = useMemo(buildPreview, []);

  return (
    <div className="preview-frame">
      <span className="corner corner--tl" aria-hidden="true" />
      <span className="corner corner--tr" aria-hidden="true" />
      <span className="corner corner--bl" aria-hidden="true" />
      <span className="corner corner--br" aria-hidden="true" />
      <div className="preview-frame__hud preview-frame__hud--top">
        <span className="micro">LATTICE SCHEMATIC</span>
        <span className="micro micro--dim">7 × 7 // RAPID</span>
      </div>
      <div className="preview-frame__board" aria-hidden="true">
        <Board
          size={7}
          board={game.board}
          interactive={false}
          winPath={game.winPath}
          label="Illustration of a completed VOIDLINK match"
        />
      </div>
      <div className="preview-frame__hud preview-frame__hud--bottom">
        <span className="preview-status">
          <span className="preview-status__pulse" aria-hidden="true" />
          CYAN CHAIN VERIFIED
        </span>
        <span className="micro micro--dim">
          <SignalIcon size={12} /> MOVE {String(game.moveCount).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
