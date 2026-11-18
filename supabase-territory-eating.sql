-- Захват чужой территории TrollsTravel.
-- Выполни этот скрипт в SQL Editor после supabase-schema.sql.

create extension if not exists postgis with schema extensions;

create or replace function public.territory_polygon(p_points jsonb)
returns extensions.geography
language plpgsql
immutable
set search_path = ''
as $$
declare
  point_count integer;
  ring extensions.geometry;
  polygon extensions.geometry;
begin
  if jsonb_typeof(p_points) is distinct from 'array' then
    raise exception 'Точки территории должны быть массивом';
  end if;

  point_count := jsonb_array_length(p_points);
  if point_count < 3 or point_count > 2000 then
    raise exception 'Недопустимое количество точек территории';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_points) as item(point)
    where case
      when jsonb_typeof(item.point) <> 'array' then true
      when jsonb_array_length(item.point) <> 2 then true
      else jsonb_typeof(item.point -> 0) <> 'number'
        or jsonb_typeof(item.point -> 1) <> 'number'
        or (item.point ->> 0)::double precision not between -90 and 90
        or (item.point ->> 1)::double precision not between -180 and 180
    end
  ) then
    raise exception 'Недопустимые координаты территории';
  end if;

  select extensions.ST_MakeLine(
    extensions.ST_SetSRID(
      extensions.ST_MakePoint((item.point ->> 1)::double precision,
                              (item.point ->> 0)::double precision),
      4326
    )
    order by item.ordinality
  )
  into ring
  from jsonb_array_elements(p_points) with ordinality as item(point, ordinality);

  if not extensions.ST_IsClosed(ring) then
    ring := extensions.ST_AddPoint(ring, extensions.ST_StartPoint(ring));
  end if;

  polygon := extensions.ST_MakePolygon(ring);
  if not extensions.ST_IsValid(polygon) or extensions.ST_Area(polygon) = 0 then
    raise exception 'Контур территории должен быть корректным замкнутым многоугольником';
  end if;

  return polygon::extensions.geography;
end;
$$;

create or replace function public.consume_territory(
  p_target_id uuid,
  p_attack_points jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target public.territories%rowtype;
  attack_shape extensions.geography;
  target_shape extensions.geography;
  attack_area double precision;
  attack_latitudes double precision[];
  attack_longitudes double precision[];
  attacker_tag text;
begin
  if current_user_id is null then
    return jsonb_build_object('eaten', false, 'reason', 'authentication_required');
  end if;

  attack_shape := public.territory_polygon(p_attack_points);
  attack_area := extensions.ST_Area(attack_shape);
  if attack_area < 1000 or attack_area > 5000000 then
    return jsonb_build_object('eaten', false, 'reason', 'invalid_attack_area');
  end if;

  select t.* into target
  from public.territories as t
  where t.id = p_target_id
  for update;

  if not found or target.user_id = current_user_id then
    return jsonb_build_object('eaten', false, 'reason', 'target_unavailable');
  end if;

  if attack_area <= target.area_m2 then
    return jsonb_build_object('eaten', false, 'reason', 'attack_not_larger');
  end if;

  target_shape := public.territory_polygon(target.points);
  if not extensions.ST_Covers(attack_shape::extensions.geometry,
                              target_shape::extensions.geometry) then
    return jsonb_build_object('eaten', false, 'reason', 'target_not_fully_covered');
  end if;

  select
    array_agg((item.point ->> 0)::double precision order by item.ordinality),
    array_agg((item.point ->> 1)::double precision order by item.ordinality)
  into attack_latitudes, attack_longitudes
  from jsonb_array_elements(p_attack_points) with ordinality as item(point, ordinality);

  attacker_tag := 'Путник-' || upper(left(replace(current_user_id::text, '-', ''), 5));

  -- Удаление цели и сохранение нового контура происходят в одной транзакции RPC.
  delete from public.territories where id = target.id;

  insert into public.territories (
    user_id, player_tag, area_m2, points,
    min_lat, max_lat, min_lon, max_lon
  ) values (
    current_user_id,
    attacker_tag,
    round(attack_area)::integer,
    p_attack_points,
    (select min(value) from unnest(attack_latitudes) as value),
    (select max(value) from unnest(attack_latitudes) as value),
    (select min(value) from unnest(attack_longitudes) as value),
    (select max(value) from unnest(attack_longitudes) as value)
  );

  return jsonb_build_object(
    'eaten', true,
    'target_player_tag', target.player_tag,
    'area_m2', round(attack_area)::integer
  );
end;
$$;

revoke all on function public.territory_polygon(jsonb) from public, anon, authenticated;
revoke all on function public.consume_territory(uuid, jsonb) from public, anon;
grant execute on function public.consume_territory(uuid, jsonb) to authenticated;
