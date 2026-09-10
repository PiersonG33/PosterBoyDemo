-- Keep newly placed notes above older pins, and prevent a single new note from
-- hiding the center point of an existing active note.

create or replace function private.note_placement_covers_existing_center(
  p_board_id uuid,
  p_note_x double precision,
  p_note_y double precision,
  p_rotation double precision
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.notes existing
    where existing.board_id = p_board_id
      and existing.removed_at is null
      and private.pin_touches_note(
        existing.board_x + 130.8 / 1352.0 / 2.0,
        existing.board_y + 130.8 / 813.0 / 2.0,
        p_note_x,
        p_note_y,
        p_rotation
      )
  );
$$;

create or replace function private.enforce_visible_note_centers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seed_key is null and private.note_placement_covers_existing_center(
    new.board_id,
    new.board_x,
    new.board_y,
    new.rotation
  ) then
    raise exception 'Move this note so existing note centers stay visible.';
  end if;

  return new;
end;
$$;

drop trigger if exists notes_keep_centers_visible on public.notes;
create trigger notes_keep_centers_visible
before insert on public.notes
for each row execute function private.enforce_visible_note_centers();

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
      and created_at >= v_note.created_at
      and private.pin_touches_note(x, y, v_note.board_x, v_note.board_y, v_note.rotation)
  ) then
    raise exception 'Remove the pins before taking this note down.';
  end if;

  perform private.consume_action(v_board_id, v_actor_id);
  update public.notes set removed_at = clock_timestamp() where id = p_note_id;
  return p_note_id;
end;
$$;

revoke all on function private.note_placement_covers_existing_center(
  uuid, double precision, double precision, double precision
) from public, anon, authenticated;
revoke all on function private.enforce_visible_note_centers() from public, anon, authenticated;
revoke execute on function public.remove_note(text, uuid) from public, anon;
grant execute on function public.remove_note(text, uuid) to authenticated;
