-- Tag lifting sets by periodization for progress charts (hypertrophy vs strength).
alter table public.workout_logs
  add column if not exists periodization_phase text;

comment on column public.workout_logs.periodization_phase is
  'hypertrophy | strength — used to filter progress graphs by current periodization';
