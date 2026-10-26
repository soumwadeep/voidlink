import { Modal } from './Modal';
import { CloseIcon, LockIcon, WifiOffIcon } from './Icons';

interface CodexProps {
  open: boolean;
  onClose: () => void;
}

export function Codex({ open, onClose }: CodexProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="codex-title"
      className="codex-modal"
    >
      <div className="modal-head codex-head">
        <div>
          <p className="eyebrow">FIELD MANUAL // FULL TEXT</p>
          <h2 id="codex-title" className="modal-title">
            THE LATTICE CODEX
          </h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close codex">
          <CloseIcon />
        </button>
      </div>

      <div className="codex-scroll">
        <div className="codex-facts">
          <div>
            <span className="micro">OPERATORS</span>
            <strong>02</strong>
          </div>
          <div>
            <span className="micro">LATTICE</span>
            <strong>7×7 / 9×9</strong>
          </div>
          <div>
            <span className="micro">DRAWS</span>
            <strong>NONE</strong>
          </div>
          <div>
            <span className="micro">MATCH</span>
            <strong>5–15 MIN</strong>
          </div>
        </div>

        <section className="codex-section codex-section--lead">
          <p className="codex-index mono">01 / OBJECTIVE</p>
          <div className="codex-copy">
            <h3>Join your two gates with one unbroken chain.</h3>
            <p>
              Every operator owns two opposite gates. <span className="text-cyan">CYAN</span> owns
              the top and bottom edges. <span className="text-magenta">MAGENTA</span> owns the left
              and right edges. Your nodes link only across a shared hex edge.
            </p>
            <p>
              The first operator to connect their own gates with a continuous chain of their own
              nodes wins. A chain can wind, branch, double back, and fill half the lattice — it
              only needs to be continuous.
            </p>
            <RulesDiagram />
          </div>
        </section>

        <section className="codex-section">
          <p className="codex-index mono">02 / THE TURN</p>
          <div className="codex-copy">
            <h3>One claim. No removals. No passes.</h3>
            <p>
              On your turn, claim exactly one empty node by tapping it. The node becomes yours and
              never moves or disappears. Then the turn passes. Cyan claims first.
            </p>
            <p>
              You may not skip a turn. If the lattice is full and neither chain is complete — which
              cannot happen under these rules — the duel is void. In practice, every sealed lattice
              links one side.
            </p>
          </div>
        </section>

        <section className="codex-section codex-section--swap">
          <p className="codex-index mono">03 / SWAP PROTOCOL</p>
          <div className="codex-copy">
            <h3>Magenta may cancel the opening advantage — once.</h3>
            <p>
              After cyan's very first claim, magenta has a single chance to invoke the swap.
              Invoking it exchanges the gates: you take cyan's opening node and the cyan gates; your
              rival takes magenta and the magenta gates. It is still the rival's turn as the new
              magenta operator.
            </p>
            <p>
              The swap closes the moment magenta makes any claim, or immediately after it is used.
              It is how a turn-based game with a known first-player edge stays fair. Cyan can see
              the option is open and must plan for it.
            </p>
            <p className="codex-note">
              <strong>When to swap:</strong> take cyan if the opening node sits somewhere you would
              have wanted it. Stay magenta if you would rather attack the position you can already
              see.
            </p>
          </div>
        </section>

        <section className="codex-section">
          <p className="codex-index mono">04 / ENDINGS</p>
          <div className="codex-copy">
            <h3>A chain, a withdrawal, or a dead uplink.</h3>
            <p>
              A duel ends the instant a chain joins its owner's gates. There are no draws. An
              operator may withdraw at any time; the rival takes the duel immediately. If a rival
              stops transmitting for <strong>80 seconds</strong> beyond their last heartbeat, the
              remaining operator may claim a disconnect win.
            </p>
            <p>
              After a result, either operator can request a rematch. Both must accept. The lattice
              resets to its opening position, cyan claims first again, and the swap protocol reopens.
            </p>
          </div>
        </section>

        <section className="codex-section">
          <p className="codex-index mono">05 / CONTROLS</p>
          <div className="codex-copy">
            <h3>Built for a thumb, a cursor, or a keyboard.</h3>
            <p>
              Tap or click any open hex to claim it. On a keyboard, tab to the lattice, use the
              arrow keys to move focus between nodes, and press Enter or Space to claim. Every
              control has a visible focus state and the match status announces itself to screen
              readers.
            </p>
            <p>
              The interface is responsive from small phones to wide monitors. 7×7 rapid is the
              friendliest on a small screen; 9×9 classic rewards a larger canvas and a longer
              campaign. Zooming the browser is always allowed.
            </p>
          </div>
        </section>

        <section className="codex-section">
          <p className="codex-index mono">06 / RELAY &amp; FAIR PLAY</p>
          <div className="codex-copy">
            <h3>Server-authoritative. No account required.</h3>
            <p>
              Every claim, swap and result is validated by the relay. The board you see is the
              authoritative room state, polled roughly every 1.4 seconds; actions apply immediately.
              Tokens are stored privately in this browser so a refresh returns you to your seat.
            </p>
            <p>
              Rooms are capped at two operators and identified by a six-character code with
              ambiguity-free characters. There is no open chat: only four pre-set pings. Share the
              link, not your browser storage. Spectators may watch a full room but cannot claim.
            </p>
            <div className="codex-icons">
              <span><LockIcon size={14} /> PRIVATE CODE</span>
              <span><WifiOffIcon size={14} /> 80s DISCONNECT GRACE</span>
            </div>
          </div>
        </section>

        <div className="codex-foot">
          <span className="mono">THE VOID DOES NOT NEGOTIATE.</span>
          <button type="button" className="btn btn--primary btn--small" onClick={onClose}>
            RETURN TO THE LATTICE
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RulesDiagram() {
  const centres = [
    { x: 96, y: 46 },
    { x: 150, y: 78 },
    { x: 204, y: 110 },
    { x: 204, y: 174 },
    { x: 150, y: 206 },
    { x: 150, y: 270 },
  ];
  const otherNodes = [
    { x: 258, y: 78 },
    { x: 258, y: 142 },
    { x: 96, y: 110 },
    { x: 96, y: 174 },
    { x: 258, y: 206 },
    { x: 42, y: 142 },
  ];
  const hex = (cx: number, cy: number, radius: number) => {
    const points: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`);
    }
    return points.join(' ');
  };
  const chain = centres.map(point => `${point.x},${point.y}`).join(' ');

  return (
    <div className="rules-diagram">
      <svg viewBox="0 0 300 316" role="img" aria-label="Diagram: a cyan chain winding from the top gate to the bottom gate">
        <defs>
          <linearGradient id="codex-cyan" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9dfcff" />
            <stop offset="100%" stopColor="#0b8794" />
          </linearGradient>
        </defs>
        <line x1="60" y1="20" x2="240" y2="20" className="rules-diagram__gate rules-diagram__gate--cyan" />
        <line x1="60" y1="296" x2="240" y2="296" className="rules-diagram__gate rules-diagram__gate--cyan" />
        <line x1="18" y1="70" x2="18" y2="246" className="rules-diagram__gate rules-diagram__gate--magenta" />
        <line x1="282" y1="70" x2="282" y2="246" className="rules-diagram__gate rules-diagram__gate--magenta" />
        <text x="150" y="12" textAnchor="middle" className="rules-diagram__label rules-diagram__label--cyan">CYAN GATE</text>
        <text x="150" y="308" textAnchor="middle" className="rules-diagram__label rules-diagram__label--cyan">CYAN GATE</text>
        <text x="10" y="160" textAnchor="middle" transform="rotate(-90 10 160)" className="rules-diagram__label rules-diagram__label--magenta">MAGENTA</text>
        <text x="290" y="160" textAnchor="middle" transform="rotate(90 290 160)" className="rules-diagram__label rules-diagram__label--magenta">MAGENTA</text>
        {otherNodes.map((point, index) => (
          <polygon key={`other-${index}`} points={hex(point.x, point.y, 22)} className="rules-diagram__hex" />
        ))}
        <polyline points={chain} className="rules-diagram__link" />
        {centres.map((point, index) => (
          <g key={`cyan-${index}`}>
            <polygon
              points={hex(point.x, point.y, 25)}
              className="rules-diagram__hex rules-diagram__hex--cyan"
              style={{ fill: 'url(#codex-cyan)' }}
            />
            <circle cx={point.x} cy={point.y} r="4" className="rules-diagram__core" />
          </g>
        ))}
      </svg>
      <div className="rules-diagram__caption">
        <p className="micro">ONE CHAIN · ANY SHAPE</p>
        <p>The link may bend through all six shared edges. It cannot jump a gap or cross a rival node.</p>
      </div>
    </div>
  );
}
