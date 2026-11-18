-- Частичное поглощение чужой территории TrollsTravel.
-- Выполни после supabase-schema.sql в SQL Editor проекта Supabase.

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
  attack_shape extensions.geometry;
  target_shape extensions.geometry;
  eaten_shape extensions.geometry;
  remaining_shape extensions.geometry;
  largest_remaining_component extensions.geometry;
  attack_area double precision;
  own_shape extensions.geometry;
  captured_shape extensions.geometry;
  captured_area double precision;
  eaten_area double precision;
  remaining_area double precision;
  attack_latitudes double precision[];
  attack_longitudes double precision[];
  remaining_points jsonb;
  captured_points jsonb;
  attacker_tag text;
begin
  if current_user_id is null then
    return jsonb_build_object('eaten', false, 'reason', 'authentication_required');
  end if;

  attack_shape := public.territory_polygon(p_attack_points)::extensions.geometry;
  attack_area := extensions.ST_Area(attack_shape::extensions.geography);
  if attack_area < 1000 or attack_area > 5000000 then
    return jsonb_build_object('eaten', false, 'reason', 'invalid_attack_area');
  end if;

  select extensions.ST_Union(
    case
      when territory.geometry_json is not null then
        extensions.ST_SetSRID(
          extensions.ST_GeomFromGeoJSON(territory.geometry_json::text),
          4326
        )
      else public.territory_polygon(territory.points)::extensions.geometry
    end
  )
  into own_shape
  from public.territories as territory
  where territory.user_id = current_user_id;

  captured_shape := case
    when own_shape is null or extensions.ST_IsEmpty(own_shape) then attack_shape
    else extensions.ST_CollectionExtract(
      extensions.ST_Difference(attack_shape, own_shape),
      3
    )
  end;
  captured_area := case
    when captured_shape is null or extensions.ST_IsEmpty(captured_shape) then 0
    else extensions.ST_Area(captured_shape::extensions.geography)
  end;

  select t.* into target
  from public.territories as t
  where t.id = p_target_id
  for update;

  if not found or target.user_id = current_user_id then
    return jsonb_build_object('eaten', false, 'reason', 'target_unavailable');
  end if;

  if target.geometry_json is null then
    target_shape := public.territory_polygon(target.points)::extensions.geometry;
  else
    target_shape := extensions.ST_SetSRID(
      extensions.ST_GeomFromGeoJSON(target.geometry_json::text),
      4326
    );
    if extensions.ST_GeometryType(target_shape) not in (
      'ST_Polygon',
      'ST_MultiPolygon'
    ) or not extensions.ST_IsValid(target_shape) then
      raise exception 'Геометрия сохранённой территории некорректна';
    end if;
  end if;

  eaten_shape := extensions.ST_CollectionExtract(
    extensions.ST_Intersection(attack_shape, target_shape),
    3
  );
  eaten_area := extensions.ST_Area(eaten_shape::extensions.geography);
  if eaten_area <= 0 then
    return jsonb_build_object('eaten', false, 'reason', 'no_overlap');
  end if;

  remaining_shape := extensions.ST_CollectionExtract(
    extensions.ST_Difference(target_shape, attack_shape),
    3
  );
  remaining_area := case
    when extensions.ST_IsEmpty(remaining_shape) then 0
    else extensions.ST_Area(remaining_shape::extensions.geography)
  end;

  attacker_tag := 'Путник-' || upper(left(replace(current_user_id::text, '-', ''), 5));

  if remaining_area <= 0 then
    delete from public.territories where id = target.id;
  else
    select component.geom
    into largest_remaining_component
    from extensions.ST_Dump(remaining_shape) as component(path, geom)
    order by extensions.ST_Area(component.geom::extensions.geography) desc
    limit 1;

    select jsonb_agg(
      jsonb_build_array(
        extensions.ST_Y(vertex.geom),
        extensions.ST_X(vertex.geom)
      )
      order by vertex.path
    )
    into remaining_points
    from extensions.ST_DumpPoints(
      extensions.ST_ExteriorRing(largest_remaining_component)
    ) as vertex(path, geom);

    update public.territories
    set area_m2 = greatest(1, round(remaining_area)::integer),
        points = remaining_points,
        geometry_json = extensions.ST_AsGeoJSON(remaining_shape, 9)::jsonb,
        min_lat = extensions.ST_YMin(
          extensions.ST_Envelope(remaining_shape)::extensions.box3d
        ),
        max_lat = extensions.ST_YMax(
          extensions.ST_Envelope(remaining_shape)::extensions.box3d
        ),
        min_lon = extensions.ST_XMin(
          extensions.ST_Envelope(remaining_shape)::extensions.box3d
        ),
        max_lon = extensions.ST_XMax(
          extensions.ST_Envelope(remaining_shape)::extensions.box3d
        )
    where id = target.id;
  end if;

  if captured_area >= 1000 then
    select component.geom
    into largest_remaining_component
    from extensions.ST_Dump(captured_shape) as component(path, geom)
    order by extensions.ST_Area(component.geom::extensions.geography) desc
    limit 1;

    select jsonb_agg(
      jsonb_build_array(
        extensions.ST_Y(vertex.geom),
        extensions.ST_X(vertex.geom)
      )
      order by vertex.path
    )
    into captured_points
    from extensions.ST_DumpPoints(
      extensions.ST_ExteriorRing(largest_remaining_component)
    ) as vertex(path, geom);

    if not exists (
      select 1
      from public.territories
      where user_id = current_user_id
        and points = captured_points
    ) then
      insert into public.territories (
        user_id, player_tag, area_m2, points, geometry_json,
        min_lat, max_lat, min_lon, max_lon
      ) values (
        current_user_id,
        attacker_tag,
        round(captured_area)::integer,
        captured_points,
        extensions.ST_AsGeoJSON(captured_shape, 9)::jsonb,
        extensions.ST_YMin(
          extensions.ST_Envelope(captured_shape)::extensions.box3d
        ),
        extensions.ST_YMax(
          extensions.ST_Envelope(captured_shape)::extensions.box3d
        ),
        extensions.ST_XMin(
          extensions.ST_Envelope(captured_shape)::extensions.box3d
        ),
        extensions.ST_XMax(
          extensions.ST_Envelope(captured_shape)::extensions.box3d
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'eaten', true,
    'target_player_tag', target.player_tag,
    'eaten_area_m2', greatest(1, round(eaten_area)::integer),
    'remaining_area_m2', greatest(0, round(remaining_area)::integer)
  );
end;
$$;

revoke all on function public.territory_polygon(jsonb) from public, anon, authenticated;
revoke all on function public.consume_territory(uuid, jsonb) from public, anon;
grant execute on function public.consume_territory(uuid, jsonb) to authenticated;
