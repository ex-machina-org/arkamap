-- Bumped on every password change or reset. Tokens carry the version they
-- were issued under, so changing the password logs out every old session.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
