ALTER TABLE hot_lead_activities
  ADD COLUMN IF NOT EXISTS gmail_message_id TEXT,
  ADD COLUMN IF NOT EXISTS gmail_thread_id  TEXT,
  ADD COLUMN IF NOT EXISTS direction        TEXT DEFAULT 'outgoing';

CREATE UNIQUE INDEX IF NOT EXISTS hot_lead_activities_gmail_msgid_uidx
  ON hot_lead_activities(gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;
