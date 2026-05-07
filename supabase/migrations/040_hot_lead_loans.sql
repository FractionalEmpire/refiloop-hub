-- Hot lead loans: stores multiple loan records per hot lead
CREATE TABLE IF NOT EXISTS hot_lead_loans (
    id SERIAL PRIMARY KEY,
    hot_lead_id INTEGER NOT NULL REFERENCES hot_leads(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 1,
    lien_label TEXT,
    lender_name TEXT,
    loan_amount NUMERIC,
    interest_rate NUMERIC,
    due_date DATE,
    loan_type TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

CREATE INDEX IF NOT EXISTS idx_hot_lead_loans_hot_lead_id ON hot_lead_loans(hot_lead_id);
