-- Up to 3 profiles per user (limit enforced in the API), each with its
-- own mode, self-description and AI reading. One is active; switching
-- reuses the stored reading (no AI call). A user_profile row without a
-- profile gets one here, made active.

CREATE TABLE IF NOT EXISTS profile (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL CHECK (mode IN ('protected', 'responden', 'plan')),
  mode_by     TEXT NOT NULL,                       -- 'user' | 'ai' | 'rule'
  role        TEXT NOT NULL,
  goals       TEXT,
  region_id   TEXT REFERENCES region(id),
  metrics     JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics_by  TEXT,
  field       TEXT,
  fit         TEXT,
  unsupported JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_message  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_user_idx ON profile (user_id);

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS active_profile_id BIGINT REFERENCES profile(id) ON DELETE SET NULL;

INSERT INTO profile (user_id, mode, mode_by, role, goals, region_id, metrics, metrics_by,
                     field, fit, unsupported, ai_message, updated_at)
SELECT p.user_id, 'responden', 'rule', p.role, p.goals, p.region_id, p.metrics, p.metrics_by,
       p.field, p.fit, p.unsupported, p.ai_message, p.updated_at
FROM user_profile p
WHERE NOT EXISTS (SELECT 1 FROM profile x WHERE x.user_id = p.user_id);

UPDATE app_user u SET active_profile_id = (SELECT MIN(id) FROM profile p WHERE p.user_id = u.id)
WHERE u.active_profile_id IS NULL AND EXISTS (SELECT 1 FROM profile p WHERE p.user_id = u.id);
