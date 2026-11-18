-- Общие территории TrollsTravel.
-- Выполни этот скрипт в SQL Editor проекта Supabase.

create table if not exists public.territories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  player_tag text not null check (char_length(player_tag) between 1 and 32),
  area_m2 integer not null check (area_m2 between 1000 and 5000000),
  points jsonb not null,
  min_lat double precision not null check (min_lat between -90 and 90),
  max_lat double precision not null check (max_lat between -90 and 90),
  min_lon double precision not null check (min_lon between -180 and 180),
  max_lon double precision not null check (max_lon between -180 and 180),
  created_at timestamptz not null default now(),
  constraint territories_points_are_array check (
    case
      when jsonb_typeof(points) = 'array'
        then jsonb_array_length(points) between 3 and 2000
      else false
    end
  )
);

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
    and area_m2 between 1000 and 5000000
    and case
      when jsonb_typeof(points) = 'array'
        then jsonb_array_length(points) between 3 and 2000
      else false
    end
  );

grant select on public.territories to anon, authenticated;
grant insert on public.territories to authenticated;
