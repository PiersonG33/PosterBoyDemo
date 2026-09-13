-- CUSTOM WORD BOMB — BEGIN
-- Preserve a few valid, unused answers whenever a turn expires so every
-- online player can see what would have worked after the prompt advances.

alter table public.word_bomb_lobbies
  add column if not exists last_examples text[] not null default '{}';

create or replace function private.word_bomb_capture_timeout_examples()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revision <> old.revision and new.last_event_type = 'timeout' then
    new.last_examples := array(
      select candidate
      from unnest(old.allowed_words) candidate
      where position(old.prompt in candidate) > 0
        and not candidate = any(old.used_words)
      order by random()
      limit 3
    );
  elsif new.revision <> old.revision then
    new.last_examples := '{}';
  end if;

  return new;
end;
$$;

drop trigger if exists word_bomb_capture_timeout_examples on public.word_bomb_lobbies;
create trigger word_bomb_capture_timeout_examples
before update on public.word_bomb_lobbies
for each row execute function private.word_bomb_capture_timeout_examples();

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
    'lastExamples', to_jsonb(lobby.last_examples),
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

revoke all on function private.word_bomb_capture_timeout_examples() from public, anon, authenticated;

-- CUSTOM WORD BOMB — END
