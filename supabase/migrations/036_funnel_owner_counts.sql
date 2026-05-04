-- Migration 036: Add owner counts to get_filter_funnel()
--
-- Each funnel stage now returns both a loan count and a distinct owner/entity count,
-- so you can see how many unique borrowing parties are at each stage vs how many loans.
-- Owner drop-off is visible in the removed column alongside loan drop-off.
--
-- Owner dedup key: CASE WHEN owner_id IS NOT NULL THEN 'o'||owner_id ELSE 'e'||entity_id END
-- (prevents ID collisions between individual owners and entities, which share an integer space)
--
-- Also adds enrichment pipeline fields:
--   ind_owners_*  — individual owner counts at each skip-trace stage
--   ent_*         — entity counts (qualifying, veil-pierced, slots, pending)

CREATE OR REPLACE FUNCTION get_filter_funnel()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
WITH qualified AS (
  SELECT l.id, lo.owner_id, lo.entity_id
  FROM loans l
  LEFT JOIN jn_loan_owners lo ON lo.capitalize_loan_id = l.id
  WHERE COALESCE(l.is_active, true) = true
    AND l.state IS NOT NULL
    AND l.state NOT IN (SELECT unnest(string_to_array(rule_value, ',')) FROM filter_rules WHERE rule_key = 'blocked_states')
    AND l.mortgage_amount BETWEEN
        (SELECT rule_value::numeric FROM filter_rules WHERE rule_key = 'min_loan_amount')
        AND (SELECT rule_value::numeric FROM filter_rules WHERE rule_key = 'max_loan_amount')
    AND COALESCE(l.due_date, l.estimated_due_date) BETWEEN
        CURRENT_DATE + (SELECT rule_value::integer FROM filter_rules WHERE rule_key = 'min_maturity_days')
        AND CURRENT_DATE + (SELECT rule_value::integer FROM filter_rules WHERE rule_key = 'max_maturity_days')
    AND COALESCE(l.property_type, '') NOT IN (SELECT unnest(string_to_array(rule_value, ',')) FROM filter_rules WHERE rule_key = 'excluded_property_types')
)
SELECT json_build_object(
  -- ── Funnel: loan counts + owner counts ──────────────────────────────────────
  'raw_capitalize',
    (SELECT COUNT(*)::bigint FROM raw_capitalize_scrape),
  'raw_capitalize_owners',
    (SELECT COUNT(DISTINCT borrower_name)::bigint FROM raw_capitalize_scrape),

  'imported_loans',
    (SELECT COUNT(*)::bigint FROM loans),
  'imported_owners',
    (SELECT COUNT(DISTINCT CASE WHEN jn.owner_id IS NOT NULL THEN 'o'||jn.owner_id::text ELSE 'e'||jn.entity_id::text END)::bigint FROM jn_loan_owners jn),

  'after_active',
    (SELECT COUNT(*)::bigint FROM loans WHERE COALESCE(is_active, true) = true),
  'after_active_owners',
    (SELECT COUNT(DISTINCT CASE WHEN jn.owner_id IS NOT NULL THEN 'o'||jn.owner_id::text ELSE 'e'||jn.entity_id::text END)::bigint FROM loans l JOIN jn_loan_owners jn ON jn.capitalize_loan_id = l.id WHERE COALESCE(l.is_active, true) = true),

  'after_state_not_null',
    (SELECT COUNT(*)::bigint FROM loans WHERE COALESCE(is_active, true) = true AND state IS NOT NULL),
  'after_state_not_null_owners',
    (SELECT COUNT(DISTINCT CASE WHEN jn.owner_id IS NOT NULL THEN 'o'||jn.owner_id::text ELSE 'e'||jn.entity_id::text END)::bigint FROM loans l JOIN jn_loan_owners jn ON jn.capitalize_loan_id = l.id WHERE COALESCE(l.is_active, true) = true AND l.state IS NOT NULL),

  'after_blocked_states',
    (SELECT COUNT(*)::bigint FROM loans WHERE COALESCE(is_active, true) = true AND state IS NOT NULL AND state NOT IN (SELECT unnest(string_to_array(rule_value, ',')) FROM filter_rules WHERE rule_key = 'blocked_states')),
  'after_blocked_states_owners',
    (SELECT COUNT(DISTINCT CASE WHEN jn.owner_id IS NOT NULL THEN 'o'||jn.owner_id::text ELSE 'e'||jn.entity_id::text END)::bigint FROM loans l JOIN jn_loan_owners jn ON jn.capitalize_loan_id = l.id WHERE COALESCE(l.is_active, true) = true AND l.state IS NOT NULL AND l.state NOT IN (SELECT unnest(string_to_array(rule_value, ',')) FROM filter_rules WHERE rule_key = 'blocked_states')),

  'after_loan_amount',
    (SELECT COUNT(*)::bigint FROM loans WHERE COALESCE(is_active, true) = true AND state IS NOT NULL AND state NOT IN (SELECT unnest(string_to_array(rule_value, ',')) FROM filter_rules WHERE rule_key = 'blocked_states') AND mortgage_amount BETWEEN (SELECT rule_value::numeric FROM filter_rules WHERE rule_key = 'min_loan_amount') AND (SELECT rule_value::numeric FROM filter_rules WHERE rule_key = 'max_loan_amount')),
  'after_loan_amount_owners',
    (SELECT COUNT(DISTINCT CASE WHEN jn.owner_id IS NOT NULL THEN 'o'||jn.owner_id::text ELSE 'e'||jn.entity_id::text END)::bigint FROM loans l JOIN jn_loan_owners jn ON jn.capitalize_loan_id = l.id WHERE COALESCE(l.is_active, true) = true AND l.state IS NOT NULL AND l.state NOT IN (SELECT unnest(string_to_array(rule_value, ',')) FROM filter_rules WHERE rule_key = 'blocked_states') AND l.mortgage_amount BETWEEN (SELECT rule_value::numeric FROM filter_rules WHERE rule_key = 'min_loan_amount') AND (SELECT rule_value::numeric FROM filter_rules WHERE rule_key = 'max_loan_amount')),

  'after_maturity',
    (SELECT COUNT(*)::bigint FROM loans WHERE COALESCE(is_active, true) = true AND state IS NOT NULL AND state NOT IN (SELECT unnest(string_to_array(rule_value, ',')) FROM filter_rules WHERE rule_key = 'blocked_states') AND mortgage_amount BETWEEN (SELECT rule_value::numeric FROM filter_rules WHERE rule_key = 'min_loan_amount') AND (SELECT rule_value::numeric FROM filter_rules WHERE rule_key = 'max_loan_amount') AND COALESCE(due_date, estimated_due_date) BETWEEN CURRENT_DATE + (SELECT rule_value::integer FROM filter_rules WHERE rule_key = 'min_maturity_days') AND CURRENT_DATE + (SELECT rule_value::integer FROM filter_rules WHERE rule_key = 'max_maturity_days')),
  'after_maturity_owners',
    (SELECT COUNT(DISTINCT CASE WHEN jn.owner_id IS NOT NULL THEN 'o'||jn.owner_id::text ELSE 'e'||jn.entity_id::text END)::bigint FROM loans l JOIN jn_loan_owners jn ON jn.capitalize_loan_id = l.id WHERE COALESCE(l.is_active, true) = true AND l.state IS NOT NULL AND l.state NOT IN (SELECT unnest(string_to_array(rule_value, ',')) FROM filter_rules WHERE rule_key = 'blocked_states') AND l.mortgage_amount BETWEEN (SELECT rule_value::numeric FROM filter_rules WHERE rule_key = 'min_loan_amount') AND (SELECT rule_value::numeric FROM filter_rules WHERE rule_key = 'max_loan_amount') AND COALESCE(l.due_date, l.estimated_due_date) BETWEEN CURRENT_DATE + (SELECT rule_value::integer FROM filter_rules WHERE rule_key = 'min_maturity_days') AND CURRENT_DATE + (SELECT rule_value::integer FROM filter_rules WHERE rule_key = 'max_maturity_days')),

  'qualified_loans',
    (SELECT COUNT(DISTINCT id)::bigint FROM qualified),
  'qualified_loans_owners',
    (SELECT COUNT(DISTINCT CASE WHEN q.owner_id IS NOT NULL THEN 'o'||q.owner_id::text ELSE 'e'||q.entity_id::text END)::bigint FROM qualified q WHERE q.owner_id IS NOT NULL OR q.entity_id IS NOT NULL),

  -- ── Owner linkage breakdown (loan-level counts) ─────────────────────────────
  'ql_individual_only',
    (SELECT COUNT(DISTINCT q.id) FROM qualified q WHERE q.owner_id IS NOT NULL AND q.entity_id IS NULL),
  'ql_entity_only',
    (SELECT COUNT(DISTINCT q.id) FROM qualified q WHERE q.entity_id IS NOT NULL AND q.owner_id IS NULL),
  'ql_both',
    (SELECT COUNT(DISTINCT q.id) FROM qualified q WHERE q.owner_id IS NOT NULL AND q.entity_id IS NOT NULL),
  'ql_no_owner',
    (SELECT COUNT(DISTINCT q.id) FROM qualified q WHERE q.owner_id IS NULL AND q.entity_id IS NULL),

  -- ── Slot-level counts ────────────────────────────────────────────────────────
  'total_slots',
    (SELECT COUNT(*)::bigint FROM v_airtable_push),
  'total_slots_owners',
    (SELECT COUNT(DISTINCT owner_id)::bigint FROM v_airtable_push WHERE owner_id IS NOT NULL),
  'pending_skip_trace',
    (SELECT COUNT(*)::bigint FROM v_airtable_push WHERE COALESCE(skip_trace_done, false) = false),
  'pending_skip_trace_owners',
    (SELECT COUNT(DISTINCT owner_id)::bigint FROM v_airtable_push WHERE owner_id IS NOT NULL AND COALESCE(skip_trace_done, false) = false),

  -- ── Individual enrichment pipeline ──────────────────────────────────────────
  'individual_slots',
    (SELECT COUNT(*)::bigint FROM v_airtable_push WHERE slot_type = 'individual'),
  'ind_owners_skip_pending',
    (SELECT COUNT(DISTINCT owner_id)::bigint FROM v_airtable_push WHERE slot_type = 'individual' AND COALESCE(skip_trace_done, false) = false),
  'ind_owners_skip_done',
    (SELECT COUNT(DISTINCT owner_id)::bigint FROM v_airtable_push WHERE slot_type = 'individual' AND COALESCE(skip_trace_done, false) = true),
  'ind_owners_has_phone',
    (SELECT COUNT(DISTINCT vp.owner_id)::bigint FROM v_airtable_push vp WHERE vp.slot_type = 'individual' AND EXISTS (SELECT 1 FROM owner_phones op WHERE op.owner_id = vp.owner_id)),

  -- ── Entity enrichment pipeline ───────────────────────────────────────────────
  'ent_qualifying_total',
    (SELECT COUNT(DISTINCT q.entity_id)::bigint FROM qualified q WHERE q.entity_id IS NOT NULL),
  'ent_veil_pierced',
    (SELECT COUNT(DISTINCT entity_id)::bigint FROM v_airtable_push WHERE slot_type = 'entity' AND entity_id IS NOT NULL),
  'entity_slots',
    (SELECT COUNT(*)::bigint FROM v_airtable_push WHERE slot_type = 'entity'),
  'ent_skip_pending',
    (SELECT COUNT(*)::bigint FROM v_airtable_push WHERE slot_type = 'entity' AND COALESCE(skip_trace_done, false) = false),

  -- ── Legacy fields (kept for backward compat) ─────────────────────────────────
  'individual_queue',
    (SELECT COUNT(*)::bigint FROM v_skip_trace_ui WHERE slot_type = 'individual' AND skip_trace_status IS NULL AND has_missing_data = false),
  'individual_missing',
    (SELECT COUNT(*)::bigint FROM v_skip_trace_ui WHERE slot_type = 'individual' AND has_missing_data = true AND skip_trace_status IS NULL),
  'individual_done',
    (SELECT COUNT(*)::bigint FROM v_skip_trace_ui WHERE slot_type = 'individual' AND skip_trace_status = 'done'),
  'entity_queue',
    (SELECT COUNT(*)::bigint FROM v_skip_trace_ui WHERE slot_type = 'entity' AND skip_trace_status IS NULL AND has_missing_data = false),
  'entity_missing',
    (SELECT COUNT(*)::bigint FROM v_skip_trace_ui WHERE slot_type = 'entity' AND has_missing_data = true AND skip_trace_status IS NULL)
)
$$;

COMMENT ON FUNCTION get_filter_funnel IS
  'Returns loan counts and distinct owner/entity counts at each filter stage, from raw Capitalize data down to skip-trace eligible slots.';
