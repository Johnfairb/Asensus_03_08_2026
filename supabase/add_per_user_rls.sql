-- Per-user RLS for the existing Ascensus project
-- Run once in Supabase → SQL Editor (project yargrkdfgscxknicdtrt)
--
-- Model: every log, metric, template, and inventory row belongs to one user.
-- Official foods/exercises are copied per account on first login (pantry stock
-- and preference_score live on inventory rows, so a shared catalogue would leak).
--
-- Existing rows are assigned to john@ascensus.com (else the oldest auth user).
-- Theo / Tyler / new accounts see an empty pantry and get seeded on next boot.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.food_inventory
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.exercise_inventory
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.food_logs
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.workout_logs
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.body_metrics
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.user_templates
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Backfill current sandbox rows onto one owner
-- ---------------------------------------------------------------------------
do $$
declare
  owner_id uuid;
begin
  select id into owner_id from auth.users where email ilike 'john@ascensus.com' limit 1;
  if owner_id is null then
    select id into owner_id from auth.users order by created_at asc limit 1;
  end if;
  if owner_id is null then
    raise notice 'No auth.users yet — skipping backfill';
    return;
  end if;

  update public.food_inventory set user_id = owner_id where user_id is null;
  update public.exercise_inventory set user_id = owner_id where user_id is null;
  update public.food_logs set user_id = owner_id where user_id is null;
  update public.workout_logs set user_id = owner_id where user_id is null;
  update public.body_metrics set user_id = owner_id where user_id is null;
  update public.user_templates set user_id = owner_id where user_id is null;
end $$;

alter table public.food_inventory alter column user_id set default auth.uid();
alter table public.exercise_inventory alter column user_id set default auth.uid();
alter table public.food_logs alter column user_id set default auth.uid();
alter table public.workout_logs alter column user_id set default auth.uid();
alter table public.body_metrics alter column user_id set default auth.uid();
alter table public.user_templates alter column user_id set default auth.uid();

do $$
begin
  if not exists (select 1 from public.food_inventory where user_id is null) then
    alter table public.food_inventory alter column user_id set not null;
  end if;
  if not exists (select 1 from public.exercise_inventory where user_id is null) then
    alter table public.exercise_inventory alter column user_id set not null;
  end if;
  if not exists (select 1 from public.food_logs where user_id is null) then
    alter table public.food_logs alter column user_id set not null;
  end if;
  if not exists (select 1 from public.workout_logs where user_id is null) then
    alter table public.workout_logs alter column user_id set not null;
  end if;
  if not exists (select 1 from public.body_metrics where user_id is null) then
    alter table public.body_metrics alter column user_id set not null;
  end if;
  if not exists (select 1 from public.user_templates where user_id is null) then
    alter table public.user_templates alter column user_id set not null;
  end if;
end $$;

create index if not exists food_inventory_user_id_idx on public.food_inventory (user_id);
create index if not exists exercise_inventory_user_id_idx on public.exercise_inventory (user_id);
create index if not exists food_logs_user_id_idx on public.food_logs (user_id);
create index if not exists workout_logs_user_id_idx on public.workout_logs (user_id);
create index if not exists body_metrics_user_id_idx on public.body_metrics (user_id);
create index if not exists user_templates_user_id_idx on public.user_templates (user_id);

-- ---------------------------------------------------------------------------
-- Replace shared-dev policies
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated full access food_inventory" on public.food_inventory;
drop policy if exists "Authenticated full access exercise_inventory" on public.exercise_inventory;
drop policy if exists "Authenticated full access food_logs" on public.food_logs;
drop policy if exists "Authenticated full access workout_logs" on public.workout_logs;
drop policy if exists "Authenticated full access body_metrics" on public.body_metrics;
drop policy if exists "Authenticated full access user_templates" on public.user_templates;

drop policy if exists "Users own food_inventory" on public.food_inventory;
drop policy if exists "Users own exercise_inventory" on public.exercise_inventory;
drop policy if exists "Users own food_logs" on public.food_logs;
drop policy if exists "Users own workout_logs" on public.workout_logs;
drop policy if exists "Users own body_metrics" on public.body_metrics;
drop policy if exists "Users own user_templates" on public.user_templates;

create policy "Users own food_inventory"
  on public.food_inventory for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own exercise_inventory"
  on public.exercise_inventory for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own food_logs"
  on public.food_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own workout_logs"
  on public.workout_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own body_metrics"
  on public.body_metrics for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own user_templates"
  on public.user_templates for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
