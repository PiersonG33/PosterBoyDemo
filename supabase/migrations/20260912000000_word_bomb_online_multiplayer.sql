-- CUSTOM WORD BOMB — BEGIN
-- Small-room online multiplayer. Remove this migration's objects together with
-- src/wordBomb if the side project is ever detached from Poster Boy.

create table if not exists public.word_bomb_lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  starting_lives integer not null check (starting_lives between 1 and 5),
  allowed_words text[] not null,
  prompts text[] not null,
  current_player_id uuid,
  prompt text,
  deadline_at timestamptz,
  used_words text[] not null default '{}',
  turned_player_ids uuid[] not null default '{}',
  round integer not null default 1 check (round >= 1),
  completed_turns integer not null default 0 check (completed_turns >= 0),
  winner_player_id uuid,
  revision bigint not null default 1,
  last_event_type text not null default 'created',
  last_event_player_id uuid,
  last_word text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.word_bomb_players (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.word_bomb_lobbies(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 18),
  seat integer not null check (seat between 1 and 8),
  lives integer not null check (lives between 0 and 5),
  joined_at timestamptz not null default clock_timestamp(),
  unique (lobby_id, actor_id),
  unique (lobby_id, seat)
);

create unique index if not exists word_bomb_players_lobby_name_idx
  on public.word_bomb_players (lobby_id, lower(name));
create index if not exists word_bomb_players_lobby_idx
  on public.word_bomb_players (lobby_id, seat);
create index if not exists word_bomb_lobbies_updated_idx
  on public.word_bomb_lobbies (updated_at);

alter table public.word_bomb_lobbies enable row level security;
alter table public.word_bomb_players enable row level security;

create or replace function private.word_bomb_is_member(p_lobby_id uuid, p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.word_bomb_players
    where lobby_id = p_lobby_id and actor_id = p_actor_id
  );
$$;

drop policy if exists "word bomb members can read lobbies" on public.word_bomb_lobbies;
create policy "word bomb members can read lobbies"
  on public.word_bomb_lobbies for select to authenticated
  using (private.word_bomb_is_member(id, auth.uid()));

drop policy if exists "word bomb members can read players" on public.word_bomb_players;
create policy "word bomb members can read players"
  on public.word_bomb_players for select to authenticated
  using (private.word_bomb_is_member(lobby_id, auth.uid()));

grant select on public.word_bomb_lobbies, public.word_bomb_players to authenticated;
revoke insert, update, delete on public.word_bomb_lobbies, public.word_bomb_players from anon, authenticated;

create or replace function private.word_bomb_turn_seconds(p_completed_turns integer)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select greatest(3.5::double precision, 12.0 - p_completed_turns * 0.42);
$$;

create or replace function private.word_bomb_choose_prompt(p_prompts text[], p_previous text default null)
returns text
language sql
volatile
set search_path = ''
as $$
  select candidate
  from unnest(p_prompts) candidate
  where candidate is distinct from p_previous or cardinality(p_prompts) = 1
  order by random()
  limit 1;
$$;

create or replace function private.word_bomb_snapshot(p_lobby_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', lobby.id,
    'code', lobby.code,
    'status', lobby.status,
    'startingLives', lobby.starting_lives,
    'currentPlayerId', lobby.current_player_id,
    'prompt', lobby.prompt,
    'deadlineAt', lobby.deadline_at,
    'usedWords', to_jsonb(lobby.used_words),
    'round', lobby.round,
    'completedTurns', lobby.completed_turns,
    'winnerPlayerId', lobby.winner_player_id,
    'revision', lobby.revision,
    'isHost', lobby.host_id = auth.uid(),
    'youPlayerId', (
      select player.id from public.word_bomb_players player
      where player.lobby_id = lobby.id and player.actor_id = auth.uid()
    ),
    'lastEvent', jsonb_build_object(
      'type', lobby.last_event_type,
      'playerId', lobby.last_event_player_id,
      'word', lobby.last_word
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player.id,
        'name', player.name,
        'seat', player.seat,
        'lives', player.lives
      ) order by player.seat)
      from public.word_bomb_players player
      where player.lobby_id = lobby.id
    ), '[]'::jsonb),
    'serverTime', clock_timestamp()
  )
  from public.word_bomb_lobbies lobby
  where lobby.id = p_lobby_id;
$$;

create or replace function private.word_bomb_advance_turn(
  p_lobby_id uuid,
  p_word text,
  p_timed_out boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.word_bomb_lobbies;
  v_current public.word_bomb_players;
  v_living_count integer;
  v_winner_id uuid;
  v_turned uuid[];
  v_used text[];
  v_round_finished boolean;
  v_next_player_id uuid;
  v_completed_turns integer;
begin
  select * into v_lobby
  from public.word_bomb_lobbies
  where id = p_lobby_id
  for update;

  select * into v_current
  from public.word_bomb_players
  where id = v_lobby.current_player_id;

  if p_timed_out then
    update public.word_bomb_players
    set lives = greatest(0, lives - 1)
    where id = v_current.id
    returning * into v_current;
  end if;

  select count(*) into v_living_count
  from public.word_bomb_players
  where lobby_id = p_lobby_id and lives > 0;

  v_completed_turns := v_lobby.completed_turns + 1;

  if v_living_count <= 1 then
    select id into v_winner_id
    from public.word_bomb_players
    where lobby_id = p_lobby_id and lives > 0
    order by seat
    limit 1;

    update public.word_bomb_lobbies
    set status = 'finished',
        current_player_id = null,
        deadline_at = null,
        winner_player_id = v_winner_id,
        completed_turns = v_completed_turns,
        revision = revision + 1,
        last_event_type = case when p_timed_out then 'timeout' else 'word' end,
        last_event_player_id = v_current.id,
        last_word = p_word,
        updated_at = clock_timestamp()
    where id = p_lobby_id;
    return;
  end if;

  v_turned := coalesce(v_lobby.turned_player_ids, '{}');
  if not v_current.id = any(v_turned) then
    v_turned := array_append(v_turned, v_current.id);
  end if;

  v_used := coalesce(v_lobby.used_words, '{}');
  if p_word is not null and not p_word = any(v_used) then
    v_used := array_append(v_used, p_word);
  end if;

  select not exists (
    select 1 from public.word_bomb_players player
    where player.lobby_id = p_lobby_id
      and player.lives > 0
      and not player.id = any(v_turned)
  ) into v_round_finished;

  if v_round_finished then
    v_turned := '{}';
    v_used := '{}';
  end if;

  select player.id into v_next_player_id
  from public.word_bomb_players player
  where player.lobby_id = p_lobby_id and player.lives > 0
  order by case when player.seat > v_current.seat then 0 else 1 end, player.seat
  limit 1;

  update public.word_bomb_lobbies
  set current_player_id = v_next_player_id,
      prompt = private.word_bomb_choose_prompt(prompts, prompt),
      deadline_at = clock_timestamp()
        + private.word_bomb_turn_seconds(v_completed_turns) * interval '1 second',
      used_words = v_used,
      turned_player_ids = v_turned,
      round = round + case when v_round_finished then 1 else 0 end,
      completed_turns = v_completed_turns,
      revision = revision + 1,
      last_event_type = case when p_timed_out then 'timeout' else 'word' end,
      last_event_player_id = v_current.id,
      last_word = p_word,
      updated_at = clock_timestamp()
  where id = p_lobby_id;
end;
$$;

create or replace function public.word_bomb_create_lobby(
  p_name text,
  p_lives integer,
  p_words text[],
  p_prompts text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_actor();
  v_name text := btrim(p_name);
  v_code text;
  v_lobby public.word_bomb_lobbies;
  v_player_id uuid;
  v_characters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt integer;
  v_position integer;
begin
  if char_length(v_name) not between 1 and 18 then
    raise exception 'Your name must be between 1 and 18 characters.';
  end if;
  if p_lives not between 1 and 5 then
    raise exception 'Lives must be between 1 and 5.';
  end if;
  if cardinality(p_words) not between 3 and 10000
    or octet_length(array_to_string(p_words, ',')) > 250000 then
    raise exception 'The word list must contain 3–10,000 reasonably sized words.';
  end if;
  if exists (select 1 from unnest(p_words) word where word !~ '^[a-z]{3,40}$')
    or (select count(*) from unnest(p_words)) <> (select count(distinct word) from unnest(p_words) word) then
    raise exception 'The word list contains an invalid or duplicate entry.';
  end if;
  if cardinality(p_prompts) not between 1 and 20000
    or exists (select 1 from unnest(p_prompts) prompt where prompt !~ '^[a-z]{2,3}$') then
    raise exception 'The prompt list is invalid.';
  end if;
  if exists (
    select 1
    from unnest(p_prompts) prompt
    where (select count(*) from unnest(p_words) word where position(prompt in word) > 0) < 3
  ) then
    raise exception 'Every prompt must match at least three words.';
  end if;

  delete from public.word_bomb_lobbies
  where updated_at < clock_timestamp() - interval '24 hours';

  for v_attempt in 1..20 loop
    v_code := '';
    for v_position in 1..6 loop
      v_code := v_code || substr(
        v_characters,
        1 + floor(random() * char_length(v_characters))::integer,
        1
      );
    end loop;

    begin
      insert into public.word_bomb_lobbies (
        code, host_id, starting_lives, allowed_words, prompts
      ) values (
        v_code, v_actor_id, p_lives, p_words, p_prompts
      ) returning * into v_lobby;
    exception when unique_violation then
      continue;
    end;

    insert into public.word_bomb_players (lobby_id, actor_id, name, seat, lives)
    values (v_lobby.id, v_actor_id, v_name, 1, p_lives)
    returning id into v_player_id;

    update public.word_bomb_lobbies
    set last_event_player_id = v_player_id
    where id = v_lobby.id;

    return private.word_bomb_snapshot(v_lobby.id);
  end loop;

  raise exception 'Could not make a unique lobby code. Please try again.';
end;
$$;

create or replace function public.word_bomb_join_lobby(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_actor();
  v_name text := btrim(p_name);
  v_lobby public.word_bomb_lobbies;
  v_existing_player_id uuid;
  v_player_id uuid;
  v_seat integer;
begin
  if char_length(v_name) not between 1 and 18 then
    raise exception 'Your name must be between 1 and 18 characters.';
  end if;

  select * into v_lobby
  from public.word_bomb_lobbies
  where code = upper(btrim(p_code))
    and updated_at >= clock_timestamp() - interval '24 hours'
  for update;

  if v_lobby.id is null then raise exception 'Lobby not found. Check the code and try again.'; end if;

  select id into v_existing_player_id
  from public.word_bomb_players
  where lobby_id = v_lobby.id and actor_id = v_actor_id;
  if v_existing_player_id is not null then
    return private.word_bomb_snapshot(v_lobby.id);
  end if;

  if v_lobby.status <> 'waiting' then raise exception 'That game has already started.'; end if;
  if (select count(*) from public.word_bomb_players where lobby_id = v_lobby.id) >= 8 then
    raise exception 'That lobby is full.';
  end if;
  if exists (
    select 1 from public.word_bomb_players
    where lobby_id = v_lobby.id and lower(name) = lower(v_name)
  ) then
    raise exception 'That name is already taken in this lobby.';
  end if;

  select coalesce(max(seat), 0) + 1 into v_seat
  from public.word_bomb_players where lobby_id = v_lobby.id;

  insert into public.word_bomb_players (lobby_id, actor_id, name, seat, lives)
  values (v_lobby.id, v_actor_id, v_name, v_seat, v_lobby.starting_lives)
  returning id into v_player_id;

  update public.word_bomb_lobbies
  set revision = revision + 1,
      last_event_type = 'joined',
      last_event_player_id = v_player_id,
      last_word = null,
      updated_at = clock_timestamp()
  where id = v_lobby.id;

  return private.word_bomb_snapshot(v_lobby.id);
end;
$$;

create or replace function public.word_bomb_get_lobby(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_actor();
  v_lobby_id uuid;
begin
  select id into v_lobby_id
  from public.word_bomb_lobbies
  where code = upper(btrim(p_code));
  if v_lobby_id is null or not private.word_bomb_is_member(v_lobby_id, v_actor_id) then
    raise exception 'You are not a member of that lobby.';
  end if;
  return private.word_bomb_snapshot(v_lobby_id);
end;
$$;

create or replace function public.word_bomb_leave_lobby(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_actor();
  v_lobby public.word_bomb_lobbies;
  v_player_id uuid;
begin
  select * into v_lobby
  from public.word_bomb_lobbies
  where code = upper(btrim(p_code))
  for update;

  if v_lobby.id is null then return true; end if;
  if v_lobby.status <> 'waiting' then raise exception 'A running game cannot be left.'; end if;

  select id into v_player_id
  from public.word_bomb_players
  where lobby_id = v_lobby.id and actor_id = v_actor_id;
  if v_player_id is null then return true; end if;

  if v_lobby.host_id = v_actor_id then
    delete from public.word_bomb_lobbies where id = v_lobby.id;
  else
    delete from public.word_bomb_players where id = v_player_id;
    update public.word_bomb_lobbies
    set revision = revision + 1,
        last_event_type = 'left',
        last_event_player_id = v_player_id,
        last_word = null,
        updated_at = clock_timestamp()
    where id = v_lobby.id;
  end if;

  return true;
end;
$$;

create or replace function public.word_bomb_start_lobby(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_actor();
  v_lobby public.word_bomb_lobbies;
  v_first_player_id uuid;
  v_prompt text;
begin
  select * into v_lobby
  from public.word_bomb_lobbies
  where code = upper(btrim(p_code))
  for update;

  if v_lobby.id is null then raise exception 'Lobby not found.'; end if;
  if v_lobby.host_id <> v_actor_id then raise exception 'Only the host can start the game.'; end if;
  if v_lobby.status <> 'waiting' then raise exception 'This lobby is not waiting to start.'; end if;
  if (select count(*) from public.word_bomb_players where lobby_id = v_lobby.id) < 2 then
    raise exception 'At least two players are required.';
  end if;

  select id into v_first_player_id
  from public.word_bomb_players
  where lobby_id = v_lobby.id
  order by seat
  limit 1;
  v_prompt := private.word_bomb_choose_prompt(v_lobby.prompts);

  update public.word_bomb_lobbies
  set status = 'playing',
      current_player_id = v_first_player_id,
      prompt = v_prompt,
      deadline_at = clock_timestamp() + interval '12 seconds',
      used_words = '{}',
      turned_player_ids = '{}',
      round = 1,
      completed_turns = 0,
      winner_player_id = null,
      revision = revision + 1,
      last_event_type = 'started',
      last_event_player_id = v_first_player_id,
      last_word = null,
      updated_at = clock_timestamp()
  where id = v_lobby.id;

  return private.word_bomb_snapshot(v_lobby.id);
end;
$$;

create or replace function public.word_bomb_submit_word(
  p_code text,
  p_revision bigint,
  p_word text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_actor();
  v_lobby public.word_bomb_lobbies;
  v_player public.word_bomb_players;
  v_word text := lower(btrim(p_word));
begin
  select * into v_lobby
  from public.word_bomb_lobbies
  where code = upper(btrim(p_code))
  for update;

  if v_lobby.id is null or not private.word_bomb_is_member(v_lobby.id, v_actor_id) then
    raise exception 'You are not a member of that lobby.';
  end if;
  if v_lobby.status <> 'playing' then raise exception 'That game is not currently running.'; end if;
  if v_lobby.revision <> p_revision then return private.word_bomb_snapshot(v_lobby.id); end if;

  if v_lobby.deadline_at <= clock_timestamp() then
    perform private.word_bomb_advance_turn(v_lobby.id, null, true);
    return private.word_bomb_snapshot(v_lobby.id);
  end if;

  select * into v_player
  from public.word_bomb_players
  where lobby_id = v_lobby.id and actor_id = v_actor_id;
  if v_player.id is null or v_player.id <> v_lobby.current_player_id then
    raise exception 'It is not your turn.';
  end if;
  if v_word !~ '^[a-z]{3,40}$' then raise exception 'Use letters only.'; end if;
  if position(v_lobby.prompt in v_word) = 0 then
    raise exception 'Your word must contain "%".', upper(v_lobby.prompt);
  end if;
  if not v_word = any(v_lobby.allowed_words) then
    raise exception 'That word is not in this game''s word list.';
  end if;
  if v_word = any(v_lobby.used_words) then
    raise exception 'That word has already been used this round.';
  end if;

  perform private.word_bomb_advance_turn(v_lobby.id, v_word, false);
  return private.word_bomb_snapshot(v_lobby.id);
end;
$$;

create or replace function public.word_bomb_expire_turn(p_code text, p_revision bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_actor();
  v_lobby public.word_bomb_lobbies;
begin
  select * into v_lobby
  from public.word_bomb_lobbies
  where code = upper(btrim(p_code))
  for update;

  if v_lobby.id is null or not private.word_bomb_is_member(v_lobby.id, v_actor_id) then
    raise exception 'You are not a member of that lobby.';
  end if;
  if v_lobby.status <> 'playing'
    or v_lobby.revision <> p_revision
    or v_lobby.deadline_at > clock_timestamp() then
    return private.word_bomb_snapshot(v_lobby.id);
  end if;

  perform private.word_bomb_advance_turn(v_lobby.id, null, true);
  return private.word_bomb_snapshot(v_lobby.id);
end;
$$;

create or replace function public.word_bomb_restart_lobby(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_actor();
  v_lobby public.word_bomb_lobbies;
begin
  select * into v_lobby
  from public.word_bomb_lobbies
  where code = upper(btrim(p_code))
  for update;

  if v_lobby.id is null then raise exception 'Lobby not found.'; end if;
  if v_lobby.host_id <> v_actor_id then raise exception 'Only the host can restart the game.'; end if;
  if v_lobby.status <> 'finished' then raise exception 'The current game is not finished.'; end if;

  update public.word_bomb_players
  set lives = v_lobby.starting_lives
  where lobby_id = v_lobby.id;

  update public.word_bomb_lobbies
  set status = 'waiting',
      current_player_id = null,
      prompt = null,
      deadline_at = null,
      used_words = '{}',
      turned_player_ids = '{}',
      round = 1,
      completed_turns = 0,
      winner_player_id = null,
      revision = revision + 1,
      last_event_type = 'restarted',
      last_event_player_id = null,
      last_word = null,
      updated_at = clock_timestamp()
  where id = v_lobby.id;

  return private.word_bomb_snapshot(v_lobby.id);
end;
$$;

revoke all on function private.word_bomb_is_member(uuid, uuid) from public, anon, authenticated;
revoke all on function private.word_bomb_turn_seconds(integer) from public, anon, authenticated;
revoke all on function private.word_bomb_choose_prompt(text[], text) from public, anon, authenticated;
revoke all on function private.word_bomb_snapshot(uuid) from public, anon, authenticated;
revoke all on function private.word_bomb_advance_turn(uuid, text, boolean) from public, anon, authenticated;

revoke all on function public.word_bomb_create_lobby(text, integer, text[], text[]) from public, anon;
revoke all on function public.word_bomb_join_lobby(text, text) from public, anon;
revoke all on function public.word_bomb_get_lobby(text) from public, anon;
revoke all on function public.word_bomb_leave_lobby(text) from public, anon;
revoke all on function public.word_bomb_start_lobby(text) from public, anon;
revoke all on function public.word_bomb_submit_word(text, bigint, text) from public, anon;
revoke all on function public.word_bomb_expire_turn(text, bigint) from public, anon;
revoke all on function public.word_bomb_restart_lobby(text) from public, anon;

grant execute on function public.word_bomb_create_lobby(text, integer, text[], text[]) to authenticated;
grant execute on function public.word_bomb_join_lobby(text, text) to authenticated;
grant execute on function public.word_bomb_get_lobby(text) to authenticated;
grant execute on function public.word_bomb_leave_lobby(text) to authenticated;
grant execute on function public.word_bomb_start_lobby(text) to authenticated;
grant execute on function public.word_bomb_submit_word(text, bigint, text) to authenticated;
grant execute on function public.word_bomb_expire_turn(text, bigint) to authenticated;
grant execute on function public.word_bomb_restart_lobby(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'word_bomb_lobbies'
    ) then
      alter publication supabase_realtime add table public.word_bomb_lobbies;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'word_bomb_players'
    ) then
      alter publication supabase_realtime add table public.word_bomb_players;
    end if;
  end if;
end
$$;

-- CUSTOM WORD BOMB — END
