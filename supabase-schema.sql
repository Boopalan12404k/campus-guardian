-- Campus Guardian live backend schema
-- Run this in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null,
 student_id text unique,
 role text not null default 'student' check(role in ('student','manager')),
 created_at timestamptz default now()
);

create table if not exists lost_items(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references profiles(id) on delete cascade,
 title text not null, category text not null, lost_place text not null,
 lost_date date, lost_time time, description text, photo_url text,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','RETURNED')),
 created_at timestamptz default now()
);

create table if not exists found_items(
 id uuid primary key default gen_random_uuid(),
 finder_id uuid not null references profiles(id) on delete cascade,
 title text not null, category text not null, found_place text not null,
 found_date date, found_time time, storage_location text,
 pickup_location text, finder_contact text, description text, photo_url text,
 status text not null default 'LIVE' check(status in ('LIVE','RETURNED')),
 created_at timestamptz default now()
);

create table if not exists claims(
 id uuid primary key default gen_random_uuid(),
 lost_id uuid not null references lost_items(id) on delete cascade,
 found_id uuid not null references found_items(id) on delete cascade,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
 created_at timestamptz default now(),
 reviewed_at timestamptz
);

-- Helper functions for RLS.
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id=auth.uid() and role='manager'); $$;

alter table profiles enable row level security;
alter table lost_items enable row level security;
alter table found_items enable row level security;
alter table claims enable row level security;

create policy "profiles self read" on profiles for select using (id=auth.uid() or public.is_manager());
create policy "students read live found" on found_items for select using (status='LIVE' or public.is_manager() or finder_id=auth.uid());
create policy "student create lost" on lost_items for insert with check(owner_id=auth.uid());
create policy "student read own lost" on lost_items for select using(owner_id=auth.uid() or public.is_manager());
create policy "student create found" on found_items for insert with check(finder_id=auth.uid());
create policy "student create claim" on claims for insert with check(exists(select 1 from lost_items l where l.id=lost_id and l.owner_id=auth.uid()));
create policy "student read own claims" on claims for select using(exists(select 1 from lost_items l where l.id=lost_id and l.owner_id=auth.uid()) or public.is_manager());
create policy "manager updates" on claims for update using(public.is_manager()) with check(public.is_manager());
create policy "manager update lost" on lost_items for update using(public.is_manager());
create policy "manager update found" on found_items for update using(public.is_manager());

-- Enable realtime.
alter publication supabase_realtime add table lost_items;
alter publication supabase_realtime add table found_items;
alter publication supabase_realtime add table claims;

-- Create a Storage bucket named campus-images in the Supabase dashboard and
-- add appropriate authenticated-user policies before enabling photo uploads.
