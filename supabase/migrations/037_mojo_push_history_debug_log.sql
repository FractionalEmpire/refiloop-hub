alter table public.mojo_push_history
  add column if not exists debug_log text;
