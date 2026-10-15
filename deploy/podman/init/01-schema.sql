-- EmperyWorld multiplayer foundation schema (local Podman init).
-- Applied once on empty Postgres data dir via docker-entrypoint-initdb.d.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Durable character progression (mirror of file saves → migration target).
CREATE TABLE IF NOT EXISTS characters (
  save_id         TEXT PRIMARY KEY,
  account_id      TEXT,
  name            TEXT NOT NULL,
  race            TEXT NOT NULL,
  profession      TEXT,
  gender          TEXT NOT NULL DEFAULT 'male',
  level           INTEGER NOT NULL DEFAULT 1,
  xp              BIGINT NOT NULL DEFAULT 0,
  location_id     TEXT NOT NULL DEFAULT 'empery_haven',
  world_x         DOUBLE PRECISION,
  world_y         DOUBLE PRECISION,
  karma           INTEGER NOT NULL DEFAULT 0,
  payload_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS characters_account_idx ON characters (account_id);
CREATE INDEX IF NOT EXISTS characters_location_idx ON characters (location_id);
CREATE INDEX IF NOT EXISTS characters_updated_idx ON characters (updated_at DESC);

CREATE TABLE IF NOT EXISTS character_equipment (
  save_id   TEXT NOT NULL REFERENCES characters (save_id) ON DELETE CASCADE,
  slot      TEXT NOT NULL,
  item_id   TEXT,
  instance  JSONB,
  PRIMARY KEY (save_id, slot)
);

CREATE TABLE IF NOT EXISTS character_inventory_items (
  id          BIGSERIAL PRIMARY KEY,
  save_id     TEXT NOT NULL REFERENCES characters (save_id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1,
  instance    JSONB,
  bag_index   INTEGER
);

CREATE INDEX IF NOT EXISTS inventory_save_idx ON character_inventory_items (save_id);

CREATE TABLE IF NOT EXISTS character_skills (
  save_id    TEXT NOT NULL REFERENCES characters (save_id) ON DELETE CASCADE,
  skill_id   TEXT NOT NULL,
  level      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (save_id, skill_id)
);

CREATE TABLE IF NOT EXISTS player_sessions (
  session_id     TEXT PRIMARY KEY,
  save_id        TEXT NOT NULL REFERENCES characters (save_id) ON DELETE CASCADE,
  account_id     TEXT,
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  connection_id  TEXT,
  location_id    TEXT,
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS sessions_save_idx ON player_sessions (save_id);
CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON player_sessions (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS parties (
  party_id    TEXT PRIMARY KEY,
  leader_id   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id   TEXT NOT NULL REFERENCES parties (party_id) ON DELETE CASCADE,
  save_id    TEXT NOT NULL REFERENCES characters (save_id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, save_id)
);

CREATE INDEX IF NOT EXISTS party_members_save_idx ON party_members (save_id);

-- Schema bookmark for future migrations.
CREATE TABLE IF NOT EXISTS schema_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (id) VALUES ('2026_08_27_multiplayer_foundation')
ON CONFLICT (id) DO NOTHING;

-- Durable command receipts share the same transaction as progression changes.
CREATE TABLE IF NOT EXISTS game_command_receipts (
  account_id text NOT NULL,
  command_key text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, command_key)
);
CREATE INDEX IF NOT EXISTS game_command_receipts_created_at ON game_command_receipts(created_at);
CREATE TABLE IF NOT EXISTS game_storage_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_accounts (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  password_hash text NOT NULL,
  salt text NOT NULL,
  save_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL,
  admin boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS game_auth_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  account_id text NOT NULL REFERENCES game_accounts(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS game_auth_sessions_expiry ON game_auth_sessions(expires_at);
