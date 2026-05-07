CREATE TABLE IF NOT EXISTS collab_call_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date             date NOT NULL DEFAULT CURRENT_DATE,
  content          text NOT NULL,
  source           text DEFAULT 'manual',
  email_message_id text UNIQUE,
  raw_email_body   text,
  commitments      text,
  decisions        text,
  action_items     text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_notes_date ON collab_call_notes (date DESC);
