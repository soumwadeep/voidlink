-- VOIDLINK room relay schema
-- Run once against any standard Postgres database:
--   psql "$DATABASE_URL" -f db/schema.sql
--
-- Two tables: one room row and up to two seats. Operators are anonymous and
-- authenticated by a 256-bit bearer token; only its SHA-256 hash is stored.
-- The room row is versioned so every transition is a single-row compare-and-set.

CREATE TABLE IF NOT EXISTS rooms (
  code            text PRIMARY KEY CHECK (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  size            integer NOT NULL DEFAULT 7 CHECK (size IN (7, 9)),
  board           text NOT NULL DEFAULT '',
  turn            integer NOT NULL DEFAULT 1 CHECK (turn IN (1, 2)),
  status          text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  winner          integer CHECK (winner IN (1, 2)),
  win_path        text NOT NULL DEFAULT '',
  move_count      integer NOT NULL DEFAULT 0 CHECK (move_count >= 0),
  last_move       integer,
  finish_reason   text CHECK (finish_reason IN ('link', 'resign', 'forfeit', 'draw')),
  swapped         boolean NOT NULL DEFAULT false,
  public_match    boolean NOT NULL DEFAULT false,
  rematch         text NOT NULL DEFAULT '[]',
  signal_seat     integer CHECK (signal_seat IN (1, 2)),
  signal_kind     text CHECK (signal_kind IN ('gg', 'nice', 'focus', 'gl')),
  signal_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS seats (
  room_code  text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  seat       integer NOT NULL CHECK (seat IN (1, 2)),
  token_hash text NOT NULL UNIQUE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 16),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, seat)
);

CREATE INDEX IF NOT EXISTS rooms_waiting_idx ON rooms (status, public_match, size, created_at);
CREATE INDEX IF NOT EXISTS rooms_updated_idx ON rooms (updated_at);
