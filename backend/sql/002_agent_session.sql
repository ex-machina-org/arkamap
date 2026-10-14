-- Agent conversation state. One row per chat session; survives restarts and
-- is shared by every API worker.
CREATE TABLE IF NOT EXISTS agent_session (
  id          TEXT PRIMARY KEY,
  history     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- last few {role, content}
  context     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- e.g. {"region": {id, name, level}}
  turns       INTEGER NOT NULL DEFAULT 0,
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
