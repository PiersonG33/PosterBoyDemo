-- Poster Boy investor demo: shared board, anonymous actors, transactional rules.
-- Apply this file to a fresh Supabase project, then enable Anonymous Sign-Ins.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  seed_key text,
  created_at timestamptz not null default clock_timestamp(),
  content_type text not null check (content_type in ('text', 'drawing')),
  text_content text,
  drawing_data jsonb,
  board_x double precision not null check (board_x >= 0 and board_x <= (1 - 130.8 / 1352.0)),
  board_y double precision not null check (board_y >= 0 and board_y <= (1 - 130.8 / 813.0)),
  rotation double precision not null check (rotation between -15 and 15),
  color text not null check (color in ('butter', 'rose', 'mint', 'sky', 'lavender')),
  removed_at timestamptz,
  constraint note_content_matches_type check (
    (content_type = 'text' and text_content is not null and drawing_data is null)
    or
    (content_type = 'drawing' and text_content is null and drawing_data is not null)
  )
);

create unique index if not exists notes_board_seed_key_idx
  on public.notes (board_id, seed_key)
  where seed_key is not null;
create index if not exists notes_board_created_idx on public.notes (board_id, created_at);
create index if not exists notes_board_active_idx on public.notes (board_id) where removed_at is null;

create table if not exists public.pins (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1)
);

create index if not exists pins_board_created_idx on public.pins (board_id, created_at);

create table if not exists public.action_budgets (
  board_id uuid not null references public.boards(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default clock_timestamp(),
  actions_used integer not null default 0 check (actions_used between 0 and 20),
  primary key (board_id, actor_id)
);

alter table public.boards enable row level security;
alter table public.notes enable row level security;
alter table public.pins enable row level security;
alter table public.action_budgets enable row level security;

drop policy if exists "authenticated visitors can read boards" on public.boards;
create policy "authenticated visitors can read boards"
  on public.boards for select to authenticated using (true);

drop policy if exists "authenticated visitors can read notes" on public.notes;
create policy "authenticated visitors can read notes"
  on public.notes for select to authenticated using (true);

drop policy if exists "authenticated visitors can read pins" on public.pins;
create policy "authenticated visitors can read pins"
  on public.pins for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select on public.boards, public.notes, public.pins to authenticated;
revoke all on public.action_budgets from anon, authenticated;

create or replace function private.require_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Sign in before changing the board.';
  end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is not true then
    raise exception 'This demo only accepts anonymous visitor sessions.';
  end if;
  return v_actor_id;
end;
$$;

create or replace function private.require_board_id(p_slug text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_board_id uuid;
begin
  select id into v_board_id from public.boards where slug = p_slug;
  if v_board_id is null then
    raise exception 'Shared board "%" was not found.', p_slug;
  end if;
  return v_board_id;
end;
$$;

create or replace function private.current_action_budget(p_board_id uuid, p_actor_id uuid)
returns public.action_budgets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget public.action_budgets;
begin
  insert into public.action_budgets (board_id, actor_id)
  values (p_board_id, p_actor_id)
  on conflict (board_id, actor_id) do nothing;

  select * into v_budget
  from public.action_budgets
  where board_id = p_board_id and actor_id = p_actor_id
  for update;

  if v_budget.window_started_at + interval '10 minutes' <= clock_timestamp() then
    update public.action_budgets
    set window_started_at = clock_timestamp(), actions_used = 0
    where board_id = p_board_id and actor_id = p_actor_id
    returning * into v_budget;
  end if;

  return v_budget;
end;
$$;

create or replace function private.consume_action(p_board_id uuid, p_actor_id uuid)
returns public.action_budgets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget public.action_budgets;
begin
  v_budget := private.current_action_budget(p_board_id, p_actor_id);
  if v_budget.actions_used >= 20 then
    raise exception 'You are out of actions. Your supply will refill soon.';
  end if;

  update public.action_budgets
  set actions_used = actions_used + 1
  where board_id = p_board_id and actor_id = p_actor_id
  returning * into v_budget;
  return v_budget;
end;
$$;

create or replace function private.budget_json(p_budget public.action_budgets)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'limit', 20,
    'used', (p_budget).actions_used,
    'windowStartedAt', (p_budget).window_started_at,
    'windowEndsAt', (p_budget).window_started_at + interval '10 minutes'
  );
$$;

create or replace function private.pin_touches_note(
  p_pin_x double precision,
  p_pin_y double precision,
  p_note_x double precision,
  p_note_y double precision,
  p_rotation double precision
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with delta as (
    select
      (p_pin_x - (p_note_x + 130.8 / 1352.0 / 2.0)) * 1352.0 as dx,
      (p_pin_y - (p_note_y + 130.8 / 813.0 / 2.0)) * 813.0 as dy,
      radians(-p_rotation) as angle
  )
  select
    abs(dx * cos(angle) - dy * sin(angle)) <= 65.4
    and abs(dx * sin(angle) + dy * cos(angle)) <= 65.4
  from delta;
$$;

create or replace function private.valid_drawing(p_drawing jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_stroke jsonb;
  v_point jsonb;
  v_total_points integer := 0;
  v_stroke_points integer;
begin
  if p_drawing is null or jsonb_typeof(p_drawing) is distinct from 'object' then return false; end if;
  if octet_length(p_drawing::text) > 1000000 then return false; end if;
  if jsonb_typeof(p_drawing->'version') is distinct from 'number' or (p_drawing->>'version')::numeric <> 1 then return false; end if;
  if jsonb_typeof(p_drawing->'width') is distinct from 'number' or (p_drawing->>'width')::numeric <= 0 or (p_drawing->>'width')::numeric > 10000 then return false; end if;
  if jsonb_typeof(p_drawing->'height') is distinct from 'number' or (p_drawing->>'height')::numeric <= 0 or (p_drawing->>'height')::numeric > 10000 then return false; end if;
  if jsonb_typeof(p_drawing->'strokes') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_drawing->'strokes') not between 1 and 120 then return false; end if;

  for v_stroke in select value from jsonb_array_elements(p_drawing->'strokes') loop
    if jsonb_typeof(v_stroke) is distinct from 'object' then return false; end if;
    if jsonb_typeof(v_stroke->'width') is distinct from 'number' then return false; end if;
    if (v_stroke->>'width')::numeric < 1 or (v_stroke->>'width')::numeric > 24 then return false; end if;
    if v_stroke ? 'color' and (
      jsonb_typeof(v_stroke->'color') is distinct from 'string'
      or (v_stroke->>'color') !~* '^#[0-9a-f]{6}$'
    ) then return false; end if;
    if jsonb_typeof(v_stroke->'points') is distinct from 'array' then return false; end if;

    v_stroke_points := jsonb_array_length(v_stroke->'points');
    if v_stroke_points > 800 then return false; end if;
    v_total_points := v_total_points + v_stroke_points;
    if v_total_points > 8000 then return false; end if;

    for v_point in select value from jsonb_array_elements(v_stroke->'points') loop
      if jsonb_typeof(v_point) is distinct from 'array' or jsonb_array_length(v_point) <> 2 then return false; end if;
      if jsonb_typeof(v_point->0) is distinct from 'number' or jsonb_typeof(v_point->1) is distinct from 'number' then return false; end if;
      if (v_point->>0)::numeric < 0 or (v_point->>0)::numeric > 1 then return false; end if;
      if (v_point->>1)::numeric < 0 or (v_point->>1)::numeric > 1 then return false; end if;
    end loop;
  end loop;

  return true;
exception when others then
  return false;
end;
$$;

create or replace function private.validate_placement(
  p_board_x double precision,
  p_board_y double precision,
  p_rotation double precision,
  p_color text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_board_x is null or p_board_x < 0 or p_board_x > (1 - 130.8 / 1352.0)
    or p_board_y is null or p_board_y < 0 or p_board_y > (1 - 130.8 / 813.0)
    or p_rotation is null or p_rotation < -15 or p_rotation > 15
    or p_color is null or p_color not in ('butter', 'rose', 'mint', 'sky', 'lavender') then
    raise exception 'That note placement is invalid.';
  end if;
end;
$$;

create or replace function public.get_action_budget(p_board_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_id uuid := private.require_board_id(p_board_slug);
  v_actor_id uuid := private.require_actor();
  v_budget public.action_budgets;
begin
  v_budget := private.current_action_budget(v_board_id, v_actor_id);
  return private.budget_json(v_budget);
end;
$$;

create or replace function public.create_text_note(
  p_board_slug text,
  p_text text,
  p_board_x double precision,
  p_board_y double precision,
  p_rotation double precision,
  p_color text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_id uuid := private.require_board_id(p_board_slug);
  v_actor_id uuid := private.require_actor();
  v_note_id uuid;
  v_text text := btrim(p_text);
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_board_id::text, 0));
  perform private.validate_placement(p_board_x, p_board_y, p_rotation, p_color);
  if v_text is null or char_length(v_text) = 0 then raise exception 'Write something before posting.'; end if;
  if char_length(v_text) > 500 then raise exception 'Keep notes under 500 characters.'; end if;
  if (select count(*) from public.notes where board_id = v_board_id and removed_at is null) >= 120 then
    raise exception 'The board is full. Take something down first.';
  end if;

  perform private.consume_action(v_board_id, v_actor_id);
  insert into public.notes (
    board_id, author_id, content_type, text_content, board_x, board_y, rotation, color
  ) values (
    v_board_id, v_actor_id, 'text', v_text, p_board_x, p_board_y, p_rotation, p_color
  ) returning id into v_note_id;
  return v_note_id;
end;
$$;

create or replace function public.create_drawing_note(
  p_board_slug text,
  p_drawing jsonb,
  p_board_x double precision,
  p_board_y double precision,
  p_rotation double precision,
  p_color text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_id uuid := private.require_board_id(p_board_slug);
  v_actor_id uuid := private.require_actor();
  v_note_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_board_id::text, 0));
  perform private.validate_placement(p_board_x, p_board_y, p_rotation, p_color);
  if not private.valid_drawing(p_drawing) then raise exception 'This drawing is invalid or too detailed.'; end if;
  if (select count(*) from public.notes where board_id = v_board_id and removed_at is null) >= 120 then
    raise exception 'The board is full. Take something down first.';
  end if;

  perform private.consume_action(v_board_id, v_actor_id);
  insert into public.notes (
    board_id, author_id, content_type, drawing_data, board_x, board_y, rotation, color
  ) values (
    v_board_id, v_actor_id, 'drawing', p_drawing, p_board_x, p_board_y, p_rotation, p_color
  ) returning id into v_note_id;
  return v_note_id;
end;
$$;

create or replace function public.add_pin(
  p_board_slug text,
  p_x double precision,
  p_y double precision
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_id uuid := private.require_board_id(p_board_slug);
  v_actor_id uuid := private.require_actor();
  v_pin_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_board_id::text, 0));
  if p_x is null or p_y is null or p_x < 0 or p_x > 1 or p_y < 0 or p_y > 1 then
    raise exception 'That pin position is invalid.';
  end if;
  if exists (
    select 1 from public.pins
    where board_id = v_board_id
      and sqrt(power((x - p_x) * 1352.0, 2) + power((y - p_y) * 813.0, 2)) < 18
  ) then
    raise exception 'Place this pin a little farther from the others.';
  end if;
  if not exists (
    select 1 from public.notes
    where board_id = v_board_id and removed_at is null
      and private.pin_touches_note(p_x, p_y, board_x, board_y, rotation)
  ) then
    raise exception 'Pins need to touch at least one note.';
  end if;

  perform private.consume_action(v_board_id, v_actor_id);
  insert into public.pins (board_id, author_id, x, y)
  values (v_board_id, v_actor_id, p_x, p_y)
  returning id into v_pin_id;
  return v_pin_id;
end;
$$;

create or replace function public.remove_pin(p_board_slug text, p_pin_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_id uuid := private.require_board_id(p_board_slug);
  v_actor_id uuid := private.require_actor();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_board_id::text, 0));
  if not exists (select 1 from public.pins where board_id = v_board_id and id = p_pin_id) then
    raise exception 'That pin is no longer on the board.';
  end if;
  perform private.consume_action(v_board_id, v_actor_id);
  delete from public.pins where board_id = v_board_id and id = p_pin_id;
  return p_pin_id;
end;
$$;

create or replace function public.remove_note(p_board_slug text, p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_id uuid := private.require_board_id(p_board_slug);
  v_actor_id uuid := private.require_actor();
  v_note public.notes;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_board_id::text, 0));
  select * into v_note from public.notes
  where board_id = v_board_id and id = p_note_id and removed_at is null;
  if v_note.id is null then raise exception 'That note is no longer on the board.'; end if;
  if exists (
    select 1 from public.pins
    where board_id = v_board_id
      and private.pin_touches_note(x, y, v_note.board_x, v_note.board_y, v_note.rotation)
  ) then
    raise exception 'Remove the pins before taking this note down.';
  end if;

  perform private.consume_action(v_board_id, v_actor_id);
  update public.notes set removed_at = clock_timestamp() where id = p_note_id;
  return p_note_id;
end;
$$;

-- This function is deliberately not granted to web visitors. Run it from the
-- Supabase SQL Editor before a demo when you want the original board back.
create or replace function private.reset_demo_board(p_slug text default 'investor-demo')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board_id uuid;
  v_note record;
  v_spot record;
  v_angle double precision;
  v_local_x double precision;
  v_local_y double precision;
begin
  insert into public.boards (slug) values (p_slug)
  on conflict (slug) do nothing;
  select id into v_board_id from public.boards where slug = p_slug;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_board_id::text, 0));

  delete from public.pins where board_id = v_board_id;
  delete from public.notes where board_id = v_board_id;
  delete from public.action_budgets where board_id = v_board_id;

  insert into public.notes (
    board_id, seed_key, created_at, content_type, text_content, drawing_data,
    board_x, board_y, rotation, color
  ) values
    (v_board_id, 'seed-1',  '2026-09-08 12:00:01+00', 'text', E'Take a note.\nLeave a note.', null, .06, .07, -2.2, 'butter'),
    (v_board_id, 'seed-2',  '2026-09-08 12:00:02+00', 'text', 'What should the internet feel like?', null, .29, .04, 1.8, 'rose'),
    (v_board_id, 'seed-3',  '2026-09-08 12:00:03+00', 'drawing', null, '{"version":1,"width":320,"height":320,"strokes":[{"width":5,"points":[[0.18,0.53],[0.3,0.35],[0.5,0.29],[0.7,0.35],[0.82,0.53],[0.73,0.72],[0.51,0.79],[0.29,0.71],[0.18,0.53]]},{"width":5,"points":[[0.36,0.49],[0.37,0.49]]},{"width":5,"points":[[0.63,0.49],[0.64,0.49]]},{"width":4,"points":[[0.36,0.62],[0.48,0.68],[0.63,0.61]]}]}'::jsonb, .55, .055, -1.3, 'mint'),
    (v_board_id, 'seed-4',  '2026-09-08 12:00:04+00', 'text', E'You have 20 moves.\nSpend them wisely.', null, .78, .06, 2.6, 'sky'),
    (v_board_id, 'seed-5',  '2026-09-08 12:00:05+00', 'text', 'tiny experiments > big opinions', null, .14, .32, 2.1, 'lavender'),
    (v_board_id, 'seed-6',  '2026-09-08 12:00:06+00', 'drawing', null, '{"version":1,"width":320,"height":320,"strokes":[{"width":7,"points":[[0.5,0.82],[0.48,0.65],[0.5,0.49],[0.48,0.35],[0.5,0.16]]},{"width":6,"points":[[0.5,0.5],[0.38,0.39],[0.27,0.38],[0.29,0.51],[0.5,0.58]]},{"width":6,"points":[[0.49,0.42],[0.59,0.29],[0.72,0.29],[0.71,0.43],[0.5,0.53]]},{"width":5,"points":[[0.37,0.82],[0.49,0.76],[0.63,0.82]]}]}'::jsonb, .42, .34, -3.2, 'butter'),
    (v_board_id, 'seed-7',  '2026-09-08 12:00:07+00', 'text', 'PIN THE GOOD STUFF', null, .68, .34, 1.1, 'rose'),
    (v_board_id, 'seed-8',  '2026-09-08 12:00:08+00', 'text', 'meet me by the corkboard after lunch', null, .02, .59, -1.5, 'mint'),
    (v_board_id, 'seed-9',  '2026-09-08 12:00:09+00', 'text', 'A place is made by the people who change it.', null, .32, .61, 2.8, 'sky'),
    (v_board_id, 'seed-10', '2026-09-08 12:00:10+00', 'drawing', null, '{"version":1,"width":320,"height":320,"strokes":[{"width":5,"points":[[0.15,0.59],[0.27,0.45],[0.39,0.57],[0.51,0.34],[0.64,0.57],[0.76,0.44],[0.86,0.59]]},{"width":5,"points":[[0.18,0.69],[0.84,0.69]]},{"width":4,"points":[[0.26,0.68],[0.26,0.8]]},{"width":4,"points":[[0.74,0.68],[0.74,0.8]]}]}'::jsonb, .59, .65, -2, 'lavender'),
    (v_board_id, 'seed-11', '2026-09-08 12:00:11+00', 'text', 'draw something weird →', null, .80, .58, 3.4, 'butter'),
    (v_board_id, 'seed-12', '2026-09-08 12:00:12+00', 'text', 'This board belongs to whoever shows up.', null, .16, .76, -2.7, 'rose'),
    (v_board_id, 'seed-13', '2026-09-08 12:00:13+00', 'text', 'hello, stranger ✦', null, .48, .76, 1.4, 'mint'),
    (v_board_id, 'seed-14', '2026-09-08 12:00:14+00', 'text', 'Protect it or pull it down.', null, .75, .76, -1.8, 'sky');

  for v_note in
    select n.*, seed_counts.pin_total
    from public.notes n
    join (values
      ('seed-1', 3), ('seed-2', 7), ('seed-3', 2), ('seed-4', 4),
      ('seed-5', 1), ('seed-6', 5), ('seed-7', 8), ('seed-8', 0),
      ('seed-9', 6), ('seed-10', 1), ('seed-11', 2), ('seed-12', 4),
      ('seed-13', 0), ('seed-14', 3)
    ) as seed_counts(seed_key, pin_total) on seed_counts.seed_key = n.seed_key
    where n.board_id = v_board_id
  loop
    v_angle := radians(v_note.rotation);
    for v_spot in
      select * from (values
        (1, .50::double precision, .08::double precision),
        (2, .18, .20), (3, .82, .18), (4, .29, .76),
        (5, .76, .72), (6, .50, .48), (7, .12, .54), (8, .88, .49)
      ) as spots(ordinal, local_x, local_y)
      where ordinal <= v_note.pin_total
      order by ordinal
    loop
      v_local_x := (v_spot.local_x - .5) * 130.8;
      v_local_y := (v_spot.local_y - .5) * 130.8;
      insert into public.pins (board_id, x, y) values (
        v_board_id,
        v_note.board_x + 130.8 / 1352.0 / 2.0
          + (v_local_x * cos(v_angle) - v_local_y * sin(v_angle)) / 1352.0,
        v_note.board_y + 130.8 / 813.0 / 2.0
          + (v_local_x * sin(v_angle) + v_local_y * cos(v_angle)) / 813.0
      );
    end loop;
  end loop;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.get_action_budget(text) from public, anon;
revoke execute on function public.create_text_note(text, text, double precision, double precision, double precision, text) from public, anon;
revoke execute on function public.create_drawing_note(text, jsonb, double precision, double precision, double precision, text) from public, anon;
revoke execute on function public.add_pin(text, double precision, double precision) from public, anon;
revoke execute on function public.remove_pin(text, uuid) from public, anon;
revoke execute on function public.remove_note(text, uuid) from public, anon;

grant execute on function public.get_action_budget(text) to authenticated;
grant execute on function public.create_text_note(text, text, double precision, double precision, double precision, text) to authenticated;
grant execute on function public.create_drawing_note(text, jsonb, double precision, double precision, double precision, text) to authenticated;
grant execute on function public.add_pin(text, double precision, double precision) to authenticated;
grant execute on function public.remove_pin(text, uuid) to authenticated;
grant execute on function public.remove_note(text, uuid) to authenticated;

alter table public.notes replica identity full;
alter table public.pins replica identity full;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
    ) then
      alter publication supabase_realtime add table public.notes;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pins'
    ) then
      alter publication supabase_realtime add table public.pins;
    end if;
  end if;
end;
$$;

select private.reset_demo_board('investor-demo');
