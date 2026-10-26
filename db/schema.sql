-- VOIDLINK room relay schema
-- Two tables per deployment: one room row and up to two seats. Anonymous
-- operators are authorised by a 256-bit bearer token whose SHA-256 hash is
-- stored in seats. The room row is versioned so every transition is a
-- single-row compare-and-set.
--
-- This file uses the platform's supported DDL subset: constraints are kept to
-- NOT NULL, PRIMARY KEY, UNIQUE and intra-schema REFERENCES. All value checks
-- live in the Function so a schema correction is never needed for gameplay.

CREATE TABLE app.rooms (
  code            text PRIMARY KEY,
  size            integer NOT NULL DEFAULT 7,
  board           text NOT NULL DEFAULT '',
  turn            integer NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'waiting',
  winner          integer,
  win_path        text NOT NULL DEFAULT '',
  move_count      integer NOT NULL DEFAULT 0,
  last_move       integer,
  finish_reason   text,
  swapped         boolean NOT NULL DEFAULT false,
  public_match    boolean NOT NULL DEFAULT false,
  rematch         text NOT NULL DEFAULT '[]',
  signal_seat     integer,
  signal_kind     text,
  signal_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1
);

CREATE TABLE app.seats (
  room_code  text NOT NULL REFERENCES app.rooms(code),
  seat       integer NOT NULL,
  token_hash text NOT NULL UNIQUE,
  name       text NOT NULL,
  last_seen  timestamptz NOT NULL DEFAULT now(),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, seat)
);

CREATE INDEX rooms_waiting_idx ON app.rooms (status, public_match, size, created_at);
CREATE INDEX rooms_updated_idx ON app.rooms (updated_at);
