# VOIDLINK

**Two operators. One lattice. Link your gates. Cut theirs.**

VOIDLINK is a turn-based board duel for two people on separate devices. Claim nodes on a hex
lattice, build an unbroken chain between your gates, and sever your rival's line before it
closes.

The repository is **ready for Vercel** with a Node Function API and Postgres room storage. No
hosted URL is checked in; [the deployment checklist](#deploy-on-vercel) takes it live.

![VOIDLINK match on desktop](docs/screenshots/game-desktop.png)

| The deck | On a phone |
| --- | --- |
| ![VOIDLINK landing page](docs/screenshots/home-desktop.png) | ![VOIDLINK match on mobile](docs/screenshots/game-mobile.png) |

| The Codex | A sealed lattice |
| --- | --- |
| ![VOIDLINK rules codex](docs/screenshots/codex-desktop.png) | ![VOIDLINK result screen](docs/screenshots/result-mobile.png) |

## What you can do

- Open a private uplink, share one six-character code or one link, and play from two devices.
- Quick-match into a public lattice, or train against NEXUS, a local sparring AI with three grades.
- Choose a **7×7 rapid** lattice for a 5–10 minute duel, or a **9×9 classic** for a longer campaign.
- Reconnect after a refresh, swap gates to cancel the first-move advantage, request a rematch,
  send one of four pre-set pings, or spectate a full room.
- Play with a keyboard as well as touch or a mouse. The layout runs from a 320 px phone to a wide monitor.

No account. No install. No chat.

> The underlying connection game is **Hex**, a public-domain rule set. VOIDLINK is an original
> product around it: a live room system, a two-gate visual language, a fairness protocol, a
> responsive mission-control interface, and an offline sparring opponent.

## Rules

1. **Claim one node.** On your turn, tap or click any empty hex. Nodes never move or disappear.
2. **Link your gates.** CYAN owns the top and bottom edges; MAGENTA owns the left and right edges.
   Adjacent nodes connect across their shared edge.
3. **First chain wins.** The first operator with an unbroken chain of their own nodes joining
   their two gates holds the lattice.
4. **No draws.** A sealed lattice always links exactly one side.
5. **Swap protocol.** After cyan's opening claim only, magenta may swap once: take the opening
   node and the cyan gates, exchanging sides. This cancels the known first-player advantage.
6. **A duel can also end** by withdrawal, or by claiming a disconnect after a rival has been
   silent for 80 seconds. Rematches need both operators.

The in-app **Codex** carries the full rules, controls, swap details, and disconnect policy.

## Architecture

```text
Browser A ─┐
           ├── same-origin /api ── Vercel Node Function ── Postgres (rooms + seats)
Browser B ─┘
```

- **Client:** React 19 + TypeScript + Vite. The lattice is a responsive SVG with keyboard
  navigation and accessible cell labels. Gameplay needs no image assets.
- **Rules engine:** pure TypeScript in `shared/engine.ts`; win paths, axial adjacency,
  no-draw property and route costs are unit-tested. The sparring AI uses weighted shortest-route
  evaluation, bridge detection and immediate-threat blocking.
- **Relay:** `shared/service.ts` owns every game rule on the server. `shared/api.ts` is a
  transport-agnostic Request/Response handler. The local Node relay and the Vercel Function both
  call the same files; there is no duplicated server logic.
- **Multiplayer:** six-character, ambiguity-free room codes. Each seat gets a 256-bit bearer
  token; only its SHA-256 hash is stored. Moves and room transitions are server-authoritative,
  with a versioned compare-and-set on the room row and primary-key seat uniqueness. The client
  polls every ~1.4 seconds, sends heartbeats, and applies action responses immediately.
- **Persistence:** two Postgres tables, `rooms` and `seats` (`db/schema.sql`). No accounts and no
  business rows beyond a display callsign and room state. `server/postgres-store.ts` is the only
  module that knows SQL; `server/node-adapter.ts` bridges Vercel's Node request/response to the
  Web Request handler.
- **No WebSockets required:** a turn-based game does not need a long-lived connection, and
  polling survives phone sleep, serverless cold starts and refreshes.

## Run it locally

Requires Node 20.19+ (or 22.12+).

```bash
npm install
npm run dev
```

- Web client: `http://127.0.0.1:5173`
- Local relay: `http://127.0.0.1:8787` (in-memory; the same room rules as production)
- Open two windows or two incognito profiles to play locally. The local relay resets when it
  restarts; the deployed game uses Postgres.

Useful commands:

```bash
npm test                 # engine, AI and room/HTTP tests
npm run build            # typecheck + production client build
npm run check            # tests + build
```

To exercise the Postgres store locally, start any Postgres instance, apply `db/schema.sql`, then
use the Vercel entry point or the store directly with `DATABASE_URL` set. The hosted adapter is
the same code that was exercised end to end against a real PostgreSQL 18 instance.

## Deploy on Vercel

The repository includes `vercel.json`, the `/api/[...path].ts` catch-all Function and the
Postgres store. The steps are:

### 1. Create the database

Use Vercel's **Storage → Postgres / Neon** integration, or any external Postgres provider
(Neon, Supabase, Railway). Copy the **pooled** connection string. TLS is required in production.

Apply the schema once:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

or paste the contents of `db/schema.sql` into the provider's SQL editor.

### 2. Import the repository

In Vercel, **Add New → Project → Import Git Repository** and select
`soumwadeep/voidlink`.

### 3. Set the environment variable

In **Project → Settings → Environment Variables**, add:

| Name | Value | Environments |
| --- | --- | --- |
| `DATABASE_URL` | Pooled Postgres connection string | Production + Preview |

Rules:

- Keep it server-only. Never prefix it with `VITE_`; Vite inlines those into the browser bundle.
- Do not commit it. The repo's `.gitignore` already excludes `.env*`.
- `POSTGRES_URL` is accepted as a fallback for provider-created integrations.
- `DATABASE_SSL=disable` exists only for a local, non-TLS database; do not set it on Vercel.

### 4. Confirm the build settings

`vercel.json` already sets:

- framework: Vite
- build command: `npm run build`
- output directory: `dist`
- auto-detected `/api/[...path].ts` Node Function

Node 22 is pinned with `.nvmrc`. No custom build command or rewrite is needed. The client and
API are served from the same origin, so there is no CORS configuration and no API base URL to
edit.

### 5. Deploy

Click **Deploy**. For a CLI deployment instead:

```bash
npm i -g vercel
vercel link
vercel env add DATABASE_URL production
vercel --prod
```

The schema must be applied before the first game request; the Function does not run migrations
at runtime.

### 6. Verify it live

```bash
curl https://YOUR-PROJECT.vercel.app/api/health
# {"ok":true,"data":{"status":"stable","service":"voidlink-relay","version":1}}
```

Then open the site on two devices, create a private uplink, join with the code, and make a few
moves. Check that a refresh restores the seat and that `/api/health` is public.

### 7. Optional polish

- Set the Function region nearest your players (for example Singapore or Mumbai) in project
  settings.
- Update `index.html`'s `og:image`/`twitter:image` to the deployed absolute URL and add a
  canonical link for social previews.
- Add a custom domain in **Settings → Domains**.
- A live game uses roughly 43 polls per minute per player plus heartbeats. That is fine for
  casual Hobby use; for many concurrent games, upgrade the Vercel plan or raise
  `POLL_INTERVAL_MS` in `shared/protocol.ts`.
- Leaving an unfilled lobby deletes it. Rooms abandoned by a closed tab can be pruned periodically
  with a small SQL job if you expect long-term traffic.

## Tests and verification

`npm test` runs **38 Vitest tests** covering the engine, AI, HTTP contract, token boundaries,
version compare-and-set, rematch flow, disconnect forfeit, quick matching, lobby cancellation and
simultaneous-move serialisation.

The Postgres store and Node adapter were also exercised end to end against a real PostgreSQL 18
database: create, join, a full 13-move chain win, rematch, swap, ping, cancellation and 404 after
deletion.

The client's two-client flow was tested at 1440, 1280, 820, 390 and 320 px widths plus a landscape
phone viewport, with keyboard-only board navigation and claiming. These are browser checks, not a
formal accessibility audit.

## Project map

```text
shared/                 pure rules, room service and HTTP contract
  engine.ts             hex rules, win path, route cost, AI support
  ai.ts                 NEXUS sparring opponent
  service.ts            authoritative rooms, seats, moves, swap, rematch, forfeit
  api.ts                Request/Response routing and validation
src/                    React client
  components/Board.tsx  interactive SVG lattice
  components/Game.tsx   live match UI, result, comms, disconnect claim
  components/Codex.tsx  full rules and controls
api/[...path].ts        Vercel Function entry point for /api/*
server/postgres-store.ts  Postgres implementation of the room store
server/node-adapter.ts  Node request/response bridge
server/dev-server.ts    local in-memory relay
db/schema.sql           Postgres schema
vercel.json             build + Function configuration
tests/                  38 Vitest tests
docs/screenshots/       screens from the game
```

## Design and access

The interface uses a dark, high-contrast mission-control language: cyan and magenta are never
the only distinction — every side is labelled with its name and gate direction. Gameplay has an
`aria-live` status, labelled dialogs and buttons, and a keyboard path over the board: tab in,
arrow between nodes, Enter or Space to claim. Motion is disabled under
`prefers-reduced-motion`. The smallest layouts stack player telemetry, then the board, then
comms; 9×9 on a very small screen is dense by nature and benefits from browser zoom.

**Privacy:** no accounts, no analytics, no open chat. Room codes are the invitation. Seat tokens
are kept in this browser's local storage; clearing site data turns that device into a spectator.
Display callsigns are sanitised before they are stored or shown. The database credential exists
only in the server environment.

## Credits

Built by [Soumwadeep Guha](https://github.com/soumwadeep). Rules ancestry: the public-domain game
Hex. Typefaces: Space Grotesk, Chakra Petch and JetBrains Mono (SIL Open Font License).

## License

[MIT](LICENSE)
