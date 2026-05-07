-- Add email-pull columns to collab_eod_updates
ALTER TABLE collab_eod_updates
  ADD COLUMN IF NOT EXISTS email_message_id   text UNIQUE,
  ADD COLUMN IF NOT EXISTS raw_email_body     text,
  ADD COLUMN IF NOT EXISTS live_and_running   text,
  ADD COLUMN IF NOT EXISTS built_not_deployed text,
  ADD COLUMN IF NOT EXISTS broken             text,
  ADD COLUMN IF NOT EXISTS next_steps         text,
  ADD COLUMN IF NOT EXISTS needs_from_david   text,
  ADD COLUMN IF NOT EXISTS clarifying_questions jsonb DEFAULT '[]'::jsonb;
