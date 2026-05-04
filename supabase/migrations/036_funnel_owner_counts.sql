-- Migration 036: Optimized get_filter_funnel() with per-stage owner counts
--
-- Rewrites the funnel function to:
--   1. Join loans × jn_loan_owners ONCE (vs. ~20 separate subqueries in prior version)
--   2. Use FILTER clauses on a single aggregation pass for all stage counts
--   3. Return both loan counts and distinct owner/entity counts at every funnel stage
--
-- Owner dedup key: 'o'||owner_id or 'e'||entity_id (prevents ID collisions between
-- individual owners and entities, which share an integer ID space)
--
-- Also bumps authenticator role timeout to 60s (was 8s) since the aggregation
-- over 590K loans × 600K jn_loan_owners rows takes ~20-25s.

ALTER ROLE authenticator SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION get_filter_funnel()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Disable per-statement timeout inside this function.
  -- The aggregation over loans × jn_loan_owners takes ~20-25s and would
  -- otherwise be killed by PostgREST's session-level statement_timeout.
  SET LOCAL statement_timeout = 0;

  WITH
  -- Read all filter rules in one scan
  rules AS (
    SELECT
      string_to_array(MAX(CASE WHEN rule_key='blocked_states'          THEN rule_value END), ',') AS blocked_states,
      MAX(CASE WHEN rule_key='min_loan_amount'       THEN rule_value END)::numeric                AS min_amount,
      MAX(CASE WHEN rule_key='max_loan_amount'       THEN rule_value END)::numeric                AS max_amount,
      CURRENT_DATE + MAX(CASE WHEN rule_key='min_maturity_days'  THEN rule_value END)::integer    AS min_maturity,
      CURRENT_DATE + MAX(CASE WHEN rule_key='max_maturity_days'  THEN rule_value END)::integer    AS max_maturity,
      string_to_array(MAX(CASE WHEN rule_key='excluded_property_types' THEN rule_value END), ',') AS excl_prop_types
    FROM filter_rules
  ),
  -- Join loans × jn_loan_owners exactly ONCE
  ljo AS (
    SELECT
      l.id,
      COALESCE(l.is_active, true)                AS is_active,
      l.state,
      l.mortgage_amount,
      COALESCE(l.due_date, l.estimated_due_date)  AS maturity_date,
      COALESCE(l.property_type, '')               AS property_type,
      jn.owner_id,
      jn.entity_id,
      CASE WHEN jn.owner_id  IS NOT NULL THEN 'o'||jn.owner_id::text
           WHEN jn.entity_id IS NOT NULL THEN 'e'||jn.entity_id::text
      END AS owner_key
    FROM loans l
    LEFT JOIN jn_loan_owners jn ON jn.capitalize_loan_id = l.id
  ),
  -- Single aggregation pass — all funnel stages computed simultaneously
  agg AS (
    SELECT
      COUNT(DISTINCT lj.id)        AS imported_loans,
      COUNT(DISTINCT lj.owner_key) AS imported_owners,

      COUNT(DISTINCT lj.id)        FILTER (WHERE lj.is_active) AS after_active,
      COUNT(DISTINCT lj.owner_key) FILTER (WHERE lj.is_active) AS after_active_owners,

      COUNT(DISTINCT lj.id)        FILTER (WHERE lj.is_active AND lj.state IS NOT NULL) AS after_state_not_null,
      COUNT(DISTINCT lj.owner_key) FILTER (WHERE lj.is_active AND lj.state IS NOT NULL) AS after_state_not_null_owners,

      COUNT(DISTINCT lj.id)        FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states))) AS after_blocked_states,
      COUNT(DISTINCT lj.owner_key) FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states))) AS after_blocked_states_owners,

      COUNT(DISTINCT lj.id)        FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount) AS after_loan_amount,
      COUNT(DISTINCT lj.owner_key) FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount) AS after_loan_amount_owners,

      COUNT(DISTINCT lj.id)        FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount AND lj.maturity_date BETWEEN r.min_maturity AND r.max_maturity) AS after_maturity,
      COUNT(DISTINCT lj.owner_key) FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount AND lj.maturity_date BETWEEN r.min_maturity AND r.max_maturity) AS after_maturity_owners,

      COUNT(DISTINCT lj.id)        FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount AND lj.maturity_date BETWEEN r.min_maturity AND r.max_maturity AND NOT (lj.property_type = ANY(r.excl_prop_types))) AS qualified_loans,
      COUNT(DISTINCT lj.owner_key) FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount AND lj.maturity_date BETWEEN r.min_maturity AND r.max_maturity AND NOT (lj.property_type = ANY(r.excl_prop_types))) AS qualified_loans_owners,

      COUNT(DISTINCT lj.id) FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount AND lj.maturity_date BETWEEN r.min_maturity AND r.max_maturity AND NOT (lj.property_type = ANY(r.excl_prop_types)) AND lj.owner_id IS NOT NULL AND lj.entity_id IS NULL) AS ql_individual_only,
      COUNT(DISTINCT lj.id) FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount AND lj.maturity_date BETWEEN r.min_maturity AND r.max_maturity AND NOT (lj.property_type = ANY(r.excl_prop_types)) AND lj.entity_id IS NOT NULL AND lj.owner_id IS NULL) AS ql_entity_only,
      COUNT(DISTINCT lj.id) FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount AND lj.maturity_date BETWEEN r.min_maturity AND r.max_maturity AND NOT (lj.property_type = ANY(r.excl_prop_types)) AND lj.owner_id IS NOT NULL AND lj.entity_id IS NOT NULL) AS ql_both,
      COUNT(DISTINCT lj.id) FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount AND lj.maturity_date BETWEEN r.min_maturity AND r.max_maturity AND NOT (lj.property_type = ANY(r.excl_prop_types)) AND lj.owner_id IS NULL AND lj.entity_id IS NULL) AS ql_no_owner,

      COUNT(DISTINCT lj.entity_id) FILTER (WHERE lj.is_active AND lj.state IS NOT NULL AND NOT (lj.state = ANY(r.blocked_states)) AND lj.mortgage_amount BETWEEN r.min_amount AND r.max_amount AND lj.maturity_date BETWEEN r.min_maturity AND r.max_maturity AND NOT (lj.property_type = ANY(r.excl_prop_types)) AND lj.entity_id IS NOT NULL) AS ent_qualifying_total
    FROM ljo lj, rules r
    GROUP BY r.blocked_states, r.min_amount, r.max_amount, r.min_maturity, r.max_maturity, r.excl_prop_types
  )
  SELECT json_build_object(
    'raw_capitalize',              (SELECT COUNT(*)::bigint FROM raw_capitalize_scrape),
    'raw_capitalize_owners',       (SELECT COUNT(DISTINCT borrower_name)::bigint FROM raw_capitalize_scrape),
    'imported_loans',              a.imported_loans,
    'imported_owners',             a.imported_owners,
    'after_active',                a.after_active,
    'after_active_owners',         a.after_active_owners,
    'after_state_not_null',        a.after_state_not_null,
    'after_state_not_null_owners', a.after_state_not_null_owners,
    'after_blocked_states',        a.after_blocked_states,
    'after_blocked_states_owners', a.after_blocked_states_owners,
    'after_loan_amount',           a.after_loan_amount,
    'after_loan_amount_owners',    a.after_loan_amount_owners,
    'after_maturity',              a.after_maturity,
    'after_maturity_owners',       a.after_maturity_owners,
    'qualified_loans',             a.qualified_loans,
    'qualified_loans_owners',      a.qualified_loans_owners,
    'ql_individual_only',          a.ql_individual_only,
    'ql_entity_only',              a.ql_entity_only,
    'ql_both',                     a.ql_both,
    'ql_no_owner',                 a.ql_no_owner,
    'ent_qualifying_total',        a.ent_qualifying_total,
    'total_slots',                 (SELECT COUNT(*)::bigint FROM v_airtable_push),
    'total_slots_owners',          (SELECT COUNT(DISTINCT owner_id)::bigint FROM v_airtable_push WHERE owner_id IS NOT NULL),
    'pending_skip_trace',          (SELECT COUNT(*)::bigint FROM v_airtable_push WHERE COALESCE(skip_trace_done, false) = false),
    'pending_skip_trace_owners',   (SELECT COUNT(DISTINCT owner_id)::bigint FROM v_airtable_push WHERE owner_id IS NOT NULL AND COALESCE(skip_trace_done, false) = false),
    'individual_slots',            (SELECT COUNT(*)::bigint FROM v_airtable_push WHERE slot_type = 'individual'),
    'ind_owners_skip_pending',     (SELECT COUNT(DISTINCT owner_id)::bigint FROM v_airtable_push WHERE slot_type = 'individual' AND COALESCE(skip_trace_done, false) = false),
    'ind_owners_skip_done',        (SELECT COUNT(DISTINCT owner_id)::bigint FROM v_airtable_push WHERE slot_type = 'individual' AND COALESCE(skip_trace_done, false) = true),
    'ind_owners_has_phone',        (SELECT COUNT(DISTINCT vp.owner_id)::bigint FROM v_airtable_push vp WHERE vp.slot_type = 'individual' AND EXISTS (SELECT 1 FROM owner_phones op WHERE op.owner_id = vp.owner_id)),
    'ent_veil_pierced',            (SELECT COUNT(DISTINCT entity_id)::bigint FROM v_airtable_push WHERE slot_type = 'entity' AND entity_id IS NOT NULL),
    'entity_slots',                (SELECT COUNT(*)::bigint FROM v_airtable_push WHERE slot_type = 'entity'),
    'ent_skip_pending',            (SELECT COUNT(*)::bigint FROM v_airtable_push WHERE slot_type = 'entity' AND COALESCE(skip_trace_done, false) = false),
    'individual_queue',            (SELECT COUNT(*)::bigint FROM v_skip_trace_ui WHERE slot_type = 'individual' AND skip_trace_status IS NULL AND has_missing_data = false),
    'individual_missing',          (SELECT COUNT(*)::bigint FROM v_skip_trace_ui WHERE slot_type = 'individual' AND has_missing_data = true AND skip_trace_status IS NULL),
    'individual_done',             (SELECT COUNT(*)::bigint FROM v_skip_trace_ui WHERE slot_type = 'individual' AND skip_trace_status = 'done'),
    'entity_queue',                (SELECT COUNT(*)::bigint FROM v_skip_trace_ui WHERE slot_type = 'entity' AND skip_trace_status IS NULL AND has_missing_data = false),
    'entity_missing',              (SELECT COUNT(*)::bigint FROM v_skip_trace_ui WHERE slot_type = 'entity' AND has_missing_data = true AND skip_trace_status IS NULL)
  ) INTO result
  FROM agg a;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION get_filter_funnel IS
  'Returns loan counts and distinct owner/entity counts at each filter stage. Single-pass aggregation over loans × jn_loan_owners for performance. Requires authenticator role timeout >= 60s.';
