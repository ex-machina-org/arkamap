-- How the AI read the user's self-description: the closest view template
-- (field), how well our data fits, what they asked for that we don't have,
-- and a short message telling them so.
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS field TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS fit TEXT;             -- cocok | sebagian | tidak_cocok
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS unsupported JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS ai_message TEXT;
