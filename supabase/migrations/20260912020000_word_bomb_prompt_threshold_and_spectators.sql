-- CUSTOM WORD BOMB — BEGIN
-- Configurable prompt support and mid-game spectator joins.

alter table public.word_bomb_lobbies
  add column if not exists minimum_prompt_words integer not null default 3
  check (minimum_prompt_words between 1 and 20);

alter table public.word_bomb_players
  add column if not exists is_spectator boolean not null default false;

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
    'minimumPromptWords', lobby.minimum_prompt_words,
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
    'lastExamples', to_jsonb(lobby.last_examples),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player.id,
        'name', player.name,
        'seat', player.seat,
        'lives', player.lives,
        'isSpectator', player.is_spectator
      ) order by player.seat)
      from public.word_bomb_players player
      where player.lobby_id = lobby.id
    ), '[]'::jsonb),
    'serverTime', clock_timestamp()
  )
  from public.word_bomb_lobbies lobby
  where lobby.id = p_lobby_id;
$$;

create or replace function public.word_bomb_create_lobby(
  p_name text,
  p_lives integer,
  p_min_prompt_words integer,
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
  if p_min_prompt_words not between 1 and 20 then
    raise exception 'Required answers per prompt must be between 1 and 20.';
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
    where (
      select count(*) from unnest(p_words) word where position(prompt in word) > 0
    ) < p_min_prompt_words
  ) then
    raise exception 'Every prompt must match the configured number of words.';
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
        code, host_id, starting_lives, minimum_prompt_words, allowed_words, prompts
      ) values (
        v_code, v_actor_id, p_lives, p_min_prompt_words, p_words, p_prompts
      ) returning * into v_lobby;
    exception when unique_violation then
      continue;
    end;

    insert into public.word_bomb_players (
      lobby_id, actor_id, name, seat, lives, is_spectator
    ) values (
      v_lobby.id, v_actor_id, v_name, 1, p_lives, false
    ) returning id into v_player_id;

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
  v_is_spectator boolean;
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

  if (select count(*) from public.word_bomb_players where lobby_id = v_lobby.id) >= 8 then
    raise exception 'That lobby is full.';
  end if;
  if exists (
    select 1 from public.word_bomb_players
    where lobby_id = v_lobby.id and lower(name) = lower(v_name)
  ) then
    raise exception 'That name is already taken in this lobby.';
  end if;

  select candidate.seat into v_seat
  from generate_series(1, 8) candidate(seat)
  where not exists (
    select 1 from public.word_bomb_players player
    where player.lobby_id = v_lobby.id and player.seat = candidate.seat
  )
  order by candidate.seat
  limit 1;
  v_is_spectator := v_lobby.status <> 'waiting';

  insert into public.word_bomb_players (
    lobby_id, actor_id, name, seat, lives, is_spectator
  ) values (
    v_lobby.id,
    v_actor_id,
    v_name,
    v_seat,
    case when v_is_spectator then 0 else v_lobby.starting_lives end,
    v_is_spectator
  ) returning id into v_player_id;

  if not v_is_spectator then
    update public.word_bomb_lobbies
    set revision = revision + 1,
        last_event_type = 'joined',
        last_event_player_id = v_player_id,
        last_word = null,
        updated_at = clock_timestamp()
    where id = v_lobby.id;
  end if;

  return private.word_bomb_snapshot(v_lobby.id);
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
  v_player public.word_bomb_players;
begin
  select * into v_lobby
  from public.word_bomb_lobbies
  where code = upper(btrim(p_code))
  for update;

  if v_lobby.id is null then return true; end if;

  select * into v_player
  from public.word_bomb_players
  where lobby_id = v_lobby.id and actor_id = v_actor_id;
  if v_player.id is null then return true; end if;

  if v_lobby.status = 'waiting' then
    if v_lobby.host_id = v_actor_id then
      delete from public.word_bomb_lobbies where id = v_lobby.id;
    else
      delete from public.word_bomb_players where id = v_player.id;
      update public.word_bomb_lobbies
      set revision = revision + 1,
          last_event_type = 'left',
          last_event_player_id = v_player.id,
          last_word = null,
          updated_at = clock_timestamp()
      where id = v_lobby.id;
    end if;
  elsif v_player.is_spectator then
    delete from public.word_bomb_players where id = v_player.id;
  else
    raise exception 'Active players remain in the lobby until the game ends.';
  end if;

  return true;
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
  set lives = v_lobby.starting_lives,
      is_spectator = false
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

revoke execute on function public.word_bomb_create_lobby(text, integer, text[], text[]) from authenticated;
revoke all on function public.word_bomb_create_lobby(text, integer, integer, text[], text[]) from public, anon;
grant execute on function public.word_bomb_create_lobby(text, integer, integer, text[], text[]) to authenticated;

-- CUSTOM WORD BOMB — END
