-- Общие территории TrollsTravel.
-- Выполни этот скрипт в SQL Editor проекта Supabase.

create table if not exists public.territories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  player_tag text not null check (char_length(player_tag) between 1 and 32),
  area_m2 integer not null check (area_m2 between 1 and 5000000),
  points jsonb not null,
  geometry_json jsonb,
  min_lat double precision not null check (min_lat between -90 and 90),
  max_lat double precision not null check (max_lat between -90 and 90),
  min_lon double precision not null check (min_lon between -180 and 180),
  max_lon double precision not null check (max_lon between -180 and 180),
  created_at timestamptz not null default now(),
  constraint territories_points_are_array check (
    case
      when jsonb_typeof(points) = 'array'
        then jsonb_array_length(points) between 3 and 10000
      else false
    end
  )
);

alter table public.territories
  add column if not exists geometry_json jsonb;

alter table public.territories
  drop constraint if exists territories_points_are_array;

alter table public.territories
  add constraint territories_points_are_array check (
    case
      when jsonb_typeof(points) = 'array'
        then jsonb_array_length(points) between 3 and 10000
      else false
    end
  );

alter table public.territories
  drop constraint if exists territories_area_m2_check;

alter table public.territories
  add constraint territories_area_m2_check
  check (area_m2 between 1 and 5000000);

create index if not exists territories_bounds_idx
  on public.territories (min_lat, max_lat, min_lon, max_lon);

alter table public.territories enable row level security;

drop policy if exists "Anyone can view shared territories" on public.territories;
create policy "Anyone can view shared territories"
  on public.territories for select
  to anon, authenticated
  using (true);

drop policy if exists "Players can publish their own territories" on public.territories;
create policy "Players can publish their own territories"
  on public.territories for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and geometry_json is null
    and area_m2 between 1000 and 5000000
    and case
      when jsonb_typeof(points) = 'array'
        then jsonb_array_length(points) between 3 and 2000
      else false
    end
  );

drop policy if exists "Players can delete their own territories" on public.territories;
create policy "Players can delete their own territories"
  on public.territories for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.territories to anon, authenticated;
grant insert on public.territories to authenticated;
grant delete on public.territories to authenticated;
