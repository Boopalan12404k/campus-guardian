-- Campus Guardian FINAL migration
-- Run AFTER supabase-schema.sql. It is safe to run more than once.

alter table public.profiles add column if not exists department text;

-- Student signup -> automatic student profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, student_id, department, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'Student'),
    nullif(new.raw_user_meta_data->>'student_id',''),
    nullif(new.raw_user_meta_data->>'department',''),
    'student'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    student_id = coalesce(public.profiles.student_id, excluded.student_id),
    department = coalesce(public.profiles.department, excluded.department);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Make an already-created Auth user a student profile if missing.
insert into public.profiles (id, full_name, role)
select u.id,
       coalesce(nullif(u.raw_user_meta_data->>'full_name',''), split_part(coalesce(u.email,''),'@',1), 'Student'),
       'student'
from auth.users u
where not exists (select 1 from public.profiles p where p.id=u.id);

-- Replace the original policies with a complete, idempotent policy set.
drop policy if exists "profiles self read" on public.profiles;
drop policy if exists "students read live found" on public.found_items;
drop policy if exists "student create lost" on public.lost_items;
drop policy if exists "student read own lost" on public.lost_items;
drop policy if exists "student create found" on public.found_items;
drop policy if exists "student create claim" on public.claims;
drop policy if exists "student read own claims" on public.claims;
drop policy if exists "manager updates" on public.claims;
drop policy if exists "manager update lost" on public.lost_items;
drop policy if exists "manager update found" on public.found_items;
drop policy if exists "manager delete claims" on public.claims;
drop policy if exists "manager delete lost" on public.lost_items;
drop policy if exists "manager delete found" on public.found_items;

create policy "profiles self read" on public.profiles
for select using (id = auth.uid() or public.is_manager());

create policy "students read live found" on public.found_items
for select using (status = 'LIVE' or finder_id = auth.uid() or public.is_manager());

create policy "student create lost" on public.lost_items
for insert with check (owner_id = auth.uid());

create policy "student read own lost" on public.lost_items
for select using (owner_id = auth.uid() or public.is_manager());

create policy "student create found" on public.found_items
for insert with check (finder_id = auth.uid());

create policy "student create claim" on public.claims
for insert with check (
  exists(select 1 from public.lost_items l where l.id = lost_id and l.owner_id = auth.uid())
);

create policy "student read own claims" on public.claims
for select using (
  exists(select 1 from public.lost_items l where l.id = lost_id and l.owner_id = auth.uid())
  or public.is_manager()
);

create policy "manager updates" on public.claims
for update using (public.is_manager()) with check (public.is_manager());

create policy "manager update lost" on public.lost_items
for update using (public.is_manager()) with check (public.is_manager());

create policy "manager update found" on public.found_items
for update using (public.is_manager()) with check (public.is_manager());

create policy "manager delete claims" on public.claims
for delete using (public.is_manager());

create policy "manager delete lost" on public.lost_items
for delete using (public.is_manager());

create policy "manager delete found" on public.found_items
for delete using (public.is_manager());

-- Storage policies for the private campus-images bucket.
-- Students can upload only inside a folder named with their auth user id.
drop policy if exists "campus images student upload" on storage.objects;
drop policy if exists "campus images authenticated read" on storage.objects;
drop policy if exists "campus images manager delete" on storage.objects;
drop policy if exists "campus images owner delete" on storage.objects;

create policy "campus images student upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campus-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "campus images authenticated read"
on storage.objects for select to authenticated
using (bucket_id = 'campus-images');

create policy "campus images manager delete"
on storage.objects for delete to authenticated
using (bucket_id = 'campus-images' and public.is_manager());

create policy "campus images owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'campus-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Transactional manager return action. It permanently removes the live item,
-- the matching lost report and all claims, so there is no history afterward.
create or replace function public.manager_return_item(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lost uuid;
  v_found uuid;
begin
  if not public.is_manager() then
    raise exception 'Manager access required';
  end if;

  select lost_id, found_id into v_lost, v_found
  from public.claims
  where id = p_claim_id;

  if v_lost is null or v_found is null then
    raise exception 'Claim not found';
  end if;

  delete from public.claims
  where lost_id = v_lost or found_id = v_found;

  delete from public.lost_items where id = v_lost;
  delete from public.found_items where id = v_found;

  return jsonb_build_object('ok', true, 'lost_id', v_lost, 'found_id', v_found);
end;
$$;

grant execute on function public.manager_return_item(uuid) to authenticated;

-- Realtime was enabled by the base schema. If you are starting from a fresh project,
-- keep the realtime lines from supabase-schema.sql.
