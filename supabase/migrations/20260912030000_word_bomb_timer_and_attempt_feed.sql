-- CUSTOM WORD BOMB — BEGIN
-- Host-configurable turn timing and a lobby-wide attempt history. This is a
-- forward migration so already-deployed Word Bomb rooms can be upgraded safely.

alter table public.word_bomb_lobbies
  add column if not exists starting_turn_seconds double precision not null default 18
    check (starting_turn_seconds between 5 and 60),
  add column if not exists speed_up_seconds double precision not null default 0.5
    check (speed_up_seconds between 0 and 2);

create table if not exists public.word_bomb_events (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.word_bomb_lobbies(id) on delete cascade,
  player_id uuid references public.word_bomb_players(id) on delete set null,
  player_name text not null,
  event_type text not null check (event_type in ('success', 'invalid', 'timeout')),
  word text,
  prompt text not null,
  reason text,
  examples text[] not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists word_bomb_events_lobby_idx
  on public.word_bomb_events (lobby_id, id desc);

alter table public.word_bomb_events enable row level security;

drop policy if exists "word bomb members can read events" on public.word_bomb_events;
create policy "word bomb members can read events"
  on public.word_bomb_events for select to authenticated
  using (private.word_bomb_is_member(lobby_id, auth.uid()));

grant select on public.word_bomb_events to authenticated;
revoke insert, update, delete on public.word_bomb_events from anon, authenticated;

create or replace function private.word_bomb_apply_timer_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revision <> old.revision and new.status = 'playing' then
    if new.last_event_type = 'started' then
      new.deadline_at := clock_timestamp()
        + new.starting_turn_seconds * interval '1 second';
    elsif new.last_event_type in ('word', 'timeout') then
      new.deadline_at := clock_timestamp()
        + greatest(
            3.5::double precision,
            new.starting_turn_seconds - new.completed_turns * new.speed_up_seconds
          ) * interval '1 second';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists word_bomb_apply_timer_settings on public.word_bomb_lobbies;
create trigger word_bomb_apply_timer_settings
before update on public.word_bomb_lobbies
for each row execute function private.word_bomb_apply_timer_settings();

create or replace function private.word_bomb_record_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_name text;
begin
  if new.revision = old.revision then
    return new;
  end if;

  if new.last_event_type = 'restarted' then
    delete from public.word_bomb_events where lobby_id = new.id;
    return new;
  end if;

  if new.last_event_type not in ('word', 'timeout') then
    return new;
  end if;

  select player.name into v_player_name
  from public.word_bomb_players player
  where player.id = new.last_event_player_id;

  insert into public.word_bomb_events (
    lobby_id,
    player_id,
    player_name,
    event_type,
    word,
    prompt,
    reason,
    examples
  ) values (
    new.id,
    new.last_event_player_id,
    coalesce(v_player_name, 'Player'),
    case when new.last_event_type = 'word' then 'success' else 'timeout' end,
    new.last_word,
    old.prompt,
    null,
    case when new.last_event_type = 'timeout' then new.last_examples else '{}' end
  );

  return new;
end;
$$;

drop trigger if exists word_bomb_record_event on public.word_bomb_lobbies;
create trigger word_bomb_record_event
after update on public.word_bomb_lobbies
for each row execute function private.word_bomb_record_event();

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
    'startingTurnSeconds', lobby.starting_turn_seconds,
    'speedUpSeconds', lobby.speed_up_seconds,
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
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'type', recent.event_type,
        'playerName', recent.player_name,
        'word', recent.word,
        'prompt', recent.prompt,
        'reason', recent.reason,
        'examples', to_jsonb(recent.examples)
      ) order by recent.id)
      from (
        select event.*
        from public.word_bomb_events event
        where event.lobby_id = lobby.id
        order by event.id desc
        limit 30
      ) recent
    ), '[]'::jsonb),
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
  p_starting_seconds double precision,
  p_speed_up_seconds double precision,
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
  if p_starting_seconds is null or p_starting_seconds not between 5 and 60 then
    raise exception 'Starting time must be between 5 and 60 seconds.';
  end if;
  if p_speed_up_seconds is null or p_speed_up_seconds not between 0 and 2 then
    raise exception 'Difficulty increase must be between 0 and 2 seconds per turn.';
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
        code,
        host_id,
        starting_lives,
        minimum_prompt_words,
        starting_turn_seconds,
        speed_up_seconds,
        allowed_words,
        prompts
      ) values (
        v_code,
        v_actor_id,
        p_lives,
        p_min_prompt_words,
        p_starting_seconds,
        p_speed_up_seconds,
        p_words,
        p_prompts
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
  v_reason text;
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

  if v_word is null or v_word !~ '^[a-z]{3,40}$' then
    v_reason := 'Use letters only.';
  elsif position(v_lobby.prompt in v_word) = 0 then
    v_reason := format('Must contain "%s".', upper(v_lobby.prompt));
  elsif not v_word = any(v_lobby.allowed_words) then
    v_reason := 'Not in this lobby''s word list.';
  elsif v_word = any(v_lobby.used_words) then
    v_reason := 'Already used this round.';
  end if;

  if v_reason is not null then
    insert into public.word_bomb_events (
      lobby_id, player_id, player_name, event_type, word, prompt, reason, examples
    ) values (
      v_lobby.id,
      v_player.id,
      v_player.name,
      'invalid',
      left(coalesce(v_word, ''), 40),
      v_lobby.prompt,
      v_reason,
      '{}'
    );
    return private.word_bomb_snapshot(v_lobby.id);
  end if;

  perform private.word_bomb_advance_turn(v_lobby.id, v_word, false);
  return private.word_bomb_snapshot(v_lobby.id);
end;
$$;

revoke execute on function public.word_bomb_create_lobby(text, integer, integer, text[], text[]) from authenticated;
revoke all on function public.word_bomb_create_lobby(text, integer, integer, double precision, double precision, text[], text[]) from public, anon;
grant execute on function public.word_bomb_create_lobby(text, integer, integer, double precision, double precision, text[], text[]) to authenticated;

revoke all on function private.word_bomb_apply_timer_settings() from public, anon, authenticated;
revoke all on function private.word_bomb_record_event() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'word_bomb_events'
    ) then
    alter publication supabase_realtime add table public.word_bomb_events;
  end if;
end;
$$;

-- CUSTOM WORD BOMB — END
